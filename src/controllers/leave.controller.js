const { Leave, LeaveType, Employee } = require('../models');
const { notifyEmployee } = require('../services/notification.service');
const { restrictEmployeeFilter, assertEmployeeAllowed } = require('../services/access-scope.service');
const { getEmployeeLeaveBalances, resolveLeaveType, assertLeaveAvailable } = require('../services/leave.service');

function normalizeStatus(leave) {
  if (leave.status) return leave.status;
  return leave.approved ? 'APPROVED' : 'REJECTED';
}

function normalizeDates(body) {
  const fromDate = body.fromDate || body.date;
  const toDate = body.toDate || body.fromDate || body.date;
  if (!fromDate || !toDate) throw new Error('date or fromDate/toDate is required');
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error('Invalid leave dates');
  if (to < from) throw new Error('toDate cannot be before fromDate');
  return { fromDate: from, toDate: to, date: from };
}

async function list(req, res) {
  try {
    const filter = {};
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.type) filter.type = req.query.type;
    const scopedFilter = await restrictEmployeeFilter(req, filter);
    const leaves = await Leave.find(scopedFilter).sort({ fromDate: -1, date: -1 }).lean();
    res.json({ success: true, count: leaves.length, leaves: leaves.map(l => ({ ...l, status: normalizeStatus(l) })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

async function create(req, res) {
  try {
    if (!req.body.employeeId) return res.status(400).json({ success: false, message: 'employeeId is required' });
    if (!(await assertEmployeeAllowed(req, req.body.employeeId))) return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    const dates = normalizeDates(req.body);
    const status = String(req.body.status || 'PENDING').toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw new Error('Invalid leave status');
    const days = Number(req.body.days || Math.max(1, Math.floor((dates.toDate - dates.fromDate) / 86400000) + 1));
    if (!Number.isFinite(days) || days <= 0) throw new Error('days must be greater than 0');
    const leaveType = await resolveLeaveType(req.body);
    if (req.body.leaveTypeId && !leaveType) throw new Error('Leave type not found');
    if (leaveType) await assertLeaveAvailable(req.body.employeeId, leaveType, days, status);
    const leave = await Leave.create({
      ...req.body,
      leaveTypeId: leaveType?._id || req.body.leaveTypeId || null,
      type: leaveType?.name || req.body.type || 'Leave',
      date: dates.date,
      fromDate: dates.fromDate,
      toDate: dates.toDate,
      days,
      status,
      approved: status === 'APPROVED',
      appliedAt: req.body.appliedAt || new Date()
    });
    res.status(201).json({ success: true, leave: { ...leave.toObject(), status } });
  } catch (e) { res.status(e.statusCode || 400).json({ success: false, code: e.code || 'LEAVE_CREATE_FAILED', message: e.message, balance: e.balance || null }); }
}


async function update(req, res) {
  try {
    const existing = await Leave.findById(req.params.id).lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (!(await assertEmployeeAllowed(req, existing.employeeId))) {
      return res.status(403).json({
        success: false,
        message: 'Leave is outside your assigned data scope',
        code: 'SCOPE_FORBIDDEN'
      });
    }

    const currentStatus = normalizeStatus(existing);
    if (currentStatus !== 'PENDING') {
      return res.status(409).json({
        success: false,
        code: 'LEAVE_NOT_EDITABLE',
        message: 'Only pending leave requests can be edited. Delete/cancel and create a corrected request instead.'
      });
    }

    const merged = { ...existing, ...req.body };
    const dates = normalizeDates(merged);
    const days = Number(
      req.body.days ??
      Math.max(1, Math.floor((dates.toDate - dates.fromDate) / 86400000) + 1)
    );
    if (!Number.isFinite(days) || days <= 0) throw new Error('days must be greater than 0');

    const leaveType = await resolveLeaveType({
      leaveTypeId: req.body.leaveTypeId ?? existing.leaveTypeId,
      type: req.body.type ?? existing.type
    });
    if ((req.body.leaveTypeId ?? existing.leaveTypeId) && !leaveType) {
      throw new Error('Leave type not found');
    }
    if (leaveType) {
      await assertLeaveAvailable(existing.employeeId, leaveType, days, 'PENDING', {
        excludeLeaveId: existing._id
      });
    }

    const patch = {
      date: dates.date,
      fromDate: dates.fromDate,
      toDate: dates.toDate,
      days,
      leaveTypeId: leaveType?._id || req.body.leaveTypeId || existing.leaveTypeId || null,
      type: leaveType?.name || req.body.type || existing.type || 'Leave',
      reason: req.body.reason ?? existing.reason ?? '',
      halfDay: Boolean(req.body.halfDay ?? existing.halfDay),
      halfDayPeriod: (req.body.halfDay ?? existing.halfDay)
        ? String(req.body.halfDayPeriod ?? existing.halfDayPeriod ?? 'FIRST').toUpperCase()
        : '',
      status: 'PENDING',
      approved: false,
      managerRemarks: ''
    };

    if (!['FIRST', 'SECOND', ''].includes(patch.halfDayPeriod)) {
      throw new Error('halfDayPeriod must be FIRST or SECOND');
    }

    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { new: true, runValidators: true }
    ).lean();

    return res.json({
      success: true,
      message: 'Leave request updated',
      leave: { ...leave, status: 'PENDING' }
    });
  } catch (e) {
    return res.status(e.statusCode || 400).json({
      success: false,
      code: e.code || 'LEAVE_UPDATE_FAILED',
      message: e.message,
      balance: e.balance || null
    });
  }
}

async function approve(req, res) {
  try {
    const existing = await Leave.findById(req.params.id).select('employeeId').lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Leave request not found' });
    if (!(await assertEmployeeAllowed(req, existing.employeeId))) return res.status(403).json({ success: false, message: 'Leave is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    const leave = await Leave.findByIdAndUpdate(req.params.id,
      { $set: { status: 'APPROVED', approved: true, managerRemarks: req.body.managerRemarks || '' } },
      { new: true, runValidators: true }).lean();
    try { await notifyEmployee(leave.employeeId, 'leaveDecision', 'Leave request approved', `Your leave request from ${new Date(leave.fromDate || leave.date).toLocaleDateString()} to ${new Date(leave.toDate || leave.date).toLocaleDateString()} has been approved.`); } catch (notifyError) { console.error('Leave approval notification failed:', notifyError.message); }
    res.json({ success: true, message: 'Leave approved', leave: { ...leave, status: 'APPROVED' } });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}

async function reject(req, res) {
  try {
    const reason = String(req.body.reason || req.body.managerRemarks || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    const existing = await Leave.findById(req.params.id).select('employeeId').lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Leave request not found' });
    if (!(await assertEmployeeAllowed(req, existing.employeeId))) return res.status(403).json({ success: false, message: 'Leave is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    const leave = await Leave.findByIdAndUpdate(req.params.id,
      { $set: { status: 'REJECTED', approved: false, managerRemarks: reason } },
      { new: true, runValidators: true }).lean();
    try { await notifyEmployee(leave.employeeId, 'leaveDecision', 'Leave request rejected', `Your leave request was rejected. Reason: ${reason}`); } catch (notifyError) { console.error('Leave rejection notification failed:', notifyError.message); }
    res.json({ success: true, message: 'Leave rejected', leave: { ...leave, status: 'REJECTED' } });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}

async function remove(req, res) {
  try { const existing = await Leave.findById(req.params.id).select('employeeId').lean(); if (!existing) return res.status(404).json({ success: false, message: 'Leave request not found' }); if (!(await assertEmployeeAllowed(req, existing.employeeId))) return res.status(403).json({ success: false, message: 'Leave is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' }); const result = await Leave.findByIdAndDelete(req.params.id); res.json({ success: true, deleted: Boolean(result) }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

async function calendar(req, res) {
  try {
    const from = new Date(req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const to = new Date(req.query.to || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
    const filter = { status: 'APPROVED', $or: [
      { fromDate: { $lte: to }, toDate: { $gte: from } },
      { fromDate: null, date: { $gte: from, $lte: to } }
    ] };
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    const scopedFilter = await restrictEmployeeFilter(req, filter);
    const leaves = await Leave.find(scopedFilter).sort({ fromDate: 1, date: 1 }).lean();
    res.json({ success: true, from, to, leaves });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

async function balances(req, res) {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const employeeFilter = req.query.employeeId ? { employeeId: req.query.employeeId } : {};
    const scopedEmployeeFilter = await restrictEmployeeFilter(req, employeeFilter);
    const employees = await Employee.find({ active: true, ...scopedEmployeeFilter }).lean();
    const data = [];
    for (const employee of employees) {
      const summary = await getEmployeeLeaveBalances(employee.employeeId, year);
      for (const balance of summary.balances) {
        data.push({ ...balance, employeeId: employee.employeeId, employeeName: employee.name });
      }
    }
    res.json({ success: true, year, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

module.exports = { list, create, update, approve, reject, remove, calendar, balances };
