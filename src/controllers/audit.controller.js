const { AuditLog } = require('../models');
async function list(req, res) {
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.actorId) filter.actorId = req.query.actorId;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, count: logs.length, logs });
}
module.exports = { list };
