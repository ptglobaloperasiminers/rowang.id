'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'

type Tab = 'home'|'interview'|'voice'|'memories'|'chat'|'upload'|'wallet'|'clone'
type Msg = { role:'user'|'assistant'; content:string }

const C = {
  cream:'#FDF8F0',sand:'#F5EDD8',sandMid:'#EFE0C0',border:'#E8DEC8',
  amber:'#B47B2E',amberDim:'#FDF0DC',walnut:'#7C5A1E',espresso:'#3C2A0E',
  muted:'#A08050',light:'#C8A462',white:'#FFFFFF',
  green:'#4A7C59',greenDim:'#EAF3EE',red:'#9B3A2A',redDim:'#FAEAE7',
  blue:'#2A5C8A',blueDim:'#EAF0F8',
}

const CATS = [
  {id:'Identity & Values',        icon:'✦',desc:'Your core — who you are and what you stand for'},
  {id:'Thinking & Decisions',     icon:'◈',desc:'How your mind works when it matters most'},
  {id:'Communication Style',      icon:'◎',desc:'How you express yourself — voice, words, presence'},
  {id:'Relationships & People',   icon:'◉',desc:'How you see, trust, and connect with others'},
  {id:'Business & Work',          icon:'◐',desc:'Your professional mind, ambitions, and philosophy'},
  {id:'Opinions & Worldview',     icon:'◑',desc:'What you believe — about Indonesia, business, life'},
  {id:'Personality & Inner Life', icon:'◒',desc:'The real, unguarded side of you'},
]

const VOICE_TOPICS = [
  {text:'The biggest professional decision of your life — what happened, how you decided, what you learned.',cat:'Business & Work'},
  {text:'What do you believe about Indonesian business that most people get wrong?',cat:'Opinions & Worldview'},
  {text:'Tell me about someone who shaped how you think. What did they teach you?',cat:'Relationships & People'},
  {text:'Describe a time you were genuinely proud of how you handled something difficult.',cat:'Identity & Values'},
  {text:'What frustrates you most about how people approach your industry?',cat:'Opinions & Worldview'},
  {text:'Describe your real, actual productive working day.',cat:'Business & Work'},
  {text:'Tell me about a failure that changed you.',cat:'Identity & Values'},
]

const WALLET_TYPES = [
  {id:'id_card',label:'KTP / ID Card',icon:'🪪'},
  {id:'passport',label:'Passport',icon:'📘'},
  {id:'will',label:'Wasiat / Will',icon:'📜'},
  {id:'deed',label:'Akta / Deed',icon:'📋'},
  {id:'insurance',label:'Insurance Policy',icon:'🛡️'},
  {id:'property',label:'Property Certificate',icon:'🏠'},
  {id:'medical',label:'Medical Records',icon:'🏥'},
  {id:'financial',label:'Financial Documents',icon:'💰'},
  {id:'legal',label:'Legal Agreements',icon:'⚖️'},
  {id:'diary',label:'Personal Diary / Notes',icon:'📓'},
  {id:'other',label:'Other Important Docs',icon:'📁'},
]

const ACCEPTED = ['pdf','txt','md','csv','json','docx','doc','pptx','ppt','xlsx','xls','jpg','jpeg','png','gif','webp','mp3','m4a','wav']
const IMG_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp'
const FILE_ACCEPT = ACCEPTED.map(e=>`.${e}`).join(',')

// ── Helper: process a file through bulk API ────────────────────────────────
async function analyzeFile(file: File): Promise<{memories?:number;status:string;reason?:string}> {
  const form = new FormData()
  form.append('files', file)
  try {
    const res = await fetch('/api/upload/bulk', {method:'POST',body:form})
    const data = await res.json()
    return data.results?.[0] || {status:'error',reason:'No result'}
  } catch {
    return {status:'error',reason:'Network error'}
  }
}

// ── Helper: voice transcription trigger ───────────────────────────────────
function startSpeech(onResult:(t:string)=>void, onEnd?:()=>void) {
  const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition
  if(!SR){alert('Please use Chrome or Edge for voice input.');return null}
  const rec=new SR(); rec.continuous=false; rec.lang='id-ID'
  let final=''
  rec.onresult=(e:any)=>{for(let i=e.resultIndex;i<e.results.length;i++) final+=e.results[i][0].transcript+' '}
  rec.onend=()=>{if(final.trim()) onResult(final.trim()); onEnd?.()}
  rec.onerror=()=>onEnd?.()
  rec.start(); return rec
}

// ── MediaInput: reusable multi-mode input bar ──────────────────────────────
function MediaInput({
  placeholder, onText, onFile, onVoice, disabled, rows=2
}:{
  placeholder:string; onText:(t:string)=>void; onFile:(f:File,preview?:string)=>void
  onVoice:(t:string)=>void; disabled?:boolean; rows?:number
}) {
  const [val, setVal]     = useState('')
  const [vRec, setVRec]   = useState(false)
  const [preview, setPreview] = useState<{name:string;type:string;url?:string}|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef  = useRef<HTMLInputElement>(null)

  const submit = () => {
    if(val.trim()) { onText(val.trim()); setVal('') }
  }

  const handleFile = (f:File) => {
    const isImg = f.type.startsWith('image/')
    const url   = isImg ? URL.createObjectURL(f) : undefined
    setPreview({name:f.name,type:f.type,url})
    onFile(f, url)
    setTimeout(()=>setPreview(null), 3000)
  }

  const recVoice = () => {
    setVRec(true)
    startSpeech(t=>{setVal(v=>v?v+' '+t:t); onVoice(t)}, ()=>setVRec(false))
  }

  return (
    <div style={{border:`0.5px solid ${C.border}`,borderRadius:'12px',background:C.sand,overflow:'hidden'}}>
      {preview&&(
        <div style={{padding:'8px 12px',borderBottom:`0.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:'8px',fontSize:'12px',color:C.walnut}}>
          {preview.url?<img src={preview.url} style={{width:'32px',height:'32px',objectFit:'cover',borderRadius:'6px'}} alt=""/>:<span>📄</span>}
          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{preview.name}</span>
          <span style={{color:C.green,fontWeight:500}}>✓ Analyzing...</span>
        </div>
      )}
      <textarea rows={rows} value={val} onChange={e=>setVal(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}}}
        disabled={disabled} placeholder={placeholder}
        style={{width:'100%',background:'transparent',border:'none',padding:'10px 12px',color:C.espresso,fontFamily:'Inter',fontSize:'13px',outline:'none',resize:'none',lineHeight:'1.65'}}/>
      <div style={{display:'flex',alignItems:'center',gap:'4px',padding:'6px 10px',borderTop:`0.5px solid ${C.border}`,background:C.amberDim}}>
        <button title="Attach file" onClick={()=>fileRef.current?.click()} style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'3px 5px',borderRadius:'6px',color:C.walnut}}>📎</button>
        <button title="Attach photo" onClick={()=>imgRef.current?.click()} style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'3px 5px',borderRadius:'6px',color:C.walnut}}>🖼️</button>
        <button title={vRec?'Listening...':'Voice input'} onClick={recVoice} disabled={vRec} style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'3px 5px',borderRadius:'6px',color:vRec?C.red:C.walnut}}>
          {vRec?'🔴':'🎤'}
        </button>
        <div style={{flex:1}}/>
        <button onClick={submit} disabled={disabled||(!val.trim()&&!preview)} style={{padding:'5px 14px',background:disabled||(!val.trim()&&!preview)?C.sandMid:C.amber,color:disabled||(!val.trim()&&!preview)?C.muted:'#FFF8EC',border:'none',borderRadius:'8px',fontFamily:'Inter',fontWeight:500,fontSize:'12px',cursor:disabled||(!val.trim()&&!preview)?'not-allowed':'pointer'}}>
          Send
        </button>
        <input ref={fileRef} type="file" accept={FILE_ACCEPT} onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])} style={{display:'none'}}/>
        <input ref={imgRef} type="file" accept={IMG_ACCEPT} onChange={e=>e.target.files?.[0]&&handleFile(e.target.files[0])} style={{display:'none'}}/>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const {data:session,status} = useSession()
  const router = useRouter()
  const [tab,setTab] = useState<Tab>('home')
  const [conf,setConf] = useState<any>(null)

  // P3: Stats
  const [stats,setStats] = useState({totalMemories:0,totalVoiceMins:0})

  // P4: Sessions
  const [sessions,setSessions]         = useState<any[]>([])
  const [sessionName,setSessionName]   = useState('')
  const [showSessions,setShowSessions] = useState(false)

  // Interview
  const [iCat,setICat]       = useState<string|null>(null)
  const [iSessId,setISessId] = useState<string|null>(null)
  const [iMsgs,setIMsgs]     = useState<Msg[]>([])
  const [iInput,setIInput]   = useState('')
  const [iStream,setIStream] = useState(false)
  const [iStart,setIStart]   = useState(false)
  const [doneCats,setDone]   = useState<string[]>([])
  const iRef = useRef<HTMLDivElement>(null)

  // P5: Voice
  const [vState,setVState] = useState<'idle'|'rec'|'proc'|'done'>('idle')
  const [vSec,setVSec]     = useState(0)
  const [vTotal,setVTotal] = useState(0)
  const [vText,setVText]   = useState('')
  const mTimer = useRef<NodeJS.Timeout>()
  const mStart = useRef(0)

  // Memories
  const [mems,setMems]     = useState<any[]>([])
  const [mTitle,setMTitle] = useState('')
  const [mBody,setMBody]   = useState('')
  const [mSave,setMSave]   = useState(false)
  const [mPaste,setMPaste] = useState('')
  const [mProc,setMProc]   = useState(false)
  const [mTab,setMTab]     = useState<'add'|'paste'|'list'>('add')

  // P6: Diary mode
  const [diaryMode,setDiaryMode] = useState(true)

  // Chat
  const [cMsgs,setCMsgs]           = useState<Msg[]>([])
  const [cStream,setCStream]       = useState(false)
  const [lastQA,setLastQA]         = useState<{q:string;a:string}|null>(null)
  const [calDone,setCalDone]       = useState(false)
  const [calVerdict,setCalVerdict] = useState<'yes'|'no'|null>(null)
  const [correction,setCorrection] = useState('')
  const [corrSaved,setCorrSaved]   = useState(false)
  const cRef = useRef<HTMLDivElement>(null)

  // P7: Wallet
  const [walletItems,setWalletItems]   = useState<any[]>([])
  const [walletType,setWalletType]     = useState('id_card')
  const [walletTitle,setWalletTitle]   = useState('')
  const [walletNotes,setWalletNotes]   = useState('')
  const [walletSaving,setWalletSaving] = useState(false)
  const [walletTab,setWalletTab]       = useState<'list'|'add'>('list')

  useEffect(()=>{if(status==='unauthenticated')router.push('/login')},[status])
  useEffect(()=>{if(session){fetchConf();fetchMems();fetchStats();loadSessions();loadWallet()}},[session,tab])
  useEffect(()=>{iRef.current?.scrollIntoView({behavior:'smooth'})},[iMsgs])
  useEffect(()=>{cRef.current?.scrollIntoView({behavior:'smooth'})},[cMsgs])

  const fetchConf  = async()=>{try{const r=await fetch('/api/confidence');const{breakdown}=await r.json();setConf(breakdown)}catch{}}
  const fetchMems  = async()=>{try{const r=await fetch('/api/memories');const{data}=await r.json();setMems(data||[])}catch{}}
  const fetchStats = async()=>{
    try{
      const [mr,vr]=await Promise.all([fetch('/api/memories'),fetch('/api/upload/voice')])
      const{data:md}=await mr.json(); const{data:vd}=await vr.json().catch(()=>({data:[]}))
      setStats({totalMemories:md?.length||0,totalVoiceMins:Math.round(((vd||[]).reduce((s:number,r:any)=>s+(r.duration_seconds||0),0))/60)})
    }catch{}
  }

  // P4: Session management
  const loadSessions=()=>{try{setSessions(JSON.parse(localStorage.getItem('rowang_sessions')||'[]'))}catch{}}
  const saveSession=()=>{
    const name=sessionName.trim()||`Session ${new Date().toLocaleDateString('id-ID')}`
    const s={id:Date.now().toString(),name,date:new Date().toLocaleDateString('id-ID'),tab,data:{iCat,iMsgs,doneCats,mTitle,mBody,cMsgs,vText,vTotal}}
    const updated=[s,...sessions].slice(0,20)
    localStorage.setItem('rowang_sessions',JSON.stringify(updated));setSessions(updated);setSessionName('');setShowSessions(false)
  }
  const loadSession=(s:any)=>{setTab(s.tab||'home');if(s.data?.iCat)setICat(s.data.iCat);if(s.data?.iMsgs)setIMsgs(s.data.iMsgs);if(s.data?.doneCats)setDone(s.data.doneCats);if(s.data?.cMsgs)setCMsgs(s.data.cMsgs);if(s.data?.vTotal)setVTotal(s.data.vTotal);setShowSessions(false)}
  const eraseSession=(id:string)=>{const u=sessions.filter(s=>s.id!==id);localStorage.setItem('rowang_sessions',JSON.stringify(u));setSessions(u)}
  const eraseAll=()=>{localStorage.removeItem('rowang_sessions');setSessions([])}

  // P7: Wallet
  const loadWallet=async()=>{try{const r=await fetch('/api/memories');const{data}=await r.json();setWalletItems((data||[]).filter((m:any)=>m.source==='wallet'))}catch{}}
  const saveWalletItem=async()=>{
    if(!walletTitle.trim())return;setWalletSaving(true)
    const t=WALLET_TYPES.find(x=>x.id===walletType)
    await fetch('/api/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:`${t?.icon} ${walletTitle}`,content:walletNotes||`Document type: ${t?.label}. Title: ${walletTitle}.`,category:t?.label||'Document',source:'wallet',importance:10})})
    setWalletTitle('');setWalletNotes('');await loadWallet();await fetchConf();setWalletSaving(false);setWalletTab('list')
  }

  // Interview
  const startCat=async(cat:string,voiceText?:string)=>{
    setIStart(true);setICat(cat);setIMsgs([]);setTab('interview')
    const r=await fetch('/api/interview',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat})})
    const{sessionId,opening}=await r.json();setISessId(sessionId)
    const msgs:Msg[]=[{role:'assistant',content:opening}]
    if(voiceText){msgs.push({role:'user',content:voiceText});setIMsgs(msgs);setIStart(false);sendInterviewMsgs(cat,sessionId,msgs)}
    else{setIMsgs(msgs);setIStart(false)}
  }

  const sendInterview=async(text:string)=>{
    if(!text.trim()||iStream)return
    const msgs:Msg[]=[...iMsgs,{role:'user',content:text}]
    await sendInterviewMsgs(iCat!,iSessId!,msgs)
  }

  const sendInterviewMsgs=async(cat:string,sessId:string|null,msgs:Msg[])=>{
    setIMsgs([...msgs,{role:'assistant',content:''}]);setIStream(true)
    const r=await fetch('/api/interview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat,messages:msgs,sessionId:sessId})})
    const reader=r.body!.getReader();const dec=new TextDecoder();let ai=''
    while(true){const{done,value}=await reader.read();if(done)break;ai+=dec.decode(value,{stream:true});setIMsgs(p=>{const c=[...p];c[c.length-1]={role:'assistant',content:ai};return c})}
    if(ai.includes('Let me ask')||msgs.length>22){if(!doneCats.includes(cat))setDone(p=>[...p,cat])}
    setIStream(false);fetchConf()
  }

  // Voice
  const startRec=(triggerCat?:string)=>{
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition
    if(!SR){alert('Please use Chrome or Edge for voice recording.');return}
    const rec=new SR();rec.continuous=true;rec.interimResults=true;rec.lang='id-ID'
    let final='';mStart.current=Date.now()
    rec.onresult=(e:any)=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript+' ';else interim+=e.results[i][0].transcript}setVText(final+interim)}
    rec.onerror=()=>{setVState('idle');clearInterval(mTimer.current)}
    rec.onend=async()=>{
      clearInterval(mTimer.current)
      const dur=Math.floor((Date.now()-mStart.current)/1000)
      if(final.trim().length>10){
        setVState('proc')
        const form=new FormData();form.append('transcript',final.trim());form.append('duration',String(dur))
        try{const r=await fetch('/api/upload/voice',{method:'POST',body:form});const d=await r.json();setVText(d.transcript||final.trim());setVTotal(p=>p+dur);setVState('done');fetchConf()
          if(triggerCat&&final.trim().length>30) setTimeout(()=>startCat(triggerCat,final.trim()),500)
        }catch{setVState('idle')}
      }else{setVState('idle');setVText('')}
    }
    rec.start();(window as any)._rowangRec=rec;setVState('rec');setVSec(0)
    mTimer.current=setInterval(()=>setVSec(Math.floor((Date.now()-mStart.current)/1000)),1000)
  }
  const stopRec=()=>{clearInterval(mTimer.current);(window as any)._rowangRec?.stop()}
  const ft=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  // Memories
  const saveMem=async()=>{
    if(!mTitle.trim()||!mBody.trim())return;setMSave(true)
    await fetch('/api/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:mTitle,content:mBody,category:'Personal Diary',source:diaryMode?'diary':'manual',importance:7})})
    setMTitle('');setMBody('');await fetchMems();await fetchConf();setMSave(false);setMTab('list')
  }
  const processPaste=async()=>{
    if(!mPaste.trim())return;setMProc(true)
    await fetch('/api/memories',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:mPaste,source:'paste'})})
    setMPaste('');await fetchMems();await fetchConf();setMProc(false);setMTab('list')
  }

  // Chat
  const sendChatMsg=async(text:string,attachedFile?:File)=>{
    if(!text.trim()&&!attachedFile)return
    const msgs:Msg[]=[...cMsgs,{role:'user',content:text||(attachedFile?`[Uploaded: ${attachedFile.name}]`:'')}]
    setCMsgs([...msgs,{role:'assistant',content:''}]);setCStream(true)
    setLastQA(null);setCalDone(false);setCalVerdict(null);setCorrection('');setCorrSaved(false)

    // If file attached, analyze it first then chat
    if(attachedFile){
      const result=await analyzeFile(attachedFile)
      if(result.status==='processed'){
        msgs[msgs.length-2]={role:'user',content:`${text?text+'\n\n':''}[I just uploaded "${attachedFile.name}" with ${result.memories||0} insights extracted from it — please incorporate this into your understanding of me and respond accordingly.]`}
      }
    }

    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs})})
    const reader=r.body!.getReader();const dec=new TextDecoder();let ai=''
    while(true){const{done,value}=await reader.read();if(done)break;ai+=dec.decode(value,{stream:true});setCMsgs(p=>{const c=[...p];c[c.length-1]={role:'assistant',content:ai};return c})}
    setLastQA({q:text||`File: ${attachedFile?.name}`,a:ai});setCStream(false);fetchConf()
  }

  const calibrate=async(verdict:'yes'|'no')=>{
    if(!lastQA)return
    await fetch('/api/confidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:lastQA.q,ai_response:lastQA.a,verdict})})
    setCalDone(true);setCalVerdict(verdict);fetchConf()
  }
  const saveCorrection=async()=>{
    if(!lastQA||!correction.trim())return
    await fetch('/api/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:`Correction: "${lastQA.q.slice(0,60)}"`,content:`Question: ${lastQA.q}\n\nAI said: ${lastQA.a}\n\nHow I would actually respond: ${correction}`,category:'Calibration',source:'correction',importance:9})})
    setCorrSaved(true);fetchConf()
  }

  if(status==='loading')return<div style={{minHeight:'100vh',background:C.cream,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{color:C.muted,fontFamily:'Inter'}}>Loading...</div></div>

  const pct=conf?.total??0
  const user=session?.user as any
  const firstName=user?.name?.split(' ')[0]||'Julius'

  const card:React.CSSProperties={background:C.white,border:`0.5px solid ${C.border}`,borderRadius:'14px',padding:'16px 18px',marginBottom:'10px'}
  const wCard:React.CSSProperties={background:C.amberDim,border:`0.5px solid ${C.border}`,borderRadius:'14px',padding:'16px 18px',marginBottom:'10px'}
  const inp:React.CSSProperties={width:'100%',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'10px',padding:'10px 13px',color:C.espresso,fontFamily:'Inter',fontSize:'13px',outline:'none'}
  const ta:React.CSSProperties={...inp,resize:'none',lineHeight:'1.65'}
  const btnP:React.CSSProperties={padding:'10px 20px',background:C.amber,color:'#FFF8EC',border:'none',borderRadius:'10px',fontFamily:'Inter',fontWeight:500,fontSize:'13px',cursor:'pointer',flexShrink:0}
  const btnS:React.CSSProperties={padding:'10px 20px',background:'transparent',color:C.walnut,border:`0.5px solid ${C.light}`,borderRadius:'10px',fontFamily:'Inter',fontSize:'13px',cursor:'pointer'}
  const mlbl:React.CSSProperties={fontFamily:'Inter',fontSize:'10px',color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:'6px',display:'block'}
  const aiMsg:React.CSSProperties={maxWidth:'85%',padding:'11px 14px',background:C.amberDim,border:`0.5px solid ${C.border}`,borderRadius:'14px 14px 14px 4px',color:C.espresso,fontSize:'13px',lineHeight:'1.65',alignSelf:'flex-start'}
  const uMsg:React.CSSProperties={maxWidth:'85%',padding:'11px 14px',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'14px 14px 4px 14px',color:C.walnut,fontSize:'13px',lineHeight:'1.65',alignSelf:'flex-end'}

  const NAV:[Tab,string,string][]=[
    ['home','⌂','Home'],['interview','✦','My Interview'],['voice','◎','Voice'],
    ['memories','○','Diary & Memories'],['chat','◐','Test My Clone'],
    ['upload','⇣','Upload Files'],['wallet','🪪','Private Wallet'],['clone','✧','My Clone'],
  ]

  return(
    <div style={{display:'flex',minHeight:'100vh',background:C.cream,fontFamily:'Inter',color:C.espresso}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.light};border-radius:4px}
        ::selection{background:rgba(180,123,46,0.2)}
        textarea,input,select{font-family:Inter,sans-serif}
        textarea:focus,input:focus,select:focus{border-color:${C.amber}!important;outline:none}
        @keyframes bounce{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade{animation:fadeUp .22s ease forwards}
        .nb:hover{background:${C.sandMid}!important}
        .ac:hover{border-color:${C.light}!important;background:${C.sand}!important}
        .cb:hover{border-color:${C.light}!important}
        .vt:hover{background:${C.amberDim}!important;border-color:${C.light}!important;cursor:pointer}
      `}</style>

      {/* SIDEBAR */}
      <aside style={{position:'fixed',top:0,left:0,height:'100vh',width:'230px',background:'#FDF5E6',borderRight:`0.5px solid ${C.border}`,display:'flex',flexDirection:'column',zIndex:50,overflowY:'auto'}}>
        <div style={{padding:'18px 16px 12px',borderBottom:`0.5px solid ${C.border}`}}>
          <div style={{fontFamily:'Lora,serif',fontWeight:600,fontSize:'19px',color:C.espresso}}>rowang<span style={{color:C.amber}}>.id</span></div>
          <div style={{fontSize:'9px',color:C.muted,marginTop:'2px',letterSpacing:'0.1em'}}>YOUR AI IDENTITY</div>
        </div>
        <div style={{padding:'10px 14px',borderBottom:`0.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:'8px'}}>
          {user?.image?<img src={user.image} style={{width:'26px',height:'26px',borderRadius:'50%',border:`1.5px solid ${C.border}`}} alt=""/>:<div style={{width:'26px',height:'26px',borderRadius:'50%',background:C.sandMid,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:500,color:C.walnut}}>{firstName[0]}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'12px',fontWeight:500,color:C.espresso,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name}</div>
            <div style={{fontSize:'9px',color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.email}</div>
          </div>
        </div>

        {/* Confidence */}
        <div style={{padding:'12px 14px',borderBottom:`0.5px solid ${C.border}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'}}>
            <span style={{fontSize:'9px',color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase'}}>Identity strength</span>
            <span style={{fontFamily:'Lora,serif',fontSize:'20px',fontWeight:500,color:C.amber}}>{pct}%</span>
          </div>
          <div style={{height:'4px',background:C.sandMid,borderRadius:'4px',overflow:'hidden'}}>
            <div style={{height:'100%',width:`${pct}%`,background:C.amber,borderRadius:'4px',transition:'width 1s ease'}}/>
          </div>
          <div style={{fontSize:'10px',color:C.muted,marginTop:'3px'}}>{conf?.label??'No data yet'}</div>
        </div>

        {/* P3: Stats grid */}
        <div style={{padding:'8px 14px',borderBottom:`0.5px solid ${C.border}`,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px'}}>
          {[
            [stats.totalMemories.toString(),'Memories'],
            [stats.totalVoiceMins+'m','Voice'],
            [(conf?.interview??0)+'/30','Interview'],
            [(conf?.calibration??0)+'/15','Calibrated'],
          ].map(([v,l])=>(
            <div key={l} style={{background:C.sand,borderRadius:'7px',padding:'5px 7px',textAlign:'center'}}>
              <div style={{fontFamily:'Lora,serif',fontSize:'13px',fontWeight:500,color:C.amber}}>{v}</div>
              <div style={{fontSize:'8px',color:C.muted,marginTop:'1px'}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:'6px'}}>
          {NAV.map(([id,icon,label])=>(
            <button key={id} className="nb" onClick={()=>{setTab(id);if(id==='interview')setICat(null)}} style={{width:'100%',display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',borderRadius:'9px',border:'none',background:tab===id?C.sandMid:'transparent',color:tab===id?C.walnut:C.muted,fontFamily:'Inter',fontWeight:tab===id?500:400,fontSize:'12px',cursor:'pointer',marginBottom:'1px',transition:'all .15s',textAlign:'left'}}>
              <span style={{fontSize:'12px',width:'14px',textAlign:'center',color:tab===id?C.amber:C.light}}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Breakdown bars */}
        {conf&&(
          <div style={{padding:'10px 14px',borderTop:`0.5px solid ${C.border}`}}>
            {([['Interview',conf.interview,30],['Voice',conf.voice,20],['Memories',conf.memories,20],['Calibration',conf.calibration,15]] as [string,number,number][]).map(([l,v,m])=>(
              <div key={l} style={{marginBottom:'4px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'9px',color:C.muted,marginBottom:'1px'}}><span>{l}</span><span>{v}/{m}</span></div>
                <div style={{height:'2px',background:C.sandMid,borderRadius:'2px'}}><div style={{height:'100%',width:`${(v/m)*100}%`,background:C.light,borderRadius:'2px',transition:'width .7s'}}/></div>
              </div>
            ))}
          </div>
        )}

        {/* P4: Session controls */}
        <div style={{padding:'8px 14px',borderTop:`0.5px solid ${C.border}`,display:'flex',gap:'4px'}}>
          <button onClick={()=>setShowSessions(p=>!p)} style={{flex:1,padding:'5px',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'7px',fontSize:'10px',color:C.walnut,cursor:'pointer',fontFamily:'Inter'}}>📋 Sessions</button>
          <button onClick={saveSession} style={{flex:1,padding:'5px',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'7px',fontSize:'10px',color:C.walnut,cursor:'pointer',fontFamily:'Inter'}}>💾 Save</button>
        </div>

        {showSessions&&(
          <div style={{padding:'10px 14px',borderTop:`0.5px solid ${C.border}`,background:C.cream}}>
            <input value={sessionName} onChange={e=>setSessionName(e.target.value)} placeholder="Session name (optional)" style={{...inp,fontSize:'11px',padding:'6px 9px',marginBottom:'6px'}}/>
            <button onClick={saveSession} style={{...btnP,width:'100%',justifyContent:'center',padding:'7px',fontSize:'11px',marginBottom:'8px'}}>Save Current Session</button>
            {sessions.length>0?(
              <div style={{maxHeight:'140px',overflowY:'auto'}}>
                {sessions.map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:'5px',padding:'5px 0',borderBottom:`0.5px solid ${C.border}`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'11px',fontWeight:500,color:C.espresso,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                      <div style={{fontSize:'9px',color:C.muted}}>{s.date}</div>
                    </div>
                    <button onClick={()=>loadSession(s)} style={{padding:'2px 7px',background:C.amber,color:'#FFF8EC',border:'none',borderRadius:'5px',fontSize:'9px',cursor:'pointer'}}>Load</button>
                    <button onClick={()=>eraseSession(s.id)} style={{background:'none',border:'none',color:C.light,fontSize:'11px',cursor:'pointer'}}>✕</button>
                  </div>
                ))}
                <button onClick={eraseAll} style={{marginTop:'5px',background:'none',border:'none',color:C.light,fontSize:'10px',cursor:'pointer',fontFamily:'Inter'}}>Erase all</button>
              </div>
            ):<div style={{fontSize:'11px',color:C.muted}}>No sessions yet.</div>}
          </div>
        )}

        <button onClick={()=>signOut()} style={{margin:'0 14px 12px',background:'none',border:'none',color:C.light,fontSize:'10px',cursor:'pointer',fontFamily:'Inter',textAlign:'left'}}>Sign out</button>
      </aside>

      {/* MAIN */}
      <main style={{marginLeft:'230px',flex:1,padding:'30px 34px',maxWidth:'760px'}}>

        {/* HOME */}
        {tab==='home'&&(
          <div className="fade">
            <div style={{...wCard,padding:'22px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'14px',marginBottom:'18px'}}>
                <div style={{width:'54px',height:'54px',borderRadius:'50%',background:C.white,border:`2px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',flexShrink:0}}>
                  <div style={{fontFamily:'Lora,serif',fontSize:'16px',fontWeight:500,color:C.amber,lineHeight:1}}>{pct}</div>
                  <div style={{fontSize:'9px',color:C.muted,marginTop:'1px'}}>%</div>
                </div>
                <div>
                  <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'22px',color:C.espresso,marginBottom:'4px'}}>Good to see you, {firstName}</h1>
                  <p style={{fontSize:'13px',color:C.walnut,lineHeight:'1.6',marginBottom:'14px'}}>{conf?.nextAction??"Start your identity interview — the highest-impact action right now."}</p>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button onClick={()=>setTab('interview')} style={btnP}>Start Interview</button>
                    <button onClick={()=>setTab('upload')} style={btnS}>Upload Files</button>
                    <button onClick={()=>setTab('voice')} style={{...btnS,padding:'10px 12px'}}>🎤</button>
                  </div>
                </div>
              </div>
              {/* P3: Data feed progress */}
              <div style={{background:C.white,borderRadius:'10px',padding:'12px 14px'}}>
                <span style={mlbl}>Data feeding progress</span>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'7px'}}>
                  {[{l:'Memories',v:stats.totalMemories,max:200},{l:'Voice',v:stats.totalVoiceMins,max:60,u:'m'},{l:'Interview',v:conf?.interview??0,max:30},{l:'Calibrated',v:conf?.calibration??0,max:15}].map(s=>(
                    <div key={s.l} style={{textAlign:'center'}}>
                      <div style={{fontFamily:'Lora,serif',fontSize:'18px',fontWeight:500,color:s.v>0?C.amber:C.espresso}}>{s.v}<span style={{fontSize:'10px',color:C.muted,fontFamily:'Inter'}}>{s.u||''}</span></div>
                      <div style={{fontSize:'9px',color:C.muted,marginBottom:'3px'}}>{s.l}</div>
                      <div style={{height:'3px',background:C.sandMid,borderRadius:'2px'}}><div style={{height:'100%',width:`${Math.min((s.v/s.max)*100,100)}%`,background:C.amber,borderRadius:'2px',transition:'width 1s'}}/></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {conf?.isUnlocked&&<div style={{...card,borderColor:'#C8E6C9',background:C.greenDim}}><div style={{fontFamily:'Lora,serif',fontSize:'14px',color:C.green,marginBottom:'3px'}}>Your AI clone is active at {pct}%</div><p style={{fontSize:'12px',color:'#4A7C59',lineHeight:'1.6'}}>Go to My Clone to share or list it for sale.</p></div>}

            <span style={mlbl}>What would you like to do?</span>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
              {([['interview','✦','Identity Interview','Real conversation — AI asks, follows up, goes deep'],['voice','◎','Voice Recording','Speak freely — most authentic data source'],['memories','○','Diary & Memories','Write privately — builds identity daily'],['upload','⇣','Upload Files','PDF, photos, WhatsApp — bulk extraction'],['wallet','🪪','Private Wallet','Secure docs, legal files, will'],['chat','◐','Test My Clone','Talk to your AI — calibrate every response']] as [Tab,string,string,string][]).map(([id,icon,title,sub])=>(
                <button key={id} className="ac" onClick={()=>setTab(id)} style={{display:'flex',alignItems:'center',gap:'11px',padding:'13px',background:C.white,border:`0.5px solid ${C.border}`,borderRadius:'11px',cursor:'pointer',textAlign:'left',transition:'all .15s',fontFamily:'Inter',color:C.espresso,width:'100%'}}>
                  <span style={{fontSize:'17px',color:C.amber,flexShrink:0}}>{icon}</span>
                  <div><div style={{fontWeight:500,fontSize:'12px',marginBottom:'1px'}}>{title}</div><div style={{fontSize:'10px',color:C.muted,lineHeight:'1.4'}}>{sub}</div></div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* INTERVIEW — list */}
        {tab==='interview'&&!iCat&&(
          <div className="fade">
            <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'24px',color:C.espresso,marginBottom:'6px'}}>Your Identity Interview</h1>
            <p style={{fontSize:'13px',color:C.walnut,lineHeight:'1.65',marginBottom:'18px'}}>A real conversation — not a form. Each topic has an AI that asks deep questions, follows up, and keeps exploring until it truly understands you.</p>
            <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
              {CATS.map(cat=>{const done=doneCats.includes(cat.id);return(
                <button key={cat.id} className="cb" onClick={()=>startCat(cat.id)} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 15px',background:done?C.greenDim:C.white,border:`0.5px solid ${done?'#C8E6C9':C.border}`,borderRadius:'11px',cursor:'pointer',textAlign:'left',transition:'all .15s',fontFamily:'Inter',color:C.espresso,width:'100%'}}>
                  <span style={{fontSize:'16px',color:done?C.green:C.amber,flexShrink:0,width:'20px',textAlign:'center'}}>{cat.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,fontSize:'13px',color:done?C.green:C.espresso,marginBottom:'1px'}}>{done?'✓ ':''}{cat.id}</div>
                    <div style={{fontSize:'11px',color:C.muted}}>{cat.desc}</div>
                  </div>
                  <span style={{color:C.light,fontSize:'13px'}}>→</span>
                </button>
              )})}
            </div>
          </div>
        )}

        {/* INTERVIEW — chat with MediaInput */}
        {tab==='interview'&&iCat&&(
          <div className="fade">
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
              <button onClick={()=>setICat(null)} style={{...btnS,padding:'6px 12px',fontSize:'12px'}}>← Back</button>
              <div style={{flex:1}}>
                <div style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'16px',color:C.espresso}}>{iCat}</div>
                <div style={{fontSize:'10px',color:C.muted}}>{iMsgs.filter(m=>m.role==='user').length} responses · text, file, photo, or voice</div>
              </div>
            </div>
            {iStart?<div style={{padding:'40px',textAlign:'center',color:C.muted,fontSize:'13px'}}>Starting interview...</div>:(
              <>
                <div style={{minHeight:'240px',maxHeight:'380px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'10px',padding:'4px 0',marginBottom:'12px'}}>
                  {iMsgs.map((m,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                      <div style={m.role==='user'?uMsg:aiMsg}>{!m.content&&iStream&&i===iMsgs.length-1?<Dots/>:m.content}</div>
                    </div>
                  ))}
                  <div ref={iRef}/>
                </div>
                {/* P9: MediaInput for interview */}
                <MediaInput
                  placeholder="Share your thoughts, attach a file, photo, or use voice... (Enter to send)"
                  onText={t=>sendInterview(t)}
                  onFile={async(f)=>{
                    const result=await analyzeFile(f)
                    if(result.status==='processed') sendInterview(`[I just uploaded "${f.name}" with ${result.memories||0} insights extracted. Please ask me about what you found most interesting.]`)
                  }}
                  onVoice={t=>sendInterview(t)}
                  disabled={iStream}
                />
              </>
            )}
          </div>
        )}

        {/* VOICE */}
        {tab==='voice'&&(
          <div className="fade">
            <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'24px',color:C.espresso,marginBottom:'6px'}}>Voice Recording</h1>
            <p style={{fontSize:'13px',color:C.walnut,lineHeight:'1.65',marginBottom:'14px'}}>Speak naturally. Your voice is your most authentic data source.{vTotal>0?` ${ft(vTotal)} recorded total.`:''}</p>
            <div style={{...card,marginBottom:'14px'}}>
              {vState==='idle'&&<button onClick={()=>startRec()} style={{...btnP,width:'100%',justifyContent:'center',padding:'14px',fontSize:'14px'}}>🎤 Start Recording</button>}
              {vState==='rec'&&(
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'10px'}}>
                    <div style={{width:'10px',height:'10px',borderRadius:'50%',background:C.red,animation:'pulse 1s infinite'}}/>
                    <span style={{fontFamily:'Lora,serif',fontSize:'20px',fontWeight:500,color:C.espresso}}>{ft(vSec)}</span>
                    <span style={{fontSize:'12px',color:C.muted}}>Recording — speak naturally</span>
                  </div>
                  {vText&&<div style={{background:C.sand,borderRadius:'8px',padding:'9px 12px',fontSize:'12px',color:C.walnut,lineHeight:'1.6',marginBottom:'9px',fontStyle:'italic',maxHeight:'90px',overflowY:'auto'}}>{vText}</div>}
                  <button onClick={stopRec} style={{width:'100%',padding:'10px',background:C.redDim,border:`0.5px solid #EBCFC9`,borderRadius:'9px',color:C.red,fontFamily:'Inter',fontWeight:500,fontSize:'13px',cursor:'pointer'}}>Stop Recording</button>
                </div>
              )}
              {vState==='proc'&&<div style={{textAlign:'center',padding:'20px',color:C.muted,fontSize:'13px'}}>Saving and analyzing...</div>}
              {vState==='done'&&(
                <div>
                  <div style={{background:C.sand,borderRadius:'9px',padding:'11px',marginBottom:'10px',fontSize:'12px',color:C.walnut,lineHeight:'1.65',maxHeight:'110px',overflowY:'auto'}}>{vText}</div>
                  {vText.length>30&&(
                    <div style={{...card,background:C.amberDim,borderColor:C.light,marginBottom:'10px'}}>
                      <div style={{fontSize:'12px',color:C.walnut,marginBottom:'7px',fontWeight:500}}>Continue this in an interview?</div>
                      <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
                        {CATS.map(cat=>(
                          <button key={cat.id} onClick={()=>startCat(cat.id,vText)} style={{padding:'4px 9px',background:C.white,border:`0.5px solid ${C.border}`,borderRadius:'18px',fontSize:'10px',color:C.walnut,cursor:'pointer',fontFamily:'Inter'}}>
                            {cat.icon} {cat.id.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{display:'flex',gap:'7px'}}>
                    <div style={{flex:1,padding:'8px',background:C.greenDim,border:'0.5px solid #C8E6C9',borderRadius:'9px',color:C.green,fontSize:'12px',textAlign:'center',fontWeight:500}}>✓ Saved</div>
                    <button onClick={()=>{setVState('idle');setVText('')}} style={{...btnS,padding:'8px 12px',fontSize:'12px'}}>Record more</button>
                  </div>
                </div>
              )}
            </div>
            {/* P5: Clickable topics → start rec + auto-interview */}
            <div style={card}>
              <span style={mlbl}>Click any topic to record + auto-start interview</span>
              {VOICE_TOPICS.map((t,i)=>(
                <div key={i} className="vt" onClick={()=>startRec(t.cat)} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'12px',color:C.walnut,padding:'9px 11px',borderBottom:i<VOICE_TOPICS.length-1?`0.5px solid ${C.border}`:'none',lineHeight:'1.5',borderRadius:'8px',transition:'all .15s',border:'0.5px solid transparent',margin:'-0.5px'}}>
                  <span style={{color:C.amber,fontSize:'13px',flexShrink:0}}>🎤</span>
                  <span style={{flex:1}}>{t.text}</span>
                  <span style={{fontSize:'9px',color:C.light,flexShrink:0,textAlign:'right'}}>{t.cat}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DIARY & MEMORIES with MediaInput */}
        {tab==='memories'&&(
          <div className="fade">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
              <div>
                <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'24px',color:C.espresso,marginBottom:'3px'}}>{diaryMode?'Personal Diary':'Memories & Knowledge'}</h1>
                <p style={{fontSize:'12px',color:C.walnut}}>{mems.length} entries · {diaryMode?'Private diary mode — write freely.':'Every story enriches your identity.'}</p>
              </div>
              <button onClick={()=>setDiaryMode(p=>!p)} style={{...btnS,padding:'6px 12px',fontSize:'11px',flexShrink:0}}>{diaryMode?'📓 Diary':'🧠 Memory'}</button>
            </div>
            <div style={{display:'flex',gap:'5px',marginBottom:'12px'}}>
              {(['add','paste','list'] as const).map(t=>(
                <button key={t} onClick={()=>setMTab(t)} style={{padding:'6px 13px',borderRadius:'18px',fontFamily:'Inter',fontSize:'11px',cursor:'pointer',background:mTab===t?C.amber:'transparent',color:mTab===t?'#FFF8EC':C.walnut,border:`0.5px solid ${mTab===t?C.amber:C.border}`,transition:'all .15s'}}>
                  {t==='add'?(diaryMode?'✏️ Write Today':'+ Add Memory'):t==='paste'?'⇣ Paste Data':`All (${mems.length})`}
                </button>
              ))}
            </div>

            {mTab==='add'&&(
              <div style={card}>
                {diaryMode&&<div style={{fontSize:'12px',color:C.muted,fontStyle:'italic',lineHeight:'1.65',marginBottom:'12px',padding:'10px 12px',background:C.sand,borderRadius:'9px'}}>📓 Private space. Write freely — thoughts, events, decisions, feelings. Everything enriches your clone.</div>}
                <label style={mlbl}>{diaryMode?"Today's entry title / date":'Title'}</label>
                <input value={mTitle} onChange={e=>setMTitle(e.target.value)} placeholder={diaryMode?`${new Date().toLocaleDateString('id-ID')} — What's on your mind?`:'e.g. How I handled my first major business failure'} style={{...inp,marginBottom:'10px'}}/>
                <label style={mlbl}>{diaryMode?'Write freely':'Full story'}</label>
                {/* P9: MediaInput for memories */}
                <div style={{marginBottom:'10px'}}>
                  <textarea rows={7} value={mBody} onChange={e=>setMBody(e.target.value)} placeholder={diaryMode?'Write anything — a decision, a feeling, a conversation...':"It was 2019, and we had just received an offer..."} style={ta}/>
                  <div style={{display:'flex',gap:'6px',marginTop:'6px',alignItems:'center'}}>
                    <span style={{fontSize:'11px',color:C.muted}}>Attach:</span>
                    <label style={{fontSize:'11px',color:C.walnut,cursor:'pointer',padding:'4px 9px',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'7px'}}>
                      📎 File
                      <input type="file" accept={FILE_ACCEPT} style={{display:'none'}} onChange={async e=>{if(!e.target.files?.[0])return;const f=e.target.files[0];const r=await analyzeFile(f);if(r.status==='processed')setMBody(v=>v+(v?'\n\n':'')+`[Extracted from ${f.name}: ${r.memories||0} insights saved to database]`)}}/>
                    </label>
                    <label style={{fontSize:'11px',color:C.walnut,cursor:'pointer',padding:'4px 9px',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'7px'}}>
                      🖼️ Photo
                      <input type="file" accept={IMG_ACCEPT} style={{display:'none'}} onChange={async e=>{if(!e.target.files?.[0])return;const f=e.target.files[0];const r=await analyzeFile(f);if(r.status==='processed')setMBody(v=>v+(v?'\n\n':'')+`[Photo "${f.name}" analyzed: ${r.memories||0} insights extracted]`)}}/>
                    </label>
                    <button title="Voice note" onClick={()=>startSpeech(t=>setMBody(v=>v+(v?'\n\n':'')+t))} style={{fontSize:'11px',color:C.walnut,cursor:'pointer',padding:'4px 9px',background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'7px',fontFamily:'Inter'}}>🎤 Voice</button>
                  </div>
                </div>
                <button onClick={saveMem} disabled={mSave||!mTitle.trim()||!mBody.trim()} style={{...btnP,width:'100%',justifyContent:'center',padding:'11px',opacity:(mSave||!mTitle.trim()||!mBody.trim())?0.5:1}}>
                  {mSave?'Saving...':(diaryMode?'Save Diary Entry ✓':'Save Memory →')}
                </button>
              </div>
            )}
            {mTab==='paste'&&(
              <div style={card}>
                <div style={{fontSize:'12px',color:C.walnut,lineHeight:'1.7',marginBottom:'11px'}}>Export WhatsApp: open chat → ⋮ → More → Export Chat (no media) → paste here. Also works for emails, notes.</div>
                <textarea rows={9} value={mPaste} onChange={e=>setMPaste(e.target.value)} placeholder="Paste WhatsApp export, emails, or any text..." style={{...ta,fontSize:'12px',marginBottom:'9px'}}/>
                <button onClick={processPaste} disabled={mProc||!mPaste.trim()} style={{...btnP,width:'100%',justifyContent:'center',padding:'11px'}}>{mProc?'Extracting patterns...':'Extract & Save →'}</button>
              </div>
            )}
            {mTab==='list'&&(
              <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
                {mems.length===0?<div style={{textAlign:'center',padding:'36px',color:C.muted,fontSize:'13px'}}>No entries yet.</div>
                  :mems.map((m:any)=>(
                  <div key={m.id} style={card}>
                    <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'3px'}}>
                      <span style={{fontSize:'10px',padding:'1px 7px',background:m.source==='diary'?C.blueDim:m.source==='wallet'?'#FEF3C7':m.source==='correction'?C.redDim:C.greenDim,color:m.source==='diary'?C.blue:m.source==='wallet'?'#92400E':m.source==='correction'?C.red:C.green,borderRadius:'18px'}}>{m.source==='diary'?'📓':m.source==='wallet'?'🪪':m.source==='correction'?'🎯':m.source?.startsWith('upload')?'📁':'💭'}</span>
                      <span style={{fontWeight:500,fontSize:'12px',color:C.espresso,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.title}</span>
                    </div>
                    <div style={{fontSize:'11px',color:C.walnut,lineHeight:'1.5',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{m.content}</div>
                    <div style={{fontSize:'9px',color:C.light,marginTop:'4px'}}>{new Date(m.created_at).toLocaleDateString('id-ID')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHAT with MediaInput */}
        {tab==='chat'&&(
          <div className="fade">
            <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'24px',color:C.espresso,marginBottom:'6px'}}>Test Your Clone</h1>
            <p style={{fontSize:'12px',color:C.walnut,marginBottom:'14px'}}>Talk to your AI. Rate each response — calibration reaches 95%. You can send text, files, photos, or voice.</p>
            <div style={{...card,padding:0,overflow:'hidden',marginBottom:'10px'}}>
              <div style={{padding:'11px 15px',borderBottom:`0.5px solid ${C.border}`,display:'flex',alignItems:'center',gap:'10px',background:C.amberDim}}>
                {user?.image?<img src={user.image} style={{width:'28px',height:'28px',borderRadius:'50%',border:`1.5px solid ${C.border}`}} alt=""/>:<div style={{width:'28px',height:'28px',borderRadius:'50%',background:C.sandMid,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:500,color:C.walnut}}>{firstName[0]}</div>}
                <div>
                  <div style={{fontWeight:500,fontSize:'13px',color:C.espresso}}>{user?.name} — AI Clone</div>
                  <div style={{fontSize:'10px',color:conf?.isUnlocked?C.green:C.amber}}>{conf?.isUnlocked?'● Clone active':`● Building — ${pct}% complete`}</div>
                </div>
              </div>
              <div style={{minHeight:'220px',maxHeight:'360px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'9px',padding:'13px'}}>
                {cMsgs.length===0&&<div style={{padding:'20px',textAlign:'center',color:C.muted,fontSize:'12px',lineHeight:'1.65'}}>Ask your clone anything — you can also attach a file, photo, or use voice input below.</div>}
                {cMsgs.map((m,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                    <div style={m.role==='user'?uMsg:aiMsg}>{!m.content&&cStream&&i===cMsgs.length-1?<Dots/>:m.content}</div>
                  </div>
                ))}
                <div ref={cRef}/>
              </div>
              {/* P9: MediaInput for chat */}
              <div style={{padding:'10px 12px',borderTop:`0.5px solid ${C.border}`}}>
                <MediaInput
                  placeholder="Ask your clone... attach file, photo, or use voice (Enter to send)"
                  onText={t=>sendChatMsg(t)}
                  onFile={(f)=>sendChatMsg(`Tell me what you think about this file I'm sharing: ${f.name}`,f)}
                  onVoice={t=>sendChatMsg(t)}
                  disabled={cStream}
                  rows={2}
                />
              </div>
            </div>

            {/* P2: Full calibration + correction */}
            {lastQA&&!cStream&&(
              <div style={card}>
                <span style={mlbl}>Was that response accurate to you?</span>
                {!calDone&&(
                  <div style={{display:'flex',gap:'8px'}}>
                    <button onClick={()=>calibrate('yes')} style={{flex:1,padding:'9px',background:C.greenDim,border:'0.5px solid #C8E6C9',borderRadius:'9px',color:C.green,fontFamily:'Inter',fontWeight:500,fontSize:'12px',cursor:'pointer'}}>✓ That's how I would respond</button>
                    <button onClick={()=>calibrate('no')} style={{flex:1,padding:'9px',background:C.redDim,border:'0.5px solid #EBCFC9',borderRadius:'9px',color:C.red,fontFamily:'Inter',fontWeight:500,fontSize:'12px',cursor:'pointer'}}>✗ I would NOT respond this way</button>
                  </div>
                )}
                {calDone&&calVerdict==='yes'&&<div style={{fontSize:'12px',color:C.green,fontWeight:500}}>✓ Great — this pattern reinforced in your clone</div>}
                {calDone&&calVerdict==='no'&&!corrSaved&&(
                  <div>
                    <div style={{fontSize:'11px',color:C.red,fontWeight:500,marginBottom:'7px'}}>✗ How would you actually respond? Write it below — becomes high-priority training data.</div>
                    <textarea rows={4} value={correction} onChange={e=>setCorrection(e.target.value)} placeholder={`How would ${firstName} actually answer: "${lastQA.q.slice(0,60)}"?\n\nWrite in your own voice...`} style={{...ta,marginBottom:'7px',fontSize:'12px'}}/>
                    <div style={{display:'flex',gap:'7px'}}>
                      <button onClick={saveCorrection} disabled={!correction.trim()} style={{...btnP,flex:1,justifyContent:'center',padding:'8px',fontSize:'12px',opacity:!correction.trim()?0.5:1}}>Save My Real Response →</button>
                      <button onClick={()=>setCorrSaved(true)} style={{...btnS,padding:'8px 11px',fontSize:'11px'}}>Skip</button>
                    </div>
                  </div>
                )}
                {calDone&&calVerdict==='no'&&corrSaved&&<div style={{fontSize:'12px',color:C.walnut,lineHeight:'1.65'}}>{correction.trim()?<><span style={{fontWeight:500,color:C.espresso}}>✓ Correction saved.</span> Clone learns your real response.</>:<><span style={{fontWeight:500,color:C.espresso}}>✓ Feedback saved.</span> Pattern flagged as inaccurate.</>}</div>}
              </div>
            )}
          </div>
        )}

        {/* UPLOAD */}
        {tab==='upload'&&(
          <div className="fade">
            <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'24px',color:C.espresso,marginBottom:'6px'}}>Upload Files & Folders</h1>
            <p style={{fontSize:'12px',color:C.walnut,lineHeight:'1.65',marginBottom:'14px'}}>Drop any file — PDFs, Word docs, photos, WhatsApp exports. AI reads, extracts identity insights, deletes raw files immediately.</p>
            <BulkUpload onComplete={fetchConf}/>
          </div>
        )}

        {/* P7: PRIVATE WALLET */}
        {tab==='wallet'&&(
          <div className="fade">
            <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'24px',color:C.espresso,marginBottom:'6px'}}>Private Wallet</h1>
            <p style={{fontSize:'12px',color:C.walnut,marginBottom:'14px'}}>Secure storage for important documents, legal files, and personal records.</p>
            <div style={{...card,borderColor:C.light,background:'#FFFBF0',marginBottom:'12px'}}>
              <div style={{fontSize:'11px',color:C.walnut,lineHeight:'1.7'}}>🔒 <span style={{fontWeight:500}}>Private.</span> Documents here are tagged importance-10 in your identity database. They enrich your clone's understanding of your real-world commitments, assets, and wishes.</div>
            </div>
            <div style={{display:'flex',gap:'5px',marginBottom:'12px'}}>
              {(['list','add'] as const).map(t=>(
                <button key={t} onClick={()=>setWalletTab(t)} style={{padding:'6px 13px',borderRadius:'18px',fontFamily:'Inter',fontSize:'11px',cursor:'pointer',background:walletTab===t?C.amber:'transparent',color:walletTab===t?'#FFF8EC':C.walnut,border:`0.5px solid ${walletTab===t?C.amber:C.border}`,transition:'all .15s'}}>
                  {t==='add'?'+ Add Document':`My Documents (${walletItems.length})`}
                </button>
              ))}
            </div>
            {walletTab==='add'&&(
              <div style={card}>
                <label style={mlbl}>Document type</label>
                <select value={walletType} onChange={e=>setWalletType(e.target.value)} style={{...inp,marginBottom:'10px',cursor:'pointer'}}>
                  {WALLET_TYPES.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                </select>
                <label style={mlbl}>Title / description</label>
                <input value={walletTitle} onChange={e=>setWalletTitle(e.target.value)} placeholder="e.g. KTP Julius Martono, valid until 2028" style={{...inp,marginBottom:'10px'}}/>
                <label style={mlbl}>Notes — key information, location, instructions</label>
                <textarea rows={5} value={walletNotes} onChange={e=>setWalletNotes(e.target.value)} placeholder="Location, contacts, instructions, key details..." style={{...ta,marginBottom:'10px'}}/>
                <div style={{background:C.amberDim,borderRadius:'9px',padding:'9px 12px',marginBottom:'10px',fontSize:'11px',color:C.walnut,lineHeight:'1.6'}}>⚠️ Store references and key info here — not actual sensitive files. Upload sensitive documents to your private NAS instead.</div>
                <button onClick={saveWalletItem} disabled={walletSaving||!walletTitle.trim()} style={{...btnP,width:'100%',justifyContent:'center',padding:'11px',opacity:(walletSaving||!walletTitle.trim())?0.5:1}}>{walletSaving?'Saving...':'Save to Private Wallet →'}</button>
              </div>
            )}
            {walletTab==='list'&&(
              walletItems.length===0?(
                <div style={{...wCard,textAlign:'center',padding:'32px'}}>
                  <div style={{fontSize:'28px',marginBottom:'8px'}}>🪪</div>
                  <div style={{fontFamily:'Lora,serif',fontSize:'15px',color:C.espresso,marginBottom:'5px'}}>Wallet is empty</div>
                  <p style={{fontSize:'12px',color:C.muted,lineHeight:'1.65',marginBottom:'12px'}}>Add important documents, legal records, and personal files.</p>
                  <button onClick={()=>setWalletTab('add')} style={btnP}>Add First Document →</button>
                </div>
              ):(
                <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
                  {walletItems.map((m:any)=>{
                    const t=WALLET_TYPES.find(x=>m.title?.includes(x.icon))
                    return(
                      <div key={m.id} style={{...card,borderLeft:`3px solid ${C.amber}`}}>
                        <div style={{display:'flex',alignItems:'center',gap:'9px',marginBottom:'3px'}}>
                          <span style={{fontSize:'16px'}}>{t?.icon||'📁'}</span>
                          <div style={{fontWeight:500,fontSize:'13px',color:C.espresso}}>{m.title}</div>
                        </div>
                        {m.content&&<div style={{fontSize:'11px',color:C.walnut,lineHeight:'1.5',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{m.content}</div>}
                        <div style={{fontSize:'9px',color:C.light,marginTop:'4px'}}>Added {new Date(m.created_at).toLocaleDateString('id-ID')}</div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* CLONE */}
        {tab==='clone'&&(
          <div className="fade">
            <h1 style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'24px',color:C.espresso,marginBottom:'6px'}}>My Clone</h1>
            <p style={{fontSize:'12px',color:C.walnut,marginBottom:'14px'}}>Your digital identity entity — own it, share it, or sell it.</p>
            {conf?.isUnlocked?(
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                <div style={{...wCard,textAlign:'center',padding:'28px'}}>
                  {user?.image&&<img src={user.image} style={{width:'56px',height:'56px',borderRadius:'50%',border:`2px solid ${C.amber}`,marginBottom:'12px'}} alt=""/>}
                  <div style={{fontFamily:'Lora,serif',fontSize:'18px',fontWeight:500,color:C.espresso,marginBottom:'3px'}}>{user?.name}</div>
                  <div style={{fontSize:'11px',color:C.amber,letterSpacing:'0.08em',marginBottom:'5px'}}>{pct}% IDENTITY CONFIDENCE · CLONE ACTIVE</div>
                </div>
                <div style={card}>
                  <span style={mlbl}>Your clone link</span>
                  <div style={{background:C.sand,border:`0.5px solid ${C.border}`,borderRadius:'9px',padding:'9px 13px',fontSize:'12px',color:C.walnut,fontFamily:'monospace',marginTop:'4px'}}>rowang.id/clone/{(user?.id||'').slice(0,8)}</div>
                </div>
                {conf?.canSell&&(
                  <div style={{...card,borderColor:C.light}}>
                    <div style={{fontFamily:'Lora,serif',fontSize:'15px',color:C.espresso,marginBottom:'7px'}}>List your clone for sale</div>
                    <input type="number" placeholder="Price in USD" style={{...inp,marginBottom:'9px'}}/>
                    <button style={{...btnP,width:'100%',justifyContent:'center',padding:'11px'}}>List for Sale →</button>
                  </div>
                )}
              </div>
            ):(
              <div style={{...wCard,textAlign:'center',padding:'42px 28px'}}>
                <div style={{fontFamily:'Lora,serif',fontSize:'48px',fontWeight:500,color:C.amber,marginBottom:'7px',lineHeight:1}}>{pct}%</div>
                <div style={{fontSize:'14px',color:C.walnut,marginBottom:'12px'}}>Clone unlocks at 85%</div>
                <div style={{height:'5px',background:C.sandMid,borderRadius:'5px',overflow:'hidden',maxWidth:'280px',margin:'0 auto 14px'}}>
                  <div style={{height:'100%',width:`${Math.min((pct/85)*100,100)}%`,background:C.amber,borderRadius:'5px',transition:'width 1s ease'}}/>
                </div>
                <p style={{fontSize:'12px',color:C.muted,lineHeight:'1.7',marginBottom:'14px'}}>{conf?.nextAction}</p>
                <button onClick={()=>setTab('interview')} style={btnP}>Continue Interview →</button>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

function Dots(){return<div style={{display:'flex',gap:'4px',padding:'2px 0'}}>{[0,1,2].map(n=><div key={n} style={{width:'5px',height:'5px',borderRadius:'50%',background:'#B47B2E',animation:`bounce 1.4s infinite ${n*.2}s`}}/>)}</div>}

type FItem={id:string;name:string;size:number;file:File;status:'queued'|'uploading'|'processed'|'skipped'|'error';memories?:number;reason?:string}

function BulkUpload({onComplete}:{onComplete:()=>void}){
  const [files,setFiles]=useState<FItem[]>([])
  const [dragging,setDrag]=useState(false)
  const [busy,setBusy]=useState(false)
  const [done,setDone]=useState(false)
  const inputRef=useRef<HTMLInputElement>(null)
  const C2={amber:'#B47B2E',amberDim:'#FDF0DC',sand:'#F5EDD8',border:'#E8DEC8',white:'#FFFFFF',muted:'#A08050',walnut:'#7C5A1E',espresso:'#3C2A0E',green:'#4A7C59',greenDim:'#EAF3EE',red:'#9B3A2A',redDim:'#FAEAE7',light:'#C8A462',sandMid:'#EFE0C0'}

  const addFiles=useCallback((raw:File[])=>{
    const ok=raw.filter(f=>ACCEPTED.includes(f.name.split('.').pop()?.toLowerCase()||'')&&f.size<=50*1024*1024)
    setFiles(prev=>{const ex=new Set(prev.map(f=>`${f.name}-${f.size}`));return[...prev,...ok.filter(f=>!ex.has(`${f.name}-${f.size}`)).map(f=>({id:`${f.name}-${Date.now()}-${Math.random()}`,name:f.name,size:f.size,file:f,status:'queued' as const}))]})
  },[])

  const onDrop=async(e:React.DragEvent)=>{
    e.preventDefault();setDrag(false)
    const collected:File[]=[]
    const readEntry=async(entry:any):Promise<void>=>{
      if(entry.isFile) await new Promise<void>(res=>entry.file((f:File)=>{collected.push(f);res()}))
      else if(entry.isDirectory){const reader=entry.createReader();const entries:any[]=await new Promise(res=>reader.readEntries(res));for(const e of entries)await readEntry(e)}
    }
    if(e.dataTransfer.items){for(let i=0;i<e.dataTransfer.items.length;i++){const en=e.dataTransfer.items[i].webkitGetAsEntry();if(en)await readEntry(en)}addFiles(collected)}
    else addFiles(Array.from(e.dataTransfer.files))
  }

  const process=async()=>{
    const queued=files.filter(f=>f.status==='queued');if(!queued.length)return
    setBusy(true);setDone(false)
    // ONE FILE AT A TIME — guaranteed to stay within size limits
    for(const item of queued){
      setFiles(p=>p.map(f=>f.id===item.id?{...f,status:'uploading'}:f))
      const form=new FormData()
      form.append('files',item.file)
      try{
        const res=await fetch('/api/upload/bulk',{method:'POST',body:form})
        const data=await res.json()
        if(data.code==='PAYLOAD_TOO_LARGE'){
          setFiles(p=>p.map(f=>f.id===item.id?{...f,status:'error',reason:'Too large — compress or split this file'}:f))
          continue
        }
        const r=data.results?.[0]||{status:'error',reason:'No result'}
        setFiles(p=>p.map(f=>f.id===item.id?{...f,status:r.status,memories:r.memoriesCreated,reason:r.reason}:f))
      }catch{
        setFiles(p=>p.map(f=>f.id===item.id?{...f,status:'error',reason:'Upload failed — retrying...'}:f))
        // Auto-retry once after 2s
        await new Promise(r=>setTimeout(r,2000))
        try{
          const form2=new FormData();form2.append('files',item.file)
          const res2=await fetch('/api/upload/bulk',{method:'POST',body:form2})
          const data2=await res2.json()
          const r2=data2.results?.[0]||{status:'error',reason:'Retry also failed'}
          setFiles(p=>p.map(f=>f.id===item.id?{...f,status:r2.status,memories:r2.memoriesCreated,reason:r2.reason}:f))
        }catch{
          setFiles(p=>p.map(f=>f.id===item.id?{...f,status:'error',reason:'Network error — check connection'}:f))
        }
      }
    }
    setBusy(false);setDone(true);onComplete()
  }

  const fmt=(b:number)=>b<1024*1024?`${(b/1024).toFixed(0)}KB`:`${(b/1024/1024).toFixed(1)}MB`
  const ICONS:Record<string,string>={pdf:'📄',docx:'📘',doc:'📘',pptx:'📙',ppt:'📙',xlsx:'📗',xls:'📗',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',txt:'📝',md:'📝',csv:'📊',json:'📋',mp3:'🎵',m4a:'🎵',wav:'🎵'}
  const icon=(name:string)=>ICONS[name.split('.').pop()?.toLowerCase()||'']||'📁'
  const sColor=(s:string)=>s==='processed'?C2.green:s==='error'?C2.red:s==='uploading'?C2.amber:C2.muted
  const sLabel=(f:FItem)=>f.status==='processed'?`✓ ${f.memories||0} insights`:f.status==='uploading'?'Analyzing...':f.status==='error'?`✗ ${f.reason||'Failed'}`:f.status==='skipped'?`Skipped: ${f.reason||''}`:'Queued'
  const queued=files.filter(f=>f.status==='queued').length
  const processed=files.filter(f=>f.status==='processed').length
  const totalInsights=files.reduce((s,f)=>s+(f.memories||0),0)

  return(
    <div>
      <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>inputRef.current?.click()}
        style={{border:`2px dashed ${dragging?C2.amber:C2.border}`,borderRadius:'14px',padding:'32px 20px',textAlign:'center',cursor:'pointer',background:dragging?C2.amberDim:C2.sand,transition:'all .2s',marginBottom:'10px'}}>
        <div style={{fontSize:'28px',marginBottom:'9px'}}>{dragging?'📂':'⇣'}</div>
        <div style={{fontFamily:'Lora,serif',fontWeight:500,fontSize:'14px',color:C2.espresso,marginBottom:'5px'}}>{dragging?'Drop files here':'Drop files or folders here'}</div>
        <div style={{fontSize:'11px',color:C2.muted,lineHeight:'1.6',marginBottom:'11px'}}>PDF, Word, PowerPoint, Excel, images, WhatsApp .txt, audio<br/>Folders supported — all files processed automatically · sent one by one</div>
        <div style={{display:'inline-block',padding:'7px 18px',background:C2.amber,color:'#FFF8EC',borderRadius:'9px',fontSize:'12px',fontFamily:'Inter',fontWeight:500}}>Browse files</div>
        <input ref={inputRef} type="file" multiple accept={ACCEPTED.map(e=>`.${e}`).join(',')} onChange={e=>e.target.files&&addFiles(Array.from(e.target.files))} style={{display:'none'}}/>
      </div>

      <div style={{background:C2.amberDim,border:`0.5px solid ${C2.border}`,borderRadius:'11px',padding:'11px 14px',marginBottom:'11px',fontSize:'11px',color:C2.walnut,lineHeight:'1.7'}}>
        <span style={{fontWeight:500,color:C2.espresso}}>How it works: </span>
        Files sent one at a time → AI reads each → extracts identity insights → saves to database → <span style={{color:C2.green,fontWeight:500}}>raw file deleted</span>. Network errors auto-retry once.
      </div>

      {files.length>0&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'7px'}}>
            <span style={{fontSize:'10px',color:C2.muted,letterSpacing:'0.06em',textTransform:'uppercase'}}>{files.length} files · {fmt(files.reduce((s,f)=>s+f.size,0))}</span>
            <button onClick={()=>{setFiles([]);setDone(false)}} style={{background:'none',border:'none',color:C2.light,fontSize:'11px',cursor:'pointer',fontFamily:'Inter'}}>Clear all</button>
          </div>
          <div style={{maxHeight:'240px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'4px',marginBottom:'9px'}}>
            {files.map(f=>(
              <div key={f.id} style={{display:'flex',alignItems:'center',gap:'9px',padding:'7px 11px',background:C2.white,border:`0.5px solid ${f.status==='processed'?'#C8E6C9':f.status==='error'?'#EBCFC9':C2.border}`,borderRadius:'9px'}}>
                <span style={{fontSize:'13px'}}>{icon(f.name)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'11px',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C2.espresso}}>{f.name}</div>
                  <div style={{fontSize:'10px',color:sColor(f.status),marginTop:'1px'}}>{sLabel(f)} · {fmt(f.size)}</div>
                </div>
                {f.status==='uploading'&&<div style={{width:'12px',height:'12px',borderRadius:'50%',border:`2px solid ${C2.amber}`,borderTopColor:'transparent',animation:'spin 0.8s linear infinite',flexShrink:0}}/>}
                {f.status==='processed'&&<span style={{color:C2.green,fontSize:'11px'}}>✓</span>}
                {f.status==='queued'&&<button onClick={()=>setFiles(p=>p.filter(x=>x.id!==f.id))} style={{background:'none',border:'none',color:C2.light,cursor:'pointer',fontSize:'11px'}}>✕</button>}
              </div>
            ))}
          </div>
          {done&&(
            <div style={{background:C2.greenDim,border:'0.5px solid #C8E6C9',borderRadius:'11px',padding:'11px 14px',marginBottom:'9px'}}>
              <div style={{fontFamily:'Lora,serif',fontSize:'14px',color:C2.green,marginBottom:'2px'}}>✓ {processed} files analyzed · {totalInsights} insights saved</div>
              <div style={{fontSize:'11px',color:'#4A7C59'}}>Raw files deleted. Identity database updated. Confidence score recalculating.</div>
            </div>
          )}
          {queued>0&&(
            <button onClick={process} disabled={busy} style={{width:'100%',padding:'11px',background:busy?C2.sandMid:C2.amber,color:busy?C2.muted:'#FFF8EC',border:'none',borderRadius:'10px',fontFamily:'Inter',fontWeight:500,fontSize:'12px',cursor:busy?'not-allowed':'pointer'}}>
              {busy?`Analyzing file ${files.filter(f=>f.status==='uploading').length} of ${files.filter(f=>f.status==='uploading'||f.status==='queued').length}...`:`⚡ Analyze ${queued} file${queued>1?'s':''} — extract identity data`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
