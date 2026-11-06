import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import os from 'node:os';
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import HotelModel from "../models/Hotel.js";
import {
  RoomType,
  Room,
  Guest,
  Reservation,
  Invoice,
  Payment,
  Housekeeping,
  Maintenance,
  Service,
  Feedback,
  Notification,
  AuditLog,
  Setting,
} from "../models/Resource.js";
import {
  login,
  me,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  updatePreferences,
} from "../controllers/authController.js";
import {
  listResource,
  createResource,
  updateResource,
  deleteResource,
} from "../controllers/resourceController.js";
import {
  summary,
  checkIn,
  cancelReservation,
  payment,
  demoPayment,
  updateInvoiceStatus,
  updatePaymentStatus,
  report,
} from "../controllers/operationsController.js";
import {
  authenticate,
  optionalAuth,
  allowRoles,
  hotelScope,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  loginSchema,
  reservationSchema,
  paymentSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  profileSchema,
  chatSchema,
  preferencesSchema,
  adminResetPasswordSchema,
} from "../validators/schemas.js";
import { chatHandler } from "../controllers/chatController.js";
import {
  createReservation,
  findAvailableRooms,
  checkoutReservation,
  publicRoomCatalog,
  approveReservation,
  rejectReservation,
  syncRoomBooking,
} from "../services/reservations.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { makePdf } from "../utils/pdf.js";
import {
  sendBookingReceivedEmail,
  notifyStaffOfNewBooking,
} from "../services/bookingEmails.js";
import { generateTempPassword } from "../utils/tempPassword.js";
const router = Router();
const guestBookingFilter = async (req) => {
  const ids = await Guest.find({ email: req.user.email }).distinct("_id");
  return { $or: [{ guestId: { $in: ids } }, { createdBy: req.user._id }] };
};
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(here, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
      }[file.mimetype];
      cb(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext || ".img"}`,
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.mimetype,
      ),
    ),
});
router.post("/auth/login", validateBody(loginSchema), login);
router.post(
  "/auth/forgot-password",
  validateBody(forgotPasswordSchema),
  forgotPassword,
);
router.post(
  "/auth/reset-password",
  validateBody(resetPasswordSchema),
  resetPassword,
);
router.post("/chat", optionalAuth, validateBody(chatSchema), chatHandler);
router.post(
  "/auth/register",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim(),
      email = String(req.body.email || "")
        .trim()
        .toLowerCase(),
      password = String(req.body.password || ""),
      phone = String(req.body.phone || "").trim();
    if (
      name.length < 2 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      password.length < 10
    )
      throw new AppError(
        "Enter your name, a valid email, and a password of at least 10 characters",
        400,
      );
    if (await User.exists({ email }))
      throw new AppError("An account with this email already exists", 409);
    const user = await User.create({
      name,
      email,
      phone,
      role: "guest",
      hotelIds: [],
      passwordHash: await bcrypt.hash(password, 12),
    });
    const token = (await import("jsonwebtoken")).default.sign(
      { sub: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );
    res
      .status(201)
      .json({
        success: true,
        data: {
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            hotelIds: user.hotelIds,
          },
        },
      });
  }),
);
router.get(
  "/public/hotels",
  asyncHandler(async (req, res) => {
    const hotels = await HotelModel.find({ active: true })
      .select(
        "name code city country address currency checkInTime checkOutTime",
      )
      .sort({ name: 1 })
      .lean();
    const caps = await RoomType.aggregate([
      { $match: { hotelId: { $in: hotels.map((h) => h._id) } } },
      { $group: { _id: "$hotelId", maxCapacity: { $max: "$capacity" } } },
    ]);
    const byHotel = Object.fromEntries(
      caps.map((c) => [String(c._id), c.maxCapacity]),
    );
    const data = hotels.map((h) => ({
      ...h,
      maxCapacity: byHotel[String(h._id)] || 2,
    }));
    res.json({ success: true, data });
  }),
);
router.get(
  "/public/rooms",
  asyncHandler(async (req, res) => {
    const { hotelId, checkIn, checkOut, guests, availableOnly } = req.query;
    if (!hotelId) throw new AppError("Choose a hotel first", 400);
    const hotel = await HotelModel.findOne({ _id: hotelId, active: true });
    if (!hotel) throw new AppError("Hotel not found", 404);
    if (
      (checkIn || checkOut) &&
      (!checkIn || !checkOut || new Date(checkOut) <= new Date(checkIn))
    )
      throw new AppError("Choose valid check-in and check-out dates", 400);
    const rooms = await publicRoomCatalog({
      hotelId,
      checkIn,
      checkOut,
      guests,
      availableOnly: availableOnly === "true",
    });
    res.json({ success: true, data: rooms });
  }),
);
router.get(
  "/public/bookings/:id/confirmation.pdf",
  asyncHandler(async (req, res) => {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();
    if (!email) throw new AppError("Booking email is required", 400);
    const guest = await Guest.findOne({ email });
    if (!guest) throw new AppError("Reservation not found", 404);
    const r = await Reservation.findOne({
      _id: req.params.id,
      guestId: guest._id,
    })
      .populate("guestId")
      .populate("roomId")
      .populate("hotelId");
    if (!r) throw new AppError("Reservation not found", 404);
    const pdf = makePdf(
      r.status === "pending"
        ? "Reservation request (awaiting approval)"
        : "Reservation confirmation",
      [
        `Reference: ${r.reference}`,
        `Guest: ${r.guestId?.firstName || ""} ${r.guestId?.lastName || ""}`,
        `Hotel: ${r.hotelId?.name || "LuxuryStay"}`,
        `Room: ${r.roomId?.number || ""}`,
        `Check-in: ${new Date(r.checkIn).toDateString()}`,
        `Check-out: ${new Date(r.checkOut).toDateString()}`,
        `Status: ${r.status}`,
        `Total: ${r.total}`,
      ],
    );
    res
      .type("application/pdf")
      .attachment(`reservation-${r.reference}.pdf`)
      .send(pdf);
  }),
);
router.post(
  "/public/bookings",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const {
      hotelId,
      roomId,
      firstName,
      lastName,
      email,
      phone,
      checkIn,
      checkOut,
      adults = 1,
      children = 0,
      notes = "",
    } = req.body;
    const isGuestUser = req.user?.role === "guest";
    const cleanEmail = String(isGuestUser ? req.user.email : email || "")
      .trim()
      .toLowerCase();
    if (
      !hotelId ||
      !roomId ||
      String(firstName || "").trim().length < 2 ||
      String(lastName || "").trim().length < 2 ||
      !/^\S+@\S+\.\S+$/.test(cleanEmail)
    )
      throw new AppError(
        "Please provide your contact details and select a room",
        400,
      );
    const inDate = new Date(checkIn),
      outDate = new Date(checkOut);
    if (
      !checkIn ||
      !checkOut ||
      Number.isNaN(+inDate) ||
      Number.isNaN(+outDate) ||
      outDate <= inDate ||
      inDate < new Date(new Date().toDateString())
    )
      throw new AppError(
        "Choose valid future check-in and check-out dates",
        400,
      );
    const hotel = await HotelModel.findOne({ _id: hotelId, active: true });
    if (!hotel) throw new AppError("Selected hotel is unavailable", 404);
    const room = await Room.findOne({ _id: roomId, hotelId }).populate(
      "roomTypeId",
    );
    if (
      !room ||
      ["maintenance", "out_of_service", "dirty", "cleaning"].includes(
        room.status,
      )
    )
      throw new AppError("This room is currently unavailable", 409);
    let guest = await Guest.findOne({ hotelId, email: cleanEmail });
    if (guest) {
      guest.firstName = String(firstName).trim();
      guest.lastName = String(lastName).trim();
      guest.phone = phone || guest.phone;
      await guest.save();
    } else
      guest = await Guest.create({
        hotelId,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: cleanEmail,
        phone,
      });
    const reservation = await createReservation(
      {
        hotelId,
        guestId: String(guest._id),
        roomId,
        checkIn: inDate,
        checkOut: outDate,
        adults: Math.max(1, Number(adults) || 1),
        children: Math.max(0, Number(children) || 0),
        nightlyRate: Number(room.roomTypeId?.baseRate) || 0,
        notes: String(notes || "").slice(0, 2000),
      },
      isGuestUser ? req.user : null,
      { status: "pending" },
    );
    await Notification.create({
      hotelId,
      title: "New reservation awaiting approval",
      message: `${String(firstName).trim()} ${String(lastName).trim()} requested Room ${room.number} (${reservation.reference}).`,
      type: "reservation",
      href: "/workspace/reservations?status=pending",
    }).catch(() => {});
    const payChoice = ["card", "bank_transfer"].includes(req.body.paymentMethod)
      ? req.body.paymentMethod
      : "pay_at_hotel";
    let payment = null;
    if (payChoice !== "pay_at_hotel") {
      const invoice = await Invoice.findOne({ reservationId: reservation._id });
      if (invoice && invoice.balance > 0) {
        const last4 =
          payChoice === "card"
            ? String(req.body.cardLast4 || "")
                .replace(/\D/g, "")
                .slice(-4)
            : "";
        payment = await Payment.create({
          hotelId,
          invoiceId: invoice._id,
          amount: invoice.balance,
          method: payChoice === "card" ? "card_terminal" : "bank_transfer",
          status: "succeeded",
          reference: `DEMO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          demo: true,
          ...(last4.length === 4 ? { cardLast4: last4 } : {}),
        });
        invoice.balance = 0;
        invoice.status = "paid";
        await invoice.save();
      }
    }
    sendBookingReceivedEmail(reservation._id); // email the guest: request received, awaiting approval
    notifyStaffOfNewBooking(reservation._id); // email admins/managers who opted in to new-booking alerts
    const populated = await Reservation.findById(reservation._id)
      .populate("guestId", "firstName lastName email")
      .populate({
        path: "roomId",
        select: "number imageUrl imageUrls",
        populate: { path: "roomTypeId", select: "name baseRate" },
      });
    res
      .status(201)
      .json({
        success: true,
        data: {
          ...populated.toObject(),
          paymentMethod: payChoice,
          payment: payment
            ? {
                reference: payment.reference,
                method: payment.method,
                amount: payment.amount,
                cardLast4: payment.cardLast4 || null,
              }
            : null,
        },
        message:
          "Your reservation request was received and is waiting for approval. Save the reference for your records.",
      });
  }),
);
router.post(
  "/public/feedback",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const reference = String(req.body.reference || "")
      .trim()
      .toUpperCase();
    const isGuestUser = req.user?.role === "guest";
    const email = String((isGuestUser ? req.user.email : req.body.email) || "")
      .trim()
      .toLowerCase();
    const rating = Number(req.body.rating);
    const category = [
      "stay",
      "service",
      "cleanliness",
      "dining",
      "facilities",
      "other",
    ].includes(req.body.category)
      ? req.body.category
      : "stay";
    const comment = String(req.body.comment || "")
      .trim()
      .slice(0, 2000);
    if (!reference || !/^\S+@\S+\.\S+$/.test(email))
      throw new AppError(
        "Enter your booking reference and the email used for the booking",
        400,
      );
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new AppError("Choose a rating from 1 to 5 stars", 400);
    if (comment.length < 3)
      throw new AppError("Please tell us a little about your stay", 400);
    const reservation = await Reservation.findOne({ reference }).populate(
      "guestId",
    );
    if (
      !reservation ||
      String(reservation.guestId?.email || "").toLowerCase() !== email
    )
      throw new AppError(
        "We could not find a booking with that reference and email",
        404,
      );
    if (
      ["pending", "rejected", "cancelled", "no_show"].includes(
        reservation.status,
      )
    )
      throw new AppError(
        "Feedback can be left once your booking has been approved",
        409,
      );
    if (await Feedback.exists({ reservationId: reservation._id }))
      throw new AppError(
        "Feedback for this booking has already been received. Thank you!",
        409,
      );
    const data = await Feedback.create({
      hotelId: reservation.hotelId,
      guestId: reservation.guestId._id,
      reservationId: reservation._id,
      rating,
      category,
      comment,
      public: false,
    });
    await Notification.create({
      hotelId: reservation.hotelId,
      title: "New guest feedback",
      message: `${reservation.guestId.firstName} ${reservation.guestId.lastName} left ${rating}/5 for ${reservation.reference}.`,
      type: "feedback",
      href: "/workspace",
    }).catch(() => {});
    res
      .status(201)
      .json({
        success: true,
        data: { _id: data._id, rating: data.rating },
        message: "Thank you — your feedback has been shared with our team.",
      });
  }),
);
router.use(authenticate);
router.post(
  "/uploads/images",
  imageUpload.array("images", 5),
  asyncHandler(async (req, res) => {
    if (!req.files?.length)
      throw new AppError(
        "Choose up to 5 JPG, PNG, WEBP, or GIF images under 5 MB each",
        400,
      );
    res
      .status(201)
      .json({
        success: true,
        data: { urls: req.files.map((file) => `/uploads/${file.filename}`) },
      });
  }),
);
router.get("/auth/me", me);
router.post("/auth/logout", logout);
router.post(
  "/auth/change-password",
  validateBody(changePasswordSchema),
  changePassword,
);
router.patch("/auth/profile", validateBody(profileSchema), updateProfile);
router.patch(
  "/auth/preferences",
  validateBody(preferencesSchema),
  updatePreferences,
);
router.get(
  "/guest/bookings/:id/billing",
  allowRoles("guest"),
  asyncHandler(async (req, res) => {
    const booking = await Reservation.findOne({
      _id: req.params.id,
      ...(await guestBookingFilter(req)),
    });
    if (!booking) throw new AppError("Reservation not found", 404);
    let invoice = await Invoice.findOne({
      reservationId: booking._id,
    }).populate("reservationId", "reference");
    if (!invoice) {
      const nights = Math.max(
        1,
        Math.ceil((booking.checkOut - booking.checkIn) / 86400000),
      );
      const total = Number((nights * booking.nightlyRate).toFixed(2));
      invoice = await Invoice.create({
        hotelId: booking.hotelId,
        reservationId: booking._id,
        number: `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        items: [
          {
            description: "Room accommodation",
            quantity: nights,
            unitPrice: booking.nightlyRate,
            total,
          },
        ],
        subtotal: total,
        total,
        balance: total,
        status: "unpaid",
      });
      invoice.reservationId = booking;
    }
    const payments = await Payment.find({
      invoiceId: invoice._id,
      status: { $ne: "failed" },
    })
      .sort({ receivedAt: -1 })
      .select("amount method status reference demo receivedAt");
    res.json({ success: true, data: { invoice, payments } });
  }),
);
router.post(
  "/guest/bookings/:id/payments",
  allowRoles("guest"),
  asyncHandler(async (req, res) => {
    const booking = await Reservation.findOne({
      _id: req.params.id,
      ...(await guestBookingFilter(req)),
    });
    if (!booking) throw new AppError("Reservation not found", 404);
    const invoice = await Invoice.findOne({ reservationId: booking._id });
    if (!invoice || invoice.balance <= 0 || invoice.status === "void")
      throw new AppError("There is no outstanding balance for this stay", 409);
    const amount = Number(req.body.amount ?? invoice.balance);
    if (!Number.isFinite(amount) || amount <= 0 || amount > invoice.balance)
      throw new AppError("Invalid payment amount", 400);
    const method = ["card_terminal", "bank_transfer", "cash"].includes(
      req.body.method,
    )
      ? req.body.method
      : "card_terminal";
    const reference = `DEMO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const record = await Payment.create({
      hotelId: booking.hotelId,
      invoiceId: invoice._id,
      amount,
      method,
      status: "succeeded",
      reference,
      demo: true,
    });
    invoice.balance = Number(Math.max(0, invoice.balance - amount).toFixed(2));
    invoice.status = invoice.balance === 0 ? "paid" : "partial";
    await invoice.save();
    res
      .status(201)
      .json({
        success: true,
        data: { payment: record, invoice },
        message: "Demo payment completed. No real money was moved.",
      });
  }),
);
router.get(
  "/guest/bookings",
  allowRoles("guest"),
  asyncHandler(async (req, res) => {
    const data = await Reservation.find(await guestBookingFilter(req))
      .sort({ createdAt: -1 })
      .populate("guestId", "firstName lastName email")
      .populate({
        path: "roomId",
        select: "number imageUrl imageUrls",
        populate: { path: "roomTypeId", select: "name baseRate" },
      })
      .populate("hotelId", "name city country");
    res.json({ success: true, data });
  }),
);
router.get(
  "/guest/bookings/:id/confirmation.pdf",
  allowRoles("guest"),
  asyncHandler(async (req, res) => {
    const r = await Reservation.findOne({
      _id: req.params.id,
      ...(await guestBookingFilter(req)),
    })
      .populate("guestId")
      .populate("roomId")
      .populate("hotelId");
    if (!r) throw new AppError("Reservation not found", 404);
    const pdf = makePdf(
      r.status === "pending"
        ? "Reservation request (awaiting approval)"
        : "Reservation confirmation",
      [
        `Reference: ${r.reference}`,
        `Guest: ${r.guestId?.firstName || ""} ${r.guestId?.lastName || ""}`,
        `Hotel: ${r.hotelId?.name || "LuxuryStay"}`,
        `Room: ${r.roomId?.number || ""}`,
        `Check-in: ${new Date(r.checkIn).toDateString()}`,
        `Check-out: ${new Date(r.checkOut).toDateString()}`,
        `Status: ${r.status}`,
        `Total: ${r.total}`,
      ],
    );
    res
      .type("application/pdf")
      .attachment(`reservation-${r.reference}.pdf`)
      .send(pdf);
  }),
);
router.get(
  "/guest/bookings/:id/invoice.pdf",
  allowRoles("guest"),
  asyncHandler(async (req, res) => {
    const r = await Reservation.findOne({
      _id: req.params.id,
      ...(await guestBookingFilter(req)),
    });
    if (!r) throw new AppError("Reservation not found", 404);
    const inv = await Invoice.findOne({ reservationId: r._id });
    if (!inv) throw new AppError("Invoice is not available yet", 404);
    const pdf = makePdf("Guest invoice", [
      `Invoice: ${inv.number}`,
      `Reservation: ${r.reference}`,
      `Room accommodation: ${inv.subtotal}`,
      `Tax: ${inv.taxRate}%`,
      `Discount: ${inv.discount}`,
      `Total: ${inv.total}`,
      `Paid: ${inv.total - inv.balance}`,
      `Balance due: ${inv.balance}`,
      `Status: ${inv.status}`,
    ]);
    res
      .type("application/pdf")
      .attachment(`invoice-${inv.number}.pdf`)
      .send(pdf);
  }),
);
router.get(
  "/invoices/:id/download.pdf",
  hotelScope,
  allowRoles("admin", "manager", "receptionist"),
  asyncHandler(async (req, res) => {
    const inv = await Invoice.findOne({
      _id: req.params.id,
      ...(req.hotelFilter || {}),
    }).populate("reservationId");
    if (!inv) throw new AppError("Invoice not found", 404);
    const pdf = makePdf("Guest invoice", [
      `Invoice: ${inv.number}`,
      `Reservation: ${inv.reservationId?.reference || ""}`,
      `Subtotal: ${inv.subtotal}`,
      `Tax: ${inv.taxRate}%`,
      `Discount: ${inv.discount}`,
      `Total: ${inv.total}`,
      `Balance due: ${inv.balance}`,
      `Status: ${inv.status}`,
    ]);
    res
      .type("application/pdf")
      .attachment(`invoice-${inv.number}.pdf`)
      .send(pdf);
  }),
);
router.get(
  "/reservations/:id/confirmation.pdf",
  hotelScope,
  allowRoles("admin", "manager", "receptionist"),
  asyncHandler(async (req, res) => {
    const r = await Reservation.findOne({
      _id: req.params.id,
      ...(req.hotelFilter || {}),
    })
      .populate("guestId")
      .populate("roomId")
      .populate("hotelId");
    if (!r) throw new AppError("Reservation not found", 404);
    const pdf = makePdf(
      r.status === "pending"
        ? "Reservation request (awaiting approval)"
        : "Reservation confirmation",
      [
        `Reference: ${r.reference}`,
        `Guest: ${r.guestId?.firstName || ""} ${r.guestId?.lastName || ""}`,
        `Hotel: ${r.hotelId?.name || "LuxuryStay"}`,
        `Room: ${r.roomId?.number || ""}`,
        `Check-in: ${new Date(r.checkIn).toDateString()}`,
        `Check-out: ${new Date(r.checkOut).toDateString()}`,
        `Status: ${r.status}`,
        `Total: ${r.total}`,
      ],
    );
    res
      .type("application/pdf")
      .attachment(`reservation-${r.reference}.pdf`)
      .send(pdf);
  }),
);
router.get(
  "/my-tasks",
  hotelScope,
  allowRoles("housekeeping", "maintenance"),
  asyncHandler(async (req, res) => {
    const Model = req.user.role === "housekeeping" ? Housekeeping : Maintenance;
    const data = await Model.find({
      ...req.hotelFilter,
      assignedTo: req.user._id,
    })
      .sort({ dueDate: 1, createdAt: -1 })
      .populate("roomId", "number")
      .populate("reservationId", "reference");
    res.json({ success: true, data });
  }),
);
router.get("/dashboard/summary", hotelScope, summary);
router.get(
  "/dashboard/revenue",
  hotelScope,
  asyncHandler(async (req, res) => {
    const data = await Payment.aggregate([
      { $match: { ...(req.hotelFilter || {}), status: "succeeded" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$receivedAt" } },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 12 },
      { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data });
  }),
);
router.get(
  "/hotels",
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) => {
    const filter =
      req.user.role === "admin" && req.user.hotelIds.length === 0
        ? {}
        : { _id: { $in: req.user.hotelIds } };
    const data = await HotelModel.find(filter).sort({ name: 1 });
    res.json({ success: true, data });
  }),
);
router.post(
  "/hotels",
  allowRoles("admin"),
  asyncHandler(async (req, res) => {
    const hotel = await HotelModel.create({
      name: req.body.name,
      code: req.body.code,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      country: req.body.country,
      timezone: req.body.timezone,
      currency: req.body.currency,
      checkInTime: req.body.checkInTime,
      checkOutTime: req.body.checkOutTime,
    });
    await User.updateOne(
      { _id: req.user._id },
      { $addToSet: { hotelIds: hotel._id } },
    );
    res.status(201).json({ success: true, data: hotel });
  }),
);
router.patch(
  "/hotels/:id",
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) => {
    const filter =
      req.user.role === "admin" && req.user.hotelIds.length === 0
        ? { _id: req.params.id }
        : { _id: req.params.id, $and: [{ _id: { $in: req.user.hotelIds } }] };
    const payload = {};
    for (const k of [
      "name",
      "email",
      "phone",
      "address",
      "city",
      "country",
      "timezone",
      "currency",
      "checkInTime",
      "checkOutTime",
      "active",
    ])
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    const hotel = await HotelModel.findOneAndUpdate(
      filter,
      { $set: payload },
      { new: true, runValidators: true },
    );
    if (!hotel) throw new AppError("Hotel not found or access denied", 404);
    res.json({ success: true, data: hotel });
  }),
);
router.delete(
  "/hotels/:id",
  allowRoles("admin"),
  asyncHandler(async (req, res) => {
    const filter =
      req.user.hotelIds.length === 0
        ? { _id: req.params.id }
        : { _id: req.params.id, _id: { $in: req.user.hotelIds } };
    const hotel = await HotelModel.findOneAndUpdate(
      filter,
      { $set: { active: false } },
      { new: true },
    );
    if (!hotel) throw new AppError("Hotel not found or access denied", 404);
    res.json({ success: true, data: hotel, message: "Hotel deactivated" });
  }),
);
router.get(
  "/feedback/recent",
  hotelScope,
  allowRoles("admin", "manager", "receptionist", "housekeeping", "maintenance"),
  asyncHandler(async (req, res) => {
    const filter = { ...(req.hotelFilter || {}) };
    const [items, stats] = await Promise.all([
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(20, Number(req.query.limit) || 6))
        .populate("guestId", "firstName lastName")
        .populate({
          path: "reservationId",
          select: "reference roomId",
          populate: { path: "roomId", select: "number" },
        }),
      Feedback.find(filter).select("rating").limit(5000).lean(),
    ]);
    const average = stats.length
      ? Number(
          (stats.reduce((t, x) => t + x.rating, 0) / stats.length).toFixed(2),
        )
      : 0;
    res.json({ success: true, data: { items, count: stats.length, average } });
  }),
);
const resources = [
  ["room-types", RoomType, "roomType", ["admin", "manager", "receptionist"]],
  ["rooms", Room, "room", ["admin", "manager", "receptionist"]],
  ["guests", Guest, "guest", ["admin", "manager", "receptionist"]],
  [
    "reservations",
    Reservation,
    "reservation",
    ["admin", "manager", "receptionist"],
  ],
  ["invoices", Invoice, "invoice", ["admin", "manager", "receptionist"]],
  ["payments", Payment, "payment", ["admin", "manager", "receptionist"]],
  [
    "housekeeping",
    Housekeeping,
    "housekeeping",
    ["admin", "manager", "receptionist", "housekeeping"],
  ],
  [
    "maintenance",
    Maintenance,
    "maintenance",
    ["admin", "manager", "maintenance", "receptionist"],
  ],
  [
    "services",
    Service,
    "service",
    ["admin", "manager", "receptionist", "housekeeping"],
  ],
  ["feedback", Feedback, "feedback", ["admin", "manager", "receptionist"]],
  [
    "notifications",
    Notification,
    "notification",
    ["admin", "manager", "receptionist", "housekeeping", "maintenance"],
  ],
  ["settings", Setting, "setting", ["admin", "manager"]],
  ["audit-logs", AuditLog, "auditLog", ["admin", "manager"]],
];
for (const [path, Model, name, roles] of resources) {
  const p = Router();
  p.use(hotelScope);
  p.get("/", allowRoles(...roles), listResource(Model));
  p.post("/", allowRoles(...roles), createResource(Model, name));
  p.patch("/:id", allowRoles(...roles), updateResource(Model, name));
  p.delete("/:id", allowRoles("admin", "manager"), deleteResource(Model));
  router.use("/" + path, p);
}
router.get(
  "/reservations/availability",
  hotelScope,
  asyncHandler(async (req, res) =>
    res.json({ success: true, data: await findAvailableRooms(req.query) }),
  ),
);
router.post(
  "/reservations",
  allowRoles("admin", "manager", "receptionist"),
  validateBody(reservationSchema),
  asyncHandler(async (req, res) =>
    res
      .status(201)
      .json({
        success: true,
        data: await createReservation(req.body, req.user),
      }),
  ),
);
router.post(
  "/reservations/:id/check-in",
  hotelScope,
  allowRoles("admin", "manager", "receptionist"),
  checkIn,
);
router.post(
  "/reservations/:id/check-out",
  hotelScope,
  allowRoles("admin", "manager", "receptionist"),
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await checkoutReservation(
        req.params.id,
        req.body.hotelId || req.query.hotelId || req.user.hotelIds[0],
      ),
    }),
  ),
);
router.post(
  "/reservations/:id/cancel",
  hotelScope,
  allowRoles("admin", "manager", "receptionist"),
  cancelReservation,
);
router.post(
  "/reservations/:id/approve",
  hotelScope,
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await approveReservation(req.params.id, req.hotelFilter, req.user),
      message: "Reservation approved and room booked.",
    }),
  ),
);
router.post(
  "/reservations/:id/reject",
  hotelScope,
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) =>
    res.json({
      success: true,
      data: await rejectReservation(
        req.params.id,
        req.hotelFilter,
        req.user,
        req.body.reason,
      ),
      message: "Reservation rejected.",
    }),
  ),
);
router.post(
  "/invoices/:id/payments",
  hotelScope,
  allowRoles("admin", "manager", "receptionist"),
  validateBody(paymentSchema),
  payment,
);
router.post(
  "/invoices/:id/demo-payment",
  hotelScope,
  allowRoles("admin", "manager", "receptionist"),
  demoPayment,
);
router.patch(
  "/invoices/:id/status",
  hotelScope,
  allowRoles("admin", "manager"),
  updateInvoiceStatus,
);
router.patch(
  "/payments/:id/status",
  hotelScope,
  allowRoles("admin", "manager"),
  updatePaymentStatus,
);
router.get(
  "/reports/:kind.csv",
  hotelScope,
  allowRoles("admin", "manager"),
  report,
);
router.get(
  "/reports/:kind",
  hotelScope,
  allowRoles("admin", "manager"),
  report,
);
router.get(
  "/users",
  hotelScope,
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) => {
    const filter =
      req.user.role === "admin" && req.user.hotelIds.length === 0
        ? {}
        : { hotelIds: { $in: req.user.hotelIds } };
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active !== undefined)
      filter.active = req.query.active === "true";
    const page = Math.max(1, Number(req.query.page) || 1),
      limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [rows, total] = await Promise.all([
      User.find(filter)
        .select("-passwordHash")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    const data = rows.map((u) => {
      if (req.user.role !== "admin" && String(u._id) !== String(req.user._id))
        delete u.salary;
      return u;
    });
    res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);
const parseSalary = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000000)
    throw new AppError("Salary must be a positive number", 400);
  return Math.round(n * 100) / 100;
};
router.patch(
  "/users/:id",
  hotelScope,
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) => {
    const update = {};
    for (const key of ["name", "email", "role", "active", "phone", "hotelIds"])
      if (req.body[key] !== undefined) update[key] = req.body[key];
    if (req.body.salary !== undefined && req.body.salary !== "") {
      if (req.user.role !== "admin")
        throw new AppError("Only an admin can change salaries", 403);
      update.salary = parseSalary(req.body.salary);
    }
    if (
      String(req.params.id) === String(req.user._id) &&
      req.body.active === false
    )
      throw new AppError("You cannot deactivate your own account", 403);
    if (
      req.user.role === "manager" &&
      update.role &&
      !["receptionist", "housekeeping", "maintenance"].includes(update.role)
    )
      throw new AppError(
        "Managers cannot grant admin, manager, or guest roles",
        403,
      );
    if (req.body.password) {
      if (String(req.body.password).length < 10)
        throw new AppError("Password must be at least 10 characters");
      update.passwordHash = await bcrypt.hash(req.body.password, 12);
    }
    if (
      req.user.role !== "admin" &&
      update.hotelIds?.some(
        (id) => !req.user.hotelIds.map(String).includes(String(id)),
      )
    )
      throw new AppError("Hotel access denied", 403);
    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        ...(req.user.role === "admin" && req.user.hotelIds.length === 0
          ? {}
          : { hotelIds: { $in: req.user.hotelIds } }),
      },
      { $set: update },
      { new: true, runValidators: true },
    )
      .select("-passwordHash")
      .lean();
    if (!user) throw new AppError("User not found", 404);
    if (req.user.role !== "admin" && String(user._id) !== String(req.user._id))
      delete user.salary;
    res.json({ success: true, data: user });
  }),
);
router.delete(
  "/users/:id",
  hotelScope,
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id))
      throw new AppError(
        "You cannot delete your own account",
        403,
        "SELF_DELETE",
      );
    const scope =
      req.user.role === "admin" && req.user.hotelIds.length === 0
        ? {}
        : { hotelIds: { $in: req.user.hotelIds } };
    const target = await User.findOne({ _id: req.params.id, ...scope });
    if (!target) throw new AppError("User not found", 404);
    if (
      req.user.role === "manager" &&
      !["receptionist", "housekeeping", "maintenance"].includes(target.role)
    )
      throw new AppError(
        "Managers can only remove receptionist, housekeeping or maintenance accounts",
        403,
      );
    if (
      target.role === "admin" &&
      (await User.countDocuments({
        role: "admin",
        active: true,
        _id: { $ne: target._id },
      })) === 0
    )
      throw new AppError("The last active admin cannot be removed", 409);
    await target.deleteOne();
    await AuditLog.create({
      actorId: req.user._id,
      action: "delete",
      resource: "user",
      resourceId: String(target._id),
      ip: req.ip,
    }).catch(() => {});
    res.json({ success: true, message: "Staff account deleted" });
  }),
);
// Passwords are stored as one-way bcrypt hashes, so nobody (admins included) can read an existing password.
// Instead an admin can set a new temporary one; it is returned once, the staff member's old sessions are signed out,
// and they are asked to choose their own password at next sign-in.
router.post(
  "/users/:id/reset-password",
  allowRoles("admin"),
  validateBody(adminResetPasswordSchema),
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id))
      throw new AppError(
        "Use Account settings to change your own password",
        403,
      );
    const scope =
      req.user.hotelIds.length === 0
        ? {}
        : { hotelIds: { $in: req.user.hotelIds } };
    const target = await User.findOne({ _id: req.params.id, ...scope }).select(
      "+passwordHash",
    );
    if (!target) throw new AppError("User not found", 404);
    if (target.role === "guest")
      throw new AppError("Guests reset their own password by email", 400);
    const password = req.body.password || generateTempPassword();
    target.passwordHash = await bcrypt.hash(password, 12);
    target.passwordChangedAt = new Date();
    target.mustChangePassword = true;
    await target.save();
    await AuditLog.create({
      actorId: req.user._id,
      action: "reset_password",
      resource: "user",
      resourceId: String(target._id),
      ip: req.ip,
    }).catch(() => {});
    res
      .set("Cache-Control", "no-store")
      .json({
        success: true,
        data: {
          userId: target._id,
          name: target.name,
          email: target.email,
          password,
        },
        message: "Temporary password set. It is shown only once.",
      });
  }),
);
router.post(
  "/users",
  allowRoles("admin", "manager"),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, hotelIds = [] } = req.body;
    if (
      req.user.role === "manager" &&
      !["receptionist", "housekeeping", "maintenance"].includes(role)
    )
      throw new AppError(
        "Managers can create receptionist, housekeeping, or maintenance accounts only",
        403,
      );
    if (!name || !email || !password || password.length < 10)
      throw new AppError("Name, email and password (10+ chars) are required");
    if (
      req.user.role !== "admin" &&
      hotelIds.some((id) => !req.user.hotelIds.map(String).includes(String(id)))
    )
      throw new AppError("Hotel access denied", 403);
    let salary = 0;
    if (req.body.salary !== undefined && req.body.salary !== "") {
      if (req.user.role !== "admin")
        throw new AppError("Only an admin can set salaries", 403);
      salary = parseSalary(req.body.salary);
    }
    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      hotelIds,
      salary,
    });
    res
      .status(201)
      .json({
        success: true,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          hotelIds: user.hotelIds,
          ...(req.user.role === "admin" ? { salary: user.salary } : {}),
        },
      });
  }),
);
export default router;
