const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  deviceIp: { type: String, index: true, default: '' },
  userId: { type: String, required: true, index: true },
  userSn: Number,
  employeeId: { type: String, required: true, index: true },
  employeeName: String,
  timestamp: { type: Date, required: true, index: true },
  punchType: { type: String, enum: ['IN', 'OUT', 'UNKNOWN'], default: 'UNKNOWN' },
  state: Number,
  attendanceState: { type: Number, default: null },
  verificationMode: { type: Number, default: null },
  verificationLabel: { type: String, default: '' },
  workCode: { type: Number, default: null },
  rawRecordHex: { type: String, default: null },
  rawData: mongoose.Schema.Types.Mixed,

  // DEVICE = F28, WEB = employee web check-in/out,
  // AUTO = automatic checkout, MANUAL_ADMIN = administrator correction.
  source: {
    type: String,
    enum: ['DEVICE', 'WEB', 'AUTO', 'MANUAL_ADMIN'],
    default: 'DEVICE',
    index: true
  },

  // The time at which an open IN punch should be automatically closed.
  autoCheckoutAt: { type: Date, default: null, index: true },

  // Groups an IN/OUT pair into the same attendance session.
  sessionId: { type: String, default: '', index: true },

  // Useful for the UI and reports without changing historical punch data.
  isAutoCheckout: { type: Boolean, default: false },

  correctionReason: { type: String, default: '' },
  correctedAt: { type: Date, default: null }
}, { timestamps: true });

// Same device/user/timestamp cannot be imported twice.
// WEB/AUTO use a synthetic deviceIp so they coexist with F28 records.
attendanceSchema.index({ deviceIp: 1, userId: 1, timestamp: 1 }, { unique: true });
attendanceSchema.index({ employeeId: 1, timestamp: 1 });
attendanceSchema.index({ employeeId: 1, punchType: 1, timestamp: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
