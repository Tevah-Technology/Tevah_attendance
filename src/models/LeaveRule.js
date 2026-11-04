const mongoose = require('mongoose');

const leaveRuleSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true, trim: true },

  maxLeaveDaysPerMonth: { type: Number, default: 0, min: 0 },
  maxLeaveDaysPerYear: { type: Number, default: 0, min: 0 },
  minimumAdvanceNoticeDays: { type: Number, default: 0, min: 0 },

  probationRestrictionEnabled: { type: Boolean, default: false },
  probationPeriodDays: { type: Number, default: 90, min: 0 },
  allowLeaveDuringProbation: { type: Boolean, default: true },

  includeWeekendsInLeaveDays: { type: Boolean, default: false },
  includeHolidaysInLeaveDays: { type: Boolean, default: false },

  carryForwardEnabled: { type: Boolean, default: true },
  carryForwardLimitDays: { type: Number, default: 0, min: 0 },

  approvalRequired: { type: Boolean, default: true },

  negativeBalanceAllowed: { type: Boolean, default: false },
  maxNegativeBalanceDays: { type: Number, default: 0, min: 0 },

  documentRequiredForSickLeave: { type: Boolean, default: false },
  documentRequiredAfterDays: { type: Number, default: 2, min: 0 },
  sickLeaveCodes: { type: [String], default: ['SL', 'SICK'] },

  allowBackdatedLeave: { type: Boolean, default: false },
  maxBackdatedDays: { type: Number, default: 0, min: 0 },

  blockOverlappingRequests: { type: Boolean, default: true },
  maxConsecutiveLeaveDays: { type: Number, default: 0, min: 0 },
  minimumGapBetweenLeaveDays: { type: Number, default: 0, min: 0 },

  allowLeaveDuringNoticePeriod: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LeaveRule', leaveRuleSchema);
