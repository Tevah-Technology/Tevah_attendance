const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: String,
  actorEmail: String,
  actorRole: String,
  action: { type: String, required: true, index: true },
  method: String,
  path: String,
  ip: String,
  targetId: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
module.exports = mongoose.model('AuditLog', auditLogSchema);
