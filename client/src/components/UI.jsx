import React from 'react';import {Search,Plus,RefreshCw,ChevronLeft,ChevronRight,AlertCircle,CheckCircle2,LoaderCircle} from 'lucide-react';
export function PageHeader({eyebrow,title,description,action}){return <div className="page-header"><div><div className="eyebrow">{eyebrow||'LUXURYSTAY HOSPITALITY'}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>}
export function Button({children,variant='primary',...props}){return <button className={`button ${variant}`} {...props}>{children}</button>}
/** Animates the first number inside a value ("PKR 12,500", "64%", 18) from 0 up to its final value. */
function CountUp({value}){
  const text=String(value??'');
  const m=text.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  const target=m?Number(m[2].replace(/,/g,'')):NaN;
  const [shown,setShown]=React.useState(Number.isFinite(target)?0:target);
  React.useEffect(()=>{
    if(!Number.isFinite(target))return;
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){setShown(target);return}
    let raf,start;const run=t=>{start??=t;const k=Math.min(1,(t-start)/900);setShown(target*(1-Math.pow(1-k,3)));if(k<1)raf=requestAnimationFrame(run)};
    raf=requestAnimationFrame(run);return()=>cancelAnimationFrame(raf);
  },[target]);
  if(!m||!Number.isFinite(target))return <>{text}</>;
  const decimals=(m[2].split('.')[1]||'').length;
  const n=decimals?shown.toFixed(decimals):Math.round(shown).toLocaleString('en-US');
  return <>{m[1]}{n}{m[3]}</>;
}
export function StatCard({label,value,detail,icon:Icon,accent}){return <div className={`stat-card ${accent||''}`}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${accent||''}`}>{Icon&&<Icon size={18}/>}</span></div><strong><CountUp value={value}/></strong><small>{detail}</small></div>}
export function Status({value}){const s=String(value||'unknown').toLowerCase();return <span className={`status status-${s.replaceAll('_','-')}`}>{s.replaceAll('_',' ')}</span>}
export function Loading(){return <div className="loading"><LoaderCircle className="spin" size={22}/> Loading data…</div>}
export function Notice({error,success}){if(!error&&!success)return null;return <div className={`notice ${error?'is-error':'is-success'}`}>{error?<AlertCircle size={17}/>:<CheckCircle2 size={17}/>} {error||success}</div>}
export function SearchBox({value,onChange,placeholder='Search records…'}){return <label className="search-box"><Search size={17}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>}
export function EmptyState({title='No records found',text='Try changing your filters or add a new record.'}){return <div className="empty-state"><div className="empty-mark">LS</div><b>{title}</b><span>{text}</span></div>}
