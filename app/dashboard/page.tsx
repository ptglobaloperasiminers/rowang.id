'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'

type Tab = 'home' | 'interview' | 'voice' | 'memories' | 'chat' | 'clone' | 'upload'
type Msg = { role: 'user' | 'assistant'; content: string }

const CATS = [
  { id: 'Identity & Values',        icon: '🧬', desc: 'Your core — what you\'d never compromise' },
  { id: 'Thinking & Decisions',     icon: '🧠', desc: 'How your mind actually works' },
  { id: 'Communication Style',      icon: '💬', desc: 'How you talk, write, express yourself' },
  { id: 'Relationships & People',   icon: '🤝', desc: 'How you see and handle people' },
  { id: 'Business & Work',          icon: '💼', desc: 'Your professional mind and ambitions' },
  { id: 'Opinions & Worldview',     icon: '🌏', desc: 'What you think about the world' },
  { id: 'Personality & Inner Life', icon: '✨', desc: 'The unguarded, human side of you' },
]

const VOICE_TOPICS = [
  'The biggest professional decision of your life — what happened, how you decided, what you learned',
  'What do you believe about Indonesian business that most people get wrong?',
  'A time you were really proud of how you handled a difficult situation',
  'Someone who shaped how you think — what did they teach you?',
  'What frustrates you most about how people approach your industry?',
  'Describe your real, actual productive working day',
  'Your most contrarian belief — one you\'d say publicly',
]

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab]   = useState<Tab>('home')
  const [conf, setConf] = useState<any>(null)

  // Interview
  const [iCat, setICat]       = useState<string|null>(null)
  const [iSessId, setISessId] = useState<string|null>(null)
  const [iMsgs, setIMsgs]     = useState<Msg[]>([])
  const [iInput, setIInput]   = useState('')
  const [iStream, setIStream] = useState(false)
  const [iStart, setIStart]   = useState(false)
  const [iMode, setIMode]     = useState<'text'|'voice'>('text')
  const [doneCats, setDone]   = useState<string[]>([])
  const iRef = useRef<HTMLDivElement>(null)

  // Voice
  const [vState, setVState]   = useState<'idle'|'rec'|'proc'|'done'>('idle')
  const [vSec, setVSec]       = useState(0)
  const [vTotal, setVTotal]   = useState(0)
  const [vText, setVText]     = useState('')
  const mRec   = useRef<MediaRecorder|null>(null)
  const mChunk = useRef<Blob[]>([])
  const mTimer = useRef<NodeJS.Timeout>()
  const mStart = useRef(0)

  // Memories
  const [mems, setMems]     = useState<any[]>([])
  const [mTitle, setMTitle] = useState('')
  const [mBody, setMBody]   = useState('')
  const [mSave, setMSave]   = useState(false)
  const [mPaste, setMPaste] = useState('')
  const [mProc, setMProc]   = useState(false)
  const [mTab, setMTab]     = useState<'add'|'paste'|'list'>('add')

  // Chat
  const [cMsgs, setCMsgs]   = useState<Msg[]>([])
  const [cInput, setCInput] = useState('')
  const [cStream, setCStream] = useState(false)
  const [lastQA, setLastQA] = useState<{q:string;a:string}|null>(null)
  const [calDone, setCalDone] = useState(false)
  const cRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (status === 'unauthenticated') router.push('/login') }, [status])
  useEffect(() => { if (session) { fetchConf(); fetchMems() } }, [session, tab])
  useEffect(() => { iRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [iMsgs])
  useEffect(() => { cRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [cMsgs])

  const fetchConf = async () => {
    const r = await fetch('/api/confidence')
    const { breakdown } = await r.json()
    setConf(breakdown)
  }
  const fetchMems = async () => {
    const r = await fetch('/api/memories')
    const { data } = await r.json()
    setMems(data || [])
  }

  // Interview
  const startCat = async (cat: string) => {
    setIStart(true); setICat(cat); setIMsgs([])
    const r = await fetch('/api/interview', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ category: cat }) })
    const { sessionId, opening } = await r.json()
    setISessId(sessionId); setIMsgs([{ role:'assistant', content:opening }]); setIStart(false)
  }

  const sendInterview = async (text?: string) => {
    const t = text || iInput.trim()
    if (!t || iStream) return
    const msgs: Msg[] = [...iMsgs, { role:'user', content:t }]
    setIMsgs([...msgs, { role:'assistant', content:'' }])
    setIInput(''); setIStream(true)
    const r = await fetch('/api/interview', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ category:iCat, messages:msgs, sessionId:iSessId }) })
    const reader = r.body!.getReader(); const dec = new TextDecoder(); let ai = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      ai += dec.decode(value, { stream:true })
      setIMsgs(p => { const c=[...p]; c[c.length-1]={role:'assistant',content:ai}; return c })
    }
    if (ai.includes("Let me ask about") || msgs.length > 22) {
      if (!doneCats.includes(iCat!)) setDone(p => [...p, iCat!])
    }
    setIStream(false); fetchConf()
  }

  // Voice
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      mRec.current = new MediaRecorder(stream, { mimeType:'audio/webm' })
      mChunk.current = []
      mRec.current.ondataavailable = e => { if (e.data.size>0) mChunk.current.push(e.data) }
      mRec.current.onstop = uploadRec
      mRec.current.start(250); mStart.current = Date.now()
      setVState('rec'); setVSec(0)
      mTimer.current = setInterval(() => setVSec(Math.floor((Date.now()-mStart.current)/1000)), 1000)
    } catch { alert('Microphone access denied — please allow mic in browser settings') }
  }

  const stopRec = () => {
    mRec.current?.stop(); mRec.current?.stream.getTracks().forEach(t=>t.stop())
    clearInterval(mTimer.current); setVState('proc')
  }

  const uploadRec = async () => {
    const dur  = Math.floor((Date.now()-mStart.current)/1000)
    const blob = new Blob(mChunk.current, { type:'audio/webm' })
    const file = new File([blob], 'rec.webm', { type:'audio/webm' })
    const form = new FormData(); form.append('audio', file); form.append('duration', String(dur))
    try {
      const r = await fetch('/api/upload/voice', { method:'POST', body:form })
      const d = await r.json()
      setVText(d.transcript||''); setVTotal(p=>p+dur); setVState('done'); fetchConf()
    } catch { setVState('idle'); alert('Upload failed — check your connection') }
  }

  const ft = (s:number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  // Memories
  const saveMem = async () => {
    if (!mTitle.trim()||!mBody.trim()) return
    setMSave(true)
    await fetch('/api/memories', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title:mTitle, content:mBody, category:'General', importance:6 }) })
    setMTitle(''); setMBody(''); await fetchMems(); await fetchConf(); setMSave(false); setMTab('list')
  }

  const processPaste = async () => {
    if (!mPaste.trim()) return
    setMProc(true)
    await fetch('/api/memories', { method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ raw:mPaste, source:'paste' }) })
    setMPaste(''); await fetchMems(); await fetchConf(); setMProc(false); setMTab('list')
  }

  // Chat
  const sendChat = async () => {
    const t = cInput.trim()
    if (!t || cStream) return
    const msgs: Msg[] = [...cMsgs, { role:'user', content:t }]
    setCMsgs([...msgs, { role:'assistant', content:'' }])
    setCInput(''); setCStream(true); setLastQA(null); setCalDone(false)
    const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages:msgs }) })
    const reader = r.body!.getReader(); const dec = new TextDecoder(); let ai = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      ai += dec.decode(value, { stream:true })
      setCMsgs(p => { const c=[...p]; c[c.length-1]={role:'assistant',content:ai}; return c })
    }
    setLastQA({ q:t, a:ai }); setCStream(false); fetchConf()
  }

  const calibrate = async (verdict:'yes'|'no') => {
    if (!lastQA) return
    await fetch('/api/confidence', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ question:lastQA.q, ai_response:lastQA.a, verdict }) })
    setCalDone(true); fetchConf()
  }

  if (status==='loading') return <div style={S.center}><span style={{ fontFamily:'Space Mono',fontSize:'13px',color:'#333' }}>Loading...</span></div>

  const pct  = conf?.total ?? 0
  const user = session?.user as any

  const NAV: [Tab,string,string][] = [
    ['home','◈','Home'], ['interview','◉','Interview'], ['voice','◎','Voice'],
    ['memories','○','Memories'], ['chat','◐','Test Clone'], ['upload','⇣','Upload Files'], ['clone','◍','My Clone'],
  ]

  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {/* SIDEBAR */}
      <aside style={S.sidebar}>
        <div style={S.sTop}>
          <div style={S.logo}>rowang<span style={{ color:'#E8E8E4' }}>.id</span></div>
          <div style={S.logoSub}>AI IDENTITY PLATFORM</div>
        </div>
        {user && (
          <div style={S.uRow}>
            {user.image && <img src={user.image} style={S.av} alt="" />}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={S.uName}>{user.name}</div>
              <div style={S.uEmail}>{user.email}</div>
            </div>
          </div>
        )}
        <div style={S.cBox}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'8px' }}>
            <span style={S.mono}>CONFIDENCE</span>
            <span style={{ fontFamily:'Syne', fontWeight:800, fontSize:'22px', color:'#C9A84C' }}>{pct}%</span>
          </div>
          <div style={S.bar}><div style={{ ...S.barFill, width:`${pct}%` }} /></div>
          <div style={{ fontSize:'11px', color:'#444', marginTop:'4px' }}>{conf?.label ?? '—'}</div>
        </div>
        <nav style={{ flex:1, padding:'8px' }}>
          {NAV.map(([id,icon,label]) => (
            <button key={id} onClick={() => { setTab(id); if(id==='interview') setICat(null) }}
              style={{ ...S.navBtn, ...(tab===id ? S.navOn : {}) }}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        {conf && (
          <div style={S.scoreBox}>
            {([['Interview',conf.interview,30],['Voice',conf.voice,20],['Memories',conf.memories,20],['Media',conf.media,10],['Calibrate',conf.calibration,15]] as [string,number,number][]).map(([l,v,m]) => (
              <div key={l} style={{ marginBottom:'5px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#333', marginBottom:'2px' }}>
                  <span>{l}</span><span style={{ fontFamily:'Space Mono' }}>{v}/{m}</span>
                </div>
                <div style={{ height:'2px', background:'#161616', borderRadius:'2px' }}>
                  <div style={{ height:'100%', width:`${(v/m)*100}%`, background:'rgba(201,168,76,0.45)', borderRadius:'2px', transition:'width .7s' }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop:'8px', fontSize:'9px', color:'#222', fontFamily:'Space Mono', lineHeight:'1.6' }}>
              Interview→Sonnet<br/>Chat→Opus · Extract→Haiku
            </div>
          </div>
        )}
        <button onClick={() => signOut()} style={{ margin:'0 18px 16px', background:'none', border:'none', color:'#282828', fontSize:'11px', cursor:'pointer', fontFamily:'Lato', textAlign:'left' }}>Sign out</button>
      </aside>

      {/* MAIN */}
      <main style={S.main}>

        {/* HOME */}
        {tab==='home' && (
          <div className="fade">
            <h1 style={S.h1}>Welcome, <span style={{ color:'#C9A84C' }}>{user?.name?.split(' ')[0]}</span></h1>
            <p style={S.sub}>{conf?.nextAction ?? 'Start building your AI clone'}</p>
            <div style={S.confCard}>
              <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', marginBottom:'14px' }}>
                <span style={{ fontFamily:'Syne', fontWeight:800, fontSize:'62px', color:'#C9A84C', lineHeight:1 }}>{pct}</span>
                <span style={{ fontFamily:'Syne', fontSize:'26px', color:'#2A2A2A', marginBottom:'6px' }}>% confidence</span>
              </div>
              <div style={{ height:'6px', background:'#0A0A0A', borderRadius:'6px', overflow:'hidden', marginBottom:'8px' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#C9A84C,#F0D078)', borderRadius:'6px', transition:'width 1.5s ease' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#2A2A2A', fontFamily:'Space Mono' }}>
                <span>0%</span>
                <span style={{ color:pct>=85?'#C9A84C':'#2A2A2A' }}>85% clone unlocks</span>
                <span style={{ color:pct>=95?'#C9A84C':'#2A2A2A' }}>95% can sell</span>
              </div>
            </div>
            {conf?.isUnlocked && (
              <div style={{ ...S.card, borderColor:'rgba(76,201,108,0.25)', background:'rgba(76,201,108,0.04)', marginBottom:'12px' }}>
                <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:'14px', color:'#4CC96C', marginBottom:'3px' }}>🎉 Clone unlocked at {pct}%</div>
                <p style={{ fontSize:'12px', color:'rgba(76,201,108,0.65)', lineHeight:'1.6' }}>Your AI clone is active. Go to My Clone tab to share or list it for sale.</p>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              {([['interview','◉','AI Interview','Sonnet asks, follows up, goes deep'],['voice','◎','Voice Recording','Whisper + Haiku extract patterns'],['memories','○','Add Memory','Stories, decisions, WhatsApp exports'],['chat','◐','Test Clone','Opus responds · rate to calibrate']] as [Tab,string,string,string][]).map(([id,ic,ti,su]) => (
                <button key={id} onClick={()=>setTab(id)} style={S.aCard}
                  onMouseOver={e=>(e.currentTarget.style.borderColor='rgba(201,168,76,0.28)')}
                  onMouseOut={e=>(e.currentTarget.style.borderColor='#161616')}>
                  <span style={{ fontSize:'20px' }}>{ic}</span>
                  <div><div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'13px' }}>{ti}</div>
                  <div style={{ fontSize:'11px', color:'#444', marginTop:'2px' }}>{su}</div></div>
                </button>
              ))}
            </div>
            <div style={{ ...S.card, marginTop:'12px' }}>
              <div style={S.mono}>MODEL ROUTING</div>
              {[['Haiku','Extraction, voice patterns, WhatsApp analysis','#2A2A2A'],['Sonnet','AI interview conductor — asks, follows up','#3A3A3A'],['Opus','Clone chat — premium quality, where you\'re judged','#C9A84C']].map(([m,d,c])=>(
                <div key={m} style={{ display:'flex', gap:'10px', alignItems:'center', fontSize:'12px', marginTop:'8px' }}>
                  <span style={{ fontFamily:'Space Mono', color:c, minWidth:'52px' }}>{m}</span>
                  <span style={{ color:'#3A3A3A', flex:1 }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INTERVIEW — category list */}
        {tab==='interview' && !iCat && (
          <div className="fade">
            <h1 style={S.h1}>AI <span style={{ color:'#C9A84C' }}>Interview</span></h1>
            <p style={S.sub}>Sonnet asks deep questions, follows up, and keeps going until it has what it needs.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {CATS.map(cat => {
                const done = doneCats.includes(cat.id)
                return (
                  <button key={cat.id} onClick={()=>startCat(cat.id)} style={{ ...S.aCard, flexDirection:'row', alignItems:'center', gap:'14px', borderColor:done?'rgba(76,201,108,0.25)':'#161616', background:done?'rgba(76,201,108,0.03)':'#0F0F0F' }}
                    onMouseOver={e=>(e.currentTarget.style.borderColor=done?'rgba(76,201,108,0.45)':'rgba(201,168,76,0.28)')}
                    onMouseOut={e=>(e.currentTarget.style.borderColor=done?'rgba(76,201,108,0.25)':'#161616')}>
                    <span style={{ fontSize:'20px' }}>{cat.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'13px', color:done?'#4CC96C':'#E8E8E4' }}>{done?'✓ ':''}{cat.id}</div>
                      <div style={{ fontSize:'11px', color:'#444', marginTop:'2px' }}>{cat.desc}</div>
                    </div>
                    <span style={{ color:'#2A2A2A' }}>→</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* INTERVIEW — chat */}
        {tab==='interview' && iCat && (
          <div className="fade">
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px' }}>
              <button onClick={()=>setICat(null)} style={S.back}>← Back</button>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'15px' }}>{iCat}</div>
                <div style={{ fontSize:'11px', color:'#444' }}>{iMsgs.filter(m=>m.role==='user').length} responses · Sonnet conducting</div>
              </div>
              <div style={{ display:'flex', gap:'4px' }}>
                {(['text','voice'] as const).map(m => (
                  <button key={m} onClick={()=>setIMode(m)} style={{ ...S.tabBtn, ...(iMode===m?S.tabOn:{}) }}>{m==='text'?'⌨ Text':'🎤 Voice'}</button>
                ))}
              </div>
            </div>
            {iStart ? (
              <div style={{ padding:'40px', textAlign:'center', color:'#333', fontFamily:'Space Mono', fontSize:'12px' }}>Starting interview...</div>
            ) : (
              <>
                <div style={S.chatBox}>
                  {iMsgs.map((m,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:m.role==='user'?'flex-end':'flex-start' }}>
                      <div style={m.role==='user'?S.mUser:S.mAI}>
                        {!m.content&&iStream&&i===iMsgs.length-1?<Dots/>:m.content}
                      </div>
                    </div>
                  ))}
                  <div ref={iRef}/>
                </div>
                {iMode==='text' ? (
                  <div style={{ display:'flex', gap:'8px' }}>
                    <textarea rows={2} value={iInput} onChange={e=>setIInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendInterview()}}}
                      disabled={iStream} placeholder="Answer honestly... (Enter to send)" style={S.ta}/>
                    <button onClick={()=>sendInterview()} disabled={iStream||!iInput.trim()} style={S.sendBtn}>{iStream?'...':'Send'}</button>
                  </div>
                ) : (
                  <VoiceBtn onTranscript={t=>sendInterview(t)}/>
                )}
              </>
            )}
          </div>
        )}

        {/* VOICE */}
        {tab==='voice' && (
          <div className="fade">
            <h1 style={S.h1}>Voice <span style={{ color:'#C9A84C' }}>Recording</span></h1>
            <p style={S.sub}>Speak about anything. Whisper transcribes, Haiku extracts your patterns.{vTotal>0?` ${ft(vTotal)} total recorded.`:''}</p>
            <div style={{ ...S.card, marginBottom:'16px' }}>
              {vState==='idle' && <button onClick={startRec} style={{ ...S.sendBtn, width:'100%', justifyContent:'center', padding:'14px' }}>🎤 Start Recording</button>}
              {vState==='rec' && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px' }}>
                    <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:'#C94C4C', animation:'pulse 1s infinite' }}/>
                    <span style={{ fontFamily:'Space Mono', fontSize:'20px', fontWeight:700 }}>{ft(vSec)}</span>
                    <span style={{ fontSize:'12px', color:'#555' }}>Recording...</span>
                  </div>
                  <button onClick={stopRec} style={{ width:'100%', padding:'12px', background:'rgba(201,76,76,0.08)', border:'0.5px solid rgba(201,76,76,0.28)', borderRadius:'8px', color:'#C94C4C', fontFamily:'Syne', fontWeight:800, fontSize:'13px', cursor:'pointer' }}>Stop & Transcribe</button>
                </div>
              )}
              {vState==='proc' && <div style={{ textAlign:'center', padding:'16px', color:'#444', fontFamily:'Space Mono', fontSize:'12px' }}>Whisper transcribing → Haiku extracting patterns...</div>}
              {vState==='done' && (
                <div>
                  <div style={{ background:'#0A0A0A', borderRadius:'8px', padding:'12px', marginBottom:'10px', fontSize:'12px', color:'#555', lineHeight:'1.6', maxHeight:'120px', overflowY:'auto', fontFamily:'Space Mono' }}>{vText}</div>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <div style={{ flex:1, padding:'8px', background:'rgba(76,201,108,0.08)', border:'0.5px solid rgba(76,201,108,0.28)', borderRadius:'8px', color:'#4CC96C', fontSize:'12px', textAlign:'center', fontFamily:'Syne', fontWeight:700 }}>✓ Saved & analyzed</div>
                    <button onClick={()=>{setVState('idle');setVText('')}} style={{ padding:'8px 14px', background:'none', border:'0.5px solid #1A1A1A', borderRadius:'8px', color:'#444', fontSize:'12px', cursor:'pointer', fontFamily:'Lato' }}>Record more</button>
                  </div>
                </div>
              )}
            </div>
            <div style={S.card}>
              <div style={S.mono}>TOPICS TO SPEAK ABOUT</div>
              {VOICE_TOPICS.map((t,i)=><div key={i} style={{ fontSize:'12px', color:'#444', padding:'7px 0', borderBottom:'0.5px solid #161616', lineHeight:'1.5' }}>· {t}</div>)}
            </div>
          </div>
        )}

        {/* MEMORIES */}
        {tab==='memories' && (
          <div className="fade">
            <h1 style={S.h1}>Memories <span style={{ color:'#C9A84C' }}>& Data</span></h1>
            <p style={S.sub}>{mems.length} memories stored · paste WhatsApp, emails, anything</p>
            <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
              {(['add','paste','list'] as const).map(t=>(
                <button key={t} onClick={()=>setMTab(t)} style={{ ...S.tabBtn, ...(mTab===t?S.tabOn:{}) }}>
                  {t==='add'?'+ Add':t==='paste'?'⇣ Paste':`◎ All (${mems.length})`}
                </button>
              ))}
            </div>
            {mTab==='add' && (
              <div style={S.card}>
                <input value={mTitle} onChange={e=>setMTitle(e.target.value)} placeholder="Memory title — e.g. How I handled my first big business loss" style={{ ...S.inp, marginBottom:'10px' }}/>
                <textarea rows={7} value={mBody} onChange={e=>setMBody(e.target.value)} placeholder="Tell the full story. Be specific — what happened, how you felt, what you decided, what you learned. The more real, the more accurate your clone becomes..." style={{ ...S.ta, marginBottom:'10px' }}/>
                <button onClick={saveMem} disabled={mSave||!mTitle.trim()||!mBody.trim()} style={{ ...S.sendBtn, width:'100%', justifyContent:'center', padding:'12px' }}>{mSave?'Saving...':'Save Memory →'}</button>
              </div>
            )}
            {mTab==='paste' && (
              <div style={S.card}>
                <div style={{ fontSize:'12px', color:'#444', lineHeight:'1.7', marginBottom:'12px' }}>
                  Export WhatsApp: open any chat → ⋮ → More → Export Chat (no media) → paste here.<br/>Haiku extracts your communication patterns automatically.
                </div>
                <textarea rows={11} value={mPaste} onChange={e=>setMPaste(e.target.value)} placeholder="Paste WhatsApp export, email threads, voice transcripts, or any text..." style={{ ...S.ta, fontFamily:'Space Mono', fontSize:'12px', marginBottom:'10px' }}/>
                <button onClick={processPaste} disabled={mProc||!mPaste.trim()} style={{ ...S.sendBtn, width:'100%', justifyContent:'center', padding:'12px' }}>{mProc?'⚡ Haiku extracting patterns...':'⚡ Extract Patterns →'}</button>
              </div>
            )}
            {mTab==='list' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {mems.length===0?<div style={{ textAlign:'center', padding:'30px', color:'#333', fontSize:'13px' }}>No memories yet</div>
                  :mems.map((m:any)=>(
                  <div key={m.id} style={S.card}>
                    <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'13px', marginBottom:'3px' }}>{m.title}</div>
                    <div style={{ fontSize:'11px', color:'#444', lineHeight:'1.5', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{m.content}</div>
                    <div style={{ fontSize:'10px', color:'#2A2A2A', marginTop:'5px', fontFamily:'Space Mono' }}>{m.category} · {m.source} · {new Date(m.created_at).toLocaleDateString('id-ID')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHAT */}
        {tab==='chat' && (
          <div className="fade">
            <h1 style={S.h1}>Test Your <span style={{ color:'#C9A84C' }}>Clone</span></h1>
            <p style={S.sub}>Opus responds as you. Rate each answer — calibration pushes you past 85%.</p>
            <div style={{ ...S.card, padding:0, overflow:'hidden', marginBottom:'10px' }}>
              <div style={{ padding:'14px 18px', borderBottom:'0.5px solid #161616', display:'flex', alignItems:'center', gap:'10px' }}>
                {user?.image && <img src={user.image} style={S.av} alt=""/>}
                <div>
                  <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'13px' }}>{user?.name} — AI Clone</div>
                  <div style={{ fontSize:'10px', color:conf?.isUnlocked?'#4CC96C':'#C9A84C' }}>{conf?.isUnlocked?'● Clone active':pct+'% building'} · Opus 4</div>
                </div>
              </div>
              <div style={{ ...S.chatBox, padding:'16px' }}>
                {cMsgs.length===0 && <div style={{ padding:'20px', textAlign:'center', color:'#2A2A2A', fontSize:'13px' }}>Ask your clone anything...</div>}
                {cMsgs.map((m,i)=>(
                  <div key={i} style={{ display:'flex', justifyContent:m.role==='user'?'flex-end':'flex-start' }}>
                    <div style={m.role==='user'?S.mUser:S.mAI}>{!m.content&&cStream&&i===cMsgs.length-1?<Dots/>:m.content}</div>
                  </div>
                ))}
                <div ref={cRef}/>
              </div>
              <div style={{ padding:'14px', borderTop:'0.5px solid #161616', display:'flex', gap:'8px' }}>
                <textarea rows={2} value={cInput} onChange={e=>setCInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}}
                  disabled={cStream} placeholder="Ask your clone... (Enter to send)" style={S.ta}/>
                <button onClick={sendChat} disabled={cStream||!cInput.trim()} style={S.sendBtn}>{cStream?'...':'Send'}</button>
              </div>
            </div>
            {lastQA && !cStream && (
              <div style={S.card}>
                <div style={S.mono}>CALIBRATE — was that response accurate?</div>
                <div style={{ marginTop:'10px' }}>
                  {calDone
                    ? <div style={{ fontSize:'13px', color:'#4CC96C', fontFamily:'Syne', fontWeight:700 }}>✓ Feedback saved</div>
                    : <div style={{ display:'flex', gap:'8px' }}>
                        <button onClick={()=>calibrate('yes')} style={{ flex:1, padding:'10px', background:'rgba(76,201,108,0.06)', border:'0.5px solid rgba(76,201,108,0.25)', borderRadius:'8px', color:'#4CC96C', fontFamily:'Syne', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>✓ I would say this</button>
                        <button onClick={()=>calibrate('no')} style={{ flex:1, padding:'10px', background:'rgba(201,76,76,0.06)', border:'0.5px solid rgba(201,76,76,0.25)', borderRadius:'8px', color:'#C94C4C', fontFamily:'Syne', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>✗ I would NOT say this</button>
                      </div>
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {/* UPLOAD */}
        {tab==='upload' && (
          <div className="fade">
            <h1 style={S.h1}>Upload <span style={{ color:'#C9A84C' }}>Files & Folders</span></h1>
            <p style={S.sub}>Drop any file — PDFs, Word docs, photos, WhatsApp exports. AI reads everything, extracts your identity insights, then deletes the raw files.</p>
            <BulkUploadInline onComplete={fetchConf} />
          </div>
        )}

        {/* CLONE */}
        {tab==='clone' && (
          <div className="fade">
            <h1 style={S.h1}>My <span style={{ color:'#C9A84C' }}>Clone</span></h1>
            <p style={S.sub}>Your digital identity entity. Own it, share it, or sell it.</p>
            {conf?.isUnlocked ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div style={{ ...S.card, textAlign:'center', padding:'28px' }}>
                  {user?.image && <img src={user.image} style={{ ...S.av, width:'60px', height:'60px', border:'2px solid #C9A84C', margin:'0 auto 12px' }} alt=""/>}
                  <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:'18px', marginBottom:'4px' }}>{user?.name}</div>
                  <div style={{ fontFamily:'Space Mono', fontSize:'10px', color:'#C9A84C', marginBottom:'14px' }}>{pct}% CONFIDENCE · CLONE ACTIVE</div>
                </div>
                <div style={S.card}>
                  <div style={S.mono}>YOUR CLONE LINK</div>
                  <div style={{ background:'#0A0A0A', border:'0.5px solid #161616', borderRadius:'8px', padding:'10px 14px', fontFamily:'Space Mono', fontSize:'12px', color:'#555', marginTop:'8px' }}>
                    rowang.id/clone/{(user?.id||'').slice(0,8)}
                  </div>
                </div>
                {conf?.canSell && (
                  <div style={{ ...S.card, borderColor:'rgba(201,168,76,0.2)', background:'rgba(201,168,76,0.03)' }}>
                    <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:'14px', color:'#C9A84C', marginBottom:'8px' }}>List Clone for Sale</div>
                    <p style={{ fontSize:'12px', color:'#444', lineHeight:'1.6', marginBottom:'12px' }}>At 95%+ your clone can be sold as a digital entity. Platform takes 20% commission.</p>
                    <input type="number" placeholder="Set price in USD (e.g. 500)" style={{ ...S.inp, marginBottom:'8px' }}/>
                    <button style={{ width:'100%', padding:'11px', background:'rgba(201,168,76,0.1)', color:'#C9A84C', border:'0.5px solid rgba(201,168,76,0.28)', borderRadius:'8px', fontFamily:'Syne', fontWeight:800, fontSize:'13px', cursor:'pointer' }}>List for Sale →</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...S.card, textAlign:'center', padding:'40px' }}>
                <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:'54px', color:'#C9A84C', marginBottom:'8px' }}>{pct}%</div>
                <div style={{ fontSize:'14px', color:'#444', marginBottom:'16px' }}>Clone unlocks at 85% confidence</div>
                <div style={{ height:'6px', background:'#0A0A0A', borderRadius:'6px', overflow:'hidden', marginBottom:'14px' }}>
                  <div style={{ height:'100%', width:`${Math.min((pct/85)*100,100)}%`, background:'#C9A84C', borderRadius:'6px' }}/>
                </div>
                <p style={{ fontSize:'12px', color:'#333', lineHeight:'1.7' }}>{conf?.nextAction}</p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

function Dots() {
  return <div style={{ display:'flex', gap:'4px', padding:'2px 0' }}>{[0,1,2].map(n=><div key={n} style={{ width:'6px',height:'6px',borderRadius:'50%',background:'#3A3A3A',animation:`bounce 1.4s infinite ${n*.2}s` }}/>)}</div>
}

function VoiceBtn({ onTranscript }: { onTranscript:(t:string)=>void }) {
  const [rec, setRec] = useState(false)
  const [proc, setProc] = useState(false)
  const mr = useRef<MediaRecorder|null>(null)
  const ch = useRef<Blob[]>([])
  const st = useRef(0)

  const toggle = async () => {
    if (rec) {
      mr.current?.stop(); mr.current?.stream.getTracks().forEach(t=>t.stop()); setRec(false); setProc(true)
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      mr.current = new MediaRecorder(stream, { mimeType:'audio/webm' }); ch.current = []
      mr.current.ondataavailable = e => { if(e.data.size>0) ch.current.push(e.data) }
      mr.current.onstop = async () => {
        const dur = Math.floor((Date.now()-st.current)/1000)
        const blob = new Blob(ch.current,{type:'audio/webm'})
        const file = new File([blob],'rec.webm',{type:'audio/webm'})
        const form = new FormData(); form.append('audio',file); form.append('duration',String(dur))
        const r = await fetch('/api/upload/voice',{method:'POST',body:form})
        const d = await r.json()
        if(d.transcript) onTranscript(d.transcript)
        setProc(false)
      }
      mr.current.start(250); st.current = Date.now(); setRec(true)
    }
  }

  return (
    <button onClick={toggle} disabled={proc} style={{ width:'100%', padding:'12px', background:rec?'rgba(201,76,76,0.08)':'rgba(201,168,76,0.08)', border:`0.5px solid ${rec?'rgba(201,76,76,0.28)':'rgba(201,168,76,0.28)'}`, borderRadius:'10px', color:rec?'#C94C4C':'#C9A84C', fontFamily:'Syne', fontWeight:800, fontSize:'13px', cursor:'pointer' }}>
      {proc?'Processing..':rec?'⏹ Stop & Send':'🎤 Record Voice Answer'}
    </button>
  )
}

const S: Record<string,React.CSSProperties> = {
  app:     { display:'flex', minHeight:'100vh', background:'#080808', fontFamily:"'Lato',sans-serif", color:'#E8E8E4' },
  sidebar: { position:'fixed', top:0, left:0, height:'100vh', width:'220px', background:'#090909', borderRight:'0.5px solid #141414', display:'flex', flexDirection:'column', zIndex:50 },
  main:    { marginLeft:'220px', flex:1, padding:'32px', maxWidth:'760px' },
  sTop:    { padding:'20px 18px 16px', borderBottom:'0.5px solid #141414' },
  logo:    { fontFamily:'Syne', fontWeight:800, fontSize:'18px', color:'#C9A84C' },
  logoSub: { fontFamily:'Space Mono', fontSize:'9px', color:'#282828', marginTop:'4px', letterSpacing:'.1em' },
  uRow:    { padding:'12px 16px', borderBottom:'0.5px solid #141414', display:'flex', alignItems:'center', gap:'10px' },
  av:      { width:'28px', height:'28px', borderRadius:'50%' },
  uName:   { fontSize:'12px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  uEmail:  { fontSize:'10px', color:'#333', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  cBox:    { padding:'14px 18px', borderBottom:'0.5px solid #141414' },
  bar:     { height:'4px', background:'#141414', borderRadius:'4px', overflow:'hidden' },
  barFill: { height:'100%', background:'#C9A84C', borderRadius:'4px', transition:'width 1s ease' },
  navBtn:  { width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'9px 10px', borderRadius:'8px', border:'none', background:'transparent', color:'#444', fontFamily:'Syne', fontWeight:700, fontSize:'13px', cursor:'pointer', marginBottom:'2px', transition:'all .15s', textAlign:'left' },
  navOn:   { background:'rgba(201,168,76,0.09)', color:'#C9A84C' },
  scoreBox:{ padding:'14px 18px', borderTop:'0.5px solid #141414' },
  mono:    { fontFamily:'Space Mono', fontSize:'9px', color:'#282828', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:'6px' },
  h1:      { fontFamily:'Syne', fontWeight:800, fontSize:'28px', marginBottom:'6px' },
  sub:     { color:'#444', fontSize:'13px', marginBottom:'20px' },
  confCard:{ background:'#0D0D0D', border:'0.5px solid rgba(201,168,76,0.12)', borderRadius:'14px', padding:'24px', marginBottom:'14px' },
  card:    { background:'#0D0D0D', border:'0.5px solid #161616', borderRadius:'12px', padding:'16px 18px', marginBottom:'10px' },
  aCard:   { display:'flex', alignItems:'center', gap:'12px', padding:'14px', background:'#0D0D0D', border:'0.5px solid #161616', borderRadius:'12px', cursor:'pointer', textAlign:'left', transition:'all .15s', fontFamily:'Lato', color:'#E8E8E4', width:'100%' },
  chatBox: { minHeight:'240px', maxHeight:'400px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'10px', padding:'4px 0' },
  mAI:     { maxWidth:'82%', padding:'10px 14px', borderRadius:'14px 14px 14px 4px', background:'#141414', border:'0.5px solid #1E1E1E', color:'#E8E8E4', fontSize:'13px', lineHeight:'1.65' },
  mUser:   { maxWidth:'82%', padding:'10px 14px', borderRadius:'14px 14px 4px 14px', background:'#0C1520', border:'0.5px solid rgba(55,138,221,0.18)', color:'#7FB3E8', fontSize:'13px', lineHeight:'1.65' },
  ta:      { width:'100%', background:'#0A0A0A', border:'0.5px solid #161616', borderRadius:'8px', padding:'10px 12px', color:'#E8E8E4', fontFamily:'Lato', fontSize:'13px', outline:'none', resize:'none', lineHeight:'1.6' },
  inp:     { width:'100%', background:'#0A0A0A', border:'0.5px solid #161616', borderRadius:'8px', padding:'10px 12px', color:'#E8E8E4', fontFamily:'Lato', fontSize:'13px', outline:'none' },
  sendBtn: { padding:'10px 18px', background:'#C9A84C', color:'#080808', border:'none', borderRadius:'8px', fontFamily:'Syne', fontWeight:800, fontSize:'13px', cursor:'pointer', flexShrink:0 },
  back:    { background:'none', border:'0.5px solid #1E1E1E', borderRadius:'8px', padding:'6px 12px', color:'#444', fontSize:'12px', cursor:'pointer', fontFamily:'Lato' },
  tabBtn:  { padding:'5px 14px', borderRadius:'20px', border:'0.5px solid #161616', background:'transparent', color:'#444', fontSize:'12px', cursor:'pointer', fontFamily:'Lato', transition:'all .15s' },
  tabOn:   { background:'rgba(201,168,76,0.09)', color:'#C9A84C', borderColor:'rgba(201,168,76,0.25)' },
  center:  { minHeight:'100vh', background:'#080808', display:'flex', alignItems:'center', justifyContent:'center' },
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Lato:wght@300;400;700&family=Space+Mono:wght@400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1E1E1E;border-radius:2px}
  ::selection{background:rgba(201,168,76,0.18)}
  textarea,input{font-family:'Lato',sans-serif}
  @keyframes bounce{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:1}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .fade{animation:fadeUp .25s ease forwards}
`

// ── Inline Bulk Upload Component ───────────────────────────────────────────
const ACCEPTED = ['pdf','txt','md','csv','json','docx','doc','pptx','ppt','xlsx','xls','jpg','jpeg','png','gif','webp']

type FileItem = { id:string; name:string; size:number; file:File; status:'queued'|'uploading'|'processed'|'skipped'|'error'; memories?:number; reason?:string }

function BulkUploadInline({ onComplete }: { onComplete: () => void }) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((raw: File[]) => {
    const accepted = raw.filter(f => ACCEPTED.includes(f.name.split('.').pop()?.toLowerCase() || '') && f.size <= 10*1024*1024)
    setFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`))
      return [...prev, ...accepted.filter(f => !existing.has(`${f.name}-${f.size}`)).map(f => ({ id:`${f.name}-${Date.now()}-${Math.random()}`, name:f.name, size:f.size, file:f, status:'queued' as const }))]
    })
  }, [])

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const collected: File[] = []
    const readEntry = async (entry: any): Promise<void> => {
      if (entry.isFile) { await new Promise<void>(res => entry.file((f: File) => { collected.push(f); res() })) }
      else if (entry.isDirectory) { const reader = entry.createReader(); const entries: any[] = await new Promise(res => reader.readEntries(res)); for (const e of entries) await readEntry(e) }
    }
    if (e.dataTransfer.items) { for (let i=0;i<e.dataTransfer.items.length;i++) { const en = e.dataTransfer.items[i].webkitGetAsEntry(); if(en) await readEntry(en) } addFiles(collected) }
    else addFiles(Array.from(e.dataTransfer.files))
  }

  const process = async () => {
    const queued = files.filter(f => f.status === 'queued')
    if (!queued.length) return
    setUploading(true); setDone(false)
    const BATCH = 3
    for (let i=0; i<queued.length; i+=BATCH) {
      const batch = queued.slice(i, i+BATCH)
      setFiles(p => p.map(f => batch.find(b=>b.id===f.id) ? {...f,status:'uploading'} : f))
      const form = new FormData()
      for (const item of batch) form.append('files', item.file)
      try {
        const res = await fetch('/api/upload/bulk', { method:'POST', body:form })
        const data = await res.json()
        setFiles(p => p.map(f => {
          const r = data.results?.find((d:any) => d.name===f.name || d.name===`${f.name}.txt`)
          return r ? {...f, status:r.status, memories:r.memoriesCreated, reason:r.reason} : f
        }))
      } catch { setFiles(p => p.map(f => batch.find(b=>b.id===f.id) ? {...f,status:'error',reason:'Network error'} : f)) }
    }
    setUploading(false); setDone(true); onComplete()
  }

  const fmt = (b:number) => b<1024*1024 ? `${(b/1024).toFixed(0)}KB` : `${(b/1024/1024).toFixed(1)}MB`
  const icons:Record<string,string> = {pdf:'📄',docx:'📘',doc:'📘',pptx:'📙',ppt:'📙',xlsx:'📗',xls:'📗',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',txt:'📝',md:'📝',csv:'📊',json:'📋'}
  const getIcon = (name:string) => icons[name.split('.').pop()?.toLowerCase()||''] || '📁'
  const statusColor = (s:string) => s==='processed'?'#4CC96C':s==='error'?'#C94C4C':s==='uploading'?'#C9A84C':'#555'
  const statusLabel = (f:FileItem) => f.status==='processed'?`✓ ${f.memories||0} insights`:f.status==='uploading'?'Analyzing...':f.status==='error'?`Error: ${f.reason||'failed'}`:f.status==='skipped'?`Skipped: ${f.reason||''}`: 'Queued'

  const queuedCount = files.filter(f=>f.status==='queued').length
  const processedCount = files.filter(f=>f.status==='processed').length
  const totalInsights = files.reduce((s,f)=>s+(f.memories||0),0)

  return (
    <div>
      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}
        style={{ border:`2px dashed ${dragging?'#C9A84C':'#1E1E1E'}`, borderRadius:'14px', padding:'36px 24px', textAlign:'center', cursor:'pointer', background:dragging?'rgba(201,168,76,0.06)':'#0F0F0F', transition:'all .2s', marginBottom:'14px' }}>
        <div style={{ fontSize:'32px', marginBottom:'10px' }}>{dragging?'📂':'⇣'}</div>
        <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'15px', color:'#E8E8E4', marginBottom:'4px' }}>{dragging?'Drop files here':'Drop files or folders here'}</div>
        <div style={{ fontSize:'12px', color:'#555', lineHeight:'1.6', marginBottom:'12px' }}>PDF, Word, PowerPoint, Excel, images, WhatsApp exports, text files<br/>Folders are supported — all files inside will be processed</div>
        <div style={{ display:'inline-block', padding:'8px 20px', background:'#C9A84C', color:'#080808', borderRadius:'8px', fontSize:'13px', fontFamily:'Syne', fontWeight:800 }}>Browse files</div>
        <input ref={inputRef} type="file" multiple accept={ACCEPTED.map(e=>`.${e}`).join(',')} onChange={e=>e.target.files&&addFiles(Array.from(e.target.files))} style={{ display:'none' }}/>
      </div>

      {/* What happens info */}
      <div style={{ background:'rgba(201,168,76,0.06)', border:'0.5px solid #1E1E1E', borderRadius:'12px', padding:'14px 16px', marginBottom:'14px', fontSize:'12px', color:'#555', lineHeight:'1.7' }}>
        <span style={{ color:'#C9A84C', fontFamily:'Syne', fontWeight:700 }}>What happens: </span>
        Claude reads each file → extracts your identity insights → saves them to your memory database → <span style={{ color:'#4CC96C' }}>raw files deleted immediately</span>. Nothing is stored except the distilled knowledge.
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
            <span style={{ fontSize:'11px', color:'#555', fontFamily:'Space Mono' }}>{files.length} files · {fmt(files.reduce((s,f)=>s+f.size,0))}</span>
            <button onClick={()=>{setFiles([]);setDone(false)}} style={{ background:'none', border:'none', color:'#333', fontSize:'11px', cursor:'pointer', fontFamily:'Lato' }}>Clear all</button>
          </div>
          <div style={{ maxHeight:'240px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'4px', marginBottom:'12px' }}>
            {files.map(f => (
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#0F0F0F', border:'0.5px solid #1A1A1A', borderRadius:'10px' }}>
                <span style={{ fontSize:'15px' }}>{getIcon(f.name)}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'12px', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#E8E8E4' }}>{f.name}</div>
                  <div style={{ fontSize:'11px', color:statusColor(f.status), marginTop:'1px' }}>{statusLabel(f)} · {fmt(f.size)}</div>
                </div>
                {f.status==='uploading' && <div style={{ width:'14px', height:'14px', borderRadius:'50%', border:'2px solid #C9A84C', borderTopColor:'transparent', animation:'spin 0.8s linear infinite', flexShrink:0 }}/>}
                {f.status==='processed' && <span style={{ color:'#4CC96C', fontSize:'13px' }}>✓</span>}
                {f.status==='queued' && <button onClick={()=>setFiles(p=>p.filter(x=>x.id!==f.id))} style={{ background:'none', border:'none', color:'#333', cursor:'pointer', fontSize:'13px' }}>✕</button>}
              </div>
            ))}
          </div>

          {done && (
            <div style={{ background:'rgba(76,201,108,0.08)', border:'0.5px solid rgba(76,201,108,0.25)', borderRadius:'12px', padding:'14px 16px', marginBottom:'12px' }}>
              <div style={{ fontFamily:'Syne', fontWeight:700, fontSize:'14px', color:'#4CC96C', marginBottom:'4px' }}>✓ Complete — {processedCount} files analyzed · {totalInsights} insights saved</div>
              <div style={{ fontSize:'12px', color:'rgba(76,201,108,0.7)' }}>Raw files deleted. Identity database updated. Your confidence score is recalculating.</div>
            </div>
          )}

          {queuedCount > 0 && (
            <button onClick={process} disabled={uploading} style={{ width:'100%', padding:'13px', background:uploading?'#1A1A1A':'#C9A84C', color:uploading?'#555':'#080808', border:'none', borderRadius:'10px', fontFamily:'Syne', fontWeight:800, fontSize:'14px', cursor:uploading?'not-allowed':'pointer' }}>
              {uploading ? `Analyzing ${files.filter(f=>f.status==='uploading').length} files...` : `⚡ Analyze ${queuedCount} file${queuedCount>1?'s':''} — extract identity data`}
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
