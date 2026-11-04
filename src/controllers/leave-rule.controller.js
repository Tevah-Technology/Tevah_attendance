const { LeaveRule } = require('../models');
const { getLeaveRule } = require('../services/leave-rule.service');

const ALLOWED_FIELDS = new Set([
  'maxLeaveDaysPerMonth', 'maxLeaveDaysPerYear', 'minimumAdvanceNoticeDays',
  'probationRestrictionEnabled', 'probationPeriodDays', 'allowLeaveDuringProbation',
  'includeWeekendsInLeaveDays', 'includeHolidaysInLeaveDays',
  'carryForwardEnabled', 'carryForwardLimitDays', 'approvalRequired',
  'negativeBalanceAllowed', 'maxNegativeBalanceDays',
  'documentRequiredForSickLeave', 'documentRequiredAfterDays', 'sickLeaveCodes',
  'allowBackdatedLeave', 'maxBackdatedDays', 'blockOverlappingRequests',
  'maxConsecutiveLeaveDays', 'minimumGapBetweenLeaveDays',
  'allowLeaveDuringNoticePeriod'
]);

function pick(body = {}) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => ALLOWED_FIELDS.has(key)));
}

function validate(update) {
  const numeric = [
    'maxLeaveDaysPerMonth', 'maxLeaveDaysPerYear', 'minimumAdvanceNoticeDays',
    'probationPeriodDays', 'carryForwardLimitDays', 'maxNegativeBalanceDays',
    'documentRequiredAfterDays', 'maxBackdatedDays', 'maxConsecutiveLeaveDays',
    'minimumGapBetweenLeaveDays'
  ];
  for (const field of numeric) {
    if (update[field] !== undefined && (!Number.isFinite(Number(update[field])) || Number(update[field]) < 0)) {
      return `${field} must be a non-negative number`;
    }
  }
  if (update.sickLeaveCodes !== undefined && !Array.isArray(update.sickLeaveCodes)) {
    return 'sickLeaveCodes must be an array';
  }
  return null;
}

async function get(req, res) {
  try {
    const leaveRule = await getLeaveRule();
    res.json({ success: true, leaveRule });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function update(req, res) {
  try {
    const patch = pick(req.body);
    const error = validate(patch);
    if (error) return res.status(400).json({ success: false, message: error });
    if (Array.isArray(patch.sickLeaveCodes)) {
      patch.sickLeaveCodes = [...new Set(patch.sickLeaveCodes.map(v => String(v).trim().toUpperCase()).filter(Boolean))];
    }
    const leaveRule = await LeaveRule.findOneAndUpdate(
      { key: 'global' },
      { $set: patch, $setOnInsert: { key: 'global' } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, leaveRule });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

module.exports = { get, update };
