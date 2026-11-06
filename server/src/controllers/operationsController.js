import {asyncHandler} from '../utils/asyncHandler.js';
import {AppError} from '../utils/errors.js';
import {Reservation,Room,Invoice,Payment,Housekeeping,Maintenance,Notification} from '../models/Resource.js';
import {syncRoomBooking} from '../services/reservations.js';

export const summary=asyncHandler(async(req,res)=>{
 const filter=req.hotelFilter||{};const today=new Date();today.setHours(0,0,0,0);const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
 const [totalRooms,occupied,available,arrivals,departures,activeReservations,balances,maintenance,revenue,pendingApprovals,booked]=await Promise.all([
  Room.countDocuments(filter),Room.countDocuments({...filter,status:'occupied'}),Room.countDocuments({...filter,status:'available'}),
  Reservation.countDocuments({...filter,checkIn:{$gte:today,$lt:tomorrow},status:'confirmed'}),Reservation.countDocuments({...filter,checkOut:{$gte:today,$lt:tomorrow},status:'checked_in'}),
  Reservation.countDocuments({...filter,status:{$in:['confirmed','checked_in']}}),Invoice.aggregate([{$match:{...filter,status:{$in:['unpaid','partial']}}},{$group:{_id:null,total:{$sum:'$balance'}}}]),
  Maintenance.countDocuments({...filter,status:{$in:['open','in_progress','waiting_parts']}}),Payment.aggregate([{$match:{...filter,status:'succeeded',receivedAt:{$gte:new Date(today.getFullYear(),today.getMonth(),1)}}},{$group:{_id:null,total:{$sum:'$amount'}}}]),
  Reservation.countDocuments({...filter,status:'pending'}),Room.countDocuments({...filter,status:'booked'})
 ]);
 res.json({success:true,data:{totalRooms,occupied,available,arrivals,departures,activeReservations,occupancyRate:totalRooms?Math.round(occupied/totalRooms*100):0,outstandingBalance:balances[0]?.total||0,pendingMaintenance:maintenance,monthRevenue:revenue[0]?.total||0,pendingApprovals,booked}});
});
export const checkIn=asyncHandler(async(req,res)=>{const r=await Reservation.findOne({_id:req.params.id,...(req.hotelFilter||{}),status:'confirmed'});if(!r)throw new AppError('Confirmed reservation not found',404);const room=await Room.findOne({_id:r.roomId,hotelId:r.hotelId});if(!room||['maintenance','out_of_service','dirty','cleaning'].includes(room.status))throw new AppError('Room must be ready before check-in',409);r.status='checked_in';await r.save();room.status='occupied';await room.save();res.json({success:true,data:r});});
export const cancelReservation=asyncHandler(async(req,res)=>{const r=await Reservation.findOne({_id:req.params.id,...(req.hotelFilter||{}),status:'confirmed'});if(!r)throw new AppError('Confirmed reservation not found',404);r.status='cancelled';await r.save();await syncRoomBooking(r.roomId,r.hotelId);await Notification.create({hotelId:r.hotelId,title:'Reservation cancelled',message:`Reservation ${r.reference} was cancelled`,type:'reservation'});res.json({success:true,data:r});});
export const payment=asyncHandler(async(req,res)=>{const invoice=await Invoice.findOne({_id:req.params.id,...(req.hotelFilter||{})});if(!invoice)throw new AppError('Invoice not found',404);if(invoice.status==='void')throw new AppError('Cannot pay a void invoice',409);const amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<=0||amount>invoice.balance)throw new AppError('Payment must be positive and no greater than the outstanding balance');const p=await Payment.create({hotelId:invoice.hotelId,invoiceId:invoice._id,amount,method:req.body.method,reference:req.body.reference,recordedBy:req.user._id});invoice.balance=Math.max(0,invoice.balance-amount);invoice.status=invoice.balance===0?'paid':'partial';await invoice.save();res.status(201).json({success:true,data:{payment:p,invoice}});});
export const report=asyncHandler(async(req,res)=>{
 // ---- 1. Work out the period. "to" is inclusive, so we push it to the END of that day (this was why today's data never showed).
 const kind=req.params.kind.replace(/\.csv$/,'');
 const isoDay=d=>d?new Date(d).toISOString().slice(0,10):'';
 const from=req.query.from?new Date(`${String(req.query.from).slice(0,10)}T00:00:00.000Z`):new Date(Date.now()-90*86400000);
 const to=req.query.to?new Date(`${String(req.query.to).slice(0,10)}T23:59:59.999Z`):new Date();
 if(Number.isNaN(+from)||Number.isNaN(+to)||from>to)throw new AppError('Invalid report date range',400);
 const scope=req.hotelFilter||{};
 const name=p=>p?`${p.firstName||''} ${p.lastName||''}`.trim():'';
 // ---- 2. Build clean, flat rows (no nested objects, no raw ids) so the table and the CSV both read well.
 let data;
 if(kind==='revenue'){
  data=(await Payment.aggregate([{$match:{...scope,status:'succeeded',receivedAt:{$gte:from,$lte:to}}},{$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$receivedAt'}},revenue:{$sum:'$amount'},payments:{$sum:1}}},{$sort:{_id:1}}])).map(r=>({date:r._id,payments:r.payments,revenue:r.revenue}));
 }else if(kind==='methods'){
  data=(await Payment.aggregate([{$match:{...scope,status:'succeeded',receivedAt:{$gte:from,$lte:to}}},{$group:{_id:'$method',revenue:{$sum:'$amount'},payments:{$sum:1}}},{$sort:{revenue:-1}}])).map(r=>({method:r._id||'other',payments:r.payments,revenue:r.revenue}));
 }else if(kind==='payments'){
  const rows=await Payment.find({...scope,receivedAt:{$gte:from,$lte:to}}).sort({receivedAt:-1}).populate('invoiceId','number').lean();
  data=rows.map(x=>({date:isoDay(x.receivedAt),reference:x.reference||'—',invoice:x.invoiceId?.number||'—',method:String(x.method||'').replaceAll('_',' '),status:x.status,amount:x.amount}));
 }else if(kind==='reservations'||kind==='cancellations'){
  const rows=await Reservation.find({...scope,createdAt:{$gte:from,$lte:to},...(kind==='cancellations'?{status:'cancelled'}:{})}).sort({createdAt:-1}).populate('guestId','firstName lastName').populate('roomId','number').lean();
  data=rows.map(x=>({reference:x.reference,guest:name(x.guestId)||'—',room:x.roomId?.number||'—',checkIn:isoDay(x.checkIn),checkOut:isoDay(x.checkOut),status:x.status,total:x.total}));
 }else if(kind==='housekeeping'){
  const rows=await Housekeeping.find({...scope,createdAt:{$gte:from,$lte:to}}).sort({createdAt:-1}).populate('roomId','number').populate('assignedTo','name').lean();
  data=rows.map(x=>({created:isoDay(x.createdAt),room:x.roomId?.number||'—',task:String(x.taskType||'').replaceAll('_',' '),priority:x.priority,status:String(x.status||'').replaceAll('_',' '),assignedTo:x.assignedTo?.name||'Unassigned',completed:isoDay(x.completedAt)||'—'}));
 }else if(kind==='maintenance'){
  const rows=await Maintenance.find({...scope,createdAt:{$gte:from,$lte:to}}).sort({createdAt:-1}).populate('roomId','number').populate('assignedTo','name').lean();
  data=rows.map(x=>({created:isoDay(x.createdAt),room:x.roomId?.number||'—',issue:x.title,priority:x.priority,status:String(x.status||'').replaceAll('_',' '),assignedTo:x.assignedTo?.name||'Unassigned',resolved:isoDay(x.resolvedAt)||'—'}));
 }else if(kind==='outstanding'){
  const rows=await Invoice.find({...scope,balance:{$gt:0},status:{$ne:'void'}}).sort({createdAt:-1}).populate('reservationId','reference').lean();
  data=rows.map(x=>({invoice:x.number,reservation:x.reservationId?.reference||'—',created:isoDay(x.createdAt),status:x.status,total:x.total,balance:x.balance}));
 }else throw new AppError('Unknown report type',404);
 // ---- 3. CSV download (uses the same flat rows) or JSON for the page.
 if(req.path.endsWith('.csv')){
  const keys=[...new Set(data.flatMap(x=>Object.keys(x)))];
  const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  res.type('text/csv').attachment(`${kind}.csv`).send([keys.map(esc).join(','),...data.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n'));
  return;
 }
 res.json({success:true,data});
});


export const demoPayment=asyncHandler(async(req,res)=>{
 const invoice=await Invoice.findOne({_id:req.params.id,...(req.hotelFilter||{})});
 if(!invoice)throw new AppError('Invoice not found',404);
 if(invoice.status==='void'||invoice.balance<=0)throw new AppError('This invoice has no payable balance',409);
 const amount=Number(req.body.amount??invoice.balance);
 if(!Number.isFinite(amount)||amount<=0||amount>invoice.balance)throw new AppError('Enter an amount up to the outstanding balance',400);
 const method=['cash','bank_transfer','card_terminal','other'].includes(req.body.method)?req.body.method:'card_terminal';
 const reference=`DEMO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
 const record=await Payment.create({hotelId:invoice.hotelId,invoiceId:invoice._id,amount,method,status:'succeeded',reference,demo:true,recordedBy:req.user?._id});
 invoice.balance=Number(Math.max(0,invoice.balance-amount).toFixed(2));invoice.status=invoice.balance===0?'paid':'partial';await invoice.save();
 res.status(201).json({success:true,data:{payment:record,invoice},message:'Demo payment simulated successfully. No real money was moved.'});
});
export const updateInvoiceStatus=asyncHandler(async(req,res)=>{
 const allowed=['draft','unpaid','partial','paid','void'];const status=String(req.body.status||'');
 if(!allowed.includes(status))throw new AppError('Choose draft, unpaid, partial, paid, or void',400);
 const invoice=await Invoice.findOne({_id:req.params.id,...(req.hotelFilter||{})});if(!invoice)throw new AppError('Invoice not found',404);
 if(status==='paid'){const due=Number(invoice.balance)||0;if(due>0&&invoice.status!=='paid'){await Payment.create({hotelId:invoice.hotelId,invoiceId:invoice._id,amount:due,method:'cash',status:'succeeded',reference:`MANUAL-${Date.now().toString(36).toUpperCase()}`,receivedAt:new Date(),recordedBy:req.user?._id});}invoice.balance=0;}else if(status==='unpaid'||status==='draft')invoice.balance=invoice.total;else if(status==='void')invoice.balance=0;else{const agg=await Payment.aggregate([{$match:{hotelId:invoice.hotelId,invoiceId:invoice._id,status:'succeeded'}},{$group:{_id:null,total:{$sum:'$amount'}}}]);const paid=Number(agg[0]?.total||0);invoice.balance=Math.max(0,Math.min(invoice.total,Number(req.body.balance??(paid>0?invoice.total-paid:invoice.total/2))));}
 invoice.status=status;await invoice.save();res.json({success:true,data:invoice});
});

export const updatePaymentStatus=asyncHandler(async(req,res)=>{
 const allowed=['succeeded','pending','failed','refunded'];const status=String(req.body.status||'');if(!allowed.includes(status))throw new AppError('Choose succeeded, pending, failed, or refunded',400);
 const record=await Payment.findOne({_id:req.params.id,...(req.hotelFilter||{})});if(!record)throw new AppError('Payment not found',404);
 record.status=status;await record.save();const invoice=await Invoice.findOne({_id:record.invoiceId,hotelId:record.hotelId});if(invoice){const agg=await Payment.aggregate([{$match:{hotelId:record.hotelId,invoiceId:invoice._id,status:'succeeded'}},{$group:{_id:null,total:{$sum:'$amount'}}}]);const paid=Math.min(invoice.total,Number(agg[0]?.total||0));invoice.balance=Number(Math.max(0,invoice.total-paid).toFixed(2));invoice.status=invoice.balance===0?'paid':paid>0?'partial':'unpaid';await invoice.save();}
 res.json({success:true,data:record});
});
