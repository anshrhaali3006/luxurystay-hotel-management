import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import {
  AuditLog,
  Room,
  RoomType,
  Reservation as ReservationModel,
} from "../models/Resource.js";
import { syncRoomBooking } from "../services/reservations.js";
import { sendBookingConfirmedEmail } from "../services/bookingEmails.js";
const protectedFields = new Set([
  "passwordHash",
  "__v",
  "createdBy",
  "hotelIds",
]);
export const listResource = (Model) =>
  asyncHandler(async (req, res) => {
    const filter = { ...(req.hotelFilter || {}) };
    if (
      ["housekeeping", "maintenance"].includes(Model.modelName.toLowerCase()) &&
      ["housekeeping", "maintenance"].includes(req.user?.role)
    )
      filter.assignedTo = req.user._id;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = req.query.q;
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { number: { $regex: q, $options: "i" } },
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { reference: { $regex: q, $options: "i" } },
        { title: { $regex: q, $options: "i" } },
      ];
    }
    const page = Math.max(1, Number(req.query.page) || 1),
      limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    let query = Model.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const populateMap = {
      Room: [["roomTypeId", "name baseRate capacity"]],
      Reservation: [
        ["guestId", "firstName lastName email"],
        ["roomId", "number imageUrl imageUrls"],
      ],
      Invoice: [["reservationId", "reference total status"]],
      Payment: [["invoiceId", "number total balance status"]],
      Housekeeping: [
        ["roomId", "number"],
        ["reservationId", "reference"],
        ["assignedTo", "name email"],
      ],
      Maintenance: [
        ["roomId", "number"],
        ["assignedTo", "name email"],
      ],
      Service: [
        ["reservationId", "reference"],
        ["guestId", "firstName lastName"],
        ["roomId", "number"],
        ["assignedTo", "name email"],
      ],
      Feedback: [
        ["guestId", "firstName lastName"],
        ["reservationId", "reference"],
      ],
    };
    for (const [path, fields] of populateMap[Model.modelName] || [])
      query = query.populate(path, fields);
    const [data, total] = await Promise.all([
      query,
      Model.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });
export const createResource = (Model, resource) =>
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    for (const k of protectedFields) delete payload[k];
    if (["Housekeeping", "Maintenance"].includes(Model.modelName)) {
      if (!["admin", "manager"].includes(req.user.role))
        throw new AppError(
          "Only an admin or manager can assign operational tasks",
          403,
        );
      if (!payload.assignedTo)
        throw new AppError("Select a staff member to assign this task", 400);
      const staff = await (
        await import("../models/User.js")
      ).default.findOne({
        _id: payload.assignedTo,
        role:
          Model.modelName === "Housekeeping" ? "housekeeping" : "maintenance",
        active: true,
      });
      if (!staff)
        throw new AppError(
          "Choose an active staff member with the matching role",
          400,
        );
      if (
        payload.hotelId &&
        !staff.hotelIds.map(String).includes(String(payload.hotelId))
      )
        throw new AppError(
          "Selected staff member is not assigned to this hotel",
          400,
        );
    }
    if (req.user.role !== "admin" || req.user.hotelIds.length) {
      const allowed = req.user.hotelIds.map(String);
      if (!payload.hotelId) payload.hotelId = allowed[0];
      if (!allowed.includes(String(payload.hotelId)))
        throw new AppError("Hotel access denied", 403);
    }
    if (
      ["Housekeeping", "Maintenance"].includes(Model.modelName) &&
      payload.assignedTo
    ) {
      const staff = await (
        await import("../models/User.js")
      ).default.findOne({
        _id: payload.assignedTo,
        role:
          Model.modelName === "Housekeeping" ? "housekeeping" : "maintenance",
        active: true,
        hotelIds: payload.hotelId,
      });
      if (!staff)
        throw new AppError("Select active staff assigned to this hotel", 400);
    }
    if (Model.modelName === "Invoice") {
      const { Reservation, Service } = await import("../models/Resource.js");
      const reservation = await Reservation.findOne({
        _id: payload.reservationId,
        hotelId: payload.hotelId,
      });
      if (!reservation) throw new AppError("Select a valid reservation", 400);
      if (!Array.isArray(payload.items) || !payload.items.length) {
        const nights = Math.max(
          1,
          Math.ceil((reservation.checkOut - reservation.checkIn) / 86400000),
        );
        const services = await Service.find({
          hotelId: payload.hotelId,
          reservationId: reservation._id,
          chargeToRoom: true,
          status: { $nin: ["cancelled"] },
        });
        payload.items = [
          {
            description: "Room accommodation",
            quantity: nights,
            unitPrice: reservation.nightlyRate,
            total: nights * reservation.nightlyRate,
          },
          ...services.map((x) => ({
            description: x.description,
            quantity: 1,
            unitPrice: x.charge,
            total: x.charge,
          })),
        ];
      }
      payload.items = payload.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.unitPrice) || 0,
        total: (Number(i.quantity) || 1) * (Number(i.unitPrice) || 0),
      }));
      payload.subtotal = Number(
        payload.items.reduce((a, i) => a + i.total, 0).toFixed(2),
      );
      const tax = Math.max(0, Number(payload.taxRate) || 0),
        discount = Math.max(0, Number(payload.discount) || 0);
      payload.total = Number(
        Math.max(
          0,
          payload.subtotal + (payload.subtotal * tax) / 100 - discount,
        ).toFixed(2),
      );
      payload.balance = payload.total;
      payload.number =
        payload.number || `INV-${Date.now().toString(36).toUpperCase()}`;
      payload.status = "unpaid";
    }
    if (Model.modelName === "Reservation") {
      if (!payload.reference)
        payload.reference = `LS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const checkIn = new Date(payload.checkIn),
        checkOut = new Date(payload.checkOut);
      if (
        !payload.checkIn ||
        !payload.checkOut ||
        Number.isNaN(+checkIn) ||
        Number.isNaN(+checkOut) ||
        checkOut <= checkIn
      )
        throw new AppError("Check-out date must be after check-in date", 400);
      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
      let nightlyRate = Number(payload.nightlyRate);
      if (
        payload.nightlyRate === undefined ||
        payload.nightlyRate === " " ||
        payload.nightlyRate === ""
      ) {
        const room = await Room.findOne({
          _id: payload.roomId,
          hotelId: payload.hotelId,
        }).select("roomTypeId");
        if (!room)
          throw new AppError("Selected room was not found for this hotel", 400);
        const roomType = await RoomType.findById(room.roomTypeId).select(
          "baseRate",
        );
        nightlyRate = Number(roomType?.baseRate);
      }
      if (!Number.isFinite(nightlyRate) || nightlyRate < 0)
        throw new AppError("A valid nightly rate is required", 400);
      payload.nightlyRate = nightlyRate;
      payload.total = Number((nightlyRate * nights).toFixed(2));
    }
    const doc = await Model.create(payload);
    if (Model.modelName === "Reservation") {
      await syncRoomBooking(doc.roomId, doc.hotelId);
      if (doc.status === "confirmed") sendBookingConfirmedEmail(doc._id);
    }
    if (Model.modelName === "Housekeeping")
      await Room.updateOne(
        { _id: doc.roomId, hotelId: doc.hotelId },
        { $set: { status: "cleaning" } },
      );
    if (Model.modelName === "Maintenance" && doc.blocksBooking && doc.roomId)
      await Room.updateOne(
        { _id: doc.roomId, hotelId: doc.hotelId },
        { $set: { status: "maintenance" } },
      );
    await AuditLog.create({
      actorId: req.user._id,
      action: "create",
      resource,
      resourceId: String(doc._id),
      hotelId: doc.hotelId,
      ip: req.ip,
    }).catch(() => {});
    res.status(201).json({ success: true, data: doc });
  });
export const updateResource = (Model, resource) =>
  asyncHandler(async (req, res) => {
    let previousStatus;
    const payload = { ...req.body };
    for (const k of protectedFields) delete payload[k];
    delete payload.hotelId;
    if (["Housekeeping", "Maintenance"].includes(Model.modelName)) {
      if (["housekeeping", "maintenance"].includes(req.user.role)) {
        const own = await Model.findOne({
          _id: req.params.id,
          assignedTo: req.user._id,
          ...(req.hotelFilter || {}),
        });
        if (!own) throw new AppError("Task not found in your assignments", 404);
        for (const key of [
          "assignedTo",
          "roomId",
          "reservationId",
          "taskType",
          "title",
          "description",
          "priority",
          "dueDate",
          "blocksBooking",
        ])
          delete payload[key];
      } else if (!["admin", "manager"].includes(req.user.role))
        throw new AppError("Not authorised to update tasks", 403);
      else if (payload.assignedTo) {
        const current = await Model.findOne({
          _id: req.params.id,
          ...(req.hotelFilter || {}),
        });
        if (!current) throw new AppError("Task not found", 404);
        const staff = await (
          await import("../models/User.js")
        ).default.findOne({
          _id: payload.assignedTo,
          role:
            Model.modelName === "Housekeeping" ? "housekeeping" : "maintenance",
          active: true,
          hotelIds: current.hotelId,
        });
        if (!staff)
          throw new AppError("Select active staff assigned to this hotel", 400);
      }
    }
    if (Model.modelName === "Invoice") {
      const current = await Model.findOne({
        _id: req.params.id,
        ...(req.hotelFilter || {}),
      });
      if (!current) throw new AppError("Record not found", 404);
      const items = Array.isArray(payload.items)
        ? payload.items
        : current.items;
      payload.items = items.map((i) => ({
        ...i,
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.unitPrice) || 0,
        total: (Number(i.quantity) || 1) * (Number(i.unitPrice) || 0),
      }));
      payload.subtotal = Number(
        payload.items.reduce((a, i) => a + i.total, 0).toFixed(2),
      );
      const tax = Math.max(0, Number(payload.taxRate ?? current.taxRate) || 0),
        discount = Math.max(
          0,
          Number(payload.discount ?? current.discount) || 0,
        );
      payload.total = Number(
        Math.max(
          0,
          payload.subtotal + (payload.subtotal * tax) / 100 - discount,
        ).toFixed(2),
      );
      const paidAgg = await (
        await import("../models/Resource.js")
      ).Payment.aggregate([
        {
          $match: {
            hotelId: current.hotelId,
            invoiceId: current._id,
            status: "succeeded",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const paid = Math.min(payload.total, Number(paidAgg[0]?.total || 0));
      payload.balance = Math.max(0, Number((payload.total - paid).toFixed(2)));
      payload.status =
        payload.balance === 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
    }
    if (Model.modelName === "Reservation") {
      const current = await Model.findOne({
        _id: req.params.id,
        ...(req.hotelFilter || {}),
      });
      if (!current) throw new AppError("Record not found", 404);
      previousStatus = current.status;
      const checkIn = new Date(payload.checkIn ?? current.checkIn),
        checkOut = new Date(payload.checkOut ?? current.checkOut);
      if (
        Number.isNaN(+checkIn) ||
        Number.isNaN(+checkOut) ||
        checkOut <= checkIn
      )
        throw new AppError("Check-out date must be after check-in date", 400);
      const rate = Number(payload.nightlyRate ?? current.nightlyRate);
      if (!Number.isFinite(rate) || rate < 0)
        throw new AppError("A valid nightly rate is required", 400);
      payload.nightlyRate = rate;
      payload.total = Number(
        (Math.ceil((checkOut - checkIn) / 86400000) * rate).toFixed(2),
      );
    }
    const doc = await Model.findOneAndUpdate(
      { _id: req.params.id, ...(req.hotelFilter || {}) },
      { $set: payload },
      { new: true, runValidators: true },
    );
    if (!doc) throw new AppError("Record not found", 404);
    if (Model.modelName === "Reservation") {
      await syncRoomBooking(doc.roomId, doc.hotelId);
      if (doc.status === "confirmed" && previousStatus !== "confirmed")
        sendBookingConfirmedEmail(doc._id);
    }
    const readyStatus = async () =>
      (await ReservationModel.exists({
        roomId: doc.roomId,
        hotelId: doc.hotelId,
        status: "checked_in",
      }))
        ? "occupied"
        : (await ReservationModel.exists({
              roomId: doc.roomId,
              hotelId: doc.hotelId,
              status: "confirmed",
              checkOut: { $gt: new Date() },
            }))
          ? "booked"
          : "available";
    if (
      Model.modelName === "Housekeeping" &&
      doc.roomId &&
      payload.status !== undefined
    ) {
      if (doc.status === "completed") {
        await Room.updateOne(
          { _id: doc.roomId, hotelId: doc.hotelId },
          { $set: { status: await readyStatus() } },
        );
        if (!doc.completedAt) {
          doc.completedAt = new Date();
          await doc.save();
        }
      } else {
        await Room.updateOne(
          {
            _id: doc.roomId,
            hotelId: doc.hotelId,
            status: { $in: ["available", "booked", "cleaning", "dirty"] },
          },
          { $set: { status: "cleaning" } },
        );
        if (doc.completedAt) {
          doc.completedAt = undefined;
          await doc.save();
        }
      }
    }
    if (
      Model.modelName === "Maintenance" &&
      doc.roomId &&
      payload.status !== undefined
    ) {
      if (["resolved", "cancelled"].includes(doc.status)) {
        await Room.updateOne(
          { _id: doc.roomId, hotelId: doc.hotelId, status: "maintenance" },
          { $set: { status: await readyStatus() } },
        );
        if (doc.status === "resolved" && !doc.resolvedAt) {
          doc.resolvedAt = new Date();
          await doc.save();
        }
      } else {
        if (doc.blocksBooking)
          await Room.updateOne(
            {
              _id: doc.roomId,
              hotelId: doc.hotelId,
              status: { $in: ["available", "booked", "cleaning", "dirty"] },
            },
            { $set: { status: "maintenance" } },
          );
        if (doc.resolvedAt) {
          doc.resolvedAt = undefined;
          await doc.save();
        }
      }
    }
    await AuditLog.create({
      actorId: req.user._id,
      action: "update",
      resource,
      resourceId: String(doc._id),
      hotelId: doc.hotelId,
      ip: req.ip,
    }).catch(() => {});
    res.json({ success: true, data: doc });
  });
export const deleteResource = (Model) =>
  asyncHandler(async (req, res) => {
    const doc = await Model.findOneAndDelete({
      _id: req.params.id,
      ...(req.hotelFilter || {}),
    });
    if (!doc) throw new AppError("Record not found", 404);
    if (Model.modelName === "Reservation")
      await syncRoomBooking(doc.roomId, doc.hotelId);
    res.json({ success: true, message: "Record deleted" });
  });
