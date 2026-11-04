const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  description: { type: String, default: '' },
  annualAllocation: { type: Number, default: 0, min: 0 },
  paid: { type: Boolean, default: true },
  halfDayAllowed: { type: Boolean, default: true },
  carryForward: { type: Boolean, default: false },
  carryForwardLimitDays: { type: Number, default: null, min: 0 },
  maxConsecutiveDays: { type: Number, default: 0, min: 0 },
  maxDaysPerMonth: { type: Number, default: null, min: 0 },
  minimumAdvanceNoticeDays: { type: Number, default: null, min: 0 },
  includeWeekendsInLeaveDays: { type: Boolean, default: null },
  includeHolidaysInLeaveDays: { type: Boolean, default: null },
  approvalRequired: { type: Boolean, default: null },
  negativeBalanceAllowed: { type: Boolean, default: null },
  maxNegativeBalanceDays: { type: Number, default: null, min: 0 },
  documentRequired: { type: Boolean, default: null },
  documentRequiredAfterDays: { type: Number, default: null, min: 0 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
