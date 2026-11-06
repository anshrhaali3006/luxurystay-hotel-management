import bcrypt from 'bcryptjs';import jwt from 'jsonwebtoken';import User from '../models/User.js';import {asyncHandler} from '../utils/asyncHandler.js';import {AppError} from '../utils/errors.js';import {requestPasswordReset,completePasswordReset} from '../services/passwordReset.js';import {sendMail} from '../utils/mailer.js';
export const publicUser=u=>({id:u._id,name:u.name,email:u.email,role:u.role,hotelIds:u.hotelIds,salary:u.salary||0,phone:u.phone||'',mustChangePassword:!!u.mustChangePassword,preferences:{bookingEmails:u.preferences?.bookingEmails!==false,newBookingAlerts:!!u.preferences?.newBookingAlerts}});
export const login=asyncHandler(async(req,res)=>{const user=await User.findOne({email:req.body.email.toLowerCase()}).select('+passwordHash');if(!user||!user.active||!(await bcrypt.compare(req.body.password,user.passwordHash)))throw new AppError('Email or password is incorrect',401,'AUTH_FAILED');user.lastLoginAt=new Date();await user.save();const token=jwt.sign({sub:user._id,role:user.role},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'8h'});res.json({success:true,data:{token,user:publicUser(user)}});});
export const me=asyncHandler(async(req,res)=>res.json({success:true,data:publicUser(req.user)}));
export const logout=asyncHandler(async(req,res)=>res.json({success:true,message:'Logged out. Clear the client session token.'}));

const signToken=u=>jwt.sign({sub:u._id,role:u.role},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'8h'});

// Same response whether or not the email has an account, so the form cannot be used to find registered emails.
export const forgotPassword=asyncHandler(async(req,res)=>{
  try{await requestPasswordReset({User,sendMail,email:req.body.email,clientUrl:process.env.CLIENT_URL});}
  catch(err){console.error('Password reset request failed:',err.message);}
  res.json({success:true,message:'If an account exists for that email, a reset link has been sent. It stays valid for 30 minutes.'});
});

export const resetPassword=asyncHandler(async(req,res)=>{
  const ok=await completePasswordReset({User,token:req.body.token,password:req.body.password});
  if(!ok)throw new AppError('This reset link is invalid or has expired. Please request a new one.',400,'RESET_INVALID');
  res.json({success:true,message:'Your password has been updated. Please sign in with your new password.'});
});

export const changePassword=asyncHandler(async(req,res)=>{
  const user=await User.findById(req.user._id).select('+passwordHash');
  if(!user||!(await bcrypt.compare(req.body.currentPassword,user.passwordHash)))throw new AppError('Your current password is incorrect',400,'WRONG_PASSWORD');
  user.passwordHash=await bcrypt.hash(req.body.newPassword,12);
  user.passwordChangedAt=new Date();
  user.mustChangePassword=false;
  await user.save();
  // Older sessions stop working; hand this device a fresh token so the user stays signed in.
  res.json({success:true,message:'Password changed. Other devices have been signed out.',data:{token:signToken(user),user:publicUser(user)}});
});

export const updateProfile=asyncHandler(async(req,res)=>{
  const user=await User.findById(req.user._id);
  user.name=req.body.name;user.phone=req.body.phone||'';
  await user.save();
  res.json({success:true,data:{user:publicUser(user)}});
});

// Opt-in / opt-out email preferences. Staff alerts are only meaningful for admins and managers.
export const updatePreferences=asyncHandler(async(req,res)=>{
  const set={};
  if(req.body.bookingEmails!==undefined)set['preferences.bookingEmails']=req.body.bookingEmails;
  if(req.body.newBookingAlerts!==undefined){
    if(!['admin','manager'].includes(req.user.role))throw new AppError('New-booking alerts are only available to admins and managers',403);
    set['preferences.newBookingAlerts']=req.body.newBookingAlerts;
  }
  const user=Object.keys(set).length?await User.findByIdAndUpdate(req.user._id,{$set:set},{new:true}):await User.findById(req.user._id);
  res.json({success:true,data:{user:publicUser(user)}});
});
