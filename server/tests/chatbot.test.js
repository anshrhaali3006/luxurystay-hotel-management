import test from 'node:test';
import assert from 'node:assert/strict';
import {detectIntent,parseStay,parseGuests,pickHotel,reply} from '../src/services/chatbot.js';

const TODAY='2026-11-02'; // a Monday

test('intent detection routes common questions',()=>{
  const cases={
    'hi':'greeting','Hello there!':'greeting','salam':'greeting',
    'thanks a lot':'thanks','bye':'bye',
    'I forgot my password':'password','how do I reset my password?':'password',"can't log in":'password',
    'cancel my booking':'cancellation','I need a refund':'cancellation','cancel LS-ABCD-1234':'cancellation',
    'where is my booking':'myBookings','show my reservations':'myBookings',
    'what time is check-in?':'checkTimes','can I have a late check out':'checkTimes',
    'how do I pay my invoice':'payment',
    'do you have room service':'services','airport pickup please':'services',
    'I want to speak to a human':'contact','what is your phone number':'contact',
    'how do I book a room':'howToBook',
    'is there free wifi':'amenities','do you have parking':'amenities',
    'I want to leave feedback':'feedback',
    'any rooms free tonight':'rooms','how much is a room for 12 dec':'rooms','prices please':'rooms',
    'where are your hotels':'hotels',
    'help':'help','':'empty','asdf qwerty':'fallback',
    'status of LS-MH3K9-AB12':'lookup',
  };
  for(const [text,expected] of Object.entries(cases))assert.equal(detectIntent(text),expected,`"${text}" should be ${expected}`);
});

test('a greeting buried in a longer question does not trigger the greeting reply',()=>{
  assert.equal(detectIntent('hi, are any rooms available tomorrow?'),'rooms');
});

test('parseStay understands relative words, day/month forms, ISO dates and nights',()=>{
  assert.deepEqual(pick(parseStay('anything tonight?',TODAY)),['2026-11-02','2026-11-03',1]);
  assert.deepEqual(pick(parseStay('tomorrow for 3 nights',TODAY)),['2026-11-03','2026-11-06',3]);
  assert.deepEqual(pick(parseStay('day after tomorrow',TODAY)),['2026-11-04','2026-11-05',1]);
  assert.deepEqual(pick(parseStay('12 dec to 15 dec',TODAY)),['2026-12-12','2026-12-15',3]);
  assert.deepEqual(pick(parseStay('from December 20th until Dec 22nd',TODAY)),['2026-12-20','2026-12-22',2]);
  assert.deepEqual(pick(parseStay('2026-12-01 to 2026-12-04',TODAY)),['2026-12-01','2026-12-04',3]);
  assert.deepEqual(pick(parseStay('arriving dec 5 for 2 nights',TODAY)),['2026-12-05','2026-12-07',2]);
  assert.deepEqual(pick(parseStay('arriving 5 dec for 2 nights',TODAY)),['2026-12-05','2026-12-07',2]);
});

test('parseStay rolls a past day/month into next year and flags impossible ranges',()=>{
  assert.equal(parseStay('1 oct',TODAY).checkIn,'2027-10-01');
  assert.match(parseStay('2026-10-01 to 2026-10-03',TODAY).problem,/past/i);
  assert.match(parseStay('15 dec to 12 dec',TODAY).problem,/after check-in/i);
  assert.equal(parseStay('31 feb',TODAY).checkIn,null,'invalid calendar dates are ignored');
  assert.deepEqual(pick(parseStay('what rooms do you have',TODAY)),[null,null,null]);
});

test('parseGuests reads common phrasings but not nights',()=>{
  assert.equal(parseGuests('room for 3 guests'),3);
  assert.equal(parseGuests('2 adults please'),2);
  assert.equal(parseGuests('family of 4'),4);
  assert.equal(parseGuests('for 5 people'),5);
  assert.equal(parseGuests('for 3 nights'),null);
  assert.equal(parseGuests('any room'),null);
});

test('pickHotel matches by name or city, falls back to the only hotel, otherwise asks',()=>{
  const A={_id:'a',name:'LuxuryStay Karachi',city:'Karachi',code:'KHI'},B={_id:'b',name:'LuxuryStay Lahore',city:'Lahore',code:'LHE'};
  assert.equal(pickHotel('rooms in lahore',[A,B]).hotel._id,'b');
  assert.equal(pickHotel('anything',[A]).hotel._id,'a');
  assert.equal(pickHotel('anything',[A,B]).ambiguous,true);
  assert.equal(pickHotel('anything',[A,B],'a').hotel._id,'a','UI-provided hotelId is honoured');
});

/* ---------------- end-to-end replies against fake data ---------------- */
const hotel={_id:'h1',name:'LuxuryStay Karachi',city:'Karachi',currency:'PKR',checkInTime:'15:00',checkOutTime:'12:00',phone:'+92 21 111',email:'desk@ls.test'};
const deluxe={_id:'t1',name:'Deluxe',baseRate:20000,capacity:2,amenities:['Wi-Fi','Air conditioning']};
const family={_id:'t2',name:'Family Suite',baseRate:35000,capacity:4,amenities:['Wi-Fi','Kitchenette']};
const booking={reference:'LS-ABC123-WXYZ',status:'pending',checkIn:new Date('2026-12-12'),checkOut:new Date('2026-12-15'),hotelId:{name:hotel.name},guestId:{email:'owner@example.com'},createdBy:'u-owner',roomId:{number:'101',roomTypeId:{name:'Deluxe'}}};
function makeData(over={}){
  const calls=[];
  return {calls,data:{
    listHotels:async()=>[hotel],
    listRoomTypes:async()=>[deluxe,family],
    availableRooms:async args=>{calls.push(args);return [{roomTypeId:deluxe},{roomTypeId:deluxe},{roomTypeId:family}];},
    guestBookings:async()=>[booking],
    bookingByReference:async ref=>ref===booking.reference?booking:null,
    ...over}};
}
const ask=(text,{user=null,data}={})=>reply({text,user,today:TODAY,data:(data||makeData().data)});

test('availability reply lists room types with rates, totals and a booking link',async()=>{
  const {data,calls}=makeData();
  const r=await ask('any rooms from 12 dec to 15 dec for 2 guests',{data});
  assert.equal(calls[0].checkIn,'2026-12-12');assert.equal(calls[0].checkOut,'2026-12-15');assert.equal(calls[0].guests,2);
  assert.match(r.reply,/Deluxe .*(?:Rs|PKR)\s?20,000\/night.*(?:Rs|PKR)\s?60,000 for 3 nights.*2 available/s);
  assert.match(r.reply,/Family Suite/);
  assert.equal(r.actions[0].to,'/rooms?hotelId=h1&checkIn=2026-12-12&checkOut=2026-12-15&adults=2');
});

test('availability reply reports no rooms honestly',async()=>{
  const {data}=makeData({availableRooms:async()=>[]});
  const r=await ask('room tonight',{data});
  assert.match(r.reply,/couldn’t find a free room/);
});

test('past dates get a clarifying question instead of a database query',async()=>{
  const {data,calls}=makeData();
  const r=await ask('room on 2026-10-01',{data});
  assert.match(r.reply,/in the past/);assert.equal(calls.length,0);
});

test('check-in times come from the hotel record and do not promise early check-in',async()=>{
  const r=await ask('what time is check in');
  assert.match(r.reply,/15:00/);assert.match(r.reply,/12:00/);assert.match(r.reply,/can’t be guaranteed/);
});

test('amenities are read from room types, not invented',async()=>{
  const r=await ask('do you have wifi');
  assert.match(r.reply,/Wi-Fi/);assert.match(r.reply,/Kitchenette/);
  const none=await ask('do you have wifi',{data:makeData({listRoomTypes:async()=>[]}).data});
  assert.match(none.reply,/don’t have a detailed amenity list/);
});

test('cancellations are never processed or promised in chat',async()=>{
  const r=await ask('please cancel my booking');
  assert.match(r.reply,/can’t change or cancel/);assert.match(r.reply,/\+92 21 111/);
});

test('reservation lookup: owner by account, stranger refused, guest by matching email',async()=>{
  const owner={_id:'u-owner',role:'guest',email:'owner@example.com',name:'Olivia Owner'};
  const stranger={_id:'u-x',role:'guest',email:'x@example.com',name:'Sam'};
  const mine=await ask('status of LS-ABC123-WXYZ',{user:owner});
  assert.match(mine.reply,/LS-ABC123-WXYZ/);assert.match(mine.reply,/awaiting approval/);

  const denied=await ask('status of LS-ABC123-WXYZ',{user:stranger});
  const missing=await ask('status of LS-NOPE00-NONE',{user:stranger});
  assert.equal(denied.reply,missing.reply,'must not reveal whether a reference exists');
  assert.doesNotMatch(denied.reply,/pending|awaiting/);

  const anon=await ask('status of LS-ABC123-WXYZ');
  assert.match(anon.reply,/sign in|email/i);assert.doesNotMatch(anon.reply,/awaiting/);

  const byEmail=await ask('LS-ABC123-WXYZ owner@example.com');
  assert.match(byEmail.reply,/awaiting approval/);
  const wrongEmail=await ask('LS-ABC123-WXYZ wrong@example.com');
  assert.doesNotMatch(wrongEmail.reply,/awaiting/);
});

test('"my bookings" needs sign-in, works for guests, and is not offered to staff',async()=>{
  assert.match((await ask('show my bookings')).reply,/sign in/i);
  const g=await ask('show my bookings',{user:{_id:'u1',role:'guest',email:'owner@example.com'}});
  assert.match(g.reply,/LS-ABC123-WXYZ/);
  const staff=await ask('show my bookings',{user:{_id:'s1',role:'admin',email:'a@b.c'}});
  assert.match(staff.reply,/guest accounts/);
});

test('multi-hotel: asks which property, then answers when the city is named',async()=>{
  const lahore={...hotel,_id:'h2',name:'LuxuryStay Lahore',city:'Lahore'};
  const {data}=makeData({listHotels:async()=>[hotel,lahore]});
  assert.match((await ask('any rooms tonight',{data})).reply,/Which property/);
  assert.match((await ask('any rooms tonight in lahore',{data})).reply,/LuxuryStay Lahore has availability/);
});

function pick(s){return [s.checkIn,s.checkOut,s.checkIn?s.nights:null];}
