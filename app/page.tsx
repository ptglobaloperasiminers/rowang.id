// This file is app/page.tsx
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from './api/auth/[...nextauth]/route'
export default async function Root() {
  const s = await getServerSession(authOptions)
  redirect(s ? '/dashboard' : '/login')
}
