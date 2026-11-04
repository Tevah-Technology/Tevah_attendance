const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'system' },
  general: {
    applicationName: { type: String, default: 'ZKTeco Attendance' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    dateFormat: { type: String, default: 'dd/MM/yyyy' },
    timeFormat: { type: String, enum: ['12', '24'], default: '24' },
    currency: { type: String, default: 'INR' },
    firstDayOfWeek: { type: Number, min: 1, max: 7, default: 1 }
  },
  company: {
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    gstin: { type: String, default: '' },
    logoUrl: { type: String, default: '' }
  },
  attendance: {
    automaticCalculation: { type: Boolean, default: true },
    automaticSync: { type: Boolean, default: true },
    syncIntervalMs: { type: Number, default: 300000, min: 10000 },
    manualCorrection: { type: Boolean, default: true },
    correctionReasonRequired: { type: Boolean, default: true },
    duplicateProtection: { type: Boolean, default: true }
  },
  notifications: {
    lateArrival: { type: Boolean, default: true },
    absence: { type: Boolean, default: true },
    earlyDeparture: { type: Boolean, default: true },
    overtime: { type: Boolean, default: true },
    incompletePunch: { type: Boolean, default: true },
    leaveRequest: { type: Boolean, default: true },
    leaveDecision: { type: Boolean, default: true },
    deviceDisconnected: { type: Boolean, default: true },
    syncFailure: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: false },
    whatsappEnabled: { type: Boolean, default: false },
    emailProvider: { type: String, enum: ['resend'], default: 'resend' },
    emailFrom: { type: String, default: '' },
    notificationRecipients: { type: [String], default: [] },
    whatsappDefaultTo: { type: String, default: '' }
  },
  leave: {
    approvalRequired: { type: Boolean, default: true },
    allowHalfDay: { type: Boolean, default: true },
    allowBackdated: { type: Boolean, default: false },
    reasonRequired: { type: Boolean, default: true },
    rejectionReasonRequired: { type: Boolean, default: true }
  },
  reports: {
    defaultFormat: { type: String, enum: ['xlsx', 'csv', 'pdf'], default: 'xlsx' },
    includePunches: { type: Boolean, default: true },
    includeWorkingHours: { type: Boolean, default: true },
    includeOvertime: { type: Boolean, default: true },
    includeLeave: { type: Boolean, default: true },
    includeCompanyHeader: { type: Boolean, default: true },
    includePageNumbers: { type: Boolean, default: true }
  },
  security: {
    sessionTimeoutMinutes: { type: Number, default: 30, min: 1 },
    auditLogging: { type: Boolean, default: true },
    maxLoginAttempts: { type: Number, default: 5, min: 1, max: 20 },
    lockoutMinutes: { type: Number, default: 15, min: 1, max: 1440 },
    passwordMinLength: { type: Number, default: 10, min: 8, max: 128 }
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
