import { createClient } from '@supabase/supabase-js'

// Client-side
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Server-side — bypasses RLS
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getUserByEmail(email: string) {
  const { data } = await db
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single()
  return data
}

export async function isEmailRegistered(email: string) {
  const { data } = await db
    .from('registered_emails')
    .select('email')
    .eq('email', email.toLowerCase())
    .single()
  return !!data
}
