import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db, getUserByEmail } from '@/lib/supabase'
import { buildInterviewPrompt, buildExtractionPrompt } from '@/lib/prompts'
import { MODELS, MAX_TOKENS } from '@/lib/models'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Send a message — SONNET conducts, HAIKU extracts in background
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { category, messages, sessionId } = await req.json()

  const { data: rows } = await db.from('persona').select('field_id,answer').eq('user_id', user.id)
  const existing: Record<string, string> = {}
  rows?.forEach(r => { if (r.answer) existing[r.field_id] = r.answer })

  // ── SONNET: interview conductor ────────────────────────────────────────
  const stream = await claude.messages.stream({
    model:      MODELS.INTERVIEW,
    max_tokens: MAX_TOKENS.INTERVIEW,
    system:     buildInterviewPrompt(category, existing, messages?.length || 0),
    messages:   messages?.slice(-16) || [],
  })

  let full = ''
  const enc = new TextEncoder()
  const readable = new ReadableStream({
    async start(ctrl) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          ctrl.enqueue(enc.encode(chunk.delta.text))
          full += chunk.delta.text
        }
      }
      if (sessionId) {
        const updated = [...(messages || []), { role: 'assistant', content: full }]
        db.from('interview_sessions').update({ messages: updated }).eq('id', sessionId).then(() => {})
      }
      // ── HAIKU: background extraction ──────────────────────────────────
      if ((messages?.length || 0) >= 6) extractInsights(user.id, category, messages, full)
      ctrl.close()
    },
  })

  return new NextResponse(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

// Start session — SONNET generates opening question
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { category } = await req.json()

  const { data: sess } = await db
    .from('interview_sessions')
    .insert({ user_id: user.id, category, messages: [], status: 'active' })
    .select().single()

  const { data: rows } = await db.from('persona').select('field_id,answer').eq('user_id', user.id)
  const existing: Record<string, string> = {}
  rows?.forEach(r => { if (r.answer) existing[r.field_id] = r.answer })

  // ── SONNET: opening question ───────────────────────────────────────────
  const res = await claude.messages.create({
    model:      MODELS.INTERVIEW,
    max_tokens: MAX_TOKENS.INTERVIEW,
    system:     buildInterviewPrompt(category, existing, 0),
    messages:   [{ role: 'user', content: `Begin the ${category} interview. Ask your first question now.` }],
  })

  const opening = res.content[0].type === 'text' ? res.content[0].text
    : `Let's start with ${category}. What's most fundamental to who you are in this area?`

  await db.from('interview_sessions')
    .update({ messages: [{ role: 'assistant', content: opening }] })
    .eq('id', sess?.id)

  return NextResponse.json({ sessionId: sess?.id, opening })
}

// ── HAIKU: extract structured insights from conversation ─────────────────
async function extractInsights(
  userId: string, category: string,
  messages: { role: string; content: string }[], lastReply: string
) {
  try {
    const userText = messages
      .filter(m => m.role === 'user').map(m => m.content).join('\n---\n').slice(0, 2500)

    const res = await claude.messages.create({
      model:      MODELS.EXTRACTION,
      max_tokens: MAX_TOKENS.EXTRACTION,
      system:     buildExtractionPrompt(
        `Extract key personality insights from this interview transcript about "${category}". ` +
        `Return a JSON object — keys are snake_case field names, values are 1-3 sentence insights.`
      ),
      messages: [{ role: 'user', content: userText }],
    })

    const raw = res.content[0].type === 'text' ? res.content[0].text : '{}'
    let insights: Record<string, string> = {}
    try { insights = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}

    for (const [key, val] of Object.entries(insights)) {
      if (typeof val !== 'string' || !val.trim()) continue
      await db.from('persona').upsert({
        user_id:  userId,
        field_id: `ai_${category.replace(/\s+/g,'_').toLowerCase()}_${key}`,
        category, question: key.replace(/_/g,' '), answer: val,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,field_id' })
    }
  } catch (e) { console.error('Extraction failed:', e) }
}
