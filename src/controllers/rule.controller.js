const { Rule } = require('../models');
const { isValidTime } = require('../utils/validators');

const TIME_FIELDS = ['morningStartTime', 'lateAfterTime', 'middayAutoCheckoutTime', 'afternoonStartTime', 'dayEndAutoCheckoutTime'];
const ALLOWED_FIELDS = new Set([
  'name', 'defaultShiftId', 'autoAlternatePunches', 'allowMultipleBreaks',
  'overtimeEnabled', 'overtimeAfterMinutes', 'minimumOvertimeMinutes',
  'halfDayEnabled', 'halfDayMinutes', 'fullDayMinutes', 'twoHalfDaysEqualOneDay',
  'attendanceUseEnvHours', 'morningStartTime', 'lateAfterTime', 'consecutiveLateThreshold',
  'consecutiveLatePenaltyUnits', 'middayAutoCheckoutTime', 'afternoonStartTime',
  'dayEndAutoCheckoutTime', 'autoCheckoutEnabled'
]);

function validate(body = {}) {
  for (const field of TIME_FIELDS) {
    if (body[field] !== undefined && !isValidTime(body[field])) return `${field} must be HH:mm`;
  }
  if (body.halfDayMinutes !== undefined && (!Number.isFinite(Number(body.halfDayMinutes)) || Number(body.halfDayMinutes) < 0)) return 'halfDayMinutes must be a non-negative number';
  if (body.fullDayMinutes !== undefined && (!Number.isFinite(Number(body.fullDayMinutes)) || Number(body.fullDayMinutes) < 1)) return 'fullDayMinutes must be at least 1';
  const halfDayMinutes = Number(body.halfDayMinutes ?? 240);
  const fullDayMinutes = Number(body.fullDayMinutes ?? 480);
  if (fullDayMinutes < halfDayMinutes) return 'fullDayMinutes must be greater than or equal to halfDayMinutes';
  const times = { morningStartTime: body.morningStartTime, lateAfterTime: body.lateAfterTime, middayAutoCheckoutTime: body.middayAutoCheckoutTime, afternoonStartTime: body.afternoonStartTime, dayEndAutoCheckoutTime: body.dayEndAutoCheckoutTime };
  const complete = TIME_FIELDS.every(k => times[k] !== undefined);
  if (complete) {
    const n = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    if (!(n(times.morningStartTime) <= n(times.lateAfterTime) && n(times.lateAfterTime) < n(times.middayAutoCheckoutTime) && n(times.middayAutoCheckoutTime) < n(times.afternoonStartTime) && n(times.afternoonStartTime) < n(times.dayEndAutoCheckoutTime))) {
      return 'Rule times must be ordered: morningStartTime <= lateAfterTime < middayAutoCheckoutTime < afternoonStartTime < dayEndAutoCheckoutTime';
    }
  }
  return null;
}

function pick(body = {}) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => ALLOWED_FIELDS.has(key)));
}

async function get(req, res) {
  try {
    let rule = await Rule.findOne().populate('defaultShiftId').lean();
    if (!rule) rule = (await Rule.create({})).toObject();
    res.json({ success: true, rule });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

async function update(req, res) {
  try {
    const update = pick(req.body);
    const existing = await Rule.findOne().lean();
    const candidate = { ...(existing || {}), ...update };
    const error = validate(candidate);
    if (error) return res.status(400).json({ success: false, message: error });
    const rule = existing
      ? await Rule.findByIdAndUpdate(existing._id, { $set: update }, { new: true, runValidators: true })
      : await Rule.create(update);
    res.json({ success: true, rule });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}

module.exports = { get, update };
