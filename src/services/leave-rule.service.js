const { LeaveRule } = require('../models');

const DEFAULTS = {
  key: 'global',
  maxLeaveDaysPerMonth: 0,
  maxLeaveDaysPerYear: 0,
  minimumAdvanceNoticeDays: 0,
  probationRestrictionEnabled: false,
  probationPeriodDays: 90,
  allowLeaveDuringProbation: true,
  includeWeekendsInLeaveDays: false,
  includeHolidaysInLeaveDays: false,
  carryForwardEnabled: true,
  carryForwardLimitDays: 0,
  approvalRequired: true,
  negativeBalanceAllowed: false,
  maxNegativeBalanceDays: 0,
  documentRequiredForSickLeave: false,
  documentRequiredAfterDays: 2,
  sickLeaveCodes: ['SL', 'SICK'],
  allowBackdatedLeave: false,
  maxBackdatedDays: 0,
  blockOverlappingRequests: true,
  maxConsecutiveLeaveDays: 0,
  minimumGapBetweenLeaveDays: 0,
  allowLeaveDuringNoticePeriod: true
};

async function getLeaveRule({ lean = true } = {}) {
  let rule = await LeaveRule.findOne({ key: 'global' });
  if (!rule) rule = await LeaveRule.create(DEFAULTS);
  return lean ? rule.toObject() : rule;
}

function effectiveLeavePolicy(rule, leaveType = null) {
  const type = leaveType || {};
  const pick = (field, globalField = field) =>
    type[field] !== undefined && type[field] !== null ? type[field] : rule[globalField];

  return {
    maxLeaveDaysPerMonth: pick('maxDaysPerMonth', 'maxLeaveDaysPerMonth'),
    maxLeaveDaysPerYear: Number(rule.maxLeaveDaysPerYear || 0),
    minimumAdvanceNoticeDays: pick('minimumAdvanceNoticeDays'),
    includeWeekendsInLeaveDays: pick('includeWeekendsInLeaveDays'),
    includeHolidaysInLeaveDays: pick('includeHolidaysInLeaveDays'),
    carryForwardEnabled: Boolean(rule.carryForwardEnabled && type.carryForward !== false),
    carryForwardLimitDays: pick('carryForwardLimitDays'),
    approvalRequired: pick('approvalRequired'),
    negativeBalanceAllowed: pick('negativeBalanceAllowed'),
    maxNegativeBalanceDays: pick('maxNegativeBalanceDays'),
    documentRequired: pick('documentRequired'),
    documentRequiredAfterDays: pick('documentRequiredAfterDays'),
    maxConsecutiveDays: Number(type.maxConsecutiveDays || rule.maxConsecutiveLeaveDays || 0)
  };
}

module.exports = { DEFAULTS, getLeaveRule, effectiveLeavePolicy };
