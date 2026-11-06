import React from 'react';
import {Link} from 'react-router-dom';
import {Sun,Moon,Monitor,Palette,Bell,LockKeyhole,Eye,EyeOff,ShieldCheck,Mail} from 'lucide-react';
import {api,setToken} from '../api/client';
import {useAuth} from '../routes/AuthContext';
import {Notice} from './UI';
import PasswordStrength from './PasswordStrength';
import {useTheme} from '../utils/theme';

const Switch=({checked,onChange,disabled,label})=><button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`switch ${checked?'on':''}`} onClick={()=>onChange(!checked)}><i/></button>;

/** Light / dark / follow-the-system choice. Saved in this browser. */
export function AppearanceCard(){
  const {pref,setPref}=useTheme();
  const options=[['light','Light',Sun],['dark','Dark',Moon],['system','System',Monitor]];
  return <section className="account-card"><h2><Palette size={18}/> Appearance</h2>
    <p className="muted setting-note">Choose how LuxuryStay looks on this device.</p>
    <div className="theme-options" role="radiogroup" aria-label="Colour theme">{options.map(([v,label,Icon])=><button key={v} type="button" role="radio" aria-checked={pref===v} className={`theme-option ${pref===v?'active':''}`} onClick={()=>setPref(v)}><Icon size={22}/><b>{label}</b>{v==='system'&&<small>Match my device</small>}</button>)}</div>
  </section>;
}

/** Email opt-in / opt-out switches saved on the account. */
export function NotificationsCard(){
  const {user,login}=useAuth();const [msg,setMsg]=React.useState({}),[busy,setBusy]=React.useState('');
  const prefs=user?.preferences||{bookingEmails:true,newBookingAlerts:false};
  const canAlert=['admin','manager'].includes(user?.role);
  async function toggle(key,value){
    setMsg({});setBusy(key);
    try{const d=await api('/auth/preferences',{method:'PATCH',body:{[key]:value}});login({...user,...d.user});setMsg({success:'Preference saved.'})}
    catch(err){setMsg({error:err.message})}finally{setBusy('')}
  }
  const rows=[
    ['bookingEmails','Booking emails','Emails when a booking you made is received and when it is confirmed.',true],
    ['newBookingAlerts','New-booking alerts','Get an email whenever a guest sends a booking request that needs approval.',canAlert],
  ].filter(r=>r[3]);
  return <section className="account-card"><h2><Bell size={18}/> Email notifications</h2>
    <Notice error={msg.error} success={msg.success}/>
    <div className="pref-list">{rows.map(([key,title,text])=><div className="pref-row" key={key}><div><b><Mail size={14}/> {title}</b><small>{text}</small></div><Switch label={title} checked={!!prefs[key]} disabled={busy===key} onChange={v=>toggle(key,v)}/></div>)}</div>
    <small className="muted"><ShieldCheck size={12}/> Security emails such as password resets are always sent.</small>
  </section>;
}

/** Change password + email a reset link. Used on the workspace Settings page and the Account page. */
export function SecurityCard(){
  const {user,login}=useAuth();
  const [pw,setPw]=React.useState({currentPassword:'',newPassword:'',confirm:''}),[show,setShow]=React.useState(false),[msg,setMsg]=React.useState({}),[busy,setBusy]=React.useState(false),[linkBusy,setLinkBusy]=React.useState(false);
  async function change(e){
    e.preventDefault();setMsg({});
    if(pw.newPassword.length<10)return setMsg({error:'Use a new password with at least 10 characters.'});
    if(pw.newPassword!==pw.confirm)return setMsg({error:'The new passwords do not match.'});
    setBusy(true);
    try{const d=await api('/auth/change-password',{method:'POST',body:{currentPassword:pw.currentPassword,newPassword:pw.newPassword}});setToken(d.token);login({...user,...d.user});setPw({currentPassword:'',newPassword:'',confirm:''});setMsg({success:'Password changed. Your other devices have been signed out.'})}
    catch(err){setMsg({error:err.message})}finally{setBusy(false)}
  }
  async function sendLink(){
    setMsg({});setLinkBusy(true);
    try{await api('/auth/forgot-password',{method:'POST',body:{email:user.email}});setMsg({success:`A password reset link was sent to ${user.email}. It is valid for 30 minutes.`})}
    catch(err){setMsg({error:err.message})}finally{setLinkBusy(false)}
  }
  return <section className="account-card"><h2><LockKeyhole size={18}/> Password &amp; security</h2>
    {user?.mustChangePassword&&<div className="must-change" role="alert"><ShieldCheck size={16}/> An administrator gave you a temporary password. Please choose your own below.</div>}
    <Notice error={msg.error} success={msg.success}/>
    <form onSubmit={change}>
      <label>Current password<input type={show?'text':'password'} required autoComplete="current-password" value={pw.currentPassword} onChange={e=>setPw({...pw,currentPassword:e.target.value})}/></label>
      <label>New password<input type={show?'text':'password'} required minLength={10} maxLength={128} autoComplete="new-password" value={pw.newPassword} onChange={e=>setPw({...pw,newPassword:e.target.value})}/><PasswordStrength value={pw.newPassword}/></label>
      <label>Confirm new password<input type={show?'text':'password'} required autoComplete="new-password" value={pw.confirm} onChange={e=>setPw({...pw,confirm:e.target.value})}/></label>
      <label className="check-row"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> {show?<EyeOff size={14}/>:<Eye size={14}/>} Show passwords</label>
      <button className="gold-button" disabled={busy}>{busy?'Updating…':'Change password'}</button>
    </form>
    <div className="reset-by-email"><b>Forgot your current password?</b><small className="muted">We can email a secure reset link to {user?.email}.</small><button type="button" className="ghost-button" disabled={linkBusy} onClick={sendLink}>{linkBusy?'Sending…':'Email me a reset link'}</button></div>
    <small className="muted"><ShieldCheck size={12}/> Changing your password signs out every other device. Prefer the full form? <Link to="/forgot-password">Reset by email</Link>.</small>
  </section>;
}
