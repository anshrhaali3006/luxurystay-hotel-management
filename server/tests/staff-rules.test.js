import test from 'node:test';import assert from 'node:assert/strict';
process.env.JWT_SECRET='test-secret-test-secret';
const express=(await import('express')).default;const jwt=(await import('jsonwebtoken')).default;
const User=(await import('../src/models/User.js')).default;
const {default:router}=await import('../src/routes/api.js');
const {errorHandler}=await import('../src/middleware/errorHandler.js').catch(()=>({}));

const chain=(v)=>{const p=Promise.resolve(v);const q={select:()=>q,sort:()=>q,skip:()=>q,limit:()=>q,lean:()=>q,then:p.then.bind(p),catch:p.catch.bind(p)};return q};
const H='64b000000000000000000001';
const people={
  admin:{_id:'a1',name:'Admin',role:'admin',active:true,hotelIds:[],salary:250000,deleteOne:async()=>{}},
  admin2:{_id:'a2',name:'Admin Two',role:'admin',active:true,hotelIds:[],salary:200000,deleteOne:async()=>{}},
  manager:{_id:'m1',name:'Manager',role:'manager',active:true,hotelIds:[H],salary:180000,deleteOne:async()=>{}},
  manager2:{_id:'m2',name:'Manager Two',role:'manager',active:true,hotelIds:[H],salary:170000,deleteOne:async()=>{}},
  clerk:{_id:'r1',name:'Clerk',role:'receptionist',active:true,hotelIds:[H],salary:90000,deleteOne:async()=>{}}
};
User.findById=(id)=>chain(Object.values(people).find(p=>p._id===id)||null);
User.find=()=>chain(Object.values(people).map(p=>({...p})));
User.countDocuments=async(f)=>f?._id?.$ne?Object.values(people).filter(p=>p.role==='admin'&&p._id!==f._id.$ne).length:Object.keys(people).length;
User.findOne=async(f)=>Object.values(people).find(p=>p._id===String(f._id))||null;
let patched;User.findOneAndUpdate=(f,u)=>{patched=u.$set;return chain({...people.clerk,...u.$set})};

const app=express();app.use(express.json());app.use('/api',router);app.use((err,req,res,next)=>res.status(err.status||err.statusCode||500).json({success:false,error:{message:err.message}}));
const server=app.listen(0);const base=`http://127.0.0.1:${server.address().port}/api`;
const call=(who,method,path,body)=>fetch(base+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+jwt.sign({sub:people[who]._id,role:people[who].role},process.env.JWT_SECRET)},body:body?JSON.stringify(body):undefined});
test.after(()=>server.close());

test('an admin cannot delete their own account',async()=>{const r=await call('admin','DELETE','/users/a1');assert.equal(r.status,403);assert.match((await r.json()).error.message,/own account/);});
test('a manager cannot delete their own account',async()=>{const r=await call('manager','DELETE','/users/m1');assert.equal(r.status,403);});
test('a manager cannot delete another manager or an admin, but can delete reception staff',async()=>{assert.equal((await call('manager','DELETE','/users/m2')).status,403);assert.equal((await call('manager','DELETE','/users/a1')).status,403);assert.equal((await call('manager','DELETE','/users/r1')).status,200);});
test('an admin can delete another admin',async()=>{assert.equal((await call('admin','DELETE','/users/a2')).status,200);});
test('salary: admin sees everyone, manager sees only their own',async()=>{
  const a=(await (await call('admin','GET','/users')).json()).data;assert.ok(a.every(u=>typeof u.salary==='number'));
  const m=(await (await call('manager','GET','/users')).json()).data;
  assert.equal(m.find(u=>u._id==='m1').salary,180000);
  assert.ok(m.filter(u=>u._id!=='m1').every(u=>u.salary===undefined));});
test('only an admin may set or change a salary',async()=>{
  assert.equal((await call('manager','PATCH','/users/r1',{salary:1})).status,403);
  assert.equal((await call('manager','POST','/users',{name:'X',email:'x@y.z',password:'longenoughpw',role:'receptionist',hotelIds:[H],salary:5})).status,403);
  const ok=await call('admin','PATCH','/users/r1',{salary:95000});assert.equal(ok.status,200);assert.equal(patched.salary,95000);
  assert.equal((await call('admin','PATCH','/users/r1',{salary:-5})).status,400);});
test('nobody can deactivate themselves',async()=>{assert.equal((await call('manager','PATCH','/users/m1',{active:false})).status,403);});
