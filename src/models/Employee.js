const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    // ========================================================
    // EMPLOYEE INFORMATION
    // ========================================================

    employeeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    department: {
      type: String,
      default: '',
      trim: true
    },

    designation: {
      type: String,
      default: '',
      trim: true
    },

    phone: {
      type: String,
      default: ''
    },

    email: {
      type: String,
      default: ''
    },

    // ========================================================
    // ZKTECO DEVICE INFORMATION
    // ========================================================

    deviceIp: {
      type: String,
      default: ''
    },

    // Internal numeric UID used by the F28
    deviceUid: {
      type: Number,
      default: null,
      index: true
    },

    // User ID stored on the F28
    deviceUserId: {
      type: String,
      default: ''
    },

    // Card number
    cardNo: {
      type: Number,
      default: 0
    },

    // ZKTeco privilege / role
    deviceRole: {
      type: Number,
      default: 0
    },

    // ========================================================
    // FINGERPRINT INFORMATION
    // ========================================================

    fingerprintEnrolled: {
      type: Boolean,
      default: false
    },

    fingerprintIds: {
      type: [Number],
      default: []
    },

    // ========================================================
    // SHIFT
    // ========================================================

    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null
    },

    // ========================================================
    // STATUS
    // ========================================================

    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.model(
    'Employee',
    employeeSchema
  );