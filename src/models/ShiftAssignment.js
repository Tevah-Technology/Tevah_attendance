const mongoose = require('mongoose');

const shiftAssignmentSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      required: true,
      index: true
    },
    assignmentType: {
      type: String,
      enum: ['single_date', 'date_range', 'recurring'],
      default: 'single_date',
      index: true
    },
    date: {
      type: Date,
      default: null,
      index: true
    },
    startDate: {
      type: Date,
      default: null,
      index: true
    },
    endDate: {
      type: Date,
      default: null,
      index: true
    },
    recurringDays: {
      type: [Number],
      default: []
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      default: null
    }
  },
  { timestamps: true }
);

shiftAssignmentSchema.index({ employeeId: 1, assignmentType: 1, date: 1, active: 1 });
shiftAssignmentSchema.index({ employeeId: 1, startDate: 1, endDate: 1, active: 1 });

module.exports = mongoose.model('ShiftAssignment', shiftAssignmentSchema);
