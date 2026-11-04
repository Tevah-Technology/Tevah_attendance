const mongoose = require('mongoose');

const dataScopeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['ALL', 'OWN_DEPARTMENT', 'ASSIGNED_EMPLOYEES', 'OWN_RECORDS', 'SELECTED_DEPARTMENTS', 'SELECTED_EMPLOYEES'],
    default: 'ALL'
  },
  departments: { type: [String], default: [] },
  employeeIds: { type: [String], default: [] }
}, { _id: false });

const roleSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  system: { type: Boolean, default: false, index: true },
  active: { type: Boolean, default: true, index: true },
  permissions: { type: [String], default: [] },
  dataScope: { type: dataScopeSchema, default: () => ({ type: 'ALL', departments: [], employeeIds: [] }) },
  approvalScope: { type: dataScopeSchema, default: () => ({ type: 'ALL', departments: [], employeeIds: [] }) },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
