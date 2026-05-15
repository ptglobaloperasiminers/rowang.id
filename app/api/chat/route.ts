import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { db, getUserByEmail } from '@/lib/supabase'
import { buildFullPersonaPrompt } from '@/lib/prompts'
import { MODELS, MAX_TOKENS } from '@/lib/models'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { messages, targetUserId } = await req.json()
  const ownerId = targetUserId || user.id

  const [personaRes, memoriesRes, voiceRes, ownerRes] = await Promise.all([
    db.from('persona').select('field_id,answer').eq('user_id', ownerId),
    db.from('memories').select('*').eq('user_id', ownerId).order('importance', { ascending: false }).limit(20),
    db.from('voice_recordings').select('transcript').eq('user_id', ownerId).eq('processed', true).limit(5),
    db.from('users').select('name').eq('id', ownerId).single(),
  ])

  const personaMap: Record<string, string> = {}
  personaRes.data?.forEach(r => { if (r.answer) personaMap[r.field_id] = r.answer })

  const voicePatterns = (voiceRes.data || [])
    .map(r => r.transcript?.slice(0, 120)).filter(Boolean) as string[]

  // ── OPUS: premium clone output ─────────────────────────────────────────
  const system = buildFullPersonaPrompt(
    ownerRes.data?.name || 'this person',
    personaMap,
    memoriesRes.data || [],
    voicePatterns
  )

  const stream = await claude.messages.stream({
    model:      MODELS.CLONE,
    max_tokens: MAX_TOKENS.CLONE,
    system,
    messages:   messages.slice(-20),
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
      db.from('chat_sessions').insert({
        owner_user_id: ownerId,
        visitor_name:  user.name || user.email,
        messages:      [...messages, { role: 'assistant', content: full }],
      }).then(() => {})
      ctrl.close()
    },
  })

  return new NextResponse(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
