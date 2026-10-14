const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  startTime: { type: String, default: '09:00' },
  endTime: { type: String, default: '17:30' },
  breakMinutes: { type: Number, default: 60 },
  requiredMinutes: { type: Number, default: 480 },
  graceMinutes: { type: Number, default: 10 },
  overtimeAfterMinutes: { type: Number, default: 480 },
  overtimeStartTime: { type: String, default: '' },
  minimumOvertimeMinutes: { type: Number, default: 0, min: 0 },
  maximumOvertimeMinutes: { type: Number, default: 0, min: 0 },
  overtimeRoundingMinutes: { type: Number, default: 1, min: 1 },
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Shift', shiftSchema);
