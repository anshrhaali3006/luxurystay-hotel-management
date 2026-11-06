# LuxuryStay Hospitality — Hotel Management System

A student-friendly MERN application foundation for hotel operations. Uses React/Vite, Express, MongoDB/Mongoose, JWT authentication, role permissions, hotel scoping, reservations, rooms, guests, billing records, housekeeping, maintenance, service requests, feedback, notifications, and reporting endpoints.

> **Environment note:** This source was created in an environment with Node/npm but without network access or a MongoDB server. Dependencies cannot be installed and the application cannot be fully launched or integration-tested here. Run the commands below on a computer with internet access and MongoDB. The modules are implemented as a working starter, not certified production software. Review the limitations at the end.

## Requirements
- Node.js 20+ and npm
- MongoDB Community Server running locally, or a MongoDB Atlas URI

## Setup
1. Copy `.env.example` to `server/.env` (or root `.env`; server loads `server/.env` then root `.env`) and set a unique `JWT_SECRET` and MongoDB URI.
2. Install dependencies from the project root:
   ```bash
   npm install
   npm run install:all
   ```
3. Start MongoDB locally, then seed the development database:
   ```bash
   npm run seed --prefix server
   ```
4. Run both apps from the root:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:5173`. API health check: `http://localhost:5000/api/health`.

### Demo account (development seed only)
- Admin: `admin@luxurystay.local`
- Password: value of `SEED_ADMIN_PASSWORD` in `server/.env` (default shown in `.env.example`; change it before seeding).
- Seed script refuses to run in production. It upserts records to avoid duplicate seed data.

## Scripts
- `npm run dev` — start Vite and Express concurrently
- `npm run seed --prefix server` — seed sample records (development only)
- `npm test --prefix server` — run Node test suite
- `npm run build` — production frontend build

## Main API routes
All paths are prefixed with `/api`. Except health/login, routes require `Authorization: Bearer <token>`.
- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `GET /dashboard/summary`, `GET /dashboard/revenue`
- CRUD resources: `/hotels`, `/users`, `/room-types`, `/rooms`, `/guests`, `/reservations`, `/invoices`, `/payments`, `/housekeeping`, `/maintenance`, `/services`, `/feedback`, `/notifications`, `/settings`, `/audit-logs`
- Reservation operations: `GET /reservations/availability?hotelId=...&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD`, `POST /reservations/:id/check-in`, `POST /reservations/:id/check-out`, `POST /reservations/:id/cancel`
- `GET /reports/:kind?from=YYYY-MM-DD&to=YYYY-MM-DD`, `GET /reports/:kind.csv?...`

Resource routes are protected by role and hotel scope. The server validates key reservation/date and payment inputs. For multi-document operations, use a MongoDB replica set/Atlas so transactions are available.

## Project structure
```text
luxurystay-hotel-management/
  client/src/{api,components,layouts,pages,routes,utils}/
  server/src/{config,controllers,middleware,models,routes,services,validators,utils}/
  server/src/app.js
  server/src/server.js
  server/src/seed.js
```

## Production notes and limitations
- Use HTTPS, a strong secret manager, strict CORS origins, monitoring, backups, and a managed MongoDB replica set in production.
- JWTs are returned to the client and kept in session storage in this starter; consider a carefully configured HttpOnly cookie plus CSRF protection for production. Never store card numbers or CVVs. Payment entries represent staff-recorded transactions; this project does not integrate with a payment processor.
- PDF invoices are currently printable via browser print; dedicated server-generated PDFs are not included. CSV exports are provided for reports.
- The seed account is development-only. Do not enable it in production.
- Before real use, add comprehensive automated integration tests, transaction retry handling, email/SMS delivery, formal audit retention, advanced rate/availability rules, and a payment provider.


## Room photos and demo data

- Room records include an `imageUrl` field. The Rooms page lets an authenticated user choose a JPG, PNG, WEBP, or GIF image up to 5 MB; the API stores it under `server/uploads/` and saves its URL on the room record.
- The seed script is safe to re-run for this demo and adds 12 rooms with sample hotel-room photos, six additional guests, and six future sample reservations, while retaining the existing example reservation and operational records.
- To refresh/add the demo records after updating the project, stop the app and run `npm run seed --prefix server` from the project root, then start it with `npm run dev`. Existing uploaded room photos are not removed by seeding.
- Uploaded images are local development files. For a deployed production app, use object storage (for example, S3 or Cloudinary) and configure access controls and image cleanup.


## Updated CRUD forms and room photo uploads

- Rooms support up to five JPG, PNG, WEBP, or GIF photos per room (5 MB maximum per image). Photos are uploaded through the authenticated `/api/uploads/images` endpoint and saved as `imageUrls`; `imageUrl` remains for compatibility with older seeded records. Local uploaded files live in `server/uploads/` and are ignored by Git.
- Management forms now fetch existing hotel, room type, guest, room, reservation, invoice, and staff records for dropdown selection instead of requiring database IDs to be typed. Reference dropdowns show readable labels and submit the selected record ID.
- The shared resource table provides create, list/search, edit, and delete actions, with the existing reservation check-in/check-out/cancel actions retained. API permissions still apply, so delete/edit actions may be restricted by role.
- This is still a student project. Validate the workflows against your own Atlas data before demonstration; local image uploads are not suitable for multi-server production deployment without persistent object storage.


## Public guest website and role workspaces

- Public landing page is available at `/` and `/welcome`; visitors can browse and book without signing in.
- `/rooms` lets visitors choose a property and dates, check available inventory, and complete a guest booking. Booking details and a reference are saved in MongoDB.
- `/register`, `/login`, and `/my-stays` provide optional guest accounts and booking history by email. Guests can browse/book without an account; registered guests get a stay dashboard and faster prefilled booking.
- Staff workspaces live under `/workspace`. Navigation is role-filtered for admin, manager, receptionist, housekeeping, and maintenance roles. The existing admin visual design is retained; the public/guest-facing UI uses a separate luxury editorial design with depth, perspective and responsive layouts.
- No SRS document was included in the project archive used for this update. Share the SRS file if you need a traceable feature-by-feature match to the formal requirements.
- Guest booking is a reservation request/reference only; this project does not process online card payments. Validate booking, availability, role permissions and guest-history flows against your own MongoDB Atlas database before a live demo.

## Operational workflow improvements (latest update)

- Admins/managers can create housekeeping and maintenance assignments, select a staff member with the matching role, choose a room/reservation, set priority and due date, and add instructions. The selected staff account must be assigned to the same hotel.
- Housekeeping and maintenance staff now have dedicated task dashboards. The API returns only tasks assigned to the signed-in staff member; staff can start and complete/resolve their own tasks but cannot reassign or edit task details.
- Assigning a housekeeping task marks its room as `cleaning`; assigning a booking-blocking maintenance task marks its room as `maintenance`. Completing/resolving the task returns the room to `available`.
- Staff accounts can be associated with hotels in the Staff form. Assign the correct hotel(s) to housekeeping and maintenance staff before assigning work.
- Invoice totals are calculated on the server from line items, tax percentage and discount. At checkout, the system creates an invoice with room accommodation and room-chargeable services. Payments reduce the balance and update invoice status.
- Admin/reception staff can download reservation confirmations and invoices. Guests can download a reservation confirmation immediately after guest checkout; signed-in guests can download confirmations and invoices from My Stays (invoice becomes available after checkout).
- Booking search, selected room and guest details are saved as a browser-local draft. Signing in or registering in the same browser restores the booking flow; completed reservations are saved against the guest email and appear in the account's stay history when the account uses that email.

The generated PDF documents are simple printable confirmations/invoices. Online payment processing and email delivery are not included. Run the app against a development database and test role assignments, room status transitions, invoice/payment calculations and downloads before using real guest data.

## Operations and demo billing updates

- Creating a reservation now creates an invoice for the room stay. Checkout adds any charge-to-room services to that invoice without discarding recorded payments.
- Guests can open **My stays** to review invoice totals, balances, payment history, and use the clearly labelled demo checkout. Demo transactions create realistic payment references and ledger entries but do not process or move real money and never collect card details.
- Admins and managers can set invoice states (`draft`, `unpaid`, `partial`, `paid`, `void`) and update individual payment states (`succeeded`, `pending`, `failed`, `refunded`) from Billing. Invoice balances and revenue summaries are recalculated from successful payment records when a payment state changes.
- Admins and managers assign housekeeping and maintenance work from their respective workspace pages. Choose an active employee from the role-filtered staff dropdown; the selected employee ID is stored with the task. Assigned tasks appear in that employee's dashboard and can be progressed there.
- Managers have a management dashboard and property-scoped staff permissions. Receptionists have a front-desk dashboard and reservation/billing permissions. Housekeeping and maintenance users only see their own assigned work queues.
- Room types are now manageable from the workspace. Public hotel and room pages read the active hotel inventory, room types, photos, and nightly rates from the API so changes made by the hotel team are reflected on the customer website.

**Demo payment notice:** The card, bank transfer, and cash options in this project are simulated test flows only. Connect a certified payment provider and implement its server-side verification before accepting real payments.

## Latest changes: booking payment, history, and task status
- **Dummy payment at booking.** The booking page now has a payment step: demo card, demo bank transfer, or pay at hotel. Card and bank transfer create a succeeded demo payment and mark the invoice `paid`; pay at hotel leaves the invoice unpaid. Use test card `4242 4242 4242 4242`, any future expiry, any 3-digit CVV. Only the last 4 digits are stored (`Payment.cardLast4`); the full number and CVV are never sent to the server.
- **Booking history.** If a guest is signed in when they book, the booking is linked to their account (`createdBy`) and the booking email is locked to their account email, so it always appears on **My stays**. Guests who book without signing in are still matched later by email.
- **Rooms & inventory removed** from the housekeeping and maintenance sidebar and dashboards (and from the `/rooms` API for those two roles). Admin, manager, and receptionist keep it.
- **Task status.** Admin/manager can change housekeeping and maintenance status straight from the table (dropdown); staff can change their own task status from their task board. Completing a housekeeping task or resolving a maintenance request returns the room to `available` (or `occupied` if a guest is checked in); moving it back re-blocks the room.
- Fixed: the maintenance form wrongly required a room, and `blocksBooking` is now a Yes/No dropdown; the empty-state icon on the booking page was missing its import.

## Reservation approval, guest capacity and 3D UI (latest update)

**Approval workflow**
- A reservation made on the public site is now saved as **`pending`** ("awaiting approval"). It shows in **Workspace → Reservations** (tab *Awaiting approval*, with a count badge, plus a banner and stat card on the dashboard). A pending request does **not** book the room.
- An **admin or manager** clicks **Approve** → the reservation becomes `confirmed` (booked) and the room status changes to **`booked`**. **Reject** (optional reason) → status `rejected`, the room is left alone, the invoice is voided and any demo payment is refunded. Approval is refused if the dates clash with an existing booking or the room is under maintenance.
- Staff-created reservations (workspace) are confirmed immediately. Cancelling/deleting the last confirmed stay returns a `booked` room to `available`; housekeeping/maintenance completion restores `booked`/`occupied`/`available` correctly.
- New API: `POST /api/reservations/:id/approve`, `POST /api/reservations/:id/reject` (body `{reason}`), and `pendingApprovals` / `booked` in `GET /api/dashboard/summary`.
- Rooms can now be set to `booked` and edited (status field) from **Rooms & inventory**.

**Client-side room appearance follows room status** (`GET /api/public/rooms` returns `availability` for each room):
`available` → selectable · `booked` → locked "Booked" (for dates that overlap an approved stay) · `occupied` / `preparing` (dirty or cleaning) / `unavailable` (maintenance or out of service) → shown locked with the matching label.

**Guest selection uses the database.** The adults/children dropdowns are built from the largest room-type capacity of the chosen property, and `GET /api/public/rooms?guests=N` returns only rooms whose room-type capacity fits the whole party. The server also rejects a booking that exceeds the room capacity. The seed adds *Family Suite* (6) and *Presidential Suite* (8) with rooms 113–116 and one pending demo request (`LS-DEMO-PENDING`). Re-run `npm run seed --prefix server`.

**3D luxury UI** — `client/src/luxe3d.css` + `client/src/effects3d.js` (no new dependencies): parallax hero with a rotating gold armillary ring and floating glass cards, cursor-tilt cards with glare, 3D scroll reveal, tactile gold/navy buttons, glass navigation, and a deeper workspace (sidebar, stat cards, tables, modals). Respects `prefers-reduced-motion`.

Tests: `npm test --prefix server` (includes approval, capacity and room-status tests using in-memory stand-ins; no database needed).

## Staff salary, self-delete protection, guest feedback, new auth UI (latest update)
- **Salary:** `User.salary`. Only an **admin** can set/edit it (Staff form). Managers see only their own salary in the Staff table (others show *Private*); every staff member sees their own salary on their dashboard. The API strips other people's salaries for non-admins and returns 403 if a non-admin tries to set one.
- **No self-delete:** admins and managers cannot delete (or deactivate) their own account (`DELETE /api/users/:id` returns 403; the UI shows a "You" badge). Managers can only remove receptionist/housekeeping/maintenance accounts; the last active admin can't be removed. Editing a staff member no longer resets their password.
- **Guest feedback:** public page `/feedback` (also linked from My Stays and the footer). Needs the booking reference + email (pre-filled for signed-in guests; only for approved bookings, one per booking). It appears in **Guest feedback** (admin/manager/receptionist) and in a *Latest guest feedback* panel on every staff dashboard (`GET /api/feedback/recent`).
- **Sign-in / Register** were rebuilt as a 3D stage; many small UI fixes were applied (stats grid, ornaments, tables, focus states, monogram).
- Tests: `npm test --prefix server` (20 tests).

## Forgot/reset password, account settings and concierge chatbot (latest update)

**Run `npm install` in `/server` once** (adds `nodemailer`).

### Forgot and reset password
- Sign-in page → **Forgot password?** → enter email → link is emailed (valid 30 minutes, single use).
- Reset page: `/reset-password?token=…`. The token is hashed (SHA-256) in MongoDB and removed from the address bar after loading.
- The request endpoint answers identically whether or not the email exists, and is rate limited (5/hour per IP; reset attempts 10/hour).
- Resetting or changing a password signs out every older session (`passwordChangedAt` is checked against the JWT's `iat`).
- **Email setup:** set `SMTP_HOST/PORT/USER/PASS/MAIL_FROM` in `.env` (see `.env.example`). With no SMTP configured and `NODE_ENV=development`, the reset email — including the link — is printed in the server console so you can test locally.
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/change-password`, `PATCH /api/auth/profile`.

### Account settings (`/account`)
Edit name/phone and change password. Guests reach it from the portal nav; staff by clicking their avatar in the top bar.

### Concierge chatbot
Floating chat on all public/guest pages (hidden in `/workspace`). Rule-based and answers from live data: room availability and prices for dates it parses from the message ("12 dec to 15 dec for 2 guests", "tomorrow for 2 nights"), check-in/out times, amenities, how to book, payments, contact details and password help. Reservation look-ups need sign-in or the booking reference plus the booking email. It never processes cancellations or quotes policies — it directs guests to the front desk. `POST /api/chat` (20 messages/minute per IP). Logic lives in `server/src/services/chatbot.js`.

### Tests
`cd server && npm test` — includes new `password-reset.test.js` and `chatbot.test.js`.


## Booking emails

Guests receive two emails about every booking (sent to the email address on the booking):

1. **Booking received** – sent as soon as the guest submits the booking. It says the request is awaiting approval.
2. **Booking confirmed** – sent when an admin/manager approves it (or when staff save a reservation as *confirmed*).

Both show the reference, hotel, room, dates, nights, guests and total. A failed email never blocks or breaks a booking – the error is only logged.

**Setup:** fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` in `server/.env` (see `.env.example`; for Gmail use an App Password).
With `SMTP_HOST` empty (development) the emails are printed in the server console instead, so you can test the whole flow without a mail server.
Code: `server/src/services/bookingEmails.js`, tests: `server/tests/booking-emails.test.js`.

## Interface extras

* Custom gold mouse cursor (mouse only – touch devices and text fields keep the normal pointer) – `client/src/components/LuxeCursor.jsx`
* Animated welcome screen after sign-in – `client/src/components/WelcomeSplash.jsx` (click or press Esc to skip)
* 3D key-card hero and time-of-day greeting on the guest portal, greetings on the staff dashboards, magnetic buttons, page entrance motion – styles in `client/src/elegant.css`
* All animation is turned off automatically for users who prefer reduced motion.

## Settings, dark mode and staff passwords

- **Settings** (`/workspace/settings`, every staff role): Light / Dark / System theme, email opt-ins, change password, and "email me a reset link". The same cards appear on `/account` (also used by guests). A sun/moon button in the top bar toggles dark mode quickly. Dark mode covers the staff workspace and the Account page; public pages keep their light design.
- **Email opt-ins**: everyone can turn *Booking emails* off; admins and managers can turn on *New-booking alerts* (off by default).
- **Staff passwords**: passwords are stored as bcrypt hashes, so they can never be displayed. In **Staff**, an admin sees a key button on each row: it creates a temporary password (shown once, with Show/Copy), signs that person out everywhere and asks them to choose their own at next sign-in. Only admins can do this (`POST /api/users/:id/reset-password`). The staff form also has a show/hide eye on the password field while typing.
