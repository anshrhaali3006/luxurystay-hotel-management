import React from 'react';
import {Link} from 'react-router-dom';
import {Star,Wallet,MessageSquareHeart,ArrowUpRight,Lock} from 'lucide-react';
import {ResponsiveContainer,AreaChart,Area,BarChart,Bar,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';
import {EmptyState} from './UI';
import {api} from '../api/client';
import {money,date,titleCase} from '../utils/format';
import {useAuth} from '../routes/AuthContext';

const Stars=({n=0})=><span className="stars" aria-label={`${n} out of 5`}>{'★'.repeat(n)}<i>{'★'.repeat(5-n)}</i></span>;

/** Guest feedback, visible on every staff dashboard (admin, manager, receptionist, housekeeping, maintenance). */
export function FeedbackPanel(){
  const {user}=useAuth();
  const [data,setData]=React.useState(null),[error,setError]=React.useState('');
  React.useEffect(()=>{api('/feedback/recent',{query:{limit:6}}).then(setData).catch(e=>setError(e.message))},[]);
  const items=data?.items||[];
  return <section className="panel feedback-panel" data-tilt-off>
    <div className="panel-heading"><div><span className="eyebrow">GUEST VOICE</span><h3>Latest guest feedback</h3><p>Reviews submitted from the guest website.</p></div>
      <div className="feedback-score"><b>{data?.average?data.average.toFixed(1):'—'}</b><Stars n={Math.round(data?.average||0)}/><small>{data?.count||0} review{data?.count===1?'':'s'}</small></div></div>
    {error?<p className="muted feedback-empty">{error}</p>:!data?<p className="muted feedback-empty">Loading feedback…</p>:items.length?<div className="feedback-list">{items.map(f=><article key={f._id} className="feedback-card">
      <div className="feedback-top"><b>{f.guestId?.firstName?`${f.guestId.firstName} ${(f.guestId.lastName||'').slice(0,1)}.`:'Guest'}</b><Stars n={f.rating}/></div>
      <p>“{f.comment||'No written comment.'}”</p>
      <small><span className="feedback-tag">{titleCase(f.category||'stay')}</span>{f.reservationId?.reference&&<> · {f.reservationId.reference}</>}{f.reservationId?.roomId?.number&&<> · Room {f.reservationId.roomId.number}</>} · {date(f.createdAt)}</small></article>)}</div>
      :<p className="muted feedback-empty">No feedback yet. Guests can leave a review from the website after their stay.</p>}
    {['admin','manager','receptionist'].includes(user?.role)&&<Link className="subtle-link feedback-all" to="/workspace/feedback">All feedback <ArrowUpRight size={15}/></Link>}
  </section>
}

/** Staff see their own salary on their dashboard. The admin's salary is NOT shown on the dashboard (it is managed on the Staff page). */
export function SalaryCard(){
  const [me,setMe]=React.useState(null);
  const {user}=useAuth();
  const hidden=!user||['guest','admin'].includes(user.role);
  React.useEffect(()=>{if(!hidden)api('/auth/me').then(setMe).catch(()=>{})},[hidden]);
  if(hidden)return null;
  return <div className="salary-card"><span className="salary-icon"><Wallet size={20}/></span><div><small>YOUR MONTHLY SALARY</small><b>{me?money(me.salary):'…'}</b></div><span className="salary-note"><Lock size={13}/> Visible only to you and the admin</span></div>
}

/**
 * Revenue chart with a chart-type switcher (Area / Bar / Line).
 * Used on the admin, manager and receptionist dashboards and on the Reports page.
 * data = [{label:'2026-10', total:125000}, ...]
 */
// tiny inline icons (no dependency on a specific lucide version)
const ico=(d)=>({size=14})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const AreaIcon=ico(<><path d="M3 18l5-7 4 4 5-8 4 5v6H3z"/></>);
const BarIcon=ico(<><path d="M5 21V11M12 21V4M19 21v-7"/></>);
const LineIcon=ico(<><path d="M3 17l5-6 4 3 8-9"/></>);
const CHART_TYPES=[['area','Area',AreaIcon],['bar','Bar',BarIcon],['line','Line',LineIcon]];
export function RevenueChart({data=[],height=260,initialType='area'}){
  const [type,setType]=React.useState(initialType);
  const id=React.useId().replace(/:/g,'');
  const total=data.reduce((t,x)=>t+(Number(x.total)||0),0);
  const best=data.reduce((b,x)=>(Number(x.total)||0)>(Number(b?.total)||0)?x:b,null);
  const axis={axisLine:false,tickLine:false,tick:{fill:'#8793a1',fontSize:11}};
  const common={data,margin:{top:12,right:10,left:0,bottom:0}};
  const grid=<CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e4e9ef"/>;
  const xa=<XAxis dataKey="label" {...axis}/>;
  const ya=<YAxis {...axis} width={44} tickFormatter={v=>v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${Math.round(v/1000)}k`:v}/>;
  const tip=<Tooltip cursor={{stroke:'#c5a365',strokeDasharray:'4 4'}} contentStyle={{borderRadius:12,border:'1px solid #e8dcc2',boxShadow:'0 18px 30px -16px rgba(16,37,63,.45)',fontSize:12}} formatter={v=>[money(v),'Revenue']}/>;
  return <div className="revenue-chart">
    <div className="rc-head">
      <div className="rc-figures"><span>Total in view</span><b>{money(total)}</b>{best&&<small>Best: {best.label} · {money(best.total)}</small>}</div>
      <div className="chart-switch" role="tablist" aria-label="Chart type">{CHART_TYPES.map(([k,label,Icon])=><button key={k} type="button" role="tab" aria-selected={type===k} className={type===k?'active':''} onClick={()=>setType(k)}><Icon size={14}/>{label}</button>)}</div>
    </div>
    {data.length?<div className="chart-wrap" style={{height}}><ResponsiveContainer width="100%" height="100%">
      {type==='bar'?<BarChart {...common}><defs><linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e3c88c"/><stop offset="100%" stopColor="#b08d4a"/></linearGradient></defs>{grid}{xa}{ya}{tip}<Bar dataKey="total" fill={`url(#b${id})`} radius={[8,8,0,0]} maxBarSize={46}/></BarChart>
      :type==='line'?<LineChart {...common}>{grid}{xa}{ya}{tip}<Line type="monotone" dataKey="total" stroke="#10253f" strokeWidth={3} dot={{r:4,fill:'#c5a365',stroke:'#fff',strokeWidth:2}} activeDot={{r:7}}/></LineChart>
      :<AreaChart {...common}><defs><linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8a96a" stopOpacity={.45}/><stop offset="100%" stopColor="#c8a96a" stopOpacity={0}/></linearGradient></defs>{grid}{xa}{ya}{tip}<Area type="monotone" dataKey="total" stroke="#b08d4a" strokeWidth={3} fill={`url(#a${id})`}/></AreaChart>}
    </ResponsiveContainer></div>:<EmptyState title="No revenue in this period" text="Recorded payments will appear here as a chart."/>}
  </div>
}
