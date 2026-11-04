const { Employee, Attendance, Leave } = require('../models');
const { getTodayStatus } = require('../services/attendance.service');
const { getEmployeeLeaveBalances, getLeaveHistory } = require('../services/leave.service');

async function profile(req, res) {
  if (!req.user.employeeId) return res.status(404).json({ success: false, message: 'No employee profile is linked to this account' });
  const employee = await Employee.findOne({ employeeId: req.user.employeeId }).populate('shiftId').lean();
  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found' });
  res.json({ success: true, employee });
}
async function updateProfile(req, res) {
  if (!req.user.employeeId) return res.status(404).json({ success: false, message: 'No employee profile is linked to this account' });
  const allowed = ['phone', 'email'];
  const update = {};
  for (const key of allowed) if (req.body[key] != null) update[key] = req.body[key];
  const employee = await Employee.findOneAndUpdate({ employeeId: req.user.employeeId }, { $set: update }, { new: true, runValidators: true }).lean();
  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found' });
  res.json({ success: true, employee });
}
async function attendance(req, res) {
  const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const rows = await Attendance.find({ employeeId: req.user.employeeId, timestamp: { $gte: from, $lte: to } }).sort({ timestamp: 1 }).lean();
  const status = await getTodayStatus(req.user.employeeId);
  res.json({ success: true, count: rows.length, data: rows, todayStatus: status });
}
async function leaves(req, res) {
  const year = Number(req.query.year || new Date().getFullYear());
  const [rows, balance] = await Promise.all([
    getLeaveHistory(req.user.employeeId, req.query.year == null ? null : year),
    getEmployeeLeaveBalances(req.user.employeeId, year)
  ]);
  res.json({
    success: true,
    count: rows.length,
    year,
    leaves: rows,
    balance,
    alert: balance.allExhausted
      ? { level: 'warning', code: 'ALL_LEAVE_EXHAUSTED', message: 'All allocated leave balances are exhausted.' }
      : balance.anyExhausted
        ? { level: 'warning', code: 'LEAVE_TYPE_EXHAUSTED', message: 'One or more leave types have no remaining balance.' }
        : null
  });
}

async function leaveSummary(req, res) {
  const year = Number(req.query.year || new Date().getFullYear());
  const balance = await getEmployeeLeaveBalances(req.user.employeeId, year);
  res.json({
    success: true,
    ...balance,
    alert: balance.allExhausted
      ? { level: 'warning', code: 'ALL_LEAVE_EXHAUSTED', message: 'All allocated leave balances are exhausted.' }
      : balance.anyExhausted
        ? { level: 'warning', code: 'LEAVE_TYPE_EXHAUSTED', message: 'One or more leave types have no remaining balance.' }
        : null
  });
}
module.exports = { profile, updateProfile, attendance, leaves, leaveSummary };
