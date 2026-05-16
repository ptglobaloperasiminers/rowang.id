import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { db, getUserByEmail } from '@/lib/supabase'
import { buildExtractionPrompt } from '@/lib/prompts'
import { MODELS, MAX_TOKENS } from '@/lib/models'

// No OpenAI — uses browser Web Speech API for transcription
// Haiku extracts personality patterns from transcript

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form          = await req.formData()
  const duration      = parseInt(form.get('duration') as string || '0')
  const preTranscript = (form.get('transcript') as string || '').trim()

  if (!preTranscript) {
    return NextResponse.json({ error: 'No transcript received.' }, { status: 400 })
  }

  // Save recording
  const { data: rec } = await db.from('voice_recordings').insert({
    user_id:          user.id,
    duration_seconds: duration,
    transcript:       preTranscript,
    processed:        false,
  }).select().single()

  // Background: Haiku extracts personality patterns (cheap, fast)
  if (preTranscript.length > 60) {
    extractVoiceInsights(user.id, preTranscript, rec?.id, duration)
  }

  return NextResponse.json({ id: rec?.id, transcript: preTranscript, duration })
}

async function extractVoiceInsights(
  userId:     string,
  transcript: string,
  recId:      string | undefined,
  duration:   number
) {
  try {
    const res = await claude.messages.create({
      model:      MODELS.EXTRACTION,
      max_tokens: MAX_TOKENS.EXTRACTION,
      system:     buildExtractionPrompt(
        'Extract personality insights from this spoken transcript. ' +
        'Return JSON: {"title":"short title","summary":"2-3 sentence summary",' +
        '"communication_patterns":"how they speak","topics":["topic1"],' +
        '"key_quotes":["phrase1"],"emotional_tone":"description"}'
      ),
      messages: [{ role: 'user', content: transcript.slice(0, 3000) }],
    })

    const raw = res.content[0].type === 'text' ? res.content[0].text : '{}'
    let p: any = {}
    try { p = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}

    await db.from('memories').insert({
      user_id:    userId,
      title:      p.title || `Voice memo — ${new Date().toLocaleDateString('id-ID')}`,
      content:    [
        p.summary,
        p.communication_patterns && `Speaking style: ${p.communication_patterns}`,
        p.key_quotes?.length     && `Key phrases: ${p.key_quotes.join(' · ')}`,
        p.topics?.length         && `Topics: ${p.topics.join(', ')}`,
      ].filter(Boolean).join('\n\n'),
      category:   'Voice Recording',
      source:     'voice',
      importance: Math.min(10, Math.round(4 + duration / 120)),
    })

    if (p.communication_patterns) {
      await db.from('persona').upsert({
        user_id:    userId,
        field_id:   `voice_pattern_${Date.now()}`,
        category:   'communication',
        question:   'Communication pattern from voice',
        answer:     p.communication_patterns,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,field_id' })
    }

    if (recId) {
      await db.from('voice_recordings').update({ processed: true }).eq('id', recId)
    }
  } catch (e) { console.error('Voice insight extraction error:', e) }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data } = await db
    .from('voice_recordings').select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  return NextResponse.json({ data })
}
