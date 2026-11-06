import {Reservation,Room,Housekeeping,Invoice,Payment,Service,Notification} from '../models/Resource.js';
import {AppError} from '../utils/errors.js';
import {sendBookingConfirmedEmail} from './bookingEmails.js';

// Room states that can never be booked, whatever the dates are.
const BLOCKED=['maintenance','out_of_service','dirty','cleaning','occupied'];
const LIVE=['confirmed','checked_in'];

/**
 * Keep Room.status in step with reservations.
 * An admin-approved (confirmed) reservation moves an available room to "booked";
 * when no confirmed stay remains, the room returns to "available".
 * Rooms that are occupied / being cleaned / in maintenance are never touched.
 */
export async function syncRoomBooking(roomId,hotelId){
  if(!roomId)return;
  const room=await Room.findOne({_id:roomId,...(hotelId?{hotelId}:{})}).select('status hotelId');
  if(!room||!['available','booked'].includes(room.status))return;
  const hasBooking=await Reservation.exists({hotelId:room.hotelId,roomId,status:'confirmed',checkOut:{$gt:new Date()}});
  const next=hasBooking?'booked':'available';
  if(room.status!==next)await Room.updateOne({_id:room._id},{$set:{status:next}});
}

/** Public room status shown to guests. Depends on Room.status and (for booked rooms) the searched dates. */
export function guestRoomState(room,overlapping){
  if(['maintenance','out_of_service'].includes(room.status))return 'unavailable';
  if(['dirty','cleaning'].includes(room.status))return 'preparing';
  if(room.status==='occupied')return 'occupied';
  if(overlapping)return 'booked';
  if(room.status==='booked'&&!overlapping)return 'available';
  return 'available';
}

/**
 * Guest-facing catalogue. Returns every room that can host `guests` people, each with a
 * status-driven `availability` ('available' | 'booked' | 'occupied' | 'preparing' | 'unavailable').
 */
export async function publicRoomCatalog({hotelId,checkIn,checkOut,guests,availableOnly}){
  const rooms=await Room.find({hotelId}).populate('roomTypeId').sort({number:1});
  let busy=new Set();
  if(checkIn&&checkOut){
    const ids=await Reservation.find({hotelId,status:{$in:LIVE},checkIn:{$lt:new Date(checkOut)},checkOut:{$gt:new Date(checkIn)}}).distinct('roomId');
    busy=new Set(ids.map(String));
  }
  const need=Math.max(0,Number(guests)||0);
  const order={available:0,booked:1,occupied:2,preparing:3,unavailable:4};
  const out=rooms
    .filter(r=>r.roomTypeId&&(!need||Number(r.roomTypeId.capacity||2)>=need))
    .map(r=>{const o=r.toObject();const overlapping=busy.has(String(r._id))||(!checkIn&&r.status==='booked');o.availability=guestRoomState(r,overlapping);o.bookable=o.availability==='available';return o;})
    .filter(r=>!availableOnly||r.bookable)
    .sort((a,b)=>order[a.availability]-order[b.availability]||Number(a.roomTypeId.capacity)-Number(b.roomTypeId.capacity)||String(a.number).localeCompare(String(b.number),undefined,{numeric:true}));
  return out;
}

export async function findAvailableRooms({hotelId,checkIn,checkOut,guests}){
  if(!hotelId||!checkIn||!checkOut||new Date(checkOut)<=new Date(checkIn))throw new AppError('Valid hotelId, checkIn and checkOut are required');
  return publicRoomCatalog({hotelId,checkIn,checkOut,guests,availableOnly:true});
}

/**
 * Create a reservation. Staff-created reservations are `confirmed` straight away;
 * guest website requests are created as `pending` and wait for admin approval.
 */
export async function createReservation(data,user,{status='confirmed'}={}){
  const session=await Reservation.startSession();
  try{
    let created;
    await session.withTransaction(async()=>{
      const room=await Room.findOne({_id:data.roomId,hotelId:data.hotelId}).populate('roomTypeId').session(session);
      if(!room)throw new AppError('Room not found for this hotel',404);
      if(BLOCKED.includes(room.status))throw new AppError('Room is unavailable for booking',409);
      const capacity=Number(room.roomTypeId?.capacity||2),party=(Number(data.adults)||1)+(Number(data.children)||0);
      if(party>capacity)throw new AppError(`This room sleeps up to ${capacity} guests. Please choose a larger room for ${party} guests.`,400,'CAPACITY_EXCEEDED');
      const overlap=await Reservation.findOne({hotelId:data.hotelId,roomId:data.roomId,status:{$in:LIVE},checkIn:{$lt:data.checkOut},checkOut:{$gt:data.checkIn}}).session(session);
      if(overlap)throw new AppError('Room is already reserved for those dates',409,'ROOM_CONFLICT');
      const reference=`LS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const nights=Math.max(1,Math.ceil((data.checkOut-data.checkIn)/86400000));
      const subtotal=Number((nights*Number(data.nightlyRate)).toFixed(2));
      [created]=await Reservation.create([{...data,status,reference,total:subtotal,...(user?{createdBy:user._id}:{})}],{session});
      const invoiceNumber=`INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      await Invoice.create([{hotelId:data.hotelId,reservationId:created._id,number:invoiceNumber,items:[{description:'Room accommodation',quantity:nights,unitPrice:Number(data.nightlyRate),total:subtotal}],subtotal,taxRate:0,discount:0,total:subtotal,balance:subtotal,status:'unpaid'}],{session});
    });
    if(created.status==='confirmed'){await syncRoomBooking(created.roomId,created.hotelId);sendBookingConfirmedEmail(created._id);}
    return created;
  }finally{await session.endSession();}
}

/** Admin approves a pending request: it becomes a real booking and the room is marked booked. */
export async function approveReservation(id,hotelFilter,user){
  const r=await Reservation.findOne({_id:id,...(hotelFilter||{})});
  if(!r)throw new AppError('Reservation not found',404);
  if(r.status!=='pending')throw new AppError('Only reservations awaiting approval can be approved',409);
  const room=await Room.findOne({_id:r.roomId,hotelId:r.hotelId});
  if(!room)throw new AppError('Room no longer exists',404);
  if(['maintenance','out_of_service'].includes(room.status))throw new AppError('This room is under maintenance. Reject the request or change the room status first.',409);
  const clash=await Reservation.findOne({_id:{$ne:r._id},hotelId:r.hotelId,roomId:r.roomId,status:{$in:LIVE},checkIn:{$lt:r.checkOut},checkOut:{$gt:r.checkIn}});
  if(clash)throw new AppError(`Room ${room.number} is already booked for part of these dates (${clash.reference}). Reject this request or ask the guest to pick another room.`,409,'ROOM_CONFLICT');
  r.status='confirmed';r.approvedBy=user._id;r.approvedAt=new Date();r.rejectionReason=undefined;await r.save();
  await syncRoomBooking(r.roomId,r.hotelId);
  sendBookingConfirmedEmail(r._id); // email the guest: booking confirmed
  await Notification.create({hotelId:r.hotelId,title:'Reservation approved',message:`Reservation ${r.reference} was approved and Room ${room.number} is now booked.`,type:'reservation'}).catch(()=>{});
  return r;
}

/** Admin rejects a pending request: the room is untouched, the invoice is voided and demo payments are refunded. */
export async function rejectReservation(id,hotelFilter,user,reason=''){
  const r=await Reservation.findOne({_id:id,...(hotelFilter||{})});
  if(!r)throw new AppError('Reservation not found',404);
  if(r.status!=='pending')throw new AppError('Only reservations awaiting approval can be rejected',409);
  r.status='rejected';r.rejectedAt=new Date();r.rejectionReason=String(reason||'').slice(0,500)||undefined;await r.save();
  const invoice=await Invoice.findOne({reservationId:r._id});
  if(invoice){await Payment.updateMany({invoiceId:invoice._id,status:'succeeded'},{$set:{status:'refunded'}});invoice.status='void';invoice.balance=0;await invoice.save();}
  await syncRoomBooking(r.roomId,r.hotelId);
  await Notification.create({hotelId:r.hotelId,title:'Reservation rejected',message:`Reservation ${r.reference} was rejected.`,type:'reservation'}).catch(()=>{});
  return r;
}

export async function checkoutReservation(id,hotelId){const session=await Reservation.startSession();try{let reservation;await session.withTransaction(async()=>{reservation=await Reservation.findOne({_id:id,hotelId,status:'checked_in'}).session(session);if(!reservation)throw new AppError('Checked-in reservation not found',404);reservation.status='checked_out';await reservation.save({session});await Room.updateOne({_id:reservation.roomId,hotelId},{status:'dirty'},{session});await Housekeeping.create([{hotelId,roomId:reservation.roomId,reservationId:reservation._id,taskType:'checkout_clean',status:'pending'}],{session});const existing=await Invoice.findOne({hotelId,reservationId:reservation._id}).session(session);const services=await Service.find({hotelId,reservationId:reservation._id,chargeToRoom:true,status:{$nin:['cancelled']}}).session(session);if(!existing){const number=`INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;const nights=Math.max(1,Math.ceil((reservation.checkOut-reservation.checkIn)/86400000));const items=[{description:'Room accommodation',quantity:nights,unitPrice:reservation.nightlyRate,total:reservation.total},...services.map(x=>({description:x.description,quantity:1,unitPrice:x.charge,total:x.charge}))];const subtotal=Number(items.reduce((sum,x)=>sum+x.total,0).toFixed(2));await Invoice.create([{hotelId,reservationId:reservation._id,number,items,subtotal,taxRate:0,discount:0,total:subtotal,balance:subtotal,status:'unpaid'}],{session});}else if(services.length){existing.items.push(...services.map(x=>({description:x.description,quantity:1,unitPrice:x.charge,total:x.charge})));existing.subtotal=Number(existing.items.reduce((sum,x)=>sum+Number(x.total||0),0).toFixed(2));existing.total=Number(Math.max(0,existing.subtotal+existing.subtotal*existing.taxRate/100-existing.discount).toFixed(2));const paidAgg=await Payment.aggregate([{$match:{hotelId,invoiceId:existing._id,status:'succeeded'}},{$group:{_id:null,total:{$sum:'$amount'}}}]).session(session);const paid=Math.min(existing.total,Number(paidAgg[0]?.total||0));existing.balance=Number(Math.max(0,existing.total-paid).toFixed(2));existing.status=existing.balance===0?'paid':paid>0?'partial':'unpaid';await existing.save({session});}});return reservation;}finally{await session.endSession();}}
