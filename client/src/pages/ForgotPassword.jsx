import React from 'react';
import {Link} from 'react-router-dom';
import {Mail,ArrowRight,KeyRound,ArrowLeft,MailCheck} from 'lucide-react';
import {api} from '../api/client';
import {Notice} from '../components/UI';
import {AuthStage} from './Login';

export default function ForgotPassword(){
  const [email,setEmail]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[sentTo,setSentTo]=React.useState('');
  async function submit(e){
    e.preventDefault();setError('');setBusy(true);
    try{await api('/auth/forgot-password',{method:'POST',body:{email:email.trim()}});setSentTo(email.trim())}
    catch(err){setError(err.message)}
    finally{setBusy(false)}
  }
  return <AuthStage eyebrow="LOCKED OUT? NO PROBLEM." title={<>Let’s get you<br/><em>back in.</em></>} lead="Enter the email you signed up with and we’ll send you a secure link to choose a new password.">
    {sentTo?<>
      <div className="auth3d-icon"><MailCheck size={24}/></div><span className="eyebrow">CHECK YOUR INBOX</span><h2>Reset link on its way</h2>
      <p className="muted">If an account exists for <b>{sentTo}</b>, we’ve sent a link to reset the password. It stays valid for 30 minutes and works once.</p>
      <p className="muted small-print">Nothing yet? Check your spam folder, make sure you used the email you registered with, or try again in a few minutes.</p>
      <button type="button" className="auth3d-submit ghost" onClick={()=>setSentTo('')}>Use a different email</button>
      <p className="auth-switch"><Link to="/login"><ArrowLeft size={12}/> Back to sign in</Link></p>
    </>:<>
      <div className="auth3d-icon"><KeyRound size={24}/></div><span className="eyebrow">PASSWORD HELP</span><h2>Forgot your password?</h2>
      <p className="muted">We’ll email you a reset link. For your security we don’t say whether an email is registered.</p>
      <Notice error={error}/>
      <form onSubmit={submit}>
        <label>Email address<div className="auth3d-field"><Mail size={16}/><input type="email" required autoFocus autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div></label>
        <button type="submit" className="auth3d-submit" disabled={busy||!email.trim()}>{busy?'Sending…':'Send reset link'} <ArrowRight size={17}/></button>
      </form>
      <p className="auth-switch">Remembered it? <Link to="/login">Back to sign in</Link></p>
    </>}
  </AuthStage>;
}
