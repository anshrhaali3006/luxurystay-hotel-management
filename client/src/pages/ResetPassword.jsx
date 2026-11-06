import React from 'react';
import {Link,useSearchParams,useNavigate} from 'react-router-dom';
import {LockKeyhole,ArrowRight,Eye,EyeOff,ShieldCheck,CircleCheck,TriangleAlert} from 'lucide-react';
import {api} from '../api/client';
import {Notice} from '../components/UI';
import PasswordStrength from '../components/PasswordStrength';
import {AuthStage} from './Login';

export default function ResetPassword(){
  const [params]=useSearchParams(),navigate=useNavigate();
  // Keep the token in memory only, then scrub it from the address bar/history so it can't leak via screenshots or Referer headers.
  const [token]=React.useState(()=>params.get('token')||'');
  React.useEffect(()=>{if(token)navigate('/reset-password',{replace:true})},[]);
  const [password,setPassword]=React.useState(''),[confirm,setConfirm]=React.useState(''),[show,setShow]=React.useState(false),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[done,setDone]=React.useState(false),[expired,setExpired]=React.useState(false);

  async function submit(e){
    e.preventDefault();setError('');
    if(password.length<10){setError('Use a password with at least 10 characters.');return}
    if(password!==confirm){setError('Passwords do not match.');return}
    setBusy(true);
    try{await api('/auth/reset-password',{method:'POST',body:{token,password}});setDone(true)}
    catch(err){if(/invalid or has expired/i.test(err.message))setExpired(true);else setError(err.message)}
    finally{setBusy(false)}
  }

  const lead='Choose a strong password you don’t use anywhere else. Every device signed in with your old password will be signed out.';
  if(!token&&!done||expired)return <AuthStage eyebrow="LINK PROBLEM" title={<>This link<br/><em>can’t be used.</em></>} lead="Reset links work once and expire after 30 minutes.">
    <div className="auth3d-icon"><TriangleAlert size={24}/></div><span className="eyebrow">RESET LINK</span><h2>Link invalid or expired</h2>
    <p className="muted">It may have already been used, or more than 30 minutes have passed. Request a fresh one and we’ll email it right away.</p>
    <Link className="auth3d-submit linklike" to="/forgot-password">Request a new link <ArrowRight size={17}/></Link>
    <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>
  </AuthStage>;

  if(done)return <AuthStage eyebrow="ALL SET" title={<>Password<br/><em>updated.</em></>} lead="You can now sign in with your new password.">
    <div className="auth3d-icon success"><CircleCheck size={24}/></div><span className="eyebrow">SUCCESS</span><h2>Your password has been reset</h2>
    <p className="muted">For your security you’ve been signed out everywhere. Sign in again to continue.</p>
    <Link className="auth3d-submit linklike" to="/login" state={{notice:'Password updated. Please sign in with your new password.'}}>Continue to sign in <ArrowRight size={17}/></Link>
  </AuthStage>;

  return <AuthStage eyebrow="CHOOSE A NEW PASSWORD" title={<>A fresh<br/><em>start.</em></>} lead={lead}>
    <div className="auth3d-icon"><LockKeyhole size={24}/></div><span className="eyebrow">RESET PASSWORD</span><h2>Set a new password</h2>
    <p className="muted">At least 10 characters. A longer phrase is stronger than a short, complicated one.</p>
    <Notice error={error}/>
    <form onSubmit={submit}>
      <label>New password<div className="auth3d-field"><LockKeyhole size={16}/><input type={show?'text':'password'} required minLength={10} maxLength={128} autoFocus autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 10 characters"/><button type="button" className="eye" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div><PasswordStrength value={password}/></label>
      <label>Confirm new password<div className="auth3d-field"><LockKeyhole size={16}/><input type={show?'text':'password'} required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat the password"/></div></label>
      <button type="submit" className="auth3d-submit" disabled={busy}>{busy?'Updating…':'Reset password'} <ArrowRight size={17}/></button>
    </form>
    <div className="secure-note"><ShieldCheck size={16}/> This link can only be used once</div>
  </AuthStage>;
}
