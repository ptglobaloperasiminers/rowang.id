'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'

type Tab = 'home' | 'interview' | 'voice' | 'memories' | 'chat' | 'upload' | 'clone'
type Msg = { role: 'user' | 'assistant'; content: string }

// Warm colour tokens — never dark again
const C = {
  cream:'#FDF8F0', sand:'#F5EDD8', sandMid:'#EFE0C0', border:'#E8DEC8',
  amber:'#B47B2E', amberDim:'#FDF0DC', walnut:'#7C5A1E', espresso:'#3C2A0E',
  muted:'#A08050', light:'#C8A462', white:'#FFFFFF',
  green:'#4A7C59', greenDim:'#EAF3EE', red:'#9B3A2A', redDim:'#FAEAE7',
}

const CATS = [
  {id:'Identity & Values',        icon:'✦', desc:"Your core — who you are and what you stand for"},
  {id:'Thinking & Decisions',     icon:'◈', desc:"How your mind works when it matters most"},
  {id:'Communication Style',      icon:'◎', desc:"How you express yourself — voice, words, presence"},
  {id:'Relationships & People',   icon:'◉', desc:"How you see, trust, and connect with others"},
  {id:'Business & Work',          icon:'◐', desc:"Your professional mind, ambitions, and philosophy"},
  {id:'Opinions & Worldview',     icon:'◑', desc:"What you believe — about Indonesia, business, life"},
  {id:'Personality & Inner Life', icon:'◒', desc:"The real, unguarded side of you"},
]

const VOICE_TOPICS = [
  'The biggest professional decision of your life — what happened, how you decided, what you learned.',
  'What do you believe about Indonesian business that most people get wrong?',
  'Tell me about someone who shaped how you think. What did they teach you?',
  'Describe a time you were genuinely proud of how you handled something difficult.',
  'What frustrates you most about how people approach your industry?',
  'Describe your real, actual productive working day.',
  'Tell me about a failure that changed you.',
]

const ACCEPTED_EXT = ['pdf','txt','md','csv','json','docx','doc','pptx','ppt','xlsx','xls','jpg','jpeg','png','gif','webp']

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
  const [doneCats, setDone]   = useState<string[]>([])
  const iRef = useRef<HTMLDivElement>(null)

  // Voice
  const [vState, setVState] = useState<'idle'|'rec'|'proc'|'done'>('idle')
  const [vSec, setVSec]     = useState(0)
  const [vTotal, setVTotal] = useState(0)
  const [vText, setVText]   = useState('')
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
  const [cMsgs, setCMsgs]     = useState<Msg[]>([])
  const [cInput, setCInput]       = useState('')
  const [cStream, setCStream]     = useState(false)
  const [lastQA, setLastQA]       = useState<{q:string;a:string}|null>(null)
  const [calDone, setCalDone]     = useState(false)
  const [calVerdict, setCalVerdict] = useState<'yes'|'no'|null>(null)
  const [correction, setCorrection] = useState('')   // Julius writes what he WOULD say
  const [corrSaved, setCorrSaved]   = useState(false)
  const cRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{ if(status==='unauthenticated') router.push('/login') },[status])
  useEffect(()=>{ if(session){ fetchConf(); fetchMems() } },[session,tab])
  useEffect(()=>{ iRef.current?.scrollIntoView({behavior:'smooth'}) },[iMsgs])
  useEffect(()=>{ cRef.current?.scrollIntoView({behavior:'smooth'}) },[cMsgs])

  const fetchConf = async () => {
    try { const r=await fetch('/api/confidence'); const{breakdown}=await r.json(); setConf(breakdown) } catch{}
  }
  const fetchMems = async () => {
    try { const r=await fetch('/api/memories'); const{data}=await r.json(); setMems(data||[]) } catch{}
  }

  // Interview
  const startCat = async (cat:string) => {
    setIStart(true); setICat(cat); setIMsgs([])
    const r = await fetch('/api/interview',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat})})
    const{sessionId,opening} = await r.json()
    setISessId(sessionId); setIMsgs([{role:'assistant',content:opening}]); setIStart(false)
  }
  const sendInterview = async (text?:string) => {
    const t = text||iInput.trim(); if(!t||iStream) return
    const msgs:Msg[] = [...iMsgs,{role:'user',content:t}]
    setIMsgs([...msgs,{role:'assistant',content:''}]); setIInput(''); setIStream(true)
    const r = await fetch('/api/interview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:iCat,messages:msgs,sessionId:iSessId})})
    const reader=r.body!.getReader(); const dec=new TextDecoder(); let ai=''
    while(true){ const{done,value}=await reader.read(); if(done) break; ai+=dec.decode(value,{stream:true}); setIMsgs(p=>{const c=[...p];c[c.length-1]={role:'assistant',content:ai};return c}) }
    if(ai.includes('Let me ask')||msgs.length>22){ if(!doneCats.includes(iCat!)) setDone(p=>[...p,iCat!]) }
    setIStream(false); fetchConf()
  }

  // Voice — Web Speech API (no third-party needed)
  const startRec = () => {
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition
    if(!SR){ alert('Please use Chrome or Edge for voice recording.'); return }
    const rec=new SR(); rec.continuous=true; rec.interimResults=true; rec.lang='id-ID'
    let final=''; mStart.current=Date.now()
    rec.onresult=(e:any)=>{ let interim=''; for(let i=e.resultIndex;i<e.results.length;i++){ if(e.results[i].isFinal) final+=e.results[i][0].transcript+' '; else interim+=e.results[i][0].transcript } setVText(final+interim) }
    rec.onerror=()=>{ setVState('idle'); clearInterval(mTimer.current) }
    rec.onend=async()=>{
      clearInterval(mTimer.current)
      const dur=Math.floor((Date.now()-mStart.current)/1000)
      if(final.trim().length>10){
        setVState('proc')
        const form=new FormData(); form.append('transcript',final.trim()); form.append('duration',String(dur))
        try{ const r=await fetch('/api/upload/voice',{method:'POST',body:form}); const d=await r.json(); setVText(d.transcript||final.trim()); setVTotal(p=>p+dur); setVState('done'); fetchConf() }catch{ setVState('idle') }
      } else { setVState('idle'); setVText('') }
    }
    rec.start(); (window as any)._rowangRec=rec; setVState('rec'); setVSec(0)
    mTimer.current=setInterval(()=>setVSec(Math.floor((Date.now()-mStart.current)/1000)),1000)
  }
  const stopRec = () => { clearInterval(mTimer.current); (window as any)._rowangRec?.stop() }
  const ft = (s:number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  // Memories
  const saveMem = async () => {
    if(!mTitle.trim()||!mBody.trim()) return; setMSave(true)
    await fetch('/api/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:mTitle,content:mBody,category:'General',importance:6})})
    setMTitle(''); setMBody(''); await fetchMems(); await fetchConf(); setMSave(false); setMTab('list')
  }
  const processPaste = async () => {
    if(!mPaste.trim()) return; setMProc(true)
    await fetch('/api/memories',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:mPaste,source:'paste'})})
    setMPaste(''); await fetchMems(); await fetchConf(); setMProc(false); setMTab('list')
  }

  // Chat
  const sendChat = async () => {
    const t=cInput.trim(); if(!t||cStream) return
    const msgs:Msg[]=[...cMsgs,{role:'user',content:t}]
    setCMsgs([...msgs,{role:'assistant',content:''}]); setCInput(''); setCStream(true); setLastQA(null); setCalDone(false); setCalVerdict(null); setCorrection(''); setCorrSaved(false)
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs})})
    const reader=r.body!.getReader(); const dec=new TextDecoder(); let ai=''
    while(true){ const{done,value}=await reader.read(); if(done) break; ai+=dec.decode(value,{stream:true}); setCMsgs(p=>{const c=[...p];c[c.length-1]={role:'assistant',content:ai};return c}) }
    setLastQA({q:t,a:ai}); setCStream(false); fetchConf()
  }
  const calibrate = async (verdict:'yes'|'no') => {
    if(!lastQA) return
    await fetch('/api/confidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:lastQA.q,ai_response:lastQA.a,verdict})})
    setCalDone(true)
    setCalVerdict(verdict)
    fetchConf()
  }

  const saveCorrection = async () => {
    if(!lastQA||!correction.trim()) return
    // Save the correct response as a high-importance calibration memory
    await fetch('/api/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      title:`Correction: "${lastQA.q.slice(0,60)}"`,
      content:`Question asked: ${lastQA.q}\n\nAI said: ${lastQA.a}\n\nHow Julius would actually respond: ${correction}`,
      category:'Calibration',
      source:'correction',
      importance:9,  // highest importance — direct correction from Julius
    })})
    setCorrSaved(true)
    fetchConf()
  }

  if(status==='loading') return <div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{color:C.muted,fontFamily:'Inter'}}>Loading...</div></div>

  const pct  = conf?.total ?? 0
  const user = session?.user as any
  const firstName = user?.name?.split(' ')[0] || 'Julius'

  // Shared styles
  const card:React.CSSProperties  = {background:C.white,border:`0.5px solid ${C.border}`,borderRadius:'14px',padding:'18px 20px',marginBottom:'12px'}
  const wCard:React.CSSProperties = {background:C.amberDim,border:`0.5px solid ${C.border}`,borderRadius:'14px',padding:'18px 20px',marginBottom:'12px'}
  const inp:React.CSSProperties   = {width:'100%',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'10px',padding:'11px 14px',color:C.espresso,fontFamily:'Inter',fontSize:'14px',outline:'none'}
  const ta:React.CSSProperties    = {...inp,resize:'none',lineHeight:'1.65'}
  const btnP:React.CSSProperties  = {padding:'11px 22px',background:C.amber,color:'#FFF8EC',border:'none',borderRadius:'10px',fontFamily:'Inter',fontWeight:500,fontSize:'14px',cursor:'pointer',flexShrink:0}
  const btnS:React.CSSProperties  = {padding:'11px 22px',background:'transparent',color:C.walnut,border:`0.5px solid ${C.light}`,borderRadius:'10px',fontFamily:'Inter',fontSize:'14px',cursor:'pointer'}
  const mlbl:React.CSSProperties  = {fontFamily:'Inter',fontSize:'11px',color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:'8px',display:'block'}
  const aiMsg:React.CSSProperties = {maxWidth:'84%',padding:'12px 16px',background:C.amberDim,border:`0.5px solid ${C.border}`,borderRadius:'16px 16px 16px 4px',color:C.espresso,fontSize:'14px',lineHeight:'1.65',alignSelf:'flex-start'}
  const uMsg:React.CSSProperties  = {maxWidth:'84%',padding:'12px 16px',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'16px 16px 4px 16px',color:C.walnut,fontSize:'14px',lineHeight:'1.65',alignSelf:'flex-end'}

  const NAV:[Tab,string,string][] = [
    ['home','⌂','Home'],['interview','✦','My Interview'],['voice','◎','Voice'],
    ['memories','○','Memories'],['chat','◐','Test My Clone'],['upload','⇣','Upload Files'],['clone','✧','My Clone'],
  ]

  return (
    <div style={{display:'flex',minHeight:'100vh',background:C.cream,fontFamily:'Inter',color:C.espresso}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.light};border-radius:4px}
        ::selection{background:rgba(180,123,46,0.2)}
        textarea,input,select{font-family:Inter,sans-serif}
        textarea:focus,input:focus{border-color:${C.amber}!important;outline:none}
        @keyframes bounce{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade{animation:fadeUp .25s ease forwards}
        .nb:hover{background:${C.sandMid}!important}
        .ac:hover{border-color:${C.light}!important;background:${C.sand}!important}
        .cb:hover{border-color:${C.light}!important}
      `}</style>

      {/* SIDEBAR */}
      <aside style={{position:'fixed',top:0,left:0,height:'100vh',width:'228px',background:'#FDF5E6',borderRight:`0.5px solid ${C.border}`,display:'flex',flexDirection:'column',zIndex:50}}>
        <div style={{padding:'22px 20px 16px',borderBottom:`0.5px solid ${C.border}`}}>
          <div style={{fontFamily:'Lora,serif',fontWeight:600,fontSize:'20px',color:C.espresso}}>rowang<span style={{color:C.amber}}>.id</span></div>
          <div style={{fontSize:'10px',color:C.muted,marginTop:'3px',letterSpacing:'0.1em'}}>YOUR AI IDENTITY</div>
        </div>

        <div style={{padding:'12px 16px',borderBottom:`0.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:'10px'}}>
          {user?.image ? <img src={user.image} style={{width:'30px',height:'30px',borderRadius:'50%',border:`1.5px solid ${C.border}`}} alt=""/> : <div style={{width:'30px',height:'30px',borderRadius:'50%',background:C.sandMid,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:500,color:C.walnut}}>{firstName[0]}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'13px',fontWeight:500,color:C.espresso,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name}</div>
            <div style={{fontSize:'10px',color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.email}</div>
          </div>
        </div>

        <div style={{padding:'14px 18px',borderBottom:`0.5px solid ${C.border}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'8px'}}>
            <span style={{fontSize:'10px',color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase'}}>Identity strength</span>
            <span style={{fontFamily:'Lora,serif',fontSize:'24px',fontWeight:500,color:C.amber}}>{pct}%</span>
          </div>
          <div style={{height:'5px',background:C.sandMid,borderRadius:'5px',overflow:'hidden'}}>
            <div style={{height:'100%',width:`${pct}%`,background:C.amber,borderRadius:'5px',transition:'width 1s ease'}}/>
          </div>
          <div style={{fontSize:'11px',color:C.muted,marginTop:'4px'}}>{conf?.label??'No data yet'}</div>
        </div>

        <nav style={{flex:1,padding:'10px'}}>
          {NAV.map(([id,icon,label])=>(
            <button key={id} className="nb" onClick={()=>{setTab(id);if(id==='interview')setICat(null)}} style={{width:'100%',display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'10px',border:'none',background:tab===id?C.sandMid:'transparent',color:tab===id?C.walnut:C.muted,fontFamily:'Inter',fontWeight:tab===id?500:400,fontSize:'14px',cursor:'pointer',marginBottom:'2px',transition:'all .15s',textAlign:'left'}}>
              <span style={{fontSize:'14px',width:'18px',textAlign:'center',color:tab===id?C.amber:C.light}}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {conf && (
          <div style={{padding:'14px 18px',borderTop:`0.5px solid ${C.border}`}}>
            {([['Interview',conf.interview,30],['Voice',conf.voice,20],['Memories',conf.memories,20],['Calibration',conf.calibration,15]] as [string,number,number][]).map(([l,v,m])=>(
              <div key={l} style={{marginBottom:'6px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:C.muted,marginBottom:'2px'}}><span>{l}</span><span>{v}/{m}</span></div>
                <div style={{height:'3px',background:C.sandMid,borderRadius:'3px'}}><div style={{height:'100%',width:`${(v/m)*100}%`,background:C.light,borderRadius:'3px',transition:'width .7s'}}/></div>
              </div>
            ))}
          </div>
        )}
        <button onClick={()=>signOut()} style={{margin:'0 18px 18px',background:'none',border:'none',color:C.light,fontSize:'12px',cursor:'pointer',fontFamily:'Inter',textAlign:'left'}}>Sign out</button>
      </aside>

      {/* MAIN */}
      <main style={{marginLeft:'228px',flex:1,padding:'36px 40px',maxWidth:'800px'}}>

        {/* HOME */}
        {tab==='home'&&(
          <div className="fade">
            <div style={{...wCard,padding:'28px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'20px'}}>
                <div style={{width:'64px',height:'64px',borderRadius:'50%',background:C.white,border:`2px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',flexShrink:0}}>
                  <div style={{fontFamily:'Lora,serif',fontSize:'18px',fontWeight:500,color:C.amber,lineHeight:1}}>{pct}</div>
                  <div style={{fontSize:'10px',color:C.muted,marginTop:'1px'}}>%</div>
                </div>
                <div>
                  <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'26px',color:C.espresso,marginBottom:'6px'}}>Good to see you, {firstName}</h1>
                  <p style={{fontSize:'14px',color:C.walnut,lineHeight:'1.65',marginBottom:'16px'}}>{conf?.nextAction??"Start your identity interview — the highest-impact thing you can do right now."}</p>
                  <div style={{display:'flex',gap:'10px'}}>
                    <button onClick={()=>setTab('interview')} style={btnP}>Start Interview</button>
                    <button onClick={()=>setTab('upload')} style={btnS}>Upload Files</button>
                  </div>
                </div>
              </div>
            </div>

            {conf?.isUnlocked&&(
              <div style={{...card,borderColor:'#C8E6C9',background:C.greenDim}}>
                <div style={{fontFamily:'Lora,serif',fontSize:'16px',color:C.green,marginBottom:'4px'}}>Your AI clone is active</div>
                <p style={{fontSize:'13px',color:'#4A7C59',lineHeight:'1.6'}}>You've reached {pct}% identity confidence. Go to My Clone to share or list it for sale.</p>
              </div>
            )}

            <span style={mlbl}>Your progress</span>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',marginBottom:'20px'}}>
              {([['Interview',conf?.interview??0,30],['Voice',conf?.voice??0,20],['Memories',conf?.memories??0,20],['Photos',conf?.media??0,10],['Calibrate',conf?.calibration??0,15]] as [string,number,number][]).map(([l,v,m])=>(
                <div key={l} style={{background:C.white,border:`0.5px solid ${C.border}`,borderRadius:'12px',padding:'14px 12px',textAlign:'center'}}>
                  <div style={{fontSize:'11px',color:C.muted,marginBottom:'4px'}}>{l}</div>
                  <div style={{fontFamily:'Lora,serif',fontSize:'18px',fontWeight:500,color:v>0?C.amber:C.espresso}}>{v}</div>
                  <div style={{fontSize:'10px',color:C.light}}>of {m}</div>
                </div>
              ))}
            </div>

            <span style={mlbl}>What would you like to do?</span>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              {([['interview','✦','Identity Interview','A real conversation that builds your AI persona'],['voice','◎','Voice Recording','Speak freely — captured and analyzed'],['memories','○','Add a Memory','Stories, decisions, WhatsApp exports'],['upload','⇣','Upload Files','PDF, Word, photos, folders — bulk analysis'],['chat','◐','Test My Clone','Talk to your AI — rate every response']] as [Tab,string,string,string][]).map(([id,icon,title,sub])=>(
                <button key={id} className="ac" onClick={()=>setTab(id)} style={{display:'flex',alignItems:'center',gap:'14px',padding:'16px',background:C.white,border:`0.5px solid ${C.border}`,borderRadius:'12px',cursor:'pointer',textAlign:'left',transition:'all .15s',fontFamily:'Inter',color:C.espresso,width:'100%'}}>
                  <span style={{fontSize:'20px',color:C.amber,flexShrink:0}}>{icon}</span>
                  <div>
                    <div style={{fontWeight:500,fontSize:'14px',marginBottom:'2px'}}>{title}</div>
                    <div style={{fontSize:'12px',color:C.muted}}>{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* INTERVIEW — category list */}
        {tab==='interview'&&!iCat&&(
          <div className="fade">
            <div style={{marginBottom:'24px'}}>
              <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'28px',color:C.espresso,marginBottom:'8px'}}>Your Identity Interview</h1>
              <p style={{fontSize:'14px',color:C.walnut,lineHeight:'1.65'}}>This is a real conversation — not a form. Each topic has an AI that will ask deep questions, follow up, and keep exploring until it truly understands you.</p>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {CATS.map(cat=>{
                const done=doneCats.includes(cat.id)
                return(
                  <button key={cat.id} className="cb" onClick={()=>startCat(cat.id)} style={{display:'flex',alignItems:'center',gap:'16px',padding:'16px 18px',background:done?C.greenDim:C.white,border:`0.5px solid ${done?'#C8E6C9':C.border}`,borderRadius:'12px',cursor:'pointer',textAlign:'left',transition:'all .15s',fontFamily:'Inter',color:C.espresso,width:'100%'}}>
                    <span style={{fontSize:'18px',color:done?C.green:C.amber,flexShrink:0,width:'24px',textAlign:'center'}}>{cat.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:500,fontSize:'14px',color:done?C.green:C.espresso,marginBottom:'2px'}}>{done?'✓ ':''}{cat.id}</div>
                      <div style={{fontSize:'12px',color:C.muted}}>{cat.desc}</div>
                    </div>
                    <span style={{color:C.light,fontSize:'16px'}}>→</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* INTERVIEW — chat */}
        {tab==='interview'&&iCat&&(
          <div className="fade">
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'20px'}}>
              <button onClick={()=>setICat(null)} style={{...btnS,padding:'7px 14px',fontSize:'13px'}}>← Back</button>
              <div>
                <div style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'18px',color:C.espresso}}>{iCat}</div>
                <div style={{fontSize:'12px',color:C.muted}}>{iMsgs.filter(m=>m.role==='user').length} responses given</div>
              </div>
            </div>
            {iStart?<div style={{padding:'48px',textAlign:'center',color:C.muted,fontSize:'14px'}}>Starting your interview...</div>:(
              <>
                <div style={{minHeight:'280px',maxHeight:'420px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'12px',padding:'4px 0',marginBottom:'14px'}}>
                  {iMsgs.map((m,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                      <div style={m.role==='user'?uMsg:aiMsg}>{!m.content&&iStream&&i===iMsgs.length-1?<Dots/>:m.content}</div>
                    </div>
                  ))}
                  <div ref={iRef}/>
                </div>
                <div style={{display:'flex',gap:'8px'}}>
                  <textarea rows={2} value={iInput} onChange={e=>setIInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendInterview()}}} disabled={iStream} placeholder="Share your thoughts... (Enter to send)" style={ta}/>
                  <button onClick={()=>sendInterview()} disabled={iStream||!iInput.trim()} style={btnP}>{iStream?'...':'Send'}</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* VOICE */}
        {tab==='voice'&&(
          <div className="fade">
            <div style={{marginBottom:'24px'}}>
              <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'28px',color:C.espresso,marginBottom:'8px'}}>Voice Recording</h1>
              <p style={{fontSize:'14px',color:C.walnut,lineHeight:'1.65'}}>Speak naturally about anything. Your voice is your most authentic data source.{vTotal>0?` ${ft(vTotal)} recorded.`:''}</p>
            </div>
            <div style={{...card,marginBottom:'16px'}}>
              {vState==='idle'&&<button onClick={startRec} style={{...btnP,width:'100%',justifyContent:'center',padding:'16px',fontSize:'15px'}}>🎤  Start Recording</button>}
              {vState==='rec'&&(
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'14px',marginBottom:'14px'}}>
                    <div style={{width:'12px',height:'12px',borderRadius:'50%',background:C.red,animation:'pulse 1s infinite'}}/>
                    <span style={{fontFamily:'Lora,serif',fontSize:'24px',fontWeight:500,color:C.espresso}}>{ft(vSec)}</span>
                    <span style={{fontSize:'13px',color:C.muted}}>Recording — speak naturally</span>
                  </div>
                  {vText&&<div style={{background:C.sand,borderRadius:'10px',padding:'12px 14px',fontSize:'13px',color:C.walnut,lineHeight:'1.6',marginBottom:'12px',fontStyle:'italic'}}>{vText}</div>}
                  <button onClick={stopRec} style={{width:'100%',padding:'12px',background:C.redDim,border:`0.5px solid #EBCFC9`,borderRadius:'10px',color:C.red,fontFamily:'Inter',fontWeight:500,fontSize:'14px',cursor:'pointer'}}>Stop Recording</button>
                </div>
              )}
              {vState==='proc'&&<div style={{textAlign:'center',padding:'24px',color:C.muted,fontSize:'14px'}}>Saving and analyzing your recording...</div>}
              {vState==='done'&&(
                <div>
                  <div style={{background:C.sand,borderRadius:'10px',padding:'14px',marginBottom:'12px',fontSize:'13px',color:C.walnut,lineHeight:'1.65',maxHeight:'140px',overflowY:'auto'}}>{vText}</div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <div style={{flex:1,padding:'10px',background:C.greenDim,border:`0.5px solid #C8E6C9`,borderRadius:'10px',color:C.green,fontSize:'13px',textAlign:'center',fontWeight:500}}>✓ Saved and analyzed</div>
                    <button onClick={()=>{setVState('idle');setVText('')}} style={{...btnS,padding:'10px 16px'}}>Record more</button>
                  </div>
                </div>
              )}
            </div>
            <div style={card}>
              <span style={mlbl}>Topics to speak about</span>
              {VOICE_TOPICS.map((p,i)=>(
                <div key={i} style={{fontSize:'13px',color:C.walnut,padding:'9px 0',borderBottom:i<VOICE_TOPICS.length-1?`0.5px solid ${C.border}`:'none',lineHeight:'1.55'}}>
                  <span style={{color:C.amber,marginRight:'8px'}}>·</span>{p}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MEMORIES */}
        {tab==='memories'&&(
          <div className="fade">
            <div style={{marginBottom:'24px'}}>
              <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'28px',color:C.espresso,marginBottom:'8px'}}>Memories & Knowledge</h1>
              <p style={{fontSize:'14px',color:C.walnut}}>{mems.length} memories stored. Every story makes your AI more authentically you.</p>
            </div>
            <div style={{display:'flex',gap:'6px',marginBottom:'16px'}}>
              {(['add','paste','list'] as const).map(t=>(
                <button key={t} onClick={()=>setMTab(t)} style={{padding:'7px 16px',borderRadius:'20px',fontFamily:'Inter',fontSize:'13px',cursor:'pointer',background:mTab===t?C.amber:'transparent',color:mTab===t?'#FFF8EC':C.walnut,border:`0.5px solid ${mTab===t?C.amber:C.border}`,transition:'all .15s'}}>
                  {t==='add'?'+ Add Memory':t==='paste'?'⇣ Paste Data':`All (${mems.length})`}
                </button>
              ))}
            </div>
            {mTab==='add'&&(
              <div style={card}>
                <label style={mlbl}>Title</label>
                <input value={mTitle} onChange={e=>setMTitle(e.target.value)} placeholder="e.g. How I handled my first major business failure" style={{...inp,marginBottom:'12px'}}/>
                <label style={mlbl}>Tell the full story</label>
                <p style={{fontSize:'12px',color:C.muted,marginBottom:'8px',lineHeight:'1.55'}}>Don't summarize — write as if telling a trusted friend. Include what happened, how you felt, what you decided, what you learned.</p>
                <textarea rows={8} value={mBody} onChange={e=>setMBody(e.target.value)} placeholder="It was 2019, and we had just received an offer..." style={{...ta,marginBottom:'12px'}}/>
                <button onClick={saveMem} disabled={mSave||!mTitle.trim()||!mBody.trim()} style={{...btnP,width:'100%',justifyContent:'center',padding:'12px',opacity:(mSave||!mTitle.trim()||!mBody.trim())?0.5:1}}>{mSave?'Saving...':'Save Memory →'}</button>
              </div>
            )}
            {mTab==='paste'&&(
              <div style={card}>
                <div style={{fontSize:'13px',color:C.walnut,lineHeight:'1.7',marginBottom:'14px'}}>Export WhatsApp: open any chat → ⋮ → More → Export Chat (no media) → paste here. Also works for emails, transcripts, notes.</div>
                <textarea rows={11} value={mPaste} onChange={e=>setMPaste(e.target.value)} placeholder="Paste WhatsApp export, email threads, or any text..." style={{...ta,fontSize:'13px',marginBottom:'12px'}}/>
                <button onClick={processPaste} disabled={mProc||!mPaste.trim()} style={{...btnP,width:'100%',justifyContent:'center',padding:'12px'}}>{mProc?'Extracting your patterns...':'Extract & Save →'}</button>
              </div>
            )}
            {mTab==='list'&&(
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {mems.length===0?<div style={{textAlign:'center',padding:'40px',color:C.muted,fontSize:'14px'}}>No memories yet.</div>
                  :mems.map((m:any)=>(
                  <div key={m.id} style={card}>
                    <div style={{fontWeight:500,fontSize:'14px',color:C.espresso,marginBottom:'4px'}}>{m.title}</div>
                    <div style={{fontSize:'13px',color:C.walnut,lineHeight:'1.55',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{m.content}</div>
                    <div style={{fontSize:'11px',color:C.light,marginTop:'6px'}}>{m.category} · {m.source} · {new Date(m.created_at).toLocaleDateString('id-ID')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHAT */}
        {tab==='chat'&&(
          <div className="fade">
            <div style={{marginBottom:'20px'}}>
              <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'28px',color:C.espresso,marginBottom:'8px'}}>Test Your Clone</h1>
              <p style={{fontSize:'14px',color:C.walnut}}>Talk to your AI. Rate each response — calibration makes your clone more accurate.</p>
            </div>
            <div style={{...card,padding:0,overflow:'hidden',marginBottom:'12px'}}>
              <div style={{padding:'14px 18px',borderBottom:`0.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:'12px',background:C.amberDim}}>
                {user?.image?<img src={user.image} style={{width:'32px',height:'32px',borderRadius:'50%',border:`1.5px solid ${C.border}`}} alt=""/>:<div style={{width:'32px',height:'32px',borderRadius:'50%',background:C.sandMid,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:500,color:C.walnut}}>{firstName[0]}</div>}
                <div>
                  <div style={{fontWeight:500,fontSize:'14px',color:C.espresso}}>{user?.name} — AI Clone</div>
                  <div style={{fontSize:'11px',color:conf?.isUnlocked?C.green:C.amber}}>{conf?.isUnlocked?'● Clone active':`● Building — ${pct}% complete`}</div>
                </div>
              </div>
              <div style={{minHeight:'260px',maxHeight:'400px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'12px',padding:'16px'}}>
                {cMsgs.length===0&&<div style={{padding:'24px',textAlign:'center',color:C.muted,fontSize:'14px',lineHeight:'1.65'}}>Ask your clone anything — how it would handle a situation, its opinion, a decision you face...</div>}
                {cMsgs.map((m,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                    <div style={m.role==='user'?uMsg:aiMsg}>{!m.content&&cStream&&i===cMsgs.length-1?<Dots/>:m.content}</div>
                  </div>
                ))}
                <div ref={cRef}/>
              </div>
              <div style={{padding:'14px 16px',borderTop:`0.5px solid ${C.border}`,display:'flex',gap:'8px'}}>
                <textarea rows={2} value={cInput} onChange={e=>setCInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}} disabled={cStream} placeholder="Ask your clone... (Enter to send)" style={ta}/>
                <button onClick={sendChat} disabled={cStream||!cInput.trim()} style={btnP}>{cStream?'...':'Send'}</button>
              </div>
            </div>
            {lastQA&&!cStream&&(
              <div style={card}>
                <span style={mlbl}>Was that response accurate to you?</span>

                {/* Step 1 — Rate the response */}
                {!calDone&&(
                  <div style={{display:'flex',gap:'10px'}}>
                    <button onClick={()=>calibrate('yes')} style={{flex:1,padding:'11px',background:C.greenDim,border:`0.5px solid #C8E6C9`,borderRadius:'10px',color:C.green,fontFamily:'Inter',fontWeight:500,fontSize:'13px',cursor:'pointer'}}>
                      ✓ That's how I would respond
                    </button>
                    <button onClick={()=>calibrate('no')} style={{flex:1,padding:'11px',background:C.redDim,border:`0.5px solid #EBCFC9`,borderRadius:'10px',color:C.red,fontFamily:'Inter',fontWeight:500,fontSize:'13px',cursor:'pointer'}}>
                      ✗ I would NOT respond this way
                    </button>
                  </div>
                )}

                {/* Step 2a — Confirmed correct */}
                {calDone&&calVerdict==='yes'&&(
                  <div style={{fontSize:'14px',color:C.green,fontWeight:500}}>
                    ✓ Great — this pattern is reinforced in your clone
                  </div>
                )}

                {/* Step 2b — Marked wrong → ask for correction */}
                {calDone&&calVerdict==='no'&&!corrSaved&&(
                  <div>
                    <div style={{fontSize:'13px',color:C.red,fontWeight:500,marginBottom:'10px'}}>
                      ✗ Noted. How would you actually respond? Write it below — this becomes high-priority training data.
                    </div>
                    <textarea
                      rows={4}
                      value={correction}
                      onChange={e=>setCorrection(e.target.value)}
                      placeholder={`How would Julius actually answer: "${lastQA.q.slice(0,80)}"?\n\nWrite it in your own voice — exactly as you would say it...`}
                      style={{...ta,marginBottom:'10px',borderColor:C.border,fontSize:'13px'}}
                    />
                    <div style={{display:'flex',gap:'8px'}}>
                      <button onClick={saveCorrection} disabled={!correction.trim()} style={{...btnP,flex:1,justifyContent:'center',padding:'10px',opacity:!correction.trim()?0.5:1,fontSize:'13px'}}>
                        Save My Correct Response →
                      </button>
                      <button onClick={()=>setCorrSaved(true)} style={{...btnS,padding:'10px 14px',fontSize:'13px'}}>
                        Skip
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3 — Correction saved */}
                {calDone&&calVerdict==='no'&&corrSaved&&(
                  <div style={{fontSize:'14px',color:C.walnut,lineHeight:'1.65'}}>
                    {correction.trim()
                      ? <><span style={{fontWeight:500,color:C.espresso}}>✓ Your correction saved.</span> Your clone will learn from your real response and avoid this pattern in future.</>
                      : <><span style={{fontWeight:500,color:C.espresso}}>✓ Feedback saved.</span> This pattern has been flagged as inaccurate.</>
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* UPLOAD */}
        {tab==='upload'&&(
          <div className="fade">
            <div style={{marginBottom:'24px'}}>
              <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'28px',color:C.espresso,marginBottom:'8px'}}>Upload Files & Folders</h1>
              <p style={{fontSize:'14px',color:C.walnut,lineHeight:'1.65'}}>Drop any file — PDFs, Word docs, PowerPoints, photos, WhatsApp exports. AI reads everything, extracts your identity insights, then the raw files are deleted immediately. Only the distilled knowledge stays.</p>
            </div>
            <BulkUpload onComplete={fetchConf}/>
          </div>
        )}

        {/* CLONE */}
        {tab==='clone'&&(
          <div className="fade">
            <div style={{marginBottom:'24px'}}>
              <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'28px',color:C.espresso,marginBottom:'8px'}}>My Clone</h1>
              <p style={{fontSize:'14px',color:C.walnut}}>Your digital identity entity — own it, share it, or sell it.</p>
            </div>
            {conf?.isUnlocked?(
              <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                <div style={{...wCard,textAlign:'center',padding:'32px'}}>
                  {user?.image&&<img src={user.image} style={{width:'64px',height:'64px',borderRadius:'50%',border:`2px solid ${C.amber}`,marginBottom:'14px'}} alt=""/>}
                  <div style={{fontFamily:'Lora,serif',fontSize:'20px',fontWeight:500,color:C.espresso,marginBottom:'4px'}}>{user?.name}</div>
                  <div style={{fontSize:'12px',color:C.amber,letterSpacing:'0.08em',marginBottom:'6px'}}>{pct}% IDENTITY CONFIDENCE</div>
                  <div style={{fontSize:'13px',color:C.walnut}}>Your AI clone is active and ready to share.</div>
                </div>
                <div style={card}>
                  <span style={mlbl}>Your clone link</span>
                  <div style={{background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'10px',padding:'11px 14px',fontSize:'13px',color:C.walnut,fontFamily:'monospace',marginTop:'4px'}}>rowang.id/clone/{(user?.id||'').slice(0,8)}</div>
                </div>
                {conf?.canSell&&(
                  <div style={{...card,borderColor:C.light}}>
                    <div style={{fontFamily:'Lora,serif',fontSize:'16px',color:C.espresso,marginBottom:'8px'}}>List your clone for sale</div>
                    <p style={{fontSize:'13px',color:C.walnut,lineHeight:'1.65',marginBottom:'14px'}}>At 95%+ identity confidence your clone can be sold as a digital entity. Platform takes 20% commission.</p>
                    <input type="number" placeholder="Set your price in USD (e.g. 500)" style={{...inp,marginBottom:'10px'}}/>
                    <button style={{...btnP,width:'100%',justifyContent:'center',padding:'12px'}}>List for Sale →</button>
                  </div>
                )}
              </div>
            ):(
              <div style={{...wCard,textAlign:'center',padding:'48px 32px'}}>
                <div style={{fontFamily:'Lora,serif',fontSize:'56px',fontWeight:500,color:C.amber,marginBottom:'8px',lineHeight:1}}>{pct}%</div>
                <div style={{fontSize:'15px',color:C.walnut,marginBottom:'16px'}}>Clone unlocks at 85% identity confidence</div>
                <div style={{height:'6px',background:C.sandMid,borderRadius:'6px',overflow:'hidden',maxWidth:'320px',margin:'0 auto 20px'}}>
                  <div style={{height:'100%',width:`${Math.min((pct/85)*100,100)}%`,background:C.amber,borderRadius:'6px',transition:'width 1s ease'}}/>
                </div>
                <p style={{fontSize:'13px',color:C.muted,lineHeight:'1.7'}}>{conf?.nextAction}</p>
                <button onClick={()=>setTab('interview')} style={{...btnP,marginTop:'20px'}}>Continue Interview →</button>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

// Typing dots
function Dots() {
  return <div style={{display:'flex',gap:'4px',padding:'2px 0'}}>{[0,1,2].map(n=><div key={n} style={{width:'6px',height:'6px',borderRadius:'50%',background:C.amber,animation:`bounce 1.4s infinite ${n*.2}s`}}/>)}</div>
}

// Bulk Upload inline component
type FItem = {id:string;name:string;size:number;file:File;status:'queued'|'uploading'|'processed'|'skipped'|'error';memories?:number;reason?:string}

function BulkUpload({ onComplete }: { onComplete: () => void }) {
  const [files, setFiles]     = useState<FItem[]>([])
  const [dragging, setDrag]   = useState(false)
  const [busy, setBusy]       = useState(false)
  const [done, setDone]       = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((raw: File[]) => {
    const ok = raw.filter(f => ACCEPTED_EXT.includes(f.name.split('.').pop()?.toLowerCase()||'') && f.size <= 10*1024*1024)
    setFiles(prev => {
      const existing = new Set(prev.map(f=>`${f.name}-${f.size}`))
      return [...prev, ...ok.filter(f=>!existing.has(`${f.name}-${f.size}`)).map(f=>({id:`${f.name}-${Date.now()}-${Math.random()}`,name:f.name,size:f.size,file:f,status:'queued' as const}))]
    })
  }, [])

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const collected: File[] = []
    const readEntry = async (entry: any): Promise<void> => {
      if(entry.isFile) await new Promise<void>(res=>entry.file((f:File)=>{collected.push(f);res()}))
      else if(entry.isDirectory){ const reader=entry.createReader(); const entries:any[]=await new Promise(res=>reader.readEntries(res)); for(const e of entries) await readEntry(e) }
    }
    if(e.dataTransfer.items){ for(let i=0;i<e.dataTransfer.items.length;i++){ const en=e.dataTransfer.items[i].webkitGetAsEntry(); if(en) await readEntry(en) } addFiles(collected) }
    else addFiles(Array.from(e.dataTransfer.files))
  }

  const process = async () => {
    const queued = files.filter(f=>f.status==='queued')
    if(!queued.length) return
    setBusy(true); setDone(false)
    for(let i=0;i<queued.length;i+=3){
      const batch = queued.slice(i,i+3)
      setFiles(p=>p.map(f=>batch.find(b=>b.id===f.id)?{...f,status:'uploading'}:f))
      const form = new FormData()
      for(const item of batch) form.append('files', item.file)
      try{
        const res = await fetch('/api/upload/bulk',{method:'POST',body:form})
        const data = await res.json()
        setFiles(p=>p.map(f=>{
          const r = data.results?.find((d:any)=>d.name===f.name||d.name===`${f.name}.txt`)
          return r?{...f,status:r.status,memories:r.memoriesCreated,reason:r.reason}:f
        }))
      }catch{ setFiles(p=>p.map(f=>batch.find(b=>b.id===f.id)?{...f,status:'error',reason:'Network error'}:f)) }
    }
    setBusy(false); setDone(true); onComplete()
  }

  const fmt = (b:number) => b<1024*1024?`${(b/1024).toFixed(0)}KB`:`${(b/1024/1024).toFixed(1)}MB`
  const ICONS:Record<string,string> = {pdf:'📄',docx:'📘',doc:'📘',pptx:'📙',ppt:'📙',xlsx:'📗',xls:'📗',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',txt:'📝',md:'📝',csv:'📊',json:'📋'}
  const icon = (name:string) => ICONS[name.split('.').pop()?.toLowerCase()||''] || '📁'
  const sColor = (s:string) => s==='processed'?C.green:s==='error'?C.red:s==='uploading'?C.amber:C.muted
  const sLabel = (f:FItem) => f.status==='processed'?`✓ ${f.memories||0} insights saved`:f.status==='uploading'?'Analyzing...':f.status==='error'?`Error: ${f.reason||'failed'}`:f.status==='skipped'?`Skipped: ${f.reason||''}`: 'Queued'
  const queued = files.filter(f=>f.status==='queued').length
  const processed = files.filter(f=>f.status==='processed').length
  const totalInsights = files.reduce((s,f)=>s+(f.memories||0),0)

  return (
    <div>
      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}
        style={{border:`2px dashed ${dragging?C.amber:C.border}`,borderRadius:'16px',padding:'40px 24px',textAlign:'center',cursor:'pointer',background:dragging?C.amberDim:C.sand,transition:'all .2s',marginBottom:'14px'}}>
        <div style={{fontSize:'36px',marginBottom:'12px'}}>{dragging?'📂':'⇣'}</div>
        <div style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'16px',color:C.espresso,marginBottom:'6px'}}>{dragging?'Drop files here':'Drop files or folders here'}</div>
        <div style={{fontSize:'13px',color:C.muted,lineHeight:'1.6',marginBottom:'14px'}}>PDF, Word, PowerPoint, Excel, images, WhatsApp exports (.txt), any text<br/>Folders are supported — all files inside will be processed</div>
        <div style={{display:'inline-block',padding:'9px 22px',background:C.amber,color:'#FFF8EC',borderRadius:'10px',fontSize:'13px',fontFamily:'Inter',fontWeight:500}}>Browse files</div>
        <input ref={inputRef} type="file" multiple accept={ACCEPTED_EXT.map(e=>`.${e}`).join(',')} onChange={e=>e.target.files&&addFiles(Array.from(e.target.files))} style={{display:'none'}}/>
      </div>

      {/* Info */}
      <div style={{background:C.amberDim,border:`0.5px solid ${C.border}`,borderRadius:'12px',padding:'14px 16px',marginBottom:'14px',fontSize:'13px',color:C.walnut,lineHeight:'1.7'}}>
        <span style={{fontWeight:500,color:C.espresso}}>What happens: </span>
        AI reads each file → extracts your identity insights → saves them to your memory database → <span style={{color:C.green,fontWeight:500}}>raw files deleted immediately</span>. Nothing stored except the distilled knowledge.
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
            <span style={{fontSize:'11px',color:C.muted,letterSpacing:'0.06em',textTransform:'uppercase'}}>{files.length} files · {fmt(files.reduce((s,f)=>s+f.size,0))}</span>
            <button onClick={()=>{setFiles([]);setDone(false)}} style={{background:'none',border:'none',color:C.light,fontSize:'12px',cursor:'pointer',fontFamily:'Inter'}}>Clear all</button>
          </div>
          <div style={{maxHeight:'260px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'4px',marginBottom:'12px'}}>
            {files.map(f=>(
              <div key={f.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 13px',background:C.white,border:`0.5px solid ${f.status==='processed'?'#C8E6C9':f.status==='error'?'#EBCFC9':C.border}`,borderRadius:'10px'}}>
                <span style={{fontSize:'16px'}}>{icon(f.name)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13px',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.espresso}}>{f.name}</div>
                  <div style={{fontSize:'11px',color:sColor(f.status),marginTop:'1px'}}>{sLabel(f)} · {fmt(f.size)}</div>
                </div>
                {f.status==='uploading'&&<div style={{width:'14px',height:'14px',borderRadius:'50%',border:`2px solid ${C.amber}`,borderTopColor:'transparent',animation:'spin 0.8s linear infinite',flexShrink:0}}/>}
                {f.status==='processed'&&<span style={{color:C.green,fontSize:'13px'}}>✓</span>}
                {f.status==='queued'&&<button onClick={()=>setFiles(p=>p.filter(x=>x.id!==f.id))} style={{background:'none',border:'none',color:C.light,cursor:'pointer',fontSize:'13px'}}>✕</button>}
              </div>
            ))}
          </div>

          {done&&(
            <div style={{background:C.greenDim,border:`0.5px solid #C8E6C9`,borderRadius:'12px',padding:'14px 16px',marginBottom:'12px'}}>
              <div style={{fontFamily:'Lora,serif',fontSize:'16px',color:C.green,marginBottom:'4px'}}>✓ {processed} files analyzed · {totalInsights} insights saved</div>
              <div style={{fontSize:'13px',color:'#4A7C59'}}>Raw files deleted. Identity database updated. Your confidence score is recalculating.</div>
            </div>
          )}

          {queued>0&&(
            <button onClick={process} disabled={busy} style={{padding:'13px',background:busy?'#EFE0C0':'#B47B2E',color:busy?'#A08050':'#FFF8EC',border:'none',borderRadius:'10px',fontFamily:'Inter',fontWeight:500,fontSize:'14px',cursor:busy?'not-allowed':'pointer',width:'100%',opacity:1}}>
              {busy?`Analyzing ${files.filter(f=>f.status==='uploading').length} files...`:`⚡ Analyze ${queued} file${queued>1?'s':''} — extract identity data`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
