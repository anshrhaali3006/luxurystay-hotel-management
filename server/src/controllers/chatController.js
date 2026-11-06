import HotelModel from '../models/Hotel.js';
import {RoomType,Guest,Reservation} from '../models/Resource.js';
import {publicRoomCatalog} from '../services/reservations.js';
import {reply} from '../services/chatbot.js';
import {asyncHandler} from '../utils/asyncHandler.js';

/** Today's date as YYYY-MM-DD in the property's timezone (the server may run in a different one). */
function todayIn(timeZone){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:timeZone||'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  catch{return new Date().toISOString().slice(0,10);}
}

// Everything the chatbot may read. Only public hotel info, plus bookings the caller has proven they own.
const data={
  listHotels:()=>HotelModel.find({active:true}).select('name code city country address phone email currency checkInTime checkOutTime timezone').sort({name:1}).lean(),
  listRoomTypes:(hotelId)=>RoomType.find(hotelId?{hotelId}:{}).select('name amenities capacity baseRate').limit(200).lean(),
  availableRooms:async({hotelId,checkIn,checkOut,guests})=>(await publicRoomCatalog({hotelId,checkIn,checkOut,guests,availableOnly:true})),
  guestBookings:async(user)=>{
    const ids=await Guest.find({email:user.email}).distinct('_id');
    return Reservation.find({$or:[{guestId:{$in:ids}},{createdBy:user._id}]}).sort({createdAt:-1}).limit(3).populate('hotelId','name').lean();
  },
  bookingByReference:(reference)=>Reservation.findOne({reference})
    .populate('guestId','email')
    .populate('hotelId','name')
    .populate({path:'roomId',select:'number',populate:{path:'roomTypeId',select:'name'}})
    .lean(),
};

export const chatHandler=asyncHandler(async(req,res)=>{
  const tz=(await HotelModel.findOne({active:true}).select('timezone').lean())?.timezone;
  const result=await reply({text:req.body.message,user:req.user||null,today:todayIn(tz),hotelId:req.body.hotelId,data});
  res.json({success:true,data:result});
});
