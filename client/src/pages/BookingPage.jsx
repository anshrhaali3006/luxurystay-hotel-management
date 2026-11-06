import React from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {ArrowRight,CalendarDays,Users,MapPin,Wifi,CheckCircle2,ShieldCheck,Star,Download,Compass,CreditCard,Landmark,Store,Lock,Hourglass,BedDouble,Ban} from 'lucide-react';
import {api,downloadFile} from '../api/client';
import {useAuth} from '../routes/AuthContext';
import {Notice} from '../components/UI';

const API_ORIGIN=(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace(/\/api\/?$/,'');
const FALLBACK='https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=900&q=80';
const photo=room=>{const src=room?.imageUrls?.[0]||room?.imageUrl;return src?(src.startsWith('http')?src:`${API_ORIGIN}${src}`):FALLBACK};
const rate=room=>Number(room?.roomTypeId?.baseRate||0);
const capacityOf=room=>Number(room?.roomTypeId?.capacity||2);
const money=n=>new Intl.NumberFormat('en-PK',{style:'currency',currency:'PKR',maximumFractionDigits:0}).format(n||0);
const today=new Date().toISOString().slice(0,10);
// What the guest sees for each room status
const STATE={
  available:{label:'READY FOR YOU',note:''},
  booked:{label:'BOOKED',note:'Reserved for your dates'},
  occupied:{label:'OCCUPIED',note:'Currently occupied'},
  preparing:{label:'BEING PREPARED',note:'Being prepared for the next guest'},
  unavailable:{label:'UNAVAILABLE',note:'Temporarily unavailable'}
};
const emptyPay={method:'card',name:'',number:'',expiry:'',cvv:''};

export default function BookingPage({mode='browse'}){
  const [params]=useSearchParams();const navigate=useNavigate();const {user}=useAuth();
  const savedDraft=(()=>{try{return JSON.parse(localStorage.getItem('luxurystay_booking_draft')||'null')}catch{return null}})();
  const [hotels,setHotels]=React.useState([]);
  const [hotelId,setHotelId]=React.useState(params.get('hotelId')||savedDraft?.hotelId||'');
  const [checkIn,setCheckIn]=React.useState(params.get('checkIn')||savedDraft?.checkIn||'');
  const [checkOut,setCheckOut]=React.useState(params.get('checkOut')||savedDraft?.checkOut||'');
  const [adults,setAdults]=React.useState(String(params.get('adults')||savedDraft?.adults||'2'));
  const [children,setChildren]=React.useState(String(params.get('children')||savedDraft?.children||'0'));
  const [rooms,setRooms]=React.useState([]);
  const [searched,setSearched]=React.useState(false);
  const [selected,setSelected]=React.useState(savedDraft?.selected||null);
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [success,setSuccess]=React.useState(null);
  const [pay,setPay]=React.useState(emptyPay);
  const [form,setForm]=React.useState({firstName:user?.name?.split(' ')[0]||'',lastName:user?.name?.split(' ').slice(1).join(' ')||'',email:user?.email||'',phone:'',notes:'',...(savedDraft?.form||{})});

  const hotel=hotels.find(h=>h._id===hotelId);
  const maxGuests=Math.max(1,Number(hotel?.maxCapacity)||6);
  const totalGuests=Number(adults)+Number(children);
  const nights=checkIn&&checkOut&&checkOut>checkIn?Math.ceil((new Date(checkOut)-new Date(checkIn))/86400000):0;
  const available=rooms.filter(r=>r.availability==='available');
  const others=rooms.filter(r=>r.availability!=='available');

  React.useEffect(()=>{api('/public/hotels').then(d=>{const a=d.data||d||[];setHotels(a);if(!hotelId&&a[0])setHotelId(a[0]._id)}).catch(e=>setError(e.message))},[]);
  React.useEffect(()=>{if(params.get('hotelId'))setHotelId(params.get('hotelId'))},[params]);
  React.useEffect(()=>{localStorage.setItem('luxurystay_booking_draft',JSON.stringify({hotelId,checkIn,checkOut,adults,children,selected,form}))},[hotelId,checkIn,checkOut,adults,children,selected,form]);
  // keep the party size inside what this property can actually host
  React.useEffect(()=>{if(!hotel)return;let a=Math.min(Number(adults),maxGuests);let c=Math.min(Number(children),Math.max(0,maxGuests-a));if(String(a)!==adults)setAdults(String(a));if(String(c)!==children)setChildren(String(c))},[hotel,maxGuests]);

  async function search(e){
    e?.preventDefault();setError('');setSuccess(null);
    if(!hotelId||!checkIn||!checkOut||checkOut<=checkIn){setError('Select a hotel and valid check-in/check-out dates.');return}
    setBusy(true);
    try{
      const d=await api('/public/rooms',{query:{hotelId,checkIn,checkOut,guests:totalGuests}});
      const list=d.data||d||[];setRooms(list);setSearched(true);
      setSelected(prev=>prev&&list.some(r=>r._id===prev._id&&r.availability==='available')?prev:null);
      if(!list.length)setError(`No room in this property sleeps ${totalGuests} guests. The largest room hosts up to ${maxGuests}.`);
      else if(!list.some(r=>r.availability==='available'))setError('Every room that fits your party is taken for these dates. Try different dates.');
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }
  React.useEffect(()=>{if(mode==='browse'&&params.get('checkIn')&&params.get('checkOut')&&params.get('hotelId'))search()},[]);

  function validatePayment(){
    if(pay.method!=='card')return '';
    const digits=pay.number.replace(/\D/g,'');
    if(pay.name.trim().length<2)return 'Enter the name on the demo card.';
    if(digits.length<13||digits.length>19)return 'Enter a card number with 13 to 19 digits. For the demo, use 4242 4242 4242 4242.';
    const m=pay.expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if(!m||Number(m[1])<1||Number(m[1])>12)return 'Enter the expiry date as MM/YY.';
    if(new Date(2000+Number(m[2]),Number(m[1]),1)<=new Date())return 'This demo card has expired.';
    if(!/^\d{3,4}$/.test(pay.cvv))return 'Enter the 3 or 4 digit security code.';
    return '';
  }

  async function book(e){
    e.preventDefault();setError('');
    if(totalGuests>capacityOf(selected)){setError(`This room sleeps up to ${capacityOf(selected)} guests.`);return}
    const payError=validatePayment();if(payError){setError(payError);return}
    setBusy(true);
    try{
      const digits=pay.number.replace(/\D/g,'');
      const d=await api('/public/bookings',{method:'POST',body:{hotelId,roomId:selected._id,checkIn,checkOut,adults:Number(adults),children:Number(children),...form,...(user?.role==='guest'?{email:user.email}:{}),paymentMethod:pay.method,...(pay.method==='card'?{cardLast4:digits.slice(-4)}:{})}});
      setSuccess(d.data||d);setPay(emptyPay);localStorage.removeItem('luxurystay_booking_draft');setSelected(null);window.scrollTo({top:0,behavior:'smooth'});
    }catch(err){setError(err.message);search()}finally{setBusy(false)}
  }

  return <div className="booking-page">
    <header className="booking-nav"><Link to="/" className="public-brand"><span className="brand-mark">L<span>S</span></span><span><b>LuxuryStay</b><small>STAY A LITTLE EXTRAORDINARY</small></span></Link><div><Link to="/">Home</Link><Link to="/my-stays">My stays</Link><Link className="nav-login" to="/login" state={{from:'/book'}}>{user?'Account':'Sign in'}</Link></div></header>
    <section className="booking-page-hero"><div className="hero-orbs" aria-hidden><i/><i/><i/></div><span className="eyebrow">YOUR NEXT CHAPTER</span><h1>Find your <em>perfect stay.</em></h1><p>Choose your dates and party size, compare rooms that truly fit, and send your request in a few simple steps.</p><div className="booking-trust"><span><ShieldCheck size={15}/> No account required</span><span><CheckCircle2 size={15}/> Instant reference number</span><span><Hourglass size={15}/> Confirmed on approval</span></div></section>
    <main className="booking-content">
      <form className="availability-form" onSubmit={search}>
        <label><span>PROPERTY</span><select required value={hotelId} onChange={e=>setHotelId(e.target.value)}><option value="">Choose a property</option>{hotels.map(h=><option key={h._id} value={h._id}>{h.name}{h.city?` · ${h.city}`:''}</option>)}</select></label>
        <label><span>CHECK IN</span><input type="date" min={today} required value={checkIn} onChange={e=>setCheckIn(e.target.value)}/></label>
        <label><span>CHECK OUT</span><input type="date" min={checkIn||today} required value={checkOut} onChange={e=>setCheckOut(e.target.value)}/></label>
        <label><span>ADULTS</span><select value={adults} onChange={e=>{const a=Number(e.target.value);setAdults(String(a));if(Number(children)>maxGuests-a)setChildren(String(Math.max(0,maxGuests-a)))}}>{Array.from({length:maxGuests},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} {n===1?'adult':'adults'}</option>)}</select></label>
        <label><span>CHILDREN</span><select value={children} onChange={e=>setChildren(e.target.value)}>{Array.from({length:Math.max(0,maxGuests-Number(adults))+1},(_,i)=>i).map(n=><option key={n} value={n}>{n} {n===1?'child':'children'}</option>)}</select></label>
        <button className="search-stays" type="submit" disabled={busy}>{busy?'Checking…':'Find available rooms'} <ArrowRight size={16}/></button>
      </form>
      <p className="guest-fit-note"><Users size={14}/> {totalGuests} {totalGuests===1?'guest':'guests'} · showing rooms that sleep {totalGuests} or more · this property hosts up to {maxGuests}</p>
      <Notice error={error}/>

      {success&&<section className="booking-success">
        <div className="success-mark"><Hourglass size={28}/></div><span className="eyebrow">REQUEST RECEIVED</span><h2>Your request is awaiting approval.</h2>
        <p>{user?.role==='guest'?'This request has been saved to your booking history.':"We've saved your request. Our team reviews every reservation — your room is booked as soon as it is approved."}</p>
        <div className="reference-card"><small>BOOKING REFERENCE</small><strong>{success.reference}</strong><span className="pending-pill">PENDING APPROVAL</span><span>{success.guestId?.firstName} {success.guestId?.lastName} · {success.roomId?.number?`Room ${success.roomId.number}`:'Selected room'}</span><div>{success.checkIn?String(success.checkIn).slice(0,10):checkIn} → {success.checkOut?String(success.checkOut).slice(0,10):checkOut} · {success.adults+success.children} guests</div><b>{money(success.total)}</b>{success.payment?<span>Demo payment {success.payment.reference}{success.payment.cardLast4?` · card ending ${success.payment.cardLast4}`:''} · refunded automatically if declined</span>:<span>Payment due at the hotel · no payment taken</span>}</div>
        <div className="success-actions"><button className="gold-button" onClick={()=>downloadFile(`/public/bookings/${success._id}/confirmation.pdf?email=${encodeURIComponent(form.email)}`,`reservation-${success.reference}.pdf`).catch(err=>setError(err.message))}><Download size={15}/> Download request summary</button>{user?.role==='guest'?<Link className="gold-button" to="/my-stays">View my booking history <ArrowRight size={15}/></Link>:<Link className="gold-button" to="/register" state={{from:'/book'}}>Create an account <ArrowRight size={15}/></Link>}<Link className="member-guest-link" to="/">Back to home</Link></div>
        {user?.role!=='guest'&&<p className="muted">Want to follow the approval? Create an account with the same email address to see your status in your stay history.</p>}
      </section>}

      {!success&&rooms.length>0&&<>
        <div className="results-heading"><div><span className="eyebrow">CURATED FOR YOUR DATES</span><h2>{available.length} room{available.length===1?'':'s'} available for {totalGuests} {totalGuests===1?'guest':'guests'}</h2><p><CalendarDays size={14}/> {checkIn} — {checkOut} <span>·</span> <Users size={14}/> {adults} adults{Number(children)?`, ${children} children`:''}{others.length?<><span>·</span> {others.length} not bookable</>:null}</p></div><span className="nights-chip">{nights} {nights===1?'NIGHT':'NIGHTS'}</span></div>
        <div className="available-rooms">{rooms.map(room=>{const st=STATE[room.availability]||STATE.unavailable;const locked=room.availability!=='available';const isSel=selected?._id===room._id;
          return <article data-tilt className={`available-room ${isSel?'selected':''} ${locked?'is-locked':''} state-${room.availability}`} key={room._id}>
            <div className="available-room-photo"><img src={photo(room)} alt={`Room ${room.number}`} onError={e=>{e.currentTarget.src=FALLBACK}}/><span className={`room-photo-badge badge-${room.availability}`}>{st.label}</span>{locked&&<div className="room-lock"><Ban size={22}/><b>{st.label}</b></div>}</div>
            <div className="available-room-info"><div className="room-category">{room.roomTypeId?.name||'Luxury room'} · Room {room.number}</div><h3>A stay that feels like yours.</h3><p>{locked?st.note:(room.roomTypeId?.description||'Thoughtfully appointed, beautifully comfortable, and designed for a restful stay.')}</p>
              <div className="room-amenities"><span><Wifi size={14}/> Wi-Fi</span><span><Star size={14}/> Premium comfort</span><span><Users size={14}/> Sleeps up to {capacityOf(room)}</span>{room.floor!=null&&<span><BedDouble size={14}/> Floor {room.floor}</span>}</div>
              <div className="available-room-bottom"><div><strong>{money(rate(room))}</strong><span>/ night · {money(rate(room)*nights)} total</span></div>
                {locked?<button type="button" className="room-select-button is-disabled" disabled>{st.label}</button>:<button type="button" className={isSel?'room-selected-button':'room-select-button'} onClick={()=>{setSelected(room);setTimeout(()=>document.getElementById('guest-checkout')?.scrollIntoView({behavior:'smooth',block:'start'}),60)}}>{isSel?'Selected':'Choose room'} <ArrowRight size={15}/></button>}</div></div>
          </article>})}</div>
      </>}

      {!rooms.length&&!busy&&!success&&<section className="browse-empty"><div className="empty-illustration"><Compass size={32}/></div><h2>{searched?'No rooms match yet.':'Your stay starts here.'}</h2><p>{searched?'Try fewer guests or a different date range.':'Choose a property, dates and your party size above to see live room availability and nightly rates.'}</p><span>Browse freely. Booking takes just a moment.</span></section>}

      {selected&&!success&&<section className="guest-checkout" id="guest-checkout">
        <div className="checkout-title"><span className="eyebrow">THE FINAL DETAILS</span><h2>Request your reservation.</h2><p>Your request goes to our team for approval. Once approved, the room is booked for you.</p></div>
        <div className="checkout-grid">
          <form onSubmit={book} className="guest-details-form">
            <div className="checkout-form-grid">
              <label>First name<input required minLength="2" value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></label>
              <label>Last name<input required minLength="2" value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label>
              <label>Email address<input required type="email" readOnly={user?.role==='guest'} value={user?.role==='guest'?user.email:form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
              <label>Phone (optional)<input type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
              <label className="checkout-wide">Guests<input readOnly value={`${adults} ${Number(adults)===1?'adult':'adults'}${Number(children)?` · ${children} ${Number(children)===1?'child':'children'}`:''} (room sleeps up to ${capacityOf(selected)})`}/></label>
              <label className="checkout-wide">Special requests<textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Anything that would make your stay better?"/></label>
            </div>
            <fieldset className="pay-box"><legend>Payment method <span className="demo-tag">DEMO</span></legend>
              <div className="pay-options">{[['card','Credit / debit card',CreditCard],['bank_transfer','Bank transfer',Landmark],['pay_at_hotel','Pay at hotel',Store]].map(([id,label,Icon])=><label key={id} className={`pay-option ${pay.method===id?'active':''}`}><input type="radio" name="payMethod" checked={pay.method===id} onChange={()=>setPay({...pay,method:id})}/><Icon size={16}/> {label}</label>)}</div>
              {pay.method==='card'&&<div className="pay-card-grid"><label className="checkout-wide">Name on card<input autoComplete="off" value={pay.name} onChange={e=>setPay({...pay,name:e.target.value})} placeholder="Test Guest"/></label><label className="checkout-wide">Card number<input inputMode="numeric" autoComplete="off" maxLength="23" value={pay.number} onChange={e=>setPay({...pay,number:e.target.value.replace(/[^\d ]/g,'').replace(/\s+/g,' ')})} placeholder="4242 4242 4242 4242"/></label><label>Expiry (MM/YY)<input autoComplete="off" maxLength="5" value={pay.expiry} onChange={e=>setPay({...pay,expiry:e.target.value.replace(/[^\d/]/g,'')})} placeholder="12/30"/></label><label>CVV<input inputMode="numeric" autoComplete="off" maxLength="4" type="password" value={pay.cvv} onChange={e=>setPay({...pay,cvv:e.target.value.replace(/\D/g,'')})} placeholder="123"/></label></div>}
              {pay.method==='bank_transfer'&&<p className="pay-help">Demo bank transfer: marked as paid instantly, no real transfer is made. It is refunded automatically if the request is declined.</p>}
              {pay.method==='pay_at_hotel'&&<p className="pay-help">No payment is taken now. Your balance stays open and can be settled at check-in or later from your booking history.</p>}
              <p className="pay-help"><Lock size={13}/> Demo only — no real money moves. Only the last 4 digits are kept; the full card number and CVV never leave your browser.</p>
            </fieldset>
            {!user&&<p className="checkout-privacy"><ShieldCheck size={14}/> Want this saved to your booking history? <Link to="/login" state={{from:'/book'}}>Sign in first</Link> — your selection is kept.</p>}
            <button className="search-stays checkout-submit" disabled={busy}>{busy?'Sending request…':pay.method==='pay_at_hotel'?'Send reservation request':`Request & pay ${money(rate(selected)*nights)}`} <ArrowRight size={16}/></button>
          </form>
          <aside className="booking-summary"><img src={photo(selected)} alt="Selected room"/><div className="summary-content"><span className="eyebrow">YOUR STAY</span><h3>{selected.roomTypeId?.name||'Luxury room'}</h3><p><MapPin size={14}/> {hotel?.name||'LuxuryStay'} · Room {selected.number}</p><div className="summary-dates"><span>Check in <b>{checkIn}</b></span><span>Check out <b>{checkOut}</b></span></div><div className="summary-line"><span>{money(rate(selected))} × {nights} nights</span><b>{money(rate(selected)*nights)}</b></div><div className="summary-total"><span>Total stay</span><strong>{money(rate(selected)*nights)}</strong></div><span className="summary-note">Booked once approved by our team. Final charges may vary if extra services are requested.</span></div></aside>
        </div>
      </section>}
    </main>
    <footer className="public-footer booking-footer"><Link to="/" className="public-brand"><span className="brand-mark">L<span>S</span></span><span><b>LuxuryStay</b><small>STAY A LITTLE EXTRAORDINARY</small></span></Link><span>© {new Date().getFullYear()} LuxuryStay Hospitality</span><Link to="/">Back to home</Link></footer>
  </div>
}
