import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from './api/auth/[...nextauth]/route'
import Provider from '@/components/Provider'

export const metadata: Metadata = {
  title: 'rowang.id — AI Identity Platform',
  description: 'Build, train, and deploy your personal AI clone.',
  robots: 'noindex, nofollow',
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#080808' }}>
        <Provider session={session}>{children}</Provider>
      </body>
    </html>
  )
}
