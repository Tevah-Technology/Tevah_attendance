const { Leave, LeaveType } = require('../models');

function yearBounds(year) {
  const start = new Date(Number(year), 0, 1);
  const end = new Date(Number(year) + 1, 0, 1);
  return { start, end };
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

async function getEmployeeLeaveBalances(employeeId, year = new Date().getFullYear()) {
  const y = Number(year);
  const { start, end } = yearBounds(y);
  const [types, leaves] = await Promise.all([
    LeaveType.find({ active: true }).sort({ name: 1 }).lean(),
    Leave.find({ employeeId: String(employeeId), status: { $in: ['APPROVED', 'PENDING'] }, $or: [
      { fromDate: { $lt: end }, toDate: { $gte: start } },
      { fromDate: null, date: { $gte: start, $lt: end } }
    ] }).sort({ fromDate: -1, date: -1 }).lean()
  ]);

  const rows = types.map(type => {
    const matching = leaves.filter(l => String(l.leaveTypeId || '') === String(type._id));
    const used = matching.filter(l => l.status === 'APPROVED').reduce((sum, l) => sum + leaveDays(l), 0);
    const pending = matching.filter(l => l.status === 'PENDING').reduce((sum, l) => sum + leaveDays(l), 0);
    const allocated = Number(type.annualAllocation || 0);
    return {
      leaveTypeId: type._id,
      leaveType: type.name,
      code: type.code,
      allocated,
      used,
      pending,
      remaining: Math.max(0, allocated - used - pending),
      overdrawn: used > allocated,
      exhausted: allocated - used - pending <= 0,
      paid: Boolean(type.paid),
      carryForward: Boolean(type.carryForward)
    };
  });

  const totals = rows.reduce((a, r) => {
    a.allocated += r.allocated; a.used += r.used; a.pending += r.pending; a.remaining += r.remaining; return a;
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

async function assertLeaveAvailable(employeeId, leaveType, requestedDays, status = 'PENDING', options = {}) {
  if (!leaveType) return { enforced: false, available: null };
  const year = new Date().getFullYear();
  const { start, end } = yearBounds(year);
  const existingFilter = {
    employeeId: String(employeeId),
    leaveTypeId: leaveType._id,
    status: { $in: ['APPROVED', 'PENDING'] },
    $or: [
      { fromDate: { $lt: end }, toDate: { $gte: start } },
      { fromDate: null, date: { $gte: start, $lt: end } }
    ]
  };
  if (options.excludeLeaveId) {
    existingFilter._id = { $ne: options.excludeLeaveId };
  }
  const existing = await Leave.find(existingFilter).lean();
  const used = existing.filter(l => l.status === 'APPROVED').reduce((s, l) => s + leaveDays(l), 0);
  const pending = existing.filter(l => l.status === 'PENDING').reduce((s, l) => s + leaveDays(l), 0);
  const allocated = Number(leaveType.annualAllocation || 0);
  const available = Math.max(0, allocated - used - pending);
  if (requestedDays > available) {
    const error = new Error(`Insufficient ${leaveType.name} leave balance. Remaining: ${available} day(s), requested: ${requestedDays} day(s).`);
    error.code = 'LEAVE_BALANCE_EXCEEDED';
    error.statusCode = 409;
    error.balance = { leaveTypeId: leaveType._id, leaveType: leaveType.name, allocated, used, pending, remaining: available, requested: requestedDays, status };
    throw error;
  }
  return { enforced: true, allocated, used, pending, available };
}

module.exports = { getEmployeeLeaveBalances, getLeaveHistory, resolveLeaveType, assertLeaveAvailable, yearBounds };
