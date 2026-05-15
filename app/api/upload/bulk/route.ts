import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { db, getUserByEmail } from '@/lib/supabase'
import { buildExtractionPrompt } from '@/lib/prompts'
import { MODELS, MAX_TOKENS } from '@/lib/models'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_TEXT_CHARS = 12000
const IMAGE_TYPES = ['image/jpeg','image/png','image/gif','image/webp']
const PDF_TYPE = 'application/pdf'
const TEXT_TYPES = ['text/plain','text/markdown','text/csv','text/html','application/json']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch (e: any) {
    return NextResponse.json({
      error: 'File too large. Split into smaller batches (max 4MB per batch on free tier).',
      code: 'PAYLOAD_TOO_LARGE',
    }, { status: 413 })
  }

  const files = form.getAll('files') as File[]
  if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })

  const results: { name:string; status:string; reason?:string; memoriesCreated?:number }[] = []
  let totalMemories = 0

  for (const file of files) {
    try {
      const ext  = file.name.split('.').pop()?.toLowerCase() || ''
      const mime = file.type || guessMime(ext)
      if (file.size < 10) { results.push({name:file.name,status:'skipped',reason:'Empty'}); continue }

      let extracted: any = null

      if (TEXT_TYPES.includes(mime) || ['txt','md','csv','html','json'].includes(ext)) {
        const raw  = await file.text()
        const text = raw.slice(0, MAX_TEXT_CHARS)
        if (text.trim().length < 50) { results.push({name:file.name,status:'skipped',reason:'Too short'}); continue }
        const isWA = file.name.toLowerCase().includes('chat') || (text.includes(' - ') && text.includes(': '))
        extracted = await extractText(text, file.name, isWA)
      }
      else if (mime === PDF_TYPE || ext === 'pdf') {
        const bytes  = await file.arrayBuffer()
        const slice  = bytes.slice(0, 3*1024*1024)
        const base64 = Buffer.from(slice).toString('base64')
        extracted = await extractPDF(base64, file.name)
      }
      else if (IMAGE_TYPES.includes(mime) || ['jpg','jpeg','png','gif','webp'].includes(ext)) {
        const bytes   = await file.arrayBuffer()
        const slice   = bytes.slice(0, 2*1024*1024)
        const base64  = Buffer.from(slice).toString('base64')
        extracted = await extractImage(base64, normImgMime(mime,ext), file.name)
      }
      else { results.push({name:file.name,status:'skipped',reason:`Unsupported .${ext}`}); continue }

      if (!extracted || (!extracted.memories?.length && !extracted.insights)) {
        results.push({name:file.name,status:'skipped',reason:'No insights extracted'}); continue
      }

      const count = await saveInsights(user.id, file.name, extracted)
      totalMemories += count
      results.push({name:file.name,status:'processed',memoriesCreated:count})

    } catch (err: any) {
      results.push({name:file.name,status:'error',reason:err?.message?.slice(0,100)||'Failed'})
    }
  }

  return NextResponse.json({ processed:results.filter(r=>r.status==='processed').length, skipped:results.filter(r=>r.status==='skipped').length, errors:results.filter(r=>r.status==='error').length, totalMemoriesCreated:totalMemories, results })
}

async function extractText(text:string, filename:string, isWA:boolean) {
  const task = isWA
    ? `WhatsApp/chat export. Extract personality of the main person: communication style, values, humor, opinions, emotional patterns, recurring topics.`
    : `Document "${filename}". Extract author personality: values, beliefs, expertise, opinions, communication style.`
  const res = await claude.messages.create({
    model:MODELS.EXTRACTION, max_tokens:MAX_TOKENS.EXTRACTION,
    system:buildExtractionPrompt(`${task} Return JSON: {"memories":["insight 1","insight 2","insight 3"],"patterns":"communication style","topics":["t1","t2"],"insights":"1-2 sentence summary"}`),
    messages:[{role:'user',content:text}],
  })
  return parseJ(res.content[0].type==='text'?res.content[0].text:'{}')
}

async function extractPDF(base64:string, filename:string) {
  try {
    const res = await claude.messages.create({
      model:MODELS.EXTRACTION, max_tokens:MAX_TOKENS.EXTRACTION,
      system:buildExtractionPrompt(`Extract personality insights from PDF "${filename}". Return JSON: {"memories":["i1","i2"],"patterns":"style","topics":["t1"],"insights":"summary"}`),
      messages:[{role:'user',content:[{type:'document',source:{type:'base64',media_type:'application/pdf',data:base64}} as any,{type:'text',text:'Extract personality insights.'}]}],
    })
    return parseJ(res.content[0].type==='text'?res.content[0].text:'{}')
  } catch { return null }
}

async function extractImage(base64:string, mime:'image/jpeg'|'image/png'|'image/gif'|'image/webp', filename:string) {
  try {
    const res = await claude.messages.create({
      model:MODELS.INTERVIEW, max_tokens:500,
      system:buildExtractionPrompt(`Analyze this image for personality insights. Return JSON: {"memories":["i1","i2"],"patterns":"style","topics":["t1"],"insights":"summary"}`),
      messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:mime,data:base64}},{type:'text',text:'What does this reveal about the person?'}]}],
    })
    return parseJ(res.content[0].type==='text'?res.content[0].text:'{}')
  } catch { return null }
}

function parseJ(raw:string) {
  try {
    const p = JSON.parse(raw.replace(/```json|```/g,'').trim())
    return { memories:Array.isArray(p.memories)?p.memories.filter((m:any)=>typeof m==='string'&&m.trim().length>10):[], patterns:p.patterns||'', topics:Array.isArray(p.topics)?p.topics:[], insights:p.insights||'' }
  } catch { return { memories:[], patterns:'', topics:[], insights:raw.slice(0,200) } }
}

async function saveInsights(userId:string, filename:string, ex:any) {
  let count=0
  const ext=filename.split('.').pop()?.toLowerCase()||'file'
  const cat:Record<string,string>={pdf:'Document',docx:'Document',pptx:'Presentation',xlsx:'Data',csv:'Data',jpg:'Photo',jpeg:'Photo',png:'Photo',txt:'Text Import',md:'Notes'}
  const category=cat[ext]||'Document'
  for (const memory of (ex.memories||[]).slice(0,5)) {
    if(!memory?.trim()) continue
    await db.from('memories').insert({user_id:userId,title:`[${ext.toUpperCase()}] ${filename}`,content:memory,category,source:`upload_${ext}`,importance:6})
    count++
  }
  if (ex.insights&&ex.insights.length>20) {
    await db.from('memories').insert({user_id:userId,title:`Summary: ${filename}`,content:`${ex.insights}${ex.topics?.length?`\n\nTopics: ${ex.topics.join(', ')}`:''}`,category,source:`upload_${ext}`,importance:7})
    count++
  }
  if (ex.patterns&&ex.patterns.length>30) {
    await db.from('persona').upsert({user_id:userId,field_id:`upload_${filename.replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}`,category:'communication',question:`Pattern from ${filename}`,answer:ex.patterns,updated_at:new Date().toISOString()},{onConflict:'user_id,field_id'})
  }
  return count
}

function guessMime(ext:string):string { const m:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',txt:'text/plain',md:'text/markdown',csv:'text/csv'}; return m[ext]||'application/octet-stream' }
function normImgMime(mime:string,ext:string):'image/jpeg'|'image/png'|'image/gif'|'image/webp' { if(mime==='image/png'||ext==='png') return 'image/png'; if(mime==='image/gif'||ext==='gif') return 'image/gif'; if(mime==='image/webp'||ext==='webp') return 'image/webp'; return 'image/jpeg' }
