const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true, index: true },
  type: {
    type: String,
    enum: ['PUBLIC', 'COMPANY', 'OPTIONAL'],
    default: 'PUBLIC',
    index: true
  },
  description: { type: String, default: '' },
  recurringAnnual: { type: Boolean, default: false },
  active: { type: Boolean, default: true, index: true }
}, { timestamps: true });

holidaySchema.index({ name: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);
