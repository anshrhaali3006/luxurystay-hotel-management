import React from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {UserRound,LogOut,ArrowLeft} from 'lucide-react';
import {api,setToken} from '../api/client';
import {useAuth} from '../routes/AuthContext';
import {Notice,PageHeader} from '../components/UI';
import {AppearanceCard,NotificationsCard,SecurityCard} from '../components/SettingsCards';import ThemeToggle from '../components/ThemeToggle';

export default function Account(){
  const {user,login,logout}=useAuth(),navigate=useNavigate();
  const [profile,setProfile]=React.useState({name:user?.name||'',phone:user?.phone||''}),[pMsg,setPMsg]=React.useState({}),[pBusy,setPBusy]=React.useState(false);
  // /auth/me has the saved phone number (it isn't kept in the login response for older sessions).
  React.useEffect(()=>{if(!user)return;api('/auth/me').then(me=>setProfile(p=>({name:p.name||me.name,phone:p.phone||me.phone||''}))).catch(()=>{})},[]);
  if(!user)return <Navigate to="/login" replace state={{from:'/account'}}/>;
  const home=user.role==='guest'?'/my-stays':'/workspace';

  async function saveProfile(e){
    e.preventDefault();setPMsg({});setPBusy(true);
    try{const d=await api('/auth/profile',{method:'PATCH',body:{name:profile.name,phone:profile.phone}});login({...user,...d.user});setPMsg({success:'Profile saved.'})}
    catch(err){setPMsg({error:err.message})}finally{setPBusy(false)}
  }
  function signOut(){setToken(null);logout();navigate('/')}

  return <div className="guest-portal account-page">
    <header className="portal-nav"><Link to="/" className="public-brand"><span className="brand-mark">L<span>S</span></span><span><b>LuxuryStay</b><small>STAY A LITTLE EXTRAORDINARY</small></span></Link>
      <nav><ThemeToggle className="theme-nav-btn"/><Link to={home}><ArrowLeft size={14}/> {user.role==='guest'?'My stays':'Workspace'}</Link><button onClick={signOut}><LogOut size={15}/> Sign out</button></nav></header>
    <main className="account-main">
      <PageHeader eyebrow="YOUR ACCOUNT" title="Account settings" description={`Signed in as ${user.email} · ${user.role}`}/>
      <div className="account-grid">
        <section className="account-card"><h2><UserRound size={18}/> Profile</h2>
          <Notice error={pMsg.error} success={pMsg.success}/>
          <form onSubmit={saveProfile}>
            <label>Full name<input required minLength={2} maxLength={120} value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
            <label>Email<input value={user.email} disabled aria-describedby="email-note"/></label><small id="email-note" className="muted">Email can’t be changed here. Contact the front desk if it needs updating.</small>
            <label>Phone<input type="tel" maxLength={40} value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})} placeholder="Optional"/></label>
            <button className="gold-button" disabled={pBusy}>{pBusy?'Saving…':'Save profile'}</button>
          </form></section>
        <AppearanceCard/>
        <NotificationsCard/>
        <SecurityCard/>
      </div>
    </main>
  </div>;
}
