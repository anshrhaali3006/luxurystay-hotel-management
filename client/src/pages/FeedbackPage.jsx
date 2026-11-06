import React from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Star,Send,CheckCircle2,ArrowRight,ShieldCheck,Sparkles} from 'lucide-react';
import {api} from '../api/client';
import {useAuth} from '../routes/AuthContext';
import {Notice} from '../components/UI';

const CATS=[['stay','Overall stay'],['service','Service'],['cleanliness','Cleanliness'],['dining','Dining'],['facilities','Facilities'],['other','Other']];
const WORDS=['','Poor','Fair','Good','Very good','Exceptional'];

export default function FeedbackPage(){
  const [params]=useSearchParams();const {user}=useAuth();
  const [stays,setStays]=React.useState([]);
  const [form,setForm]=React.useState({reference:params.get('reference')||'',email:user?.email||'',category:'stay',comment:''});
  const [rating,setRating]=React.useState(0),[hover,setHover]=React.useState(0);
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[done,setDone]=React.useState('');
  React.useEffect(()=>{if(user?.role==='guest')api('/guest/bookings').then(d=>{const l=(d.data||d||[]).filter(b=>['confirmed','checked_in','checked_out'].includes(b.status));setStays(l);if(!form.reference&&l[0])setForm(f=>({...f,reference:l[0].reference}))}).catch(()=>{})},[user]);
  async function submit(e){
    e.preventDefault();setError('');
    if(!rating){setError('Please choose a star rating.');return}
    setBusy(true);
    try{const d=await api('/public/feedback',{method:'POST',body:{...form,rating,...(user?.role==='guest'?{email:user.email}:{})}});setDone(d.message||'Thank you for your feedback.')}
    catch(err){setError(err.message)}finally{setBusy(false)}
  }
  const shown=hover||rating;
  return <div className="booking-page feedback-page">
    <header className="booking-nav"><Link to="/" className="public-brand"><span className="brand-mark">L<span>S</span></span><span><b>LuxuryStay</b><small>STAY A LITTLE EXTRAORDINARY</small></span></Link><div><Link to="/">Home</Link><Link to="/my-stays">My stays</Link><Link className="nav-login" to="/rooms">Book a stay</Link></div></header>
    <section className="booking-page-hero"><div className="hero-orbs" aria-hidden><i/><i/><i/></div><span className="eyebrow">YOUR VOICE MATTERS</span><h1>Tell us about <em>your stay.</em></h1><p>Every review is read by our team and shared with the managers and staff who looked after you.</p></section>
    <main className="booking-content feedback-main">
      {done?<section className="booking-success feedback-done"><div className="success-mark"><CheckCircle2 size={28}/></div><span className="eyebrow">THANK YOU</span><h2>Feedback received.</h2><p>{done}</p><div className="success-actions"><Link className="gold-button" to="/">Back to home <ArrowRight size={15}/></Link><Link className="member-guest-link" to="/rooms">Plan another stay</Link></div></section>
      :<form className="feedback-form" onSubmit={submit}>
        <div className="feedback-form-head"><span className="success-mark small"><Sparkles size={20}/></span><div><span className="eyebrow">SHARE YOUR EXPERIENCE</span><h2>How was it?</h2></div></div>
        <Notice error={error}/>
        <div className="star-picker" role="radiogroup" aria-label="Rating" onMouseLeave={()=>setHover(0)}>
          {[1,2,3,4,5].map(n=><button type="button" key={n} role="radio" aria-checked={rating===n} className={`star-btn ${n<=shown?'on':''}`} onMouseEnter={()=>setHover(n)} onClick={()=>setRating(n)} aria-label={`${n} star${n>1?'s':''}`}><Star size={34} fill={n<=shown?'currentColor':'none'}/></button>)}
          <span className="star-word">{WORDS[shown]||'Tap a star'}</span>
        </div>
        <div className="checkout-form-grid">
          {stays.length>0?<label className="checkout-wide">Your stay<select value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}>{stays.map(b=><option key={b._id} value={b.reference}>{b.reference} · {b.hotelId?.name||'LuxuryStay'} · Room {b.roomId?.number||'—'}</option>)}</select></label>
          :<><label>Booking reference<input required value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="LS-XXXX-XXXX"/></label><label>Booking email<input required type="email" readOnly={user?.role==='guest'} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/></label></>}
          <label className="checkout-wide">What is this about?<div className="cat-chips">{CATS.map(([v,l])=><button type="button" key={v} className={`cat-chip ${form.category===v?'active':''}`} onClick={()=>setForm({...form,category:v})}>{l}</button>)}</div></label>
          <label className="checkout-wide">Your comments<textarea required rows="5" minLength="3" maxLength="2000" value={form.comment} onChange={e=>setForm({...form,comment:e.target.value})} placeholder="What made your stay special — or what could we do better?"/><small className="muted">{form.comment.length}/2000</small></label>
        </div>
        <button className="search-stays checkout-submit" disabled={busy}>{busy?'Sending…':'Send feedback'} <Send size={16}/></button>
        <p className="checkout-privacy"><ShieldCheck size={14}/> Your feedback is shared only with the hotel team.</p>
      </form>}
    </main>
    <footer className="public-footer booking-footer"><Link to="/" className="public-brand"><span className="brand-mark">L<span>S</span></span><span><b>LuxuryStay</b><small>STAY A LITTLE EXTRAORDINARY</small></span></Link><span>© {new Date().getFullYear()} LuxuryStay Hospitality</span><Link to="/">Back to home</Link></footer>
  </div>
}
