export default function Waitlist() {
  return (
    <div style={{ minHeight:'100vh', background:'#080808', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Lato',sans-serif", color:'#E8E8E4', textAlign:'center', padding:'20px' }}>
      <div>
        <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:'30px', color:'#C9A84C', marginBottom:'20px' }}>rowang.id</div>
        <h1 style={{ fontSize:'18px', fontWeight:700, marginBottom:'10px' }}>Access by invitation only</h1>
        <p style={{ color:'#444', fontSize:'13px', lineHeight:'1.7' }}>Your email isn't registered yet.<br/>Contact the admin to get access.</p>
        <a href="/login" style={{ display:'inline-block', marginTop:'20px', color:'#C9A84C', fontSize:'13px' }}>← Back to login</a>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&display=swap')`}</style>
    </div>
  )
}
