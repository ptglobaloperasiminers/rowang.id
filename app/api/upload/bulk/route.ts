import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { db, getUserByEmail } from '@/lib/supabase'
import { buildExtractionPrompt } from '@/lib/prompts'
import { MODELS, MAX_TOKENS } from '@/lib/models'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Supported file types ───────────────────────────────────────────────────
const TEXT_TYPES = [
  'text/plain', 'text/markdown', 'text/csv', 'text/html',
  'application/json', 'application/xml',
]
const PDF_TYPE   = 'application/pdf'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const OFFICE_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/msword', // doc
]

// Max file size: 10MB per file (stays within Supabase free tier limits)
const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form  = await req.formData()
  const files = form.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const results: {
    name: string
    status: 'processed' | 'skipped' | 'error'
    reason?: string
    memoriesCreated?: number
  }[] = []

  let totalMemoriesCreated = 0

  for (const file of files) {
    try {
      // Size check
      if (file.size > MAX_FILE_SIZE) {
        results.push({ name: file.name, status: 'skipped', reason: 'File too large (max 10MB)' })
        continue
      }

      const ext  = file.name.split('.').pop()?.toLowerCase() || ''
      const mime = file.type || guessMime(ext)

      let extracted: { memories: string[]; patterns: string; topics: string[]; insights: string } | null = null

      // ── Plain text / markdown / CSV / HTML ────────────────────────────
      if (TEXT_TYPES.includes(mime) || ['txt', 'md', 'csv', 'html', 'json'].includes(ext)) {
        const text = await file.text()
        if (text.trim().length < 50) {
          results.push({ name: file.name, status: 'skipped', reason: 'File too short to analyze' })
          continue
        }
        extracted = await extractFromText(text.slice(0, 8000), file.name)
      }

      // ── PDF ────────────────────────────────────────────────────────────
      else if (mime === PDF_TYPE || ext === 'pdf') {
        const bytes      = await file.arrayBuffer()
        const base64     = Buffer.from(bytes).toString('base64')
        extracted = await extractFromPDF(base64, file.name)
      }

      // ── Images ─────────────────────────────────────────────────────────
      else if (IMAGE_TYPES.includes(mime) || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        const bytes  = await file.arrayBuffer()
        const base64 = Buffer.from(bytes).toString('base64')
        const imgMime = (IMAGE_TYPES.includes(mime) ? mime : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
        extracted = await extractFromImage(base64, imgMime, file.name)
      }

      // ── Office docs (DOCX, PPTX, XLSX) — extract as text client-side ──
      // These are sent pre-converted to text by the client component
      else if (
        OFFICE_TYPES.includes(mime) ||
        ['docx', 'pptx', 'xlsx', 'doc', 'xls', 'ppt'].includes(ext)
      ) {
        // The client extracts text from office files using mammoth/sheetjs
        // and sends as a .txt file. If raw office file arrives, skip.
        results.push({
          name: file.name, status: 'skipped',
          reason: 'Office files are pre-processed by browser — should arrive as text',
        })
        continue
      }

      // ── WhatsApp export (.txt files) ───────────────────────────────────
      else if (ext === 'txt' || mime === 'text/plain') {
        const text = await file.text()
        extracted = await extractFromText(text.slice(0, 8000), file.name)
      }

      // ── Unsupported ────────────────────────────────────────────────────
      else {
        results.push({ name: file.name, status: 'skipped', reason: `Unsupported file type: ${ext}` })
        continue
      }

      if (!extracted) {
        results.push({ name: file.name, status: 'error', reason: 'Extraction returned empty' })
        continue
      }

      // ── Save extracted insights as memories ───────────────────────────
      const memoriesCreated = await saveExtractedInsights(user.id, file.name, extracted)
      totalMemoriesCreated += memoriesCreated

      results.push({ name: file.name, status: 'processed', memoriesCreated })

      // ── Raw file is NEVER stored — it's processed in memory and discarded ──
      // Nothing to delete — we never saved it to disk or storage bucket

    } catch (err: any) {
      console.error(`Error processing ${file.name}:`, err)
      results.push({ name: file.name, status: 'error', reason: err.message || 'Processing failed' })
    }
  }

  return NextResponse.json({
    processed: results.filter(r => r.status === 'processed').length,
    skipped:   results.filter(r => r.status === 'skipped').length,
    errors:    results.filter(r => r.status === 'error').length,
    totalMemoriesCreated,
    results,
  })
}

// ── Extractors ─────────────────────────────────────────────────────────────

async function extractFromText(text: string, filename: string) {
  // Detect if it's WhatsApp export
  const isWhatsApp = text.includes(' - ') && (text.includes(': ') || filename.toLowerCase().includes('whatsapp'))

  const taskDescription = isWhatsApp
    ? `This is a WhatsApp chat export. Extract the personality, communication style, values, opinions, and behavioral patterns of the main person (not all participants). Focus on how they express themselves, what they care about, their humor, their decision-making, their relationships.`
    : `This is a document or text file named "${filename}". Extract any personality insights, values, beliefs, communication style, expertise, opinions, or behavioral patterns that reveal who the author is as a person.`

  return await runHaikuExtraction(text, taskDescription)
}

async function extractFromPDF(base64: string, filename: string) {
  try {
    // ── HAIKU reads PDF via document API ──────────────────────────────────
    const res = await claude.messages.create({
      model:      MODELS.EXTRACTION,
      max_tokens: MAX_TOKENS.EXTRACTION,
      system: buildExtractionPrompt(
        `Extract personality insights from this PDF document named "${filename}". ` +
        `Focus on: values, beliefs, communication style, expertise, opinions, behavioral patterns, ` +
        `decision-making, relationships. Return JSON: ` +
        `{"memories":["insight 1","insight 2"],"patterns":"communication style","topics":["topic1"],"insights":"1-2 sentence summary of what this reveals about the person"}`
      ),
      messages: [{
        role: 'user',
        content: [{
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as any, {
          type: 'text',
          text: 'Extract personality insights from this document.',
        }],
      }],
    })

    return parseExtraction(res.content[0].type === 'text' ? res.content[0].text : '{}')
  } catch {
    // Fallback: some PDFs fail — return null and skip
    return null
  }
}

async function extractFromImage(base64: string, mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', filename: string) {
  try {
    // ── SONNET reads images (Haiku vision is weaker) ───────────────────
    const res = await claude.messages.create({
      model:      MODELS.INTERVIEW, // Sonnet — better vision
      max_tokens: 600,
      system: buildExtractionPrompt(
        `Analyze this image to extract personality insights about the person who took it or is featured in it. ` +
        `Consider: what environment are they in, what does their expression/posture reveal, what activities, ` +
        `what possessions are visible, what does this say about their lifestyle, values, relationships, priorities? ` +
        `Return JSON: {"memories":["insight 1","insight 2"],"patterns":"visual communication style","topics":["topic1"],"insights":"1-2 sentence summary"}`
      ),
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64 },
        }, {
          type: 'text',
          text: 'What does this image reveal about the person who took it or is in it?',
        }],
      }],
    })

    return parseExtraction(res.content[0].type === 'text' ? res.content[0].text : '{}')
  } catch {
    return null
  }
}

async function runHaikuExtraction(text: string, taskDescription: string) {
  const res = await claude.messages.create({
    model:      MODELS.EXTRACTION,
    max_tokens: MAX_TOKENS.EXTRACTION,
    system:     buildExtractionPrompt(
      `${taskDescription} ` +
      `Return JSON: {"memories":["insight 1","insight 2","insight 3"],"patterns":"communication style","topics":["topic1","topic2"],"insights":"1-2 sentence summary of what this reveals about the person"}`
    ),
    messages: [{ role: 'user', content: text }],
  })

  return parseExtraction(res.content[0].type === 'text' ? res.content[0].text : '{}')
}

function parseExtraction(raw: string): { memories: string[]; patterns: string; topics: string[]; insights: string } {
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories.filter((m: any) => typeof m === 'string' && m.trim()) : [],
      patterns: parsed.patterns || '',
      topics:   Array.isArray(parsed.topics) ? parsed.topics : [],
      insights: parsed.insights || '',
    }
  } catch {
    return { memories: [], patterns: '', topics: [], insights: raw.slice(0, 200) }
  }
}

async function saveExtractedInsights(
  userId: string,
  filename: string,
  extracted: { memories: string[]; patterns: string; topics: string[]; insights: string }
): Promise<number> {
  let count = 0
  const ext  = filename.split('.').pop()?.toLowerCase() || 'file'
  const date = new Date().toLocaleDateString('id-ID')

  // Save each memory as its own entry for searchability
  for (const memory of extracted.memories.slice(0, 5)) {
    if (!memory.trim()) continue
    await db.from('memories').insert({
      user_id:   userId,
      title:     `[${ext.toUpperCase()}] ${filename} — ${date}`,
      content:   memory,
      category:  getCategoryFromExt(ext),
      source:    `upload_${ext}`,
      importance: 6,
    })
    count++
  }

  // Save patterns to persona table if substantial
  if (extracted.patterns && extracted.patterns.length > 30) {
    await db.from('persona').upsert({
      user_id:    userId,
      field_id:   `file_pattern_${filename.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
      category:   'communication',
      question:   `Communication pattern from ${filename}`,
      answer:     extracted.patterns,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,field_id' })
  }

  // Save combined summary if we have insights
  if (extracted.insights && extracted.insights.length > 20) {
    await db.from('memories').insert({
      user_id:   userId,
      title:     `Summary: ${filename}`,
      content:   `${extracted.insights}${extracted.topics.length ? `\n\nTopics: ${extracted.topics.join(', ')}` : ''}`,
      category:  getCategoryFromExt(ext),
      source:    `upload_${ext}`,
      importance: 7,
    })
    count++
  }

  return count
}

function getCategoryFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'Document', docx: 'Document', doc: 'Document',
    pptx: 'Presentation', ppt: 'Presentation',
    xlsx: 'Data', xls: 'Data', csv: 'Data',
    jpg: 'Photo', jpeg: 'Photo', png: 'Photo', gif: 'Photo', webp: 'Photo',
    txt: 'Text Import', md: 'Notes',
    mp3: 'Audio', wav: 'Audio', m4a: 'Audio',
  }
  return map[ext] || 'Document'
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return map[ext] || 'application/octet-stream'
}
