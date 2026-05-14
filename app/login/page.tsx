'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function Login() {
  const [loading, setLoading] = useState(false)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #FDF8F0 0%, #F5EDD8 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      padding: '24px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Inter:wght@300;400;500&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .a{animation:fadeUp .5s ease forwards}
        .b{animation:fadeUp .5s ease .12s forwards;opacity:0}
        .c{animation:fadeUp .5s ease .24s forwards;opacity:0}
        .login-btn:hover{background:#9A6820!important}
        .login-btn:active{transform:scale(0.98)}
      `}</style>

      {/* Logo */}
      <div className="a" style={{ marginBottom: '52px', textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Lora', serif",
          fontWeight: 600,
          fontSize: '36px',
          color: '#3C2A0E',
          letterSpacing: '-0.01em',
        }}>
          rowang<span style={{ color: '#B47B2E' }}>.id</span>
        </div>
        <div style={{
          fontSize: '13px',
          color: '#A08050',
          marginTop: '6px',
          letterSpacing: '0.08em',
        }}>
          YOUR AI IDENTITY PLATFORM
        </div>
      </div>

      {/* Card */}
      <div className="b" style={{
        background: '#FFFFFF',
        border: '0.5px solid #E8DEC8',
        borderRadius: '20px',
        padding: '40px 36px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 4px 24px rgba(60, 42, 14, 0.08)',
        textAlign: 'center',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          background: '#FDF0DC',
          border: '0.5px solid #E8DEC8',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: '24px',
        }}>
          ✦
        </div>

        <h1 style={{
          fontFamily: "'Lora', serif",
          fontWeight: 500,
          fontSize: '22px',
          color: '#3C2A0E',
          marginBottom: '8px',
        }}>
          Welcome back
        </h1>

        <p style={{
          color: '#A08050',
          fontSize: '14px',
          marginBottom: '32px',
          lineHeight: '1.65',
        }}>
          Sign in to continue building your<br />AI identity. Invitation only.
        </p>

        <button
          className="login-btn"
          onClick={async () => { setLoading(true); await signIn('google', { callbackUrl: '/dashboard' }) }}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px 20px',
            background: '#B47B2E',
            color: '#FFF8EC',
            border: 'none',
            borderRadius: '12px',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.15s',
          }}
        >
          {loading ? 'Signing in...' : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p style={{ marginTop: '20px', fontSize: '12px', color: '#C8A462', lineHeight: '1.6' }}>
          Not registered? Contact the admin<br />to get your email added.
        </p>
      </div>

      {/* Tagline */}
      <div className="c" style={{ marginTop: '44px', textAlign: 'center' }}>
        <p style={{ color: '#C8A462', fontSize: '13px', lineHeight: '1.9' }}>
          Build your AI clone. Reach 95% identity confidence.<br />
          <span style={{ color: '#B47B2E', fontWeight: 500 }}>Own it. Share it. Sell it.</span>
        </p>
      </div>
    </div>
  )
}
