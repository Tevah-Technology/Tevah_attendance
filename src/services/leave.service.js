const { Leave, LeaveType, Employee } = require('../models');
const { getLeaveRule, effectiveLeavePolicy } = require('./leave-rule.service');
const { holidayDateKeys, startOfDay, dateKey } = require('./holiday.service');

function yearBounds(year) {
  const start = new Date(Number(year), 0, 1);
  const end = new Date(Number(year) + 1, 0, 1);
  return { start, end };
}

function monthBounds(date) {
  const d = new Date(date);
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1)
  };
}

function normalizeLeaveTypeName(value) {
  return String(value || '').trim().toLowerCase();
}

async function resolveLeaveType({ leaveTypeId, type } = {}) {
  if (leaveTypeId) {
    const byId = await LeaveType.findById(leaveTypeId).lean();
    if (byId) return byId;
  }
  const needle = normalizeLeaveTypeName(type);
  if (needle) {
    const all = await LeaveType.find({ active: true }).lean();
    const found = all.find(t => normalizeLeaveTypeName(t.name) === needle || normalizeLeaveTypeName(t.code) === needle);
    if (found) return found;
  }
  const activeCount = await LeaveType.countDocuments({ active: true });
  if (activeCount === 1) return LeaveType.findOne({ active: true }).lean();
  return null;
}

function leaveDays(leave) {
  const n = Number(leave.days);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function errorWith(code, message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function isWeekend(date) {
  const day = new Date(date).getDay();
  return day === 0 || day === 6;
}

function dayDiff(a, b) {
  const one = startOfDay(a);
  const two = startOfDay(b);
  return Math.floor((two - one) / 86400000);
}

async function calculateChargeableDays(fromDate, toDate, policy, { halfDay = false } = {}) {
  if (halfDay) return { days: 0.5, excludedWeekends: 0, excludedHolidays: 0, chargeableDates: [startOfDay(fromDate)] };

  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  const { exact, recurring } = policy.includeHolidaysInLeaveDays
    ? { exact: new Set(), recurring: new Set() }
    : await holidayDateKeys(from, to);

  let excludedWeekends = 0;
  let excludedHolidays = 0;
  const chargeableDates = [];
  const cursor = new Date(from);

  while (cursor <= to) {
    const exactKey = cursor.toISOString().slice(0, 10);
    const holiday = exact.has(exactKey) || recurring.has(dateKey(cursor));
    const weekend = isWeekend(cursor);

    if (!policy.includeWeekendsInLeaveDays && weekend) {
      excludedWeekends += 1;
    } else if (!policy.includeHolidaysInLeaveDays && holiday) {
      excludedHolidays += 1;
    } else {
      chargeableDates.push(new Date(cursor));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    days: chargeableDates.length,
    excludedWeekends,
    excludedHolidays,
    chargeableDates
  };
}

async function previousYearCarryForward(employeeId, leaveType, year, rule) {
  if (!leaveType || !leaveType.carryForward || !rule.carryForwardEnabled) return 0;
  const previous = Number(year) - 1;
  const { start, end } = yearBounds(previous);
  const leaves = await Leave.find({
    employeeId: String(employeeId),
    leaveTypeId: leaveType._id,
    status: 'APPROVED',
    $or: [
      { fromDate: { $lt: end }, toDate: { $gte: start } },
      { fromDate: null, date: { $gte: start, $lt: end } }
    ]
  }).lean();
  const used = leaves.reduce((sum, row) => sum + leaveDays(row), 0);
  const unused = Math.max(0, Number(leaveType.annualAllocation || 0) - used);
  const typeLimit = leaveType.carryForwardLimitDays;
  const globalLimit = Number(rule.carryForwardLimitDays || 0);
  const limit = typeLimit !== null && typeLimit !== undefined
    ? Number(typeLimit)
    : globalLimit;
  return limit > 0 ? Math.min(unused, limit) : unused;
}

async function getEmployeeLeaveBalances(employeeId, year = new Date().getFullYear()) {
  const y = Number(year);
  const { start, end } = yearBounds(y);
  const [types, leaves, rule] = await Promise.all([
    LeaveType.find({ active: true }).sort({ name: 1 }).lean(),
    Leave.find({ employeeId: String(employeeId), status: { $in: ['APPROVED', 'PENDING'] }, $or: [
      { fromDate: { $lt: end }, toDate: { $gte: start } },
      { fromDate: null, date: { $gte: start, $lt: end } }
    ] }).sort({ fromDate: -1, date: -1 }).lean(),
    getLeaveRule()
  ]);

  const rows = [];
  for (const type of types) {
    const matching = leaves.filter(l => String(l.leaveTypeId || '') === String(type._id));
    const used = matching.filter(l => l.status === 'APPROVED').reduce((sum, l) => sum + leaveDays(l), 0);
    const pending = matching.filter(l => l.status === 'PENDING').reduce((sum, l) => sum + leaveDays(l), 0);
    const baseAllocated = Number(type.annualAllocation || 0);
    const carryForward = await previousYearCarryForward(employeeId, type, y, rule);
    const allocated = baseAllocated + carryForward;
    const policy = effectiveLeavePolicy(rule, type);
    const negativeLimit = policy.negativeBalanceAllowed ? Number(policy.maxNegativeBalanceDays || 0) : 0;
    const remaining = allocated - used - pending;
    rows.push({
      leaveTypeId: type._id,
      leaveType: type.name,
      code: type.code,
      baseAllocated,
      carryForward,
      allocated,
      used,
      pending,
      remaining,
      availableWithNegativeLimit: remaining + negativeLimit,
      overdrawn: remaining < 0,
      exhausted: remaining <= 0,
      paid: Boolean(type.paid),
      carryForwardEnabled: Boolean(type.carryForward && rule.carryForwardEnabled),
      negativeBalanceAllowed: Boolean(policy.negativeBalanceAllowed),
      maxNegativeBalanceDays: negativeLimit
    });
  }

  const totals = rows.reduce((a, r) => {
    a.allocated += r.allocated;
    a.used += r.used;
    a.pending += r.pending;
    a.remaining += r.remaining;
    return a;
  }, { allocated: 0, used: 0, pending: 0, remaining: 0 });

  return {
    year: y,
    employeeId: String(employeeId),
    balances: rows,
    totals,
    anyExhausted: rows.some(r => r.exhausted),
    allExhausted: rows.length > 0 && rows.every(r => r.exhausted)
  };
}

async function getLeaveHistory(employeeId, year = null) {
  const filter = { employeeId: String(employeeId) };
  if (year != null) {
    const { start, end } = yearBounds(year);
    filter.$or = [
      { fromDate: { $lt: end }, toDate: { $gte: start } },
      { fromDate: null, date: { $gte: start, $lt: end } }
    ];
  }
  const rows = await Leave.find(filter).populate('leaveTypeId').sort({ fromDate: -1, date: -1, createdAt: -1 }).lean();
  return rows.map(l => ({ ...l, status: l.status || (l.approved ? 'APPROVED' : 'REJECTED') }));
}

async function getExistingUsage(employeeId, leaveType, start, end, excludeLeaveId = null) {
  const filter = {
    employeeId: String(employeeId),
    status: { $in: ['APPROVED', 'PENDING'] },
    $or: [
      { fromDate: { $lt: end }, toDate: { $gte: start } },
      { fromDate: null, date: { $gte: start, $lt: end } }
    ]
  };
  if (leaveType?._id) filter.leaveTypeId = leaveType._id;
  if (excludeLeaveId) filter._id = { $ne: excludeLeaveId };
  return Leave.find(filter).lean();
}

async function assertLeaveAvailable(employeeId, leaveType, requestedDays, status = 'PENDING', options = {}) {
  if (!leaveType) return { enforced: false, available: null };
  const year = new Date(options.fromDate || Date.now()).getFullYear();
  const { start, end } = yearBounds(year);
  const [existing, rule] = await Promise.all([
    getExistingUsage(employeeId, leaveType, start, end, options.excludeLeaveId),
    getLeaveRule()
  ]);
  const used = existing.filter(l => l.status === 'APPROVED').reduce((s, l) => s + leaveDays(l), 0);
  const pending = existing.filter(l => l.status === 'PENDING').reduce((s, l) => s + leaveDays(l), 0);
  const carryForward = await previousYearCarryForward(employeeId, leaveType, year, rule);
  const allocated = Number(leaveType.annualAllocation || 0) + carryForward;
  const policy = effectiveLeavePolicy(rule, leaveType);
  const available = allocated - used - pending;
  const negativeLimit = policy.negativeBalanceAllowed ? Number(policy.maxNegativeBalanceDays || 0) : 0;
  const allowedAvailable = available + negativeLimit;

  if (requestedDays > allowedAvailable) {
    const error = errorWith(
      'LEAVE_BALANCE_EXCEEDED',
      `Insufficient ${leaveType.name} leave balance. Remaining: ${available} day(s), negative allowance: ${negativeLimit} day(s), requested: ${requestedDays} day(s).`,
      409
    );
    error.balance = {
      leaveTypeId: leaveType._id,
      leaveType: leaveType.name,
      allocated,
      carryForward,
      used,
      pending,
      remaining: available,
      negativeAllowance: negativeLimit,
      requested: requestedDays,
      status
    };
    throw error;
  }
  return { enforced: true, allocated, carryForward, used, pending, available, negativeLimit };
}

async function assertNoOverlap(employeeId, fromDate, toDate, excludeLeaveId = null) {
  const filter = {
    employeeId: String(employeeId),
    status: { $in: ['APPROVED', 'PENDING'] },
    $or: [
      { fromDate: { $lte: toDate }, toDate: { $gte: fromDate } },
      { fromDate: null, date: { $gte: fromDate, $lte: toDate } }
    ]
  };
  if (excludeLeaveId) filter._id = { $ne: excludeLeaveId };
  const conflict = await Leave.findOne(filter).lean();
  if (conflict) {
    throw errorWith('LEAVE_OVERLAP', 'The requested dates overlap an existing pending or approved leave request.', 409, { conflictLeaveId: conflict._id });
  }
}

async function assertMinimumGap(employeeId, fromDate, toDate, days, excludeLeaveId = null) {
  if (!days || days <= 0) return;
  const filter = { employeeId: String(employeeId), status: { $in: ['APPROVED', 'PENDING'] } };
  if (excludeLeaveId) filter._id = { $ne: excludeLeaveId };
  const previous = await Leave.findOne({ ...filter, $or: [{ toDate: { $lt: fromDate } }, { fromDate: null, date: { $lt: fromDate } }] })
    .sort({ toDate: -1, date: -1 }).lean();
  const next = await Leave.findOne({ ...filter, $or: [{ fromDate: { $gt: toDate } }, { fromDate: null, date: { $gt: toDate } }] })
    .sort({ fromDate: 1, date: 1 }).lean();

  const prevDate = previous ? new Date(previous.toDate || previous.date) : null;
  const nextDate = next ? new Date(next.fromDate || next.date) : null;
  if (prevDate && dayDiff(prevDate, fromDate) - 1 < days) {
    throw errorWith('LEAVE_MINIMUM_GAP', `At least ${days} day(s) gap is required between leave periods.`, 409);
  }
  if (nextDate && dayDiff(toDate, nextDate) - 1 < days) {
    throw errorWith('LEAVE_MINIMUM_GAP', `At least ${days} day(s) gap is required between leave periods.`, 409);
  }
}

function isSickLeave(rule, leaveType) {
  if (!leaveType) return false;
  const codes = new Set((rule.sickLeaveCodes || []).map(v => String(v).trim().toUpperCase()));
  return codes.has(String(leaveType.code || '').trim().toUpperCase()) ||
    String(leaveType.name || '').toLowerCase().includes('sick');
}

async function validateLeaveRequest({
  employeeId,
  leaveType,
  fromDate,
  toDate,
  halfDay = false,
  requestedStatus = 'PENDING',
  excludeLeaveId = null,
  documentSubmitted = false,
  isAdminGrant = false
}) {
  const [rule, employee] = await Promise.all([
    getLeaveRule(),
    Employee.findOne({ employeeId: String(employeeId) }).lean()
  ]);
  if (!employee) throw errorWith('EMPLOYEE_NOT_FOUND', 'Employee not found', 404);

  const policy = effectiveLeavePolicy(rule, leaveType);
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  const today = startOfDay(new Date());

  if (halfDay && leaveType && leaveType.halfDayAllowed === false) {
    throw errorWith('HALF_DAY_NOT_ALLOWED', `${leaveType.name} does not allow half-day leave.`, 409);
  }

  if (from < today) {
    const backdatedDays = dayDiff(from, today);
    if (!rule.allowBackdatedLeave || backdatedDays > Number(rule.maxBackdatedDays || 0)) {
      throw errorWith('BACKDATED_LEAVE_NOT_ALLOWED', `Backdated leave is not allowed beyond ${Number(rule.maxBackdatedDays || 0)} day(s).`, 409);
    }
  } else {
    const advanceDays = dayDiff(today, from);
    if (advanceDays < Number(policy.minimumAdvanceNoticeDays || 0) && !isAdminGrant) {
      throw errorWith('ADVANCE_NOTICE_REQUIRED', `This leave requires at least ${Number(policy.minimumAdvanceNoticeDays || 0)} day(s) advance notice.`, 409);
    }
  }

  if (rule.probationRestrictionEnabled && !rule.allowLeaveDuringProbation && !isAdminGrant) {
    const joining = employee.dateOfJoining ? startOfDay(employee.dateOfJoining) : startOfDay(employee.createdAt || today);
    const probationEnd = employee.probationEndDate
      ? startOfDay(employee.probationEndDate)
      : new Date(joining.getTime() + Number(rule.probationPeriodDays || 0) * 86400000);
    if (from < probationEnd) {
      throw errorWith('PROBATION_LEAVE_RESTRICTED', `Leave is restricted during probation until ${probationEnd.toISOString().slice(0, 10)}.`, 409);
    }
  }

  if (!rule.allowLeaveDuringNoticePeriod && employee.noticePeriodStartDate && from >= startOfDay(employee.noticePeriodStartDate) && !isAdminGrant) {
    throw errorWith('NOTICE_PERIOD_LEAVE_RESTRICTED', 'Leave is not allowed during the notice period.', 409);
  }

  const calculated = await calculateChargeableDays(from, to, policy, { halfDay });
  if (calculated.days <= 0) {
    throw errorWith('NO_CHARGEABLE_LEAVE_DAYS', 'The selected range contains no chargeable leave days after weekend/holiday exclusions.', 409);
  }

  if (Number(policy.maxConsecutiveDays || 0) > 0 && calculated.days > Number(policy.maxConsecutiveDays)) {
    throw errorWith('MAX_CONSECUTIVE_LEAVE_EXCEEDED', `Maximum consecutive leave is ${policy.maxConsecutiveDays} day(s).`, 409);
  }

  if (rule.blockOverlappingRequests) {
    await assertNoOverlap(employeeId, from, to, excludeLeaveId);
  }
  await assertMinimumGap(employeeId, from, to, Number(rule.minimumGapBetweenLeaveDays || 0), excludeLeaveId);

  const { start: monthStart, end: monthEnd } = monthBounds(from);
  if (Number(policy.maxLeaveDaysPerMonth || 0) > 0) {
    const monthly = await getExistingUsage(employeeId, null, monthStart, monthEnd, excludeLeaveId);
    const usedMonth = monthly.reduce((sum, row) => sum + leaveDays(row), 0);
    if (usedMonth + calculated.days > Number(policy.maxLeaveDaysPerMonth)) {
      throw errorWith('MONTHLY_LEAVE_LIMIT_EXCEEDED', `Monthly leave limit is ${policy.maxLeaveDaysPerMonth} day(s).`, 409, { used: usedMonth, requested: calculated.days });
    }
  }

  if (Number(policy.maxLeaveDaysPerYear || 0) > 0) {
    const { start: yearStart, end: yearEnd } = yearBounds(from.getFullYear());
    const yearly = await getExistingUsage(employeeId, null, yearStart, yearEnd, excludeLeaveId);
    const usedYear = yearly.reduce((sum, row) => sum + leaveDays(row), 0);
    if (usedYear + calculated.days > Number(policy.maxLeaveDaysPerYear)) {
      throw errorWith('YEARLY_LEAVE_LIMIT_EXCEEDED', `Yearly leave limit is ${policy.maxLeaveDaysPerYear} day(s).`, 409, { used: usedYear, requested: calculated.days });
    }
  }

  const balance = leaveType
    ? await assertLeaveAvailable(employeeId, leaveType, calculated.days, requestedStatus, { excludeLeaveId, fromDate: from })
    : { enforced: false };

  const sick = isSickLeave(rule, leaveType);
  const threshold = Number(policy.documentRequiredAfterDays ?? rule.documentRequiredAfterDays ?? 0);
  const documentRequired = Boolean(
    (policy.documentRequired === true || (rule.documentRequiredForSickLeave && sick)) &&
    (threshold <= 0 || calculated.days > threshold)
  );

  let status = String(requestedStatus || 'PENDING').toUpperCase();
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) status = 'PENDING';
  if (!isAdminGrant && policy.approvalRequired) status = 'PENDING';
  if (!isAdminGrant && !policy.approvalRequired && status === 'PENDING') status = 'APPROVED';
  if (documentRequired && !documentSubmitted && status === 'APPROVED') status = 'PENDING';

  return {
    rule,
    policy,
    status,
    days: calculated.days,
    excludedWeekends: calculated.excludedWeekends,
    excludedHolidays: calculated.excludedHolidays,
    documentRequired,
    documentSubmitted: Boolean(documentSubmitted),
    balance
  };
}

module.exports = {
  getEmployeeLeaveBalances,
  getLeaveHistory,
  resolveLeaveType,
  assertLeaveAvailable,
  validateLeaveRequest,
  calculateChargeableDays,
  yearBounds,
  monthBounds
};
