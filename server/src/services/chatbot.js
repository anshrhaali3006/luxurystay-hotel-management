/**
 * LuxuryStay concierge chatbot — rule-based, answers from live hotel data.
 *
 * The engine is deliberately free of Express/Mongoose imports: everything it needs from the database
 * is passed in through the `data` argument, so it can be unit-tested and later swapped for an LLM
 * without touching the routes. It never invents policies — when the system has no data for a question
 * (e.g. cancellation terms) it points the guest to the front desk instead.
 */

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
export const REFERENCE_RE = /\bLS-[A-Z0-9]{4,}-[A-Z0-9]{3,}\b/i;
const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/;

/* ------------------------------ date helpers (all 'YYYY-MM-DD' strings, UTC math) ------------------------------ */
const toISO = (d) => d.toISOString().slice(0, 10);
const fromISO = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (iso, n) => { const d = fromISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
const validISO = (y, m, d) => { const dt = new Date(Date.UTC(y, m, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d ? toISO(dt) : null; };
export const nightsBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);

/** Day/month without a year means "the next time that date comes around". */
function resolveYear(day, month, today) {
  const year = Number(today.slice(0, 4));
  let iso = validISO(year, month, day);
  if (iso && iso < today) iso = validISO(year + 1, month, day);
  return iso;
}

/**
 * Pulls stay dates out of free text. Understands ISO dates, "12 dec", "dec 12th", today/tonight/tomorrow,
 * and "for 3 nights". Returns { checkIn, checkOut, nights, problem }.
 */
export function parseStay(text, today) {
  const t = ` ${String(text).toLowerCase()} `;
  const found = []; // { at, iso }
  const push = (at, iso) => { if (iso) found.push({ at, iso }); };

  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(m.index, validISO(+m[1], +m[2] - 1, +m[3]));
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`, 'g'))) push(m.index, resolveYear(+m[1], MONTHS[m[2]], today));
  for (const m of t.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g'))) push(m.index, resolveYear(+m[2], MONTHS[m[1]], today));

  let tonight = false;
  const afterTomorrow = /\bday after tomorrow\b/.exec(t);
  const tomorrow = !afterTomorrow && /\btomorrow\b/.exec(t);
  const todayWord = /\b(tonight|today)\b/.exec(t);
  if (afterTomorrow) push(afterTomorrow.index, addDays(today, 2));
  else if (tomorrow) push(tomorrow.index, addDays(today, 1));
  if (todayWord) { push(todayWord.index, today); tonight = true; }

  found.sort((a, b) => a.at - b.at);
  const unique = [...new Set(found.map((f) => f.iso))];
  const nightsMatch = /\b(\d{1,2}|a|one|two|three|four|five|six|seven)\s*nights?\b/.exec(t);
  const words = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const nights = nightsMatch ? (words[nightsMatch[1]] ?? Number(nightsMatch[1])) : null;

  let checkIn = unique[0] || null;
  let checkOut = unique[1] || null;
  if (checkIn && !checkOut) checkOut = addDays(checkIn, nights || 1);
  if (!checkIn) return { checkIn: null, checkOut: null, nights, problem: null };
  if (checkIn < today) return { checkIn: null, checkOut: null, nights, problem: 'Those dates are in the past — which upcoming dates did you have in mind?' };
  if (checkOut <= checkIn) return { checkIn: null, checkOut: null, nights, problem: 'Check-out needs to be after check-in. Could you give me the dates again?' };
  return { checkIn, checkOut, nights: nightsBetween(checkIn, checkOut), problem: null, tonight };
}

export function parseGuests(text) {
  const t = String(text).toLowerCase();
  const m = /\b(\d{1,2})\s*(?:guests?|people|persons?|adults?|pax|ppl)\b/.exec(t)
    || /\b(?:family|party|group) of (\d{1,2})\b/.exec(t)
    || /\bfor (\d{1,2})\b(?!\s*(?:nights?|days?))/.exec(t);
  const n = m ? Number(m[1]) : null;
  return n && n >= 1 && n <= 20 ? n : null;
}

/* ------------------------------ intent detection ------------------------------ */
const RULES = [
  ['greeting', /^\s*(hi|hello|hey|hiya|salam|assalam[a-z\s-]*|good (morning|afternoon|evening))\b[\s!.,]*(there|team|concierge)?[\s!.]*$/i],
  ['thanks', /\b(thanks|thank you|thx|shukriya|much appreciated)\b/i],
  ['bye', /^\s*(bye|goodbye|see you|that'?s all|nothing else)\b/i],
  ['password', /\b(forgot|forget|reset|lost|change|recover)\b.*\bpassword\b|\bpassword\b.*\b(reset|forgot|change)\b|\bcan'?t (log ?in|sign ?in)\b|\b(login|sign ?in) (problem|issue|trouble)\b/i],
  ['cancellation', /\b(cancel|refund|reschedule|amend|modify)\b|\bchange (my|the|our) (dates?|booking|reservation)\b/i],
  ['myBookings', /\b(my|our)\s+(bookings?|reservations?|stays?|trips?)\b|\b(booking|reservation) status\b|\bstatus of (my|the)\b|\bwhere is my (booking|reservation)\b/i],
  ['checkTimes', /\b(check[- ]?in|check[- ]?out|arrival|departure)\b.*\b(time|times|when|hour|hours|early|late)\b|\bwhat time\b.*\b(check|arriv|leave)|\b(early|late) (check|arrival|departure)/i],
  ['payment', /\b(pay|payment|payments|invoice|bill|billing|receipt|card)\b/i],
  ['services', /\b(room service|laundry|wake[- ]?up|transport|airport|taxi|pick[- ]?up|housekeeping|extra (towels?|pillows?)|concierge)\b/i],
  ['contact', /\b(human|real person|agent|speak to|talk to|someone|call|phone|contact|email|reach|support|front desk|reception|manager)\b/i],
  ['howToBook', /\bhow (do|can|to)\b.*\b(book|reserve|reservation)\b|\bmake a (booking|reservation)\b|\bbooking process\b/i],
  ['amenities', /\b(amenit|facilit|wi-?fi|parking|breakfast|pool|gym|spa|air ?con|\bac\b|tv|minibar|balcony)\w*/i],
  ['feedback', /\b(feedback|review|complain\w*|suggestion|rate (us|my stay))\b/i],
  ['rooms', /\b(rooms?|suites?|availab\w*|vacan\w*|price|prices|rate|rates|cost|how much|cheap\w*|tariff|per night|book(ing)?|reserve|stay)\b/i],
  ['hotels', /\b(where|location|locations|address|city|cities|branch\w*|propert\w*|hotels?)\b/i],
  ['help', /^\s*(help|menu|options|what can you do|commands?)\b/i],
];

export function detectIntent(text) {
  const t = String(text || '').trim();
  if (!t) return 'empty';
  if (REFERENCE_RE.test(t)) return /\b(cancel|refund|reschedule|amend|modify)\b/i.test(t) ? 'cancellation' : 'lookup';
  for (const [intent, re] of RULES) if (re.test(t)) return intent;
  return 'fallback';
}

/* ------------------------------ formatting helpers ------------------------------ */
const money = (n, currency = 'PKR') => new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n) || 0);
const prettyDate = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const STATUS_TEXT = {
  pending: 'awaiting approval from our team — you’ll be confirmed as soon as it’s reviewed',
  confirmed: 'confirmed',
  checked_in: 'checked in',
  checked_out: 'checked out',
  cancelled: 'cancelled',
  rejected: 'not accepted',
  no_show: 'marked as a no-show',
};
const DEFAULT_SUGGESTIONS = ['Check room availability', 'Check-in & check-out times', 'How do I book?', 'Contact the front desk'];

const out = (reply, { suggestions = DEFAULT_SUGGESTIONS, actions = [], intent = 'fallback' } = {}) => ({ reply, suggestions, actions, intent });

function contactLines(hotel) {
  if (!hotel) return 'our front desk';
  const bits = [hotel.phone && `phone ${hotel.phone}`, hotel.email && `email ${hotel.email}`].filter(Boolean);
  return bits.length ? `${hotel.name} (${bits.join(', ')})` : hotel.name;
}

/** Choose which property the guest means: by name/city in the message, otherwise the only one, otherwise ask. */
export function pickHotel(text, hotels, hintId) {
  if (!hotels.length) return { hotel: null };
  const t = String(text).toLowerCase();
  const byText = hotels.filter((h) => (h.name && t.includes(h.name.toLowerCase())) || (h.city && t.includes(h.city.toLowerCase())) || (h.code && new RegExp(`\\b${h.code.toLowerCase()}\\b`).test(t)));
  if (byText.length === 1) return { hotel: byText[0] };
  if (hintId) { const h = hotels.find((x) => String(x._id) === String(hintId)); if (h) return { hotel: h }; }
  if (hotels.length === 1) return { hotel: hotels[0] };
  return { hotel: null, ambiguous: true };
}

/* ------------------------------ main entry ------------------------------ */
/**
 * @param {object} p
 * @param {string} p.text         guest message
 * @param {object|null} p.user    authenticated user (or null)
 * @param {string} p.today        'YYYY-MM-DD' in the hotel's timezone
 * @param {string} [p.hotelId]    hotel the UI already knows about
 * @param {object} p.data         { listHotels, listRoomTypes, availableRooms, guestBookings, bookingByReference }
 */
export async function reply({ text, user = null, today, hotelId, data }) {
  const intent = detectIntent(text);
  const hotels = await data.listHotels();
  const { hotel, ambiguous } = pickHotel(text, hotels, hotelId);
  const hotelNames = hotels.map((h) => h.name);

  switch (intent) {
    case 'empty':
      return out('Say something and I’ll do my best to help — for example, “Is a room free this weekend?”', { intent });

    case 'greeting':
      return out(`Hello${user?.name ? `, ${user.name.split(' ')[0]}` : ''}! I’m the LuxuryStay concierge. I can check room availability and prices, explain how booking works, look up your reservation, or put you in touch with the front desk. What would you like to do?`, { intent });

    case 'thanks':
      return out('You’re very welcome! Is there anything else I can help with?', { intent });

    case 'bye':
      return out('Thank you for chatting with LuxuryStay — we hope to welcome you soon. 🌙', { suggestions: [], intent });

    case 'help':
      return out('Here’s what I can help with:\n• Room availability and prices for your dates\n• Check-in / check-out times\n• How to book, pay and get your invoice\n• Looking up your reservation\n• Password help and contacting the front desk', { intent });

    case 'password':
      return out('You can reset your password yourself: open “Forgot password?” on the sign-in page, enter your email, and we’ll send a link that works for 30 minutes. If you’re already signed in, you can change it from your Account page.', {
        actions: [{ label: 'Reset my password', to: '/forgot-password' }, ...(user ? [{ label: 'Account settings', to: '/account' }] : [])], suggestions: ['Contact the front desk', 'Check room availability'], intent });

    case 'checkTimes': {
      if (!hotel) return out(ambiguous ? `Which property do you mean? ${hotelNames.join(', ')}.` : 'Standard check-in is 14:00 and check-out is 11:00.', { suggestions: hotelNames.slice(0, 4), intent });
      return out(`At ${hotel.name}, check-in is from ${hotel.checkInTime || '14:00'} and check-out is by ${hotel.checkOutTime || '11:00'}. Early check-in or late check-out can’t be guaranteed in chat — please ask the front desk (${contactLines(hotel)}) and they’ll do their best.`, { suggestions: ['Check room availability', 'Contact the front desk'], intent });
    }

    case 'cancellation':
      return out(`I can’t change or cancel a reservation from here, and I don’t want to quote a refund policy I can’t see. Please contact ${contactLines(hotel || hotels[0])} with your booking reference and they’ll help. You can find the reference under “My stays”.`, {
        actions: [{ label: 'My stays', to: '/my-stays' }], suggestions: ['Look up my booking', 'Contact the front desk'], intent });

    case 'payment':
      return out('Your invoice, balance and payment history are under “My stays”, and you can download a PDF invoice there. Note that online payments on this site are a demo — no real money moves — so please settle your final bill with the front desk.', {
        actions: [{ label: 'Open My stays', to: '/my-stays' }], suggestions: ['Look up my booking', 'Contact the front desk'], intent });

    case 'contact': {
      const lines = hotels.map((h) => `• ${h.name}${h.city ? `, ${h.city}` : ''}${h.phone ? ` — ${h.phone}` : ''}${h.email ? ` — ${h.email}` : ''}`);
      return out(lines.length ? `You can reach our teams here:\n${lines.join('\n')}\n\nA team member can help with anything I can’t.` : 'Please contact the front desk at your property — a team member will be glad to help.', { suggestions: ['Check room availability', 'How do I book?'], intent });
    }

    case 'howToBook':
      return out('Booking takes a minute:\n1. Choose a property and your dates.\n2. Pick an available room.\n3. Enter your contact details and send the request.\n\nYou don’t need an account, but signing in keeps your bookings in “My stays”. Online requests are reviewed by our team, so a new booking shows as “awaiting approval” until it’s confirmed.', {
        actions: [{ label: 'Find a room', to: '/rooms' }], suggestions: ['Check room availability', 'Contact the front desk'], intent });

    case 'services':
      return out('Our team can help with room service, laundry, wake-up calls, transport and extra amenities during your stay — just ask the front desk or your housekeeping contact. For anything time-sensitive, calling reception is quickest.', { suggestions: ['Contact the front desk', 'Check room availability'], intent });

    case 'amenities': {
      const types = await data.listRoomTypes(hotel?._id);
      const list = [...new Set(types.flatMap((t) => t.amenities || []).map((a) => String(a).trim()).filter(Boolean))];
      if (!list.length) return out('I don’t have a detailed amenity list on file. The front desk can confirm exactly what’s included — would you like their contact details?', { suggestions: ['Contact the front desk', 'Check room availability'], intent });
      return out(`Across our room categories${hotel ? ` at ${hotel.name}` : ''} you’ll find: ${list.slice(0, 12).join(', ')}. Amenities vary by room type, so check the room you’re interested in.`, { actions: [{ label: 'Browse rooms', to: '/rooms' }], suggestions: ['Check room availability', 'Contact the front desk'], intent });
    }

    case 'hotels': {
      if (!hotels.length) return out('I can’t see any properties right now — please try again shortly or contact the front desk.', { intent });
      const lines = hotels.map((h) => `• ${h.name}${h.city ? ` — ${[h.address, h.city, h.country].filter(Boolean).join(', ')}` : ''}`);
      return out(`Our properties:\n${lines.join('\n')}`, { suggestions: hotelNames.slice(0, 3).map((n) => `Rooms at ${n}`), actions: [{ label: 'Explore stays', to: '/rooms' }], intent });
    }

    case 'feedback':
      return out('We’d love to hear about your stay — you can leave feedback in under a minute.', { actions: [{ label: 'Leave feedback', to: '/feedback' }], suggestions: ['Contact the front desk'], intent });

    case 'myBookings':
      return handleBookings({ user, data, intent });

    case 'lookup':
      return handleLookup({ text, user, data, intent });

    case 'rooms':
      return handleRooms({ text, today, hotel, hotels, ambiguous, data, intent });

    default:
      return out('I’m not sure I understood that, but I can help with room availability and prices, check-in times, booking, your reservation, or reaching the front desk. Which of those would you like?', { intent: 'fallback' });
  }
}

/* ------------------------------ data-backed handlers ------------------------------ */
async function handleRooms({ text, today, hotel, hotels, ambiguous, data, intent }) {
  if (!hotel) {
    return out(ambiguous ? `Which property would you like to stay at? ${hotels.map((h) => h.name).join(', ')}.` : 'I can’t see any bookable properties right now — please try again shortly.', { suggestions: hotels.slice(0, 4).map((h) => `Rooms at ${h.name}`), intent });
  }
  const stay = parseStay(text, today);
  if (stay.problem) return out(stay.problem, { suggestions: ['Tonight', 'Tomorrow for 2 nights'], intent });
  const guests = parseGuests(text);
  const rooms = await data.availableRooms({ hotelId: hotel._id, checkIn: stay.checkIn, checkOut: stay.checkOut, guests });
  const when = stay.checkIn ? `${prettyDate(stay.checkIn)} → ${prettyDate(stay.checkOut)} (${plural(stay.nights, 'night')})` : 'right now';
  const query = new URLSearchParams({ hotelId: String(hotel._id), ...(stay.checkIn ? { checkIn: stay.checkIn, checkOut: stay.checkOut } : {}), ...(guests ? { adults: String(guests) } : {}) });
  const actions = [{ label: 'View & book', to: `/rooms?${query}` }];

  if (!rooms.length) {
    return out(`I couldn’t find a free room at ${hotel.name} for ${when}${guests ? ` for ${plural(guests, 'guest')}` : ''}. Try different dates or a smaller party — or ask the front desk about waitlists.`, { actions: [{ label: 'Try other dates', to: '/rooms' }], suggestions: ['Tomorrow for 2 nights', 'Contact the front desk'], intent });
  }

  const groups = new Map();
  for (const r of rooms) {
    const rt = r.roomTypeId || {};
    const key = String(rt._id || rt.name);
    const g = groups.get(key) || { name: rt.name || 'Room', rate: rt.baseRate || 0, capacity: rt.capacity || 2, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => a.rate - b.rate);
  const lines = list.slice(0, 5).map((g) => {
    const total = stay.nights ? ` · ${money(g.rate * stay.nights, hotel.currency)} for ${plural(stay.nights, 'night')}` : '';
    return `• ${g.name} (sleeps ${g.capacity}) — ${money(g.rate, hotel.currency)}/night${total} · ${g.count} available`;
  });
  return out(`Good news — ${hotel.name} has availability for ${when}${guests ? `, ${plural(guests, 'guest')}` : ''}:\n${lines.join('\n')}${stay.checkIn ? '' : '\n\nTell me your dates (e.g. “12 dec to 15 dec for 2 guests”) and I’ll check exactly.'}`, { actions, suggestions: ['How do I book?', 'Check-in & check-out times', 'Contact the front desk'], intent });
}

async function handleBookings({ user, data, intent }) {
  if (!user) return out('To see your reservations, please sign in first — or send me your booking reference (it looks like LS-XXXX-XXXX) together with the email you booked with.', { actions: [{ label: 'Sign in', to: '/login' }], suggestions: ['How do I book?', 'Contact the front desk'], intent });
  if (user.role !== 'guest') return out('Reservation look-ups here are for guest accounts. As a team member, you’ll find reservations in the workspace.', { actions: [{ label: 'Open workspace', to: '/workspace' }], suggestions: [], intent });
  const rows = await data.guestBookings(user);
  if (!rows.length) return out('I can’t find any reservations linked to your account email yet. If you booked as a guest with a different email, send me the booking reference and that email.', { actions: [{ label: 'Find a room', to: '/rooms' }], suggestions: ['How do I book?'], intent });
  const lines = rows.map((r) => `• ${r.reference} — ${r.hotelId?.name || 'LuxuryStay'}, ${prettyDate(r.checkIn)} → ${prettyDate(r.checkOut)}: ${STATUS_TEXT[r.status] || r.status}`);
  return out(`Here are your latest reservations:\n${lines.join('\n')}`, { actions: [{ label: 'Open My stays', to: '/my-stays' }], suggestions: ['Check-in & check-out times', 'Contact the front desk'], intent });
}

async function handleLookup({ text, user, data, intent }) {
  const reference = REFERENCE_RE.exec(text)[0].toUpperCase();
  const email = (EMAIL_RE.exec(text) || [])[0]?.toLowerCase();
  const booking = await data.bookingByReference(reference);
  const ownsIt = booking && user?.role === 'guest' && (String(booking.createdBy) === String(user._id) || (booking.guestId?.email && booking.guestId.email.toLowerCase() === user.email.toLowerCase()));
  const emailMatches = booking && email && booking.guestId?.email && booking.guestId.email.toLowerCase() === email;
  if (!booking || !(ownsIt || emailMatches)) {
    // Same answer for "doesn't exist" and "isn't yours" so references can't be probed.
    return out(user || email
      ? 'I couldn’t find a reservation with that reference and email. Please double-check both, or contact the front desk.'
      : `I can look up ${reference}, but I need to verify it’s yours — please sign in, or send the reference again together with the email address you booked with.`, {
      actions: user ? [] : [{ label: 'Sign in', to: '/login' }], suggestions: ['Contact the front desk'], intent });
  }
  const room = booking.roomId?.roomTypeId?.name ? `${booking.roomId.roomTypeId.name}${booking.roomId.number ? `, room ${booking.roomId.number}` : ''}` : 'your room';
  return out(`Reservation ${booking.reference} at ${booking.hotelId?.name || 'LuxuryStay'}: ${room}, ${prettyDate(booking.checkIn)} → ${prettyDate(booking.checkOut)}. Status: ${STATUS_TEXT[booking.status] || booking.status}.`, {
    actions: user ? [{ label: 'Open My stays', to: '/my-stays' }] : [], suggestions: ['Check-in & check-out times', 'Contact the front desk'], intent });
}
