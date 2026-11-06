import React from 'react';
import {Link} from 'react-router-dom';
import {UserRound} from 'lucide-react';
import {PageHeader} from '../components/UI';
import {useAuth} from '../routes/AuthContext';
import {AppearanceCard,NotificationsCard,SecurityCard} from '../components/SettingsCards';

/** Personal settings for every staff role: appearance, email opt-ins and password. */
export default function SettingsPage(){
  const {user}=useAuth();
  return <>
    <PageHeader title="Settings" description="Personalise your workspace, choose which emails you get, and keep your account secure."/>
    <div className="account-grid settings-grid">
      <AppearanceCard/>
      <NotificationsCard/>
      <SecurityCard/>
      <section className="account-card"><h2><UserRound size={18}/> Profile</h2><p className="muted setting-note">Signed in as <b>{user?.email}</b> · {user?.role}</p><Link className="ghost-button" to="/account">Edit name &amp; phone</Link></section>
    </div>
  </>;
}
