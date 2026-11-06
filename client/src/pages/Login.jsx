import React from 'react';
import {Link,useNavigate,useLocation} from 'react-router-dom';
import {Hotel,LockKeyhole,ArrowRight,ShieldCheck,Globe,Eye,EyeOff,Mail,Sparkles} from 'lucide-react';
import {api,setToken} from '../api/client';
import {useAuth} from '../routes/AuthContext';
import {Notice} from '../components/UI';
import {announceWelcome} from '../components/WelcomeSplash';

/** Shared 3D stage used by the sign-in and register screens. */
export function AuthStage({eyebrow,title,lead,children}){
  return <div className="auth3d" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.setProperty('--ax',(((e.clientX-r.left)/r.width-.5)*2).toFixed(3));e.currentTarget.style.setProperty('--ay',(((e.clientY-r.top)/r.height-.5)*2).toFixed(3))}}>
    <div className="auth3d-bg" aria-hidden><i className="glow g1"/><i className="glow g2"/><i className="grid-floor"/></div>
    <section className="auth3d-showcase">
      <Link to="/" className="auth3d-brand"><span className="brand-mark">L<span>S</span></span><span><b>LuxuryStay</b><small>STAY A LITTLE EXTRAORDINARY</small></span></Link>
      <div className="auth3d-copy"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{lead}</p>
        <div className="auth3d-points"><span><ShieldCheck size={15}/> Secure sign-in</span><span><Sparkles size={15}/> One account, every stay</span></div></div>
      <div className="auth3d-scene" aria-hidden="true"><div className="armillary"><i/><i/><i/><b>LS</b></div>
        <div className="float-card fc1"><b>5★</b><small>Guest rated</small></div><div className="float-card fc2"><b>24/7</b><small>Concierge</small></div><div className="auth3d-key"><span>LS</span><small>KEY CARD</small></div></div>
    </section>
    <section className="auth3d-panel"><div className="auth3d-card">{children}</div><p className="auth3d-legal">© {new Date().getFullYear()} LuxuryStay Hospitality · Privacy · Security</p></section>
  </div>
}

export default function Login(){
  const [email,setEmail]=React.useState(''),[password,setPassword]=React.useState(''),[show,setShow]=React.useState(false),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const {login}=useAuth(),navigate=useNavigate(),location=useLocation();
  async function submit(e){e.preventDefault();setError('');setBusy(true);try{const d=await api('/auth/login',{method:'POST',body:{email,password}});setToken(d.token);login(d.user);announceWelcome(d.user);navigate(d.user.role==='guest'?(location.state?.from==='/book'&&localStorage.getItem('luxurystay_booking_draft')?'/book':'/my-stays'):(location.state?.from||'/workspace'),{replace:true})}catch(err){setError(err.message)}finally{setBusy(false)}}
  return <AuthStage eyebrow="EXCEPTIONAL STAYS. SEAMLESS OPERATIONS." title={<>Your world of<br/><em>better stays.</em></>} lead="Manage your upcoming stays or step into your hospitality workspace with one secure account.">
    <div className="auth3d-icon"><Hotel size={24}/></div><span className="eyebrow">WELCOME BACK</span><h2>Sign in to LuxuryStay</h2><p className="muted">Access your guest account or authorized team workspace.</p>
    <Notice error={error} success={location.state?.notice}/>
    <form onSubmit={submit}>
      <label>Email address<div className="auth3d-field"><Mail size={16}/><input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div></label>
      <label>Password<div className="auth3d-field"><LockKeyhole size={16}/><input type={show?'text':'password'} required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/><button type="button" className="eye" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
      <div className="forgot-row"><Link to="/forgot-password">Forgot password?</Link></div>
      <button type="submit" className="auth3d-submit" disabled={busy}>{busy?'Signing in…':'Sign in securely'} <ArrowRight size={17}/></button>
    </form>
    <div className="secure-note"><ShieldCheck size={16}/> Your information stays protected</div>
    <p className="auth-switch">New to LuxuryStay? <Link to="/register">Create a guest account</Link></p>
    <Link className="back-public" to="/"><Globe size={15}/> Continue browsing as a guest</Link>
  </AuthStage>
}
