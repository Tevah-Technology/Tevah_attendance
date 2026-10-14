const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, index: true },
  // Kept for backward compatibility; represents the first/primary leave date.
  date: { type: Date, required: true, index: true },
  fromDate: { type: Date, default: null, index: true },
  toDate: { type: Date, default: null, index: true },
  days: { type: Number, default: 1, min: 0.5 },
  type: { type: String, default: 'Leave' },
  leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', default: null },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED', index: true },
  approved: { type: Boolean, default: true, index: true },
  halfDay: { type: Boolean, default: false },
  halfDayPeriod: { type: String, enum: ['FIRST', 'SECOND', ''], default: '' },
  managerRemarks: { type: String, default: '' },
  appliedAt: { type: Date, default: Date.now }
}, { timestamps: true });

leaveSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Leave', leaveSchema);
