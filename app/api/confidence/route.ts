import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { db, getUserByEmail } from '@/lib/supabase'
import { calculateConfidence, TOTAL_FIELDS } from '@/lib/confidence'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [personaRes, memoriesRes, voiceRes, mediaRes, chatRes, calRes] = await Promise.all([
    db.from('persona').select('field_id,answer').eq('user_id', user.id),
    db.from('memories').select('id', { count: 'exact' }).eq('user_id', user.id),
    db.from('voice_recordings').select('duration_seconds').eq('user_id', user.id),
    db.from('media_uploads').select('type').eq('user_id', user.id),
    db.from('chat_sessions').select('id', { count: 'exact' }).eq('owner_user_id', user.id),
    db.from('calibration').select('verdict').eq('user_id', user.id),
  ])

  const answeredFields = (personaRes.data || []).filter(r => r.answer?.trim()).length
  const voiceSeconds   = (voiceRes.data || []).reduce((s, r) => s + (r.duration_seconds || 0), 0)
  const photoCount     = (mediaRes.data || []).filter(m => m.type === 'photo').length
  const videoCount     = (mediaRes.data || []).filter(m => m.type === 'video').length
  const calibrations   = calRes.data || []

  const breakdown = calculateConfidence({
    answeredFields,
    memoryCount:  memoriesRes.count || 0,
    voiceSeconds,
    photoCount,
    videoCount,
    chatCount:    chatRes.count || 0,
    yesVotes:     calibrations.filter(c => c.verdict === 'yes').length,
    noVotes:      calibrations.filter(c => c.verdict === 'no').length,
  })

  if (breakdown.isUnlocked && user.clone_status === 'building') {
    await db.from('users').update({ clone_status: 'unlocked' }).eq('id', user.id)
  }

  return NextResponse.json({ breakdown, cloneStatus: user.clone_status })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { question, ai_response, verdict, note } = await req.json()
  await db.from('calibration').insert({ user_id: user.id, question, ai_response, verdict, note })
  return NextResponse.json({ ok: true })
}
