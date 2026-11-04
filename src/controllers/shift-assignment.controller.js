const mongoose = require('mongoose');
const { Employee, Shift, ShiftAssignment } = require('../models');
const { startOfDay, endOfDay } = require('../utils/time');
const { getEffectiveShift } = require('../services/shift-assignment.service');

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function validatePayload(body, { partial = false } = {}) {
  const type = body.assignmentType;

  if (!partial || body.employeeId !== undefined) {
    if (!String(body.employeeId || '').trim()) return 'employeeId is required';
    const employee = await Employee.findOne({ employeeId: String(body.employeeId).trim() }).lean();
    if (!employee) return 'Employee not found';
  }

  if (!partial || body.shiftId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(body.shiftId || ''))) return 'Valid shiftId is required';
    const shift = await Shift.findById(body.shiftId).lean();
    if (!shift) return 'Shift not found';
  }

  if (type !== undefined && !['single_date', 'date_range', 'recurring'].includes(type)) {
    return 'assignmentType must be single_date, date_range, or recurring';
  }

  if (type === 'single_date') {
    if (!parseDate(body.date)) return 'date is required for single_date assignment';
  }

  if (type === 'date_range') {
    const start = parseDate(body.startDate);
    const end = parseDate(body.endDate);
    if (!start || !end) return 'startDate and endDate are required for date_range assignment';
    if (start > end) return 'startDate must be on or before endDate';
  }

  if (type === 'recurring' && body.recurringDays !== undefined) {
    if (!Array.isArray(body.recurringDays) || !body.recurringDays.length || body.recurringDays.some((d) => !Number.isInteger(Number(d)) || Number(d) < 1 || Number(d) > 7)) {
      return 'recurringDays must contain day numbers 1-7';
    }
  }

  return null;
}

function normalizePayload(body) {
  const out = { ...body };
  if (out.employeeId !== undefined) out.employeeId = String(out.employeeId).trim();
  if (out.date !== undefined) out.date = out.date ? startOfDay(new Date(out.date)) : null;
  if (out.startDate !== undefined) out.startDate = out.startDate ? startOfDay(new Date(out.startDate)) : null;
  if (out.endDate !== undefined) out.endDate = out.endDate ? endOfDay(new Date(out.endDate)) : null;
  if (Array.isArray(out.recurringDays)) out.recurringDays = [...new Set(out.recurringDays.map(Number))].sort((a, b) => a - b);
  return out;
}

async function list(req, res) {
  try {
    const filter = {};
    if (req.query.employeeId) filter.employeeId = String(req.query.employeeId);
    if (req.query.active !== undefined) filter.active = String(req.query.active) !== 'false';

    if (req.query.date) {
      const date = parseDate(req.query.date);
      if (!date) return res.status(400).json({ success: false, message: 'Invalid date' });
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      const weekday = new Date(date).getDay() || 7;
      filter.$or = [
        { assignmentType: 'single_date', date: { $gte: dayStart, $lt: dayEnd } },
        { assignmentType: 'date_range', startDate: { $lte: dayEnd }, endDate: { $gte: dayStart } },
        {
          assignmentType: 'recurring', recurringDays: weekday,
          $and: [
            { $or: [{ startDate: null }, { startDate: { $lte: dayEnd } }] },
            { $or: [{ endDate: null }, { endDate: { $gte: dayStart } }] }
          ]
        }
      ];
    }

    const assignments = await ShiftAssignment.find(filter)
      .populate('shiftId')
      .sort({ date: -1, startDate: -1, createdAt: -1 })
      .lean();

    return res.json({ success: true, count: assignments.length, assignments });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to load shift assignments' });
  }
}

async function create(req, res) {
  try {
    const body = normalizePayload(req.body || {});
    body.assignmentType = body.assignmentType || 'single_date';
    const error = await validatePayload(body);
    if (error) return res.status(400).json({ success: false, message: error });

    if (req.user?._id) body.createdBy = req.user._id;
    const assignment = await ShiftAssignment.create(body);
    await assignment.populate('shiftId');
    return res.status(201).json({ success: true, assignment });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to create shift assignment' });
  }
}

async function update(req, res) {
  try {
    const current = await ShiftAssignment.findById(req.params.id).lean();
    if (!current) return res.status(404).json({ success: false, message: 'Shift assignment not found' });

    const body = normalizePayload(req.body || {});
    const merged = { ...current, ...body };
    const error = await validatePayload(merged);
    if (error) return res.status(400).json({ success: false, message: error });

    const assignment = await ShiftAssignment.findByIdAndUpdate(
      req.params.id,
      { $set: body },
      { new: true, runValidators: true }
    ).populate('shiftId');

    return res.json({ success: true, assignment });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to update shift assignment' });
  }
}

async function remove(req, res) {
  try {
    const assignment = await ShiftAssignment.findByIdAndDelete(req.params.id).lean();
    return res.json({ success: true, deleted: Boolean(assignment) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to delete shift assignment' });
  }
}

async function resolve(req, res) {
  try {
    const employeeId = String(req.query.employeeId || '').trim();
    const date = parseDate(req.query.date || new Date());
    if (!employeeId || !date) return res.status(400).json({ success: false, message: 'employeeId and valid date are required' });

    const employee = await Employee.findOne({ employeeId }).lean();
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const result = await getEffectiveShift(employee, date);
    return res.json({ success: true, employeeId, date: startOfDay(date), ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to resolve shift' });
  }
}

module.exports = { list, create, update, remove, resolve };
