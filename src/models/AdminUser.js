const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  // Kept as a role code for backward compatibility. Custom roles may use their own code.
  role: { type: String, default: 'EMPLOYEE', uppercase: true, trim: true, index: true },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null, index: true },
  employeeId: { type: String, default: '', index: true },
  active: { type: Boolean, default: true, index: true },
  lastLoginAt: { type: Date, default: null },
  mustChangePassword: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);
