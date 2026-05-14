import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db, isEmailRegistered } from '@/lib/supabase'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase()
      if (!email) return false
      const ok = await isEmailRegistered(email)
      if (!ok) return '/waitlist'
      await db.from('users').upsert({
        email,
        name:        user.name,
        avatar_url:  user.image,
        is_registered: true,
        last_active: new Date().toISOString(),
      }, { onConflict: 'email' })
      return true
    },
    async session({ session }) {
      if (!session.user?.email) return session
      const { data } = await db
        .from('users')
        .select('id, plan, clone_status, clone_price')
        .eq('email', session.user.email.toLowerCase())
        .single()
      if (data) {
        const u = session.user as any
        u.id = data.id; u.plan = data.plan
        u.cloneStatus = data.clone_status; u.clonePrice = data.clone_price
      }
      return session
    },
  },
  pages: { signIn: '/login', error: '/login' },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
