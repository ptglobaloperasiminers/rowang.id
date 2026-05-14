import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { db, getUserByEmail } from '@/lib/supabase'
import { buildExtractionPrompt } from '@/lib/prompts'
import { MODELS, MAX_TOKENS } from '@/lib/models'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await db.from('memories').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const { data } = await db.from('memories').insert({ user_id: user.id, ...body }).select()
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { id } = await req.json()
  await db.from('memories').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { raw, source } = await req.json()
  if (!raw?.trim()) return NextResponse.json({ error: 'No data' }, { status: 400 })

  try {
    const res = await claude.messages.create({
      model: MODELS.EXTRACTION,
      max_tokens: MAX_TOKENS.EXTRACTION,
      system: buildExtractionPrompt(
        'Analyze raw message/chat/document data and extract personality insights. ' +
        'Return JSON: {"title":"short title","summary":"2-3 sentence summary","patterns":"communication style","topics":["topic1"],"insights":["insight1"],"tone":"emotional tone"}'
      ),
      messages: [{ role: 'user', content: raw.slice(0, 4000) }],
    })

    const rawText = res.content[0].type === 'text' ? res.content[0].text : '{}'
    let p: any = {}
    try { p = JSON.parse(rawText.replace(/```json|```/g, '').trim()) } catch {}

    const content = [p.summary, p.patterns && `Patterns: ${p.patterns}`,
      p.topics?.length && `Topics: ${p.topics.join(', ')}`,
      p.insights?.length && `Insights: ${p.insights.join(' | ')}`].filter(Boolean).join('\n\n')

    const { data } = await db.from('memories').insert({
      user_id: user.id,
      title: p.title || `${source || 'Import'} — ${new Date().toLocaleDateString('id-ID')}`,
      content: content || raw.slice(0, 1500),
      category: 'Extracted Pattern', source: source || 'paste', importance: 7,
    }).select()

    return NextResponse.json({ data, extracted: p })
  } catch {
    const { data } = await db.from('memories').insert({
      user_id: user.id,
      title: `Raw import — ${new Date().toLocaleDateString('id-ID')}`,
      content: raw.slice(0, 2000), category: 'Raw Import', source: 'paste', importance: 4,
    }).select()
    return NextResponse.json({ data })
  }
}
