'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function Login() {
  const [loading, setLoading] = useState(false)
  return (
    <div style={{ minHeight:'100vh', background:'#080808', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:"'Lato',sans-serif", padding:'20px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Space+Mono&display=swap');
        @keyframes fu{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .a{animation:fu .4s ease forwards}
        .b{animation:fu .4s ease .12s forwards;opacity:0}
        .c{animation:fu .4s ease .24s forwards;opacity:0}
        button:hover{opacity:.85}
      `}</style>

      <div className="a" style={{ marginBottom:'44px', textAlign:'center' }}>
        <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:'38px', color:'#C9A84C', letterSpacing:'-.01em' }}>
          rowang<span style={{ color:'#E8E8E4' }}>.id</span>
        </div>
        <div style={{ fontFamily:'Space Mono', fontSize:'10px', color:'#2A2A2A', marginTop:'8px', letterSpacing:'.18em' }}>
          AI IDENTITY PLATFORM
        </div>
      </div>

      <div className="b" style={{ background:'#0F0F0F', border:'0.5px solid #1A1A1A', borderRadius:'20px', padding:'38px 34px', width:'100%', maxWidth:'390px', textAlign:'center' }}>
        <h1 style={{ fontFamily:'Syne', fontWeight:800, fontSize:'21px', color:'#E8E8E4', marginBottom:'8px' }}>
          Sign in to your clone
        </h1>
        <p style={{ color:'#3A3A3A', fontSize:'13px', marginBottom:'30px', lineHeight:'1.65' }}>
          Access by invitation only.<br/>Your Google account must be pre-registered.
        </p>

        <button
          onClick={async () => { setLoading(true); await signIn('google', { callbackUrl: '/dashboard' }) }}
          disabled={loading}
          style={{ width:'100%', padding:'14px 18px', background:'rgba(201,168,76,0.08)', border:'0.5px solid rgba(201,168,76,0.28)', borderRadius:'11px', color:'#C9A84C', fontFamily:'Syne', fontWeight:800, fontSize:'13px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', letterSpacing:'.04em', transition:'opacity .15s' }}>
          {loading ? 'Signing in...' : (
            <>
              <svg width="17" height="17" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div style={{ marginTop:'22px', padding:'14px', background:'#0A0A0A', borderRadius:'10px', border:'0.5px solid #161616' }}>
          <p style={{ color:'#2A2A2A', fontSize:'11px', lineHeight:'1.75', fontFamily:'Space Mono' }}>
            Not registered?<br/>Contact admin to get your email added.
          </p>
        </div>
      </div>

      <div className="c" style={{ marginTop:'36px', textAlign:'center' }}>
        <p style={{ color:'#1A1A1A', fontSize:'11px', fontFamily:'Space Mono', lineHeight:'1.9' }}>
          Build your AI clone. Reach 95% confidence.<br/>
          <span style={{ color:'#C9A84C' }}>Own it, share it, or sell it.</span>
        </p>
      </div>
    </div>
  )
}
