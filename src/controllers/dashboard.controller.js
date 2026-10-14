const { Employee } = require('../models');
const { buildReport, aggregate } = require('../services/report.service');
const { syncAttendance } = require('../services/attendance.service');
const deviceService = require('../services/device.service');
const { getAllowedEmployeeIds } = require('../services/access-scope.service');

async function summary(req, res) {
  try {
    const date = req.query.date || new Date();
    const employeeIds = await getAllowedEmployeeIds(req);
    const data = await buildReport({ from: date, to: date, employeeIds });
    const summary = aggregate(data);
    const device = req.permissions?.includes('dashboard.deviceHealth.view') || req.access?.roleCode === 'SUPER_ADMIN'
      ? await deviceService.getInfo().catch(() => null)
      : null;
    const employees = employeeIds === null ? await Employee.countDocuments({ active: true }) : employeeIds.length;
    const present = data.filter(r => r.status === 'PRESENT').length;
    const absent = data.filter(r => r.status === 'ABSENT').length;
    const leave = data.filter(r => r.status === 'LEAVE').length;
    const late = data.filter(r => r.lateMinutes > 0).length;
    const overtime = data.filter(r => r.overtimeMinutes > 0).length;
    res.json({ success: true, date, employees, present, absent, leave, late, overtime, summary, device });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
}

async function sync(req, res) {
  try { res.json({ success: true, result: await syncAttendance() }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
}

module.exports = { summary, sync };
