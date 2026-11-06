/**
 * Booking emails sent to the guest.
 *
 *  1. "received"  – right after the guest books. The request is waiting for approval.
 *  2. "confirmed" – when an admin/manager approves it (or staff create an already-confirmed booking).
 *
 * Emails must never break a booking: every public function here catches its own errors and only logs them.
 * `sendMail` and the reservation loader are injectable so the templates can be unit-tested without MongoDB or SMTP.
 */
import {sendMail as defaultSendMail} from '../utils/mailer.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'}) : '—');
const fmtMoney = (n, currency = 'PKR') => `${currency} ${Number(n || 0).toLocaleString('en-US', {maximumFractionDigits: 0})}`;
const nightsBetween = (a, b) => Math.max(1, Math.ceil((new Date(b) - new Date(a)) / 86400000));

/** Turns a populated reservation into the plain values the templates need. */
export function bookingDetails(r) {
  const hotel = r.hotelId || {};
  const guest = r.guestId || {};
  const room = r.roomId || {};
  const currency = hotel.currency || 'PKR';
  return {
    to: guest.email,
    firstName: guest.firstName || 'Guest',
    fullName: `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Guest',
    reference: r.reference,
    hotelName: hotel.name || 'LuxuryStay',
    hotelCity: [hotel.city, hotel.country].filter(Boolean).join(', '),
    hotelPhone: hotel.phone || '',
    hotelEmail: hotel.email || '',
    roomLabel: `${room.roomTypeId?.name || 'Room'}${room.number ? ` · Room ${room.number}` : ''}`,
    checkIn: fmtDate(r.checkIn),
    checkOut: fmtDate(r.checkOut),
    checkInTime: hotel.checkInTime || '',
    checkOutTime: hotel.checkOutTime || '',
    nights: nightsBetween(r.checkIn, r.checkOut),
    guests: (Number(r.adults) || 1) + (Number(r.children) || 0),
    total: fmtMoney(r.total, currency),
  };
}

/** Builds { subject, text, html } for "received" or "confirmed". */
export function buildBookingEmail(kind, r, {clientUrl} = {}) {
  const d = bookingDetails(r);
  const confirmed = kind === 'confirmed';
  const portal = `${String(clientUrl || process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '')}/my-stays`;

  const subject = confirmed
    ? `Your stay is confirmed · ${d.reference} · ${d.hotelName}`
    : `We received your booking request · ${d.reference} · ${d.hotelName}`;
  const headline = confirmed ? 'Your booking is confirmed' : 'We have received your booking';
  const intro = confirmed
    ? `Wonderful news, ${d.firstName} — your reservation has been approved and your room is now booked. We look forward to welcoming you.`
    : `Thank you, ${d.firstName}. Your request is with our team and is waiting for approval. We will email you again as soon as it is confirmed — no further action is needed from you.`;
  const badge = confirmed ? 'CONFIRMED' : 'AWAITING APPROVAL';

  const rows = [
    ['Booking reference', d.reference],
    ['Hotel', d.hotelName + (d.hotelCity ? ` — ${d.hotelCity}` : '')],
    ['Room', d.roomLabel],
    ['Check-in', d.checkIn + (d.checkInTime ? ` (from ${d.checkInTime})` : '')],
    ['Check-out', d.checkOut + (d.checkOutTime ? ` (by ${d.checkOutTime})` : '')],
    ['Stay', `${d.nights} night${d.nights === 1 ? '' : 's'} · ${d.guests} guest${d.guests === 1 ? '' : 's'}`],
    ['Total', d.total],
  ];

  const contact = [d.hotelPhone && `Phone: ${d.hotelPhone}`, d.hotelEmail && `Email: ${d.hotelEmail}`].filter(Boolean).join('  ·  ');

  const text = [
    `Hello ${d.fullName},`,
    '',
    intro,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `View your stays: ${portal}`,
    contact && `Questions? ${contact}`,
    '',
    'LuxuryStay Hospitality — Stay a little extraordinary',
  ].filter((line) => line !== undefined && line !== false).join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef1f5;font-family:Arial,Helvetica,sans-serif;color:#1c2c3e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(16,37,63,.12)">
<tr><td style="background:#10253f;padding:26px 32px;text-align:left">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#ffffff;letter-spacing:.5px">Luxury<span style="color:#d9bc7e">Stay</span></div>
  <div style="font-size:10px;letter-spacing:2.2px;color:#91a0b1;margin-top:6px">STAY A LITTLE EXTRAORDINARY</div>
</td></tr>
<tr><td style="height:4px;background:#c5a365;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:34px 32px 8px">
  <span style="display:inline-block;background:${confirmed ? '#e8f5ed' : '#fbf2df'};color:${confirmed ? '#37815a' : '#a47b30'};font-size:10px;font-weight:700;letter-spacing:1.6px;padding:6px 10px;border-radius:3px">${badge}</span>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:28px;line-height:1.2;margin:16px 0 12px;color:#10253f">${esc(headline)}</h1>
  <p style="font-size:14px;line-height:1.7;color:#4b5b6b;margin:0">${esc(intro)}</p>
</td></tr>
<tr><td style="padding:22px 32px 6px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7ebef;border-radius:8px">
  ${rows.map(([k, v], i) => `<tr><td style="padding:12px 16px;font-size:12px;color:#8290a0;width:38%;${i ? 'border-top:1px solid #eef1f5;' : ''}">${esc(k)}</td><td style="padding:12px 16px;font-size:13px;font-weight:600;color:#1c2c3e;${i ? 'border-top:1px solid #eef1f5;' : ''}">${esc(v)}</td></tr>`).join('')}
  </table>
</td></tr>
<tr><td style="padding:24px 32px 34px" align="left">
  <a href="${esc(portal)}" style="display:inline-block;background:#10253f;color:#f3e3b8;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.4px;padding:14px 24px;border-radius:6px;border-bottom:3px solid #c5a365">View my stays</a>
  ${contact ? `<p style="font-size:12px;color:#8290a0;margin:22px 0 0">Questions? ${esc(contact)}</p>` : ''}
</td></tr>
<tr><td style="background:#f6f8fa;padding:18px 32px;font-size:11px;color:#98a2ad;text-align:center">© ${new Date().getFullYear()} LuxuryStay Hospitality · This is an automated message about your booking.</td></tr>
</table></td></tr></table></body></html>`;

  return {subject, text, html};
}

/** Core sender: builds the email for an already-populated reservation and sends it. Never throws. */
export async function sendBookingEmail(kind, reservation, {sendMail = defaultSendMail, clientUrl} = {}) {
  try {
    const to = reservation?.guestId?.email;
    if (!to) return {sent: false, reason: 'no-guest-email'};
    const {subject, text, html} = buildBookingEmail(kind, reservation, {clientUrl});
    await sendMail({to, subject, text, html});
    return {sent: true};
  } catch (err) {
    console.error(`[mail] Could not send "${kind}" booking email:`, err.message);
    return {sent: false, reason: err.message};
  }
}

/** Loads the reservation with guest / hotel / room details, then sends. Fire-and-forget safe. */
async function loadAndSend(kind, reservationId) {
  try {
    const {Reservation} = await import('../models/Resource.js');
    const r = await Reservation.findById(reservationId)
      .populate('guestId', 'firstName lastName email')
      .populate('hotelId', 'name city country phone email currency checkInTime checkOutTime')
      .populate({path: 'roomId', select: 'number', populate: {path: 'roomTypeId', select: 'name'}})
      .lean();
    if (!r) return {sent: false, reason: 'reservation-not-found'};
    // A guest with an account can opt out of booking emails in their account settings.
    const {default: User} = await import('../models/User.js');
    const account = await User.findOne({email: String(r.guestId?.email || '').toLowerCase()}).select('preferences').lean();
    if (account?.preferences?.bookingEmails === false) return {sent: false, reason: 'guest-opted-out'};
    return await sendBookingEmail(kind, r);
  } catch (err) {
    console.error(`[mail] Could not prepare "${kind}" booking email:`, err.message);
    return {sent: false, reason: err.message};
  }
}

/** Call right after a guest's booking request is saved. Does not block the HTTP response. */
export const sendBookingReceivedEmail = (reservationId) => { loadAndSend('received', reservationId); };
/** Call when a booking becomes confirmed (admin approval, or staff create it as confirmed). */
export const sendBookingConfirmedEmail = (reservationId) => { loadAndSend('confirmed', reservationId); };

/** Plain alert for admins/managers who opted in: a new booking request needs approval. */
export function buildStaffAlertEmail(r, {clientUrl} = {}) {
  const d = bookingDetails(r);
  const link = `${String(clientUrl || process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '')}/workspace/reservations?status=pending`;
  const lines = [
    ['Reference', d.reference], ['Guest', d.fullName], ['Hotel', d.hotelName], ['Room', d.roomLabel],
    ['Check-in', d.checkIn], ['Check-out', d.checkOut], ['Total', d.total],
  ];
  return {
    subject: `New booking awaiting approval · ${d.reference} · ${d.hotelName}`,
    text: ['A new reservation request is waiting for approval.', '', ...lines.map(([k, v]) => `${k}: ${v}`), '', `Review it: ${link}`, '', 'You receive this because you turned on new-booking alerts in Settings.'].join('\n'),
    html: `<p>A new reservation request is waiting for approval.</p><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${lines.map(([k, v]) => `<tr><td style="color:#8290a0">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table><p><a href="${esc(link)}">Review the request</a></p><p style="color:#98a2ad;font-size:12px">You receive this because you turned on new-booking alerts in Settings.</p>`,
  };
}

/** Emails admins/managers (of the booking's hotel) who switched on new-booking alerts. Never throws. */
export async function notifyStaffOfNewBooking(reservationId, {sendMail = defaultSendMail, clientUrl} = {}) {
  try {
    const {Reservation} = await import('../models/Resource.js');
    const {default: User} = await import('../models/User.js');
    const r = await Reservation.findById(reservationId)
      .populate('guestId', 'firstName lastName email')
      .populate('hotelId', 'name city country currency')
      .populate({path: 'roomId', select: 'number', populate: {path: 'roomTypeId', select: 'name'}})
      .lean();
    if (!r) return {sent: 0};
    const hotelId = r.hotelId?._id || r.hotelId;
    const people = await User.find({
      active: true, role: {$in: ['admin', 'manager']}, 'preferences.newBookingAlerts': true,
      $or: [{hotelIds: hotelId}, {role: 'admin', hotelIds: {$size: 0}}],
    }).select('email').lean();
    if (!people.length) return {sent: 0};
    const {subject, text, html} = buildStaffAlertEmail(r, {clientUrl});
    const results = await Promise.allSettled(people.map((u) => sendMail({to: u.email, subject, text, html})));
    return {sent: results.filter((x) => x.status === 'fulfilled').length};
  } catch (err) {
    console.error('[mail] Could not send new-booking alerts:', err.message);
    return {sent: 0};
  }
}
