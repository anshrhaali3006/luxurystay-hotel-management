import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBookingEmail, sendBookingEmail} from '../src/services/bookingEmails.js';

const reservation = (over = {}) => ({
  reference: 'LS-ABC123-XY12',
  checkIn: new Date('2027-03-10'),
  checkOut: new Date('2027-03-13'),
  adults: 2, children: 1, total: 45000, status: 'pending',
  guestId: {firstName: 'Ayesha', lastName: 'Khan', email: 'ayesha@example.com'},
  hotelId: {name: 'LuxuryStay Karachi', city: 'Karachi', country: 'Pakistan', currency: 'PKR', checkInTime: '14:00', checkOutTime: '12:00'},
  roomId: {number: '204', roomTypeId: {name: 'Deluxe Suite'}},
  ...over,
});

test('received email says the request is awaiting approval and includes the booking details', () => {
  const m = buildBookingEmail('received', reservation(), {clientUrl: 'http://localhost:5173'});
  assert.match(m.subject, /received your booking request/i);
  assert.match(m.subject, /LS-ABC123-XY12/);
  for (const part of ['Ayesha', 'Deluxe Suite', 'Room 204', '3 nights', '3 guests', 'PKR 45,000', 'AWAITING APPROVAL']) {
    assert.ok(m.html.includes(part) || m.text.includes(part), `missing ${part}`);
  }
  assert.match(m.text, /http:\/\/localhost:5173\/my-stays/);
});

test('confirmed email says the booking is confirmed', () => {
  const m = buildBookingEmail('confirmed', reservation({status: 'confirmed'}));
  assert.match(m.subject, /confirmed/i);
  assert.match(m.html, /CONFIRMED/);
  assert.doesNotMatch(m.html, /AWAITING APPROVAL/);
});

test('guest input is HTML-escaped in the email body', () => {
  const m = buildBookingEmail('received', reservation({guestId: {firstName: '<script>x</script>', lastName: 'K', email: 'a@b.co'}}));
  assert.ok(!m.html.includes('<script>x</script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
});

test('sendBookingEmail sends to the guest address and reports success', async () => {
  const sent = [];
  const out = await sendBookingEmail('confirmed', reservation(), {sendMail: async (m) => { sent.push(m); }});
  assert.equal(out.sent, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ayesha@example.com');
});

test('a failing mail server never throws into the booking flow', async () => {
  const out = await sendBookingEmail('received', reservation(), {sendMail: async () => { throw new Error('SMTP down'); }});
  assert.equal(out.sent, false);
});

test('no guest email means nothing is sent', async () => {
  const out = await sendBookingEmail('received', reservation({guestId: {firstName: 'A'}}), {sendMail: async () => { throw new Error('should not be called'); }});
  assert.equal(out.sent, false);
});
