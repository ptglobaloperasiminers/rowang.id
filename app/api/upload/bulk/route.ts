import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { db, getUserByEmail } from '@/lib/supabase'
import { buildExtractionPrompt } from '@/lib/prompts'
import { MODELS, MAX_TOKENS } from '@/lib/models'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const IMAGE_TYPES = ['image/jpeg','image/png','image/gif','image/webp']
const PDF_TYPE = 'application/pdf'
const TEXT_TYPES = ['text/plain','text/markdown','text/csv','text/html','application/json']

// Smart prompts based on document type
function getExtractionPrompt(filename: string, isWA: boolean): string {
  const f = filename.toLowerCase()
  // Identity documents → extract facts, not personality
  if (f.includes('ktp') || f.includes('passport') || f.includes('id') || f.includes('akte') || f.includes('birth') || f.includes('lahir') || f.includes('akta') || f.includes('bca') || f.includes('card') || f.includes('str_') || f.includes('sim ') || f.includes('sim_')) {
    return `This is an identity document or ID card image named "${filename}". Extract factual personal information visible: name, date of birth, address, ID numbers, document type, expiry date, nationality, religion, marital status, occupation, or any other facts shown. These are important identity facts, NOT personality insights — save them as identity records. Return JSON: {"memories":["fact 1: name shown is...","fact 2: born on...","fact 3: address is..."],"patterns":"identity document","topics":["identity","personal records"],"insights":"Identity document: ${filename} — contains personal factual information"}`
  }
  if (isWA) {
    return `WhatsApp/messaging chat export. Extract the personality of the MAIN sender: communication style, humor, values, recurring topics, how they handle conflict, emotional patterns, what excites them. Return JSON: {"memories":["insight 1","insight 2","insight 3"],"patterns":"communication style","topics":["t1","t2"],"insights":"summary"}`
  }
  return `Document named "${filename}". Extract personality insights and/or factual identity information: values, beliefs, expertise, opinions, communication style, decisions, personal facts. Return JSON: {"memories":["insight 1","insight 2","insight 3"],"patterns":"communication style or document type","topics":["t1","t2"],"insights":"1-2 sentence summary of what this reveals"}`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({
      results: [{ name: 'upload', status: 'error', reason: 'File too large. Max ~4MB per file on free hosting.' }],
      processed: 0, skipped: 0, errors: 1, totalMemoriesCreated: 0,
    })
  }

  const files = form.getAll('files') as File[]
  if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })

  const results: { name:string; status:string; reason?:string; memoriesCreated?:number }[] = []
  let totalMemories = 0

  for (const file of files) {
    try {
      const ext  = file.name.split('.').pop()?.toLowerCase() || ''
      const mime = file.type || guessMime(ext)

      if (file.size < 5) { results.push({name:file.name,status:'skipped',reason:'Empty'}); continue }

      let extracted: any = null

      // Text files
      if (TEXT_TYPES.includes(mime) || ['txt','md','csv','html','json'].includes(ext)) {
        const raw  = await file.text()
        const text = raw.slice(0, 10000)
        if (text.trim().length < 30) { results.push({name:file.name,status:'skipped',reason:'Too short'}); continue }
        const isWA = file.name.toLowerCase().includes('chat') || file.name.toLowerCase().includes('whatsapp') || (text.includes(' - ') && text.includes(': '))
        extracted = await extractWithPrompt(text, getExtractionPrompt(file.name, isWA))
      }
      // PDF
      else if (mime === PDF_TYPE || ext === 'pdf') {
        const bytes  = await file.arrayBuffer()
        // Slice to 2.5MB to stay safe within Vercel limits
        const slice  = bytes.byteLength > 2.5*1024*1024 ? bytes.slice(0, 2.5*1024*1024) : bytes
        const base64 = Buffer.from(slice).toString('base64')
        extracted = await extractPDF(base64, file.name)
      }
      // Images — resize large ones in memory
      else if (IMAGE_TYPES.includes(mime) || ['jpg','jpeg','png','gif','webp'].includes(ext)) {
        const bytes  = await file.arrayBuffer()
        // Slice to 1MB for images — enough for Claude Vision to read
        const slice  = bytes.byteLength > 1*1024*1024 ? bytes.slice(0, 1*1024*1024) : bytes
        const base64 = Buffer.from(slice).toString('base64')
        extracted = await extractImage(base64, normImgMime(mime,ext), file.name)
      }
      else {
        results.push({name:file.name,status:'skipped',reason:`Unsupported .${ext}`}); continue
      }

      if (!extracted || (!extracted.memories?.length && !extracted.insights)) {
        results.push({name:file.name,status:'skipped',reason:'No content extracted — try a clearer image or text file'})
        continue
      }

      const count = await saveInsights(user.id, file.name, extracted)
      totalMemories += count
      results.push({name:file.name,status:'processed',memoriesCreated:count})

    } catch (err: any) {
      const msg = err?.message||'Failed'
      results.push({name:file.name,status:'error',reason:
        msg.includes('overload')?'AI busy — try again':
        msg.includes('large')||msg.includes('size')?'Too large — compress image first':
        msg.slice(0,80)})
    }
  }

  return NextResponse.json({
    processed: results.filter(r=>r.status==='processed').length,
    skipped:   results.filter(r=>r.status==='skipped').length,
    errors:    results.filter(r=>r.status==='error').length,
    totalMemoriesCreated: totalMemories,
    results,
  })
}

async function extractWithPrompt(text: string, prompt: string) {
  const res = await claude.messages.create({
    model: MODELS.EXTRACTION, max_tokens: MAX_TOKENS.EXTRACTION,
    system: buildExtractionPrompt(prompt),
    messages: [{role:'user',content:text}],
  })
  return parseJ(res.content[0].type==='text'?res.content[0].text:'{}')
}

async function extractPDF(base64: string, filename: string) {
  try {
    const res = await claude.messages.create({
      model: MODELS.EXTRACTION, max_tokens: MAX_TOKENS.EXTRACTION,
      system: buildExtractionPrompt(getExtractionPrompt(filename, false)),
      messages: [{role:'user',content:[
        {type:'document',source:{type:'base64',media_type:'application/pdf',data:base64}} as any,
        {type:'text',text:'Extract all useful information from this document.'},
      ]}],
    })
    return parseJ(res.content[0].type==='text'?res.content[0].text:'{}')
  } catch { return null }
}

async function extractImage(base64: string, mime: 'image/jpeg'|'image/png'|'image/gif'|'image/webp', filename: string) {
  try {
    const res = await claude.messages.create({
      model: MODELS.INTERVIEW, max_tokens: 800, // Sonnet for vision
      system: buildExtractionPrompt(getExtractionPrompt(filename, false)),
      messages: [{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:mime,data:base64}},
        {type:'text',text:'Read and extract all information visible in this image. If it is an ID document, extract all text and data visible. If it is a photo, describe what it reveals about the person.'},
      ]}],
    })
    return parseJ(res.content[0].type==='text'?res.content[0].text:'{}')
  } catch(e) { console.error('Image extract error:',e); return null }
}

function parseJ(raw: string) {
  try {
    const p = JSON.parse(raw.replace(/```json|```/g,'').trim())
    return {
      memories: Array.isArray(p.memories)?p.memories.filter((m:any)=>typeof m==='string'&&m.trim().length>5):[],
      patterns: typeof p.patterns==='string'?p.patterns:'',
      topics:   Array.isArray(p.topics)?p.topics:[],
      insights: typeof p.insights==='string'?p.insights:'',
    }
  } catch { return {memories:[],patterns:'',topics:[],insights:raw.slice(0,200)} }
}

async function saveInsights(userId: string, filename: string, ex: any): Promise<number> {
  let count = 0
  const ext = filename.split('.').pop()?.toLowerCase()||'file'
  const cats:Record<string,string>={pdf:'Document',docx:'Document',jpg:'Photo',jpeg:'Photo',png:'Photo',txt:'Text',csv:'Data'}
  const category = cats[ext]||'Document'

  // Determine if identity doc → save as wallet item with importance 10
  const fname = filename.toLowerCase()
  const isIdDoc = fname.includes('ktp')||fname.includes('passport')||fname.includes('akte')||fname.includes('lahir')||fname.includes('birth')||fname.includes('bca')||fname.includes('card')||fname.includes('str_')||fname.includes('sim_')||fname.includes('akta')
  const importance = isIdDoc ? 10 : 6

  for (const memory of (ex.memories||[]).slice(0,6)) {
    if (!memory?.trim()) continue
    await db.from('memories').insert({
      user_id:userId, title:`[${ext.toUpperCase()}] ${filename}`,
      content:memory, category, source:isIdDoc?'wallet':`upload_${ext}`, importance,
    })
    count++
  }

  if (ex.insights&&ex.insights.length>10) {
    await db.from('memories').insert({
      user_id:userId, title:`Summary: ${filename}`,
      content:`${ex.insights}${ex.topics?.length?`\n\nTopics: ${ex.topics.join(', ')}` :''}`,
      category, source:isIdDoc?'wallet':`upload_${ext}`, importance,
    })
    count++
  }

  if (!isIdDoc && ex.patterns&&ex.patterns.length>30) {
    await db.from('persona').upsert({
      user_id:userId, field_id:`upload_${filename.replace(/[^a-zA-Z0-9]/g,'_')}_${Date.now()}`,
      category:'communication', question:`Pattern from ${filename}`,
      answer:ex.patterns, updated_at:new Date().toISOString(),
    },{onConflict:'user_id,field_id'})
  }
  return count
}

function guessMime(ext:string):string{const m:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',txt:'text/plain',md:'text/markdown',csv:'text/csv'};return m[ext]||'application/octet-stream'}
function normImgMime(mime:string,ext:string):'image/jpeg'|'image/png'|'image/gif'|'image/webp'{if(mime==='image/png'||ext==='png')return 'image/png';if(mime==='image/gif'||ext==='gif')return 'image/gif';if(mime==='image/webp'||ext==='webp')return 'image/webp';return 'image/jpeg'}
