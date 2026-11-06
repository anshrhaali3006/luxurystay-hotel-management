/**
 * One-off repair: invoices that were set to "paid" before this fix have NO payment record,
 * so revenue/reports ignored them. This creates the missing cash payment for each such invoice.
 *
 *   npm run backfill:payments            -> dry run (only prints what it would create)
 *   npm run backfill:payments -- --apply -> really creates the payments
 *
 * Safe to run twice: invoices that already have enough payments are skipped.
 */
import dotenv from 'dotenv';
import {connectDB} from '../config/db.js';
import {Invoice,Payment} from '../models/Resource.js';
dotenv.config();
const apply=process.argv.includes('--apply');
await connectDB();
let created=0,sum=0;
for(const inv of await Invoice.find({status:'paid',total:{$gt:0}})){
  const agg=await Payment.aggregate([{$match:{hotelId:inv.hotelId,invoiceId:inv._id,status:'succeeded'}},{$group:{_id:null,total:{$sum:'$amount'}}}]);
  const missing=Number((inv.total-Number(agg[0]?.total||0)).toFixed(2));
  if(missing<=0)continue;
  console.log(`${apply?'CREATE':'would create'}  ${inv.number}  PKR ${missing}  dated ${inv.updatedAt.toISOString().slice(0,10)}`);
  if(apply)await Payment.create({hotelId:inv.hotelId,invoiceId:inv._id,amount:missing,method:'cash',status:'succeeded',reference:`BACKFILL-${inv.number}`,receivedAt:inv.updatedAt});
  created++;sum+=missing;
}
console.log(`${apply?'Created':'Would create'} ${created} payment(s), total PKR ${sum}.${apply?'':'  Re-run with --apply to save.'}`);
process.exit(0);
