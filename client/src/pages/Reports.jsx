import React from 'react';
import {Download,Printer,CalendarRange,FileBarChart2,Wallet,Receipt,TrendingUp} from 'lucide-react';
import {ResponsiveContainer,PieChart,Pie,Cell,Tooltip} from 'recharts';
import {api,downloadFile} from '../api/client';
import {PageHeader,Button,Notice,Loading,EmptyState,StatCard,Status} from '../components/UI';
import {RevenueChart} from '../components/Widgets';
import {money,date,titleCase} from '../utils/format';

const KINDS=[['revenue','Revenue'],['payments','Payments'],['reservations','Reservations'],['cancellations','Cancellations'],['outstanding','Outstanding invoices'],['housekeeping','Housekeeping'],['maintenance','Maintenance']];
const MONEY_COLUMNS=new Set(['amount','revenue','total','balance']);
const PIE_COLORS=['#10253f','#c5a365','#4f7aa6','#8fb59a','#b86d5c'];
const isoDay=d=>d.toISOString().slice(0,10);
const header=k=>titleCase(k.replace(/([A-Z])/g,' $1').trim().toLowerCase());

function Cell2({column,value}){
  if(value===null||value===undefined||value==='')return '—';
  if(column==='status')return <Status value={value}/>;
  if(MONEY_COLUMNS.has(column))return money(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return date(value);
  return String(value);
}

export default function Reports(){
  // Default period: the last 90 days, so the page is never empty on first open.
  const [kind,setKind]=React.useState('revenue');
  const [from,setFrom]=React.useState(isoDay(new Date(Date.now()-90*86400000)));
  const [to,setTo]=React.useState(isoDay(new Date()));
  const [rows,setRows]=React.useState([]);
  const [series,setSeries]=React.useState([]);      // revenue per day -> chart
  const [methods,setMethods]=React.useState([]);    // revenue per payment method -> donut
  const [busy,setBusy]=React.useState(true);
  const [error,setError]=React.useState('');

  async function load(){
    setBusy(true);setError('');
    try{
      const query={from,to};
      const [table,revenue,byMethod]=await Promise.all([api(`/reports/${kind}`,{query}),api('/reports/revenue',{query}),api('/reports/methods',{query})]);
      setRows(Array.isArray(table)?table:[]);
      setSeries((Array.isArray(revenue)?revenue:[]).map(r=>({label:date(r.date).slice(0,6),total:r.revenue})));
      setMethods((Array.isArray(byMethod)?byMethod:[]).map(m=>({name:titleCase(m.method),value:m.revenue})));
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  React.useEffect(()=>{load()},[kind]);   // reload when the report type changes; dates apply on "Generate"

  async function exportCsv(){
    try{await downloadFile(`/reports/${kind}.csv?from=${from}&to=${to}`,`luxurystay-${kind}-${from}-to-${to}.csv`)}
    catch(e){setError(e.message)}
  }

  const columns=rows.length?Object.keys(rows[0]):[];
  const revenueTotal=series.reduce((t,x)=>t+(Number(x.total)||0),0);
  const paymentsCount=series.length;
  const activeLabel=KINDS.find(k=>k[0]===kind)?.[1];

  return <>
    <PageHeader title="Reports & analytics" description="Explore revenue and operational performance, then export any report as CSV." action={<Button variant="secondary" onClick={()=>window.print()}><Printer size={16}/> Print report</Button>}/>
    <Notice error={error}/>

    <section className="panel report-filters">
      <div className="filter-field"><label>Report type</label><select value={kind} onChange={e=>setKind(e.target.value)}>{KINDS.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></div>
      <div className="filter-field"><label>From date</label><input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></div>
      <div className="filter-field"><label>To date</label><input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></div>
      <Button onClick={load} disabled={busy}><CalendarRange size={16}/> Generate report</Button>
      <Button variant="secondary" onClick={exportCsv}><Download size={16}/> Export CSV</Button>
    </section>

    <section className="stats-grid role-stats">
      <StatCard label="Revenue in period" value={money(revenueTotal)} detail="Succeeded payments" icon={Wallet} accent="gold"/>
      <StatCard label="Days with revenue" value={paymentsCount} detail={`${date(from)} – ${date(to)}`} icon={TrendingUp}/>
      <StatCard label={`${activeLabel} rows`} value={rows.length} detail="In the table below" icon={Receipt}/>
    </section>

    <div className="dashboard-grid">
      <section className="panel revenue-panel">
        <div className="panel-heading"><div><span className="eyebrow">REVENUE</span><h3>Revenue over time</h3><p>Switch between area, bar and line views</p></div></div>
        {busy?<Loading/>:<RevenueChart data={series}/>}
      </section>
      <section className="panel occupancy-panel">
        <div className="panel-heading"><div><span className="eyebrow">PAYMENT MIX</span><h3>Revenue by method</h3><p>How guests are paying</p></div></div>
        {busy?<Loading/>:methods.length?<>
          <div className="chart-wrap" style={{height:190}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={methods} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3} stroke="none">{methods.map((m,i)=><Cell key={m.name} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}</Pie><Tooltip formatter={v=>money(v)}/></PieChart></ResponsiveContainer></div>
          <div className="occupancy-legend">{methods.map((m,i)=><div key={m.name}><i style={{background:PIE_COLORS[i%PIE_COLORS.length]}}/>{m.name}<b>{money(m.value)}</b></div>)}</div>
        </>:<EmptyState title="No payments yet" text="Payment methods will be summarised here."/>}
      </section>
    </div>

    <section className="panel report-results">
      <div className="panel-heading"><div><span className="eyebrow">REPORT OUTPUT</span><h3>{activeLabel} report</h3><p>{date(from)} — {date(to)}</p></div><div className="report-count"><FileBarChart2 size={18}/>{rows.length} rows</div></div>
      {busy?<Loading/>:rows.length?<div className="table-wrap"><table><thead><tr>{columns.map(k=><th key={k}>{header(k).toUpperCase()}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{columns.map(k=><td key={k}><Cell2 column={k} value={row[k]}/></td>)}</tr>)}</tbody></table></div>
      :<EmptyState title="No report data for this period" text="Choose a different period or record activity to populate this report."/>}
    </section>
  </>
}
