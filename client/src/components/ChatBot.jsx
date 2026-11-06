import React from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {MessageCircle,X,Send,ArrowRight,Sparkles} from 'lucide-react';
import {api} from '../api/client';

const STORE='luxurystay_chat';
const WELCOME={role:'bot',text:'Hello! I’m the LuxuryStay concierge. Ask me about room availability and prices, check-in times, how to book, or your reservation.',suggestions:['Check room availability','Check-in & check-out times','How do I book?','Look up my booking']};
const load=()=>{try{const m=JSON.parse(sessionStorage.getItem(STORE));return Array.isArray(m)&&m.length?m:[WELCOME]}catch{return [WELCOME]}};

export default function ChatBot(){
  const {pathname}=useLocation(),navigate=useNavigate();
  const [open,setOpen]=React.useState(false),[messages,setMessages]=React.useState(load),[text,setText]=React.useState(''),[busy,setBusy]=React.useState(false);
  const endRef=React.useRef(null),inputRef=React.useRef(null);

  React.useEffect(()=>{try{sessionStorage.setItem(STORE,JSON.stringify(messages.slice(-40)))}catch{}},[messages]);
  React.useEffect(()=>{endRef.current?.scrollIntoView({block:'end',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})},[messages,busy,open]);
  React.useEffect(()=>{if(open)inputRef.current?.focus()},[open]);
  React.useEffect(()=>{const onKey=e=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);

  // The concierge is for guests; the staff workspace has its own tools.
  if(pathname.startsWith('/workspace'))return null;

  async function send(raw){
    const message=String(raw??text).trim();
    if(!message||busy)return;
    setText('');setMessages(m=>[...m,{role:'user',text:message}]);setBusy(true);
    try{
      const d=await api('/chat',{method:'POST',body:{message}});
      setMessages(m=>[...m,{role:'bot',text:d.reply,suggestions:d.suggestions,actions:d.actions}]);
    }catch(err){
      setMessages(m=>[...m,{role:'bot',text:err.message||'Sorry, I couldn’t reach the concierge just now. Please try again.',suggestions:['Contact the front desk']}]);
    }finally{setBusy(false)}
  }
  function go(to){navigate(to);if(window.innerWidth<640)setOpen(false)}
  const last=messages[messages.length-1];

  return <div className="chatbot">
    {open&&<section className="chat-panel" role="dialog" aria-label="LuxuryStay concierge chat">
      <header><span className="chat-avatar"><Sparkles size={16}/></span><div><b>LuxuryStay Concierge</b><small>Usually replies instantly</small></div><button onClick={()=>setOpen(false)} aria-label="Close chat"><X size={18}/></button></header>
      <div className="chat-log" role="log" aria-live="polite">
        {messages.map((m,i)=><div key={i} className={`chat-msg ${m.role}`}>
          <p>{m.text}</p>
          {m.actions?.length>0&&<div className="chat-actions">{m.actions.map(a=><button key={a.to+a.label} onClick={()=>go(a.to)}>{a.label} <ArrowRight size={13}/></button>)}</div>}
        </div>)}
        {busy&&<div className="chat-msg bot typing" aria-label="Concierge is typing"><i/><i/><i/></div>}
        <div ref={endRef}/>
      </div>
      {last?.role==='bot'&&last.suggestions?.length>0&&!busy&&<div className="chat-chips">{last.suggestions.map(s=><button key={s} onClick={()=>send(s)}>{s}</button>)}</div>}
      <form className="chat-input" onSubmit={e=>{e.preventDefault();send()}}>
        <input ref={inputRef} value={text} onChange={e=>setText(e.target.value)} maxLength={500} placeholder="Ask about rooms, dates, bookings…" aria-label="Type your message"/>
        <button type="submit" disabled={busy||!text.trim()} aria-label="Send message"><Send size={17}/></button>
      </form>
      <small className="chat-note">Automated assistant — for changes or cancellations, please contact the front desk.</small>
    </section>}
    <button className={`chat-launch ${open?'is-open':''}`} onClick={()=>setOpen(o=>!o)} aria-label={open?'Close concierge chat':'Open concierge chat'} aria-expanded={open}>{open?<X size={22}/>:<MessageCircle size={22}/>}</button>
  </div>;
}
