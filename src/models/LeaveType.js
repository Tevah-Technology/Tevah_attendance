const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  description: { type: String, default: '' },
  annualAllocation: { type: Number, default: 0, min: 0 },
  paid: { type: Boolean, default: true },
  halfDayAllowed: { type: Boolean, default: true },
  carryForward: { type: Boolean, default: false },
  maxConsecutiveDays: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
