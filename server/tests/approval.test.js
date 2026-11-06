import test from 'node:test';import assert from 'node:assert/strict';
import {Reservation,Room,Invoice,Payment,Notification} from '../src/models/Resource.js';
import {publicRoomCatalog,approveReservation,rejectReservation,syncRoomBooking,guestRoomState} from '../src/services/reservations.js';

// --- tiny in-memory stand-ins for the mongoose calls the service makes -------------
const chain=(value)=>{const p=Promise.resolve(value);const q={populate:()=>q,sort:()=>q,select:()=>q,then:p.then.bind(p),catch:p.catch.bind(p)};return q};
const type=(name,capacity,baseRate=1000)=>({_id:name,name,capacity,baseRate});
const mkRoom=(id,number,status,roomTypeId)=>({_id:id,hotelId:'H',number,status,roomTypeId,toObject(){return {...this}}});
let rooms,reservations,updates,notes;
function install(){
  updates=[];notes=[];
  Room.find=()=>chain(rooms);
  Room.findOne=({_id})=>chain(rooms.find(r=>r._id===_id)||null);
  Room.updateOne=async({_id},{$set})=>{updates.push([_id,$set.status]);const r=rooms.find(x=>x._id===_id);if(r)Object.assign(r,$set)};
  Reservation.find=(f)=>({distinct:async()=>reservations.filter(r=>['confirmed','checked_in'].includes(r.status)&&r.checkIn<new Date(f.checkIn.$lt?.getTime?f.checkIn.$lt:f.checkIn.$lt)&&r.checkOut>new Date(f.checkOut.$gt)).map(r=>r.roomId)});
  Reservation.exists=async(f)=>reservations.some(r=>r.roomId===f.roomId&&r.status===f.status&&r.checkOut>f.checkOut.$gt)?{_id:1}:null;
  Reservation.findOne=async(f)=>{if(f._id&&!f._id.$ne)return reservations.find(r=>r._id===f._id)||null;return reservations.find(r=>r._id!==f._id?.$ne&&r.roomId===f.roomId&&['confirmed','checked_in'].includes(r.status)&&r.checkIn<f.checkIn.$lt&&r.checkOut>f.checkOut.$gt)||null};
  Notification.create=async(d)=>{notes.push(d.title)};
  Invoice.findOne=async()=>invoice;Payment.updateMany=async()=>{payment.status='refunded'};
}
let invoice,payment;
const d=(s)=>new Date(s);
const res=(over)=>({save:async function(){return this},...over});
const setup=()=>{
  const king=type('king',2),suite=type('suite',4),family=type('family',6);
  rooms=[mkRoom('r1','101','available',king),mkRoom('r2','102','available',suite),mkRoom('r3','103','available',family),mkRoom('r4','104','maintenance',family),mkRoom('r5','105','booked',family)];
  reservations=[res({_id:'x1',roomId:'r3',status:'confirmed',checkIn:d('2027-01-10'),checkOut:d('2027-01-13')})];
  invoice={status:'unpaid',balance:5000,save:async()=>{}};payment={status:'succeeded'};install();
};

test('guest room state is driven by room status',()=>{
  assert.equal(guestRoomState({status:'available'},false),'available');
  assert.equal(guestRoomState({status:'available'},true),'booked');
  assert.equal(guestRoomState({status:'booked'},true),'booked');
  assert.equal(guestRoomState({status:'booked'},false),'available');
  assert.equal(guestRoomState({status:'occupied'},false),'occupied');
  assert.equal(guestRoomState({status:'cleaning'},false),'preparing');
  assert.equal(guestRoomState({status:'maintenance'},false),'unavailable');
});

test('guest selection only lists rooms that sleep the whole party',async()=>{
  setup();
  const two=await publicRoomCatalog({hotelId:'H',checkIn:'2027-02-01',checkOut:'2027-02-03',guests:2});
  assert.equal(two.length,5);
  const five=await publicRoomCatalog({hotelId:'H',checkIn:'2027-02-01',checkOut:'2027-02-03',guests:5});
  assert.deepEqual(five.map(r=>r.number).sort(),['103','104','105']);
  const seven=await publicRoomCatalog({hotelId:'H',checkIn:'2027-02-01',checkOut:'2027-02-03',guests:7});
  assert.equal(seven.length,0);
});

test('booked rooms appear as booked only for the dates they are booked',async()=>{
  setup();
  const clash=await publicRoomCatalog({hotelId:'H',checkIn:'2027-01-11',checkOut:'2027-01-12',guests:5});
  const by=n=>clash.find(r=>r.number===n);
  assert.equal(by('103').availability,'booked');
  assert.equal(by('103').bookable,false);
  assert.equal(by('104').availability,'unavailable');
  assert.equal(by('105').availability,'available');      // status "booked" but not for these dates
  assert.equal(clash[0].bookable,true);                    // available rooms are listed first
  const later=await publicRoomCatalog({hotelId:'H',checkIn:'2027-02-01',checkOut:'2027-02-02',guests:5});
  assert.equal(later.find(r=>r.number==='103').availability,'available');
  const onlyFree=await publicRoomCatalog({hotelId:'H',checkIn:'2027-01-11',checkOut:'2027-01-12',guests:5,availableOnly:true});
  assert.ok(onlyFree.every(r=>r.bookable));
});

test('a pending request does not book the room; approval does',async()=>{
  setup();
  const pending=res({_id:'p1',roomId:'r2',hotelId:'H',status:'pending',reference:'LS-P1',checkIn:d('2027-03-01'),checkOut:d('2027-03-04')});
  reservations.push(pending);
  const before=await publicRoomCatalog({hotelId:'H',checkIn:'2027-03-01',checkOut:'2027-03-04',guests:3});
  assert.equal(before.find(r=>r.number==='102').availability,'available');
  assert.equal(rooms[1].status,'available');
  const out=await approveReservation('p1',{},{_id:'admin'});
  assert.equal(out.status,'confirmed');assert.equal(String(out.approvedBy),'admin');
  assert.equal(rooms[1].status,'booked');                  // room status flips on approval
  assert.ok(notes.includes('Reservation approved'));
  const after=await publicRoomCatalog({hotelId:'H',checkIn:'2027-03-01',checkOut:'2027-03-04',guests:3});
  assert.equal(after.find(r=>r.number==='102').availability,'booked');
  await assert.rejects(()=>approveReservation('p1',{},{_id:'admin'}),/awaiting approval/);
});

test('approval is refused when the dates clash with an existing booking',async()=>{
  setup();
  reservations.push(res({_id:'p2',roomId:'r3',hotelId:'H',status:'pending',reference:'LS-P2',checkIn:d('2027-01-12'),checkOut:d('2027-01-15')}));
  await assert.rejects(()=>approveReservation('p2',{},{_id:'admin'}),e=>e.status===409||/already booked/.test(e.message));
  assert.equal(reservations.at(-1).status,'pending');
});

test('rejecting leaves the room alone, voids the invoice and refunds payment',async()=>{
  setup();
  reservations.push(res({_id:'p3',roomId:'r1',hotelId:'H',status:'pending',reference:'LS-P3',checkIn:d('2027-04-01'),checkOut:d('2027-04-02')}));
  const out=await rejectReservation('p3',{},{_id:'admin'},'Fully booked');
  assert.equal(out.status,'rejected');assert.equal(out.rejectionReason,'Fully booked');
  assert.equal(invoice.status,'void');assert.equal(invoice.balance,0);assert.equal(payment.status,'refunded');
  assert.equal(rooms[0].status,'available');
});

test('cancelling the last confirmed stay frees the room again',async()=>{
  setup();rooms[2].status='booked';reservations[0].status='cancelled';
  await syncRoomBooking('r3','H');
  assert.equal(rooms[2].status,'available');
  reservations[0].status='confirmed';reservations[0].checkOut=d('2099-01-01');
  await syncRoomBooking('r3','H');
  assert.equal(rooms[2].status,'booked');
});
