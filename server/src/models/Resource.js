import mongoose from "mongoose";
const common = {
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hotel",
    required: true,
    index: true,
  },
};
const specs = {
  RoomType: {
    name: { type: String, required: true },
    description: String,
    capacity: { type: Number, default: 2, min: 1 },
    baseRate: { type: Number, required: true, min: 0 },
    amenities: [String],
  },
  Room: {
    number: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    imageUrls: { type: [String], default: [] },
    floor: Number,
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomType",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "available",
        "booked",
        "occupied",
        "dirty",
        "cleaning",
        "maintenance",
        "out_of_service",
      ],
      default: "available",
      index: true,
    },
    notes: String,
  },
  Guest: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    documentRef: String,
    preferences: String,
    notes: String,
  },
  Reservation: {
    reference: { type: String, required: true, unique: true, index: true },
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guest",
      required: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    checkIn: { type: Date, required: true, index: true },
    checkOut: { type: Date, required: true, index: true },
    adults: { type: Number, default: 1, min: 1 },
    children: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "checked_in",
        "checked_out",
        "cancelled",
        "rejected",
        "no_show",
      ],
      default: "confirmed",
      index: true,
    },
    nightlyRate: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    rejectedAt: Date,
    rejectionReason: String,
  },
  Invoice: {
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
    },
    number: { type: String, required: true, unique: true },
    items: [
      {
        description: String,
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
      },
    ],
    subtotal: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "unpaid", "partial", "paid", "void"],
      default: "unpaid",
    },
  },
  Payment: {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    method: {
      type: String,
      enum: ["cash", "bank_transfer", "card_terminal", "other"],
      default: "cash",
    },
    status: {
      type: String,
      enum: ["succeeded", "pending", "failed", "refunded"],
      default: "succeeded",
      index: true,
    },
    reference: String,
    demo: { type: Boolean, default: false },
    cardLast4: { type: String, maxlength: 4 },
    receivedAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  Housekeeping: {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    taskType: {
      type: String,
      enum: ["checkout_clean", "stayover", "deep_clean", "inspection", "other"],
      default: "checkout_clean",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "inspection", "completed"],
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    notes: String,
    dueDate: Date,
    completedAt: Date,
  },
  Maintenance: {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    title: { type: String, required: true },
    description: String,
    category: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    reservationId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Reservation'
},
    status: {
      type: String,
      enum: ["open", "in_progress", "waiting_parts", "resolved", "cancelled"],
      default: "open",
      index: true,
    },
    blocksBooking: { type: Boolean, default: true },
    dueDate: Date,
    resolvedAt: Date,
  },
  Service: {
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation" },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    serviceType: {
      type: String,
      enum: [
        "room_service",
        "laundry",
        "wake_up",
        "transport",
        "amenity",
        "other",
      ],
      default: "other",
    },
    description: { type: String, required: true },
    scheduledAt: Date,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["requested", "accepted", "in_progress", "completed", "cancelled"],
      default: "requested",
      index: true,
    },
    charge: { type: Number, default: 0, min: 0 },
    chargeToRoom: { type: Boolean, default: false },
  },
  Feedback: {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest" },
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: String,
    category: String,
    public: { type: Boolean, default: false },
  },
  Notification: {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: "info" },
    readAt: Date,
    href: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  AuditLog: {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    resource: String,
    resourceId: String,
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel" },
    metadata: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  Setting: {
    key: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    description: String,
  },
};
const models = {};
for (const [name, fields] of Object.entries(specs)) {
  const schema = new mongoose.Schema(
    { ...common, ...fields },
    { timestamps: true, strict: "throw" },
  );
  if (name === "Room")
    schema.index({ hotelId: 1, number: 1 }, { unique: true });
  if (name === "RoomType")
    schema.index({ hotelId: 1, name: 1 }, { unique: true });
  if (name === "Setting")
    schema.index({ hotelId: 1, key: 1 }, { unique: true });
  models[name] = mongoose.models[name] || mongoose.model(name, schema);
}
export const RoomType = models.RoomType;
export const Room = models.Room;
export const Guest = models.Guest;
export const Reservation = models.Reservation;
export const Invoice = models.Invoice;
export const Payment = models.Payment;
export const Housekeeping = models.Housekeeping;
export const Maintenance = models.Maintenance;
export const Service = models.Service;
export const Feedback = models.Feedback;
export const Notification = models.Notification;
export const AuditLog = models.AuditLog;
export const Setting = models.Setting;
