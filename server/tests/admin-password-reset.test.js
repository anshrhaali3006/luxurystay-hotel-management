import test from 'node:test';import assert from 'node:assert/strict';
process.env.JWT_SECRET='test-secret-test-secret';
const express=(await import('express')).default;const jwt=(await import('jsonwebtoken')).default;const bcrypt=(await import('bcryptjs')).default;
const User=(await import('../src/models/User.js')).default;
const {AuditLog}=await import('../src/models/Resource.js');
const {default:router}=await import('../src/routes/api.js');
const {generateTempPassword}=await import('../src/utils/tempPassword.js');
const {buildStaffAlertEmail}=await import('../src/services/bookingEmails.js');

const chain=(v)=>{const p=Promise.resolve(v);const q={select:()=>q,sort:()=>q,skip:()=>q,limit:()=>q,lean:()=>q,then:p.then.bind(p),catch:p.catch.bind(p)};return q};
const H='64b000000000000000000001';
const make=(o)=>({active:true,hotelIds:[],preferences:{},save:async function(){this.saved=true},...o});
const people={
  admin:make({_id:'a1',name:'Admin',role:'admin'}),
  manager:make({_id:'m1',name:'Manager',role:'manager',hotelIds:[H]}),
  clerk:make({_id:'r1',name:'Clerk',email:'clerk@x.test',role:'receptionist',hotelIds:[H],passwordHash:'old'}),
  guest:make({_id:'g1',name:'Guest',email:'g@x.test',role:'guest'}),
};
User.findById=(id)=>chain(Object.values(people).find(p=>p._id===id)||null);
User.findOne=(f)=>chain(Object.values(people).find(p=>p._id===String(f._id))||null);
User.findByIdAndUpdate=(id,upd)=>{const p=Object.values(people).find(x=>x._id===id);for(const [k,v] of Object.entries(upd.$set)){const [,key]=k.split('.');p.preferences={...p.preferences,[key]:v}}return chain(p)};
AuditLog.create=async()=>({});

const app=express();app.use(express.json());app.use('/api',router);app.use((err,req,res,next)=>res.status(err.status||err.statusCode||500).json({success:false,error:{message:err.message}}));
const server=app.listen(0);const base=`http://127.0.0.1:${server.address().port}/api`;
const call=(who,method,path,body)=>fetch(base+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+jwt.sign({sub:people[who]._id,role:people[who].role},process.env.JWT_SECRET)},body:body?JSON.stringify(body):undefined});
test.after(()=>server.close());

test('admin can set a temporary password: shown once, stored only as a hash, sessions revoked, change required',async()=>{
  const r=await call('admin','POST','/users/r1/reset-password',{});
  assert.equal(r.status,200);assert.match(r.headers.get('cache-control')||'',/no-store/);
  const {data}=await r.json();
  assert.ok(typeof data.password==='string'&&data.password.length>=10);
  assert.ok(await bcrypt.compare(data.password,people.clerk.passwordHash),'hash must match the shown password');
  assert.notEqual(people.clerk.passwordHash,data.password,'the plain password must never be stored');
  assert.equal(people.clerk.mustChangePassword,true);assert.ok(people.clerk.passwordChangedAt instanceof Date);assert.equal(people.clerk.saved,true);
});
test('admin can choose the temporary password, but it must be at least 10 characters',async()=>{
  assert.equal((await call('admin','POST','/users/r1/reset-password',{password:'short'})).status,400);
  const ok=await call('admin','POST','/users/r1/reset-password',{password:'ChosenByAdmin42'});assert.equal(ok.status,200);
  assert.ok(await bcrypt.compare('ChosenByAdmin42',people.clerk.passwordHash));
});
test('only an admin may reset a staff password',async()=>{
  assert.equal((await call('manager','POST','/users/r1/reset-password',{})).status,403);
  assert.equal((await call('clerk','POST','/users/r1/reset-password',{})).status,403);
  assert.equal((await call('guest','POST','/users/r1/reset-password',{})).status,403);
});
test('an admin cannot use the reset route on themselves, and cannot reset a guest',async()=>{
  assert.equal((await call('admin','POST','/users/a1/reset-password',{})).status,403);
  assert.equal((await call('admin','POST','/users/g1/reset-password',{})).status,400);
});
test('the staff list never exposes password hashes',async()=>{
  User.find=()=>chain([{_id:'r1',name:'Clerk',role:'receptionist'}]);User.countDocuments=async()=>1;
  const body=JSON.stringify(await (await call('admin','GET','/users')).json());
  assert.doesNotMatch(body,/passwordHash|password"/);
});

test('generateTempPassword is long, random and avoids look-alike characters',()=>{
  const seen=new Set();for(let i=0;i<50;i++){const p=generateTempPassword();assert.equal(p.length,14);assert.match(p,/^[A-HJ-NP-Za-km-np-z2-9]+$/);seen.add(p)}
  assert.equal(seen.size,50);
});

test('preferences: anyone can opt out of booking emails; only admins/managers can opt in to new-booking alerts',async()=>{
  const g=await call('guest','PATCH','/auth/preferences',{bookingEmails:false});assert.equal(g.status,200);
  assert.equal((await g.json()).data.user.preferences.bookingEmails,false);
  assert.equal((await call('clerk','PATCH','/auth/preferences',{newBookingAlerts:true})).status,403);
  const a=await call('admin','PATCH','/auth/preferences',{newBookingAlerts:true});assert.equal(a.status,200);
  assert.equal((await a.json()).data.user.preferences.newBookingAlerts,true);
});
test('preferences endpoint rejects unknown fields (no way to smuggle in a role change)',async()=>{
  assert.equal((await call('guest','PATCH','/auth/preferences',{role:'admin'})).status,400);
});

test('new-booking alert email names the guest, reference and links to pending approvals',()=>{
  const m=buildStaffAlertEmail({reference:'LS-1234',checkIn:'2027-01-10',checkOut:'2027-01-12',total:20000,adults:2,guestId:{firstName:'Sara',lastName:'Khan',email:'s@x.test'},hotelId:{name:'LuxuryStay Karachi',currency:'PKR'},roomId:{number:'101',roomTypeId:{name:'Deluxe'}}},{clientUrl:'http://localhost:5173'});
  assert.match(m.subject,/LS-1234/);assert.match(m.text,/Sara Khan/);assert.match(m.text,/\/workspace\/reservations\?status=pending/);
});
