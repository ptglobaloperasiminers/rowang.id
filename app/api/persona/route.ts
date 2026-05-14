import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db, getUserByEmail } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await db.from('persona').select('*').eq('user_id', user.id)
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getUserByEmail(session.user.email)
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { field_id, category, question, answer } = await req.json()
  const { data } = await db.from('persona').upsert({
    user_id: user.id, field_id, category, question, answer,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,field_id' }).select()
  return NextResponse.json({ data })
}
