import {z} from 'zod';
export const loginSchema=z.object({email:z.string().email(),password:z.string().min(8).max(128)});
export const reservationSchema=z.object({hotelId:z.string().min(1),guestId:z.string().min(1),roomId:z.string().min(1),checkIn:z.coerce.date(),checkOut:z.coerce.date(),adults:z.coerce.number().int().min(1).default(1),children:z.coerce.number().int().min(0).default(0),nightlyRate:z.coerce.number().min(0),notes:z.string().max(2000).optional()}).refine(d=>d.checkOut>d.checkIn,{message:'Check-out must be after check-in',path:['checkOut']});
export const paymentSchema=z.object({amount:z.coerce.number().positive(),method:z.enum(['cash','bank_transfer','card_terminal','other']),reference:z.string().max(120).optional()});

const newPassword=z.string().min(10,'Use at least 10 characters').max(128);
export const forgotPasswordSchema=z.object({email:z.string().trim().email().max(254)});
export const resetPasswordSchema=z.object({token:z.string().min(32).max(200),password:newPassword});
export const changePasswordSchema=z.object({currentPassword:z.string().min(1).max(128),newPassword}).refine(d=>d.currentPassword!==d.newPassword,{message:'Choose a password different from your current one',path:['newPassword']});
export const profileSchema=z.object({name:z.string().trim().min(2).max(120),phone:z.string().trim().max(40).optional().default('')});
export const chatSchema=z.object({message:z.string().trim().min(1).max(500),hotelId:z.string().trim().max(40).optional()});
export const preferencesSchema=z.object({bookingEmails:z.boolean().optional(),newBookingAlerts:z.boolean().optional()}).strict();
export const adminResetPasswordSchema=z.object({password:newPassword.optional()});
