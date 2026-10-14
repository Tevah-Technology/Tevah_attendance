const express = require('express');
const router = express.Router();

const device = require('../controllers/device.controller');
const employee = require('../controllers/employee.controller');
const attendance = require('../controllers/attendance.controller');
const report = require('../controllers/report.controller');
const shift = require('../controllers/shift.controller');
const rule = require('../controllers/rule.controller');
const leave = require('../controllers/leave.controller');
const leaveType = require('../controllers/leave-type.controller');
const settings = require('../controllers/settings.controller');
const dashboard = require('../controllers/dashboard.controller');
const system = require('../controllers/system.controller');
const auth = require('../controllers/auth.controller');
const adminUser = require('../controllers/admin-user.controller');
const notification = require('../controllers/notification.controller');
const backup = require('../controllers/backup.controller');
const me = require('../controllers/me.controller');
const audit = require('../controllers/audit.controller');
const role = require('../controllers/role.controller');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { setBroadcaster } = require('../services/attendance.service');

const p = requirePermission;

// ============================================================
// AUTH
// ============================================================
router.post('/auth/login', auth.login);
router.post('/auth/refresh', auth.refresh);
router.post('/auth/logout', auth.logout);
// Public self-registration: no Bearer token required.
router.post('/auth/register', auth.register);
router.use(authenticate);
router.get('/auth/me', auth.me);
router.put('/auth/change-password', auth.changePassword);
router.get('/me/permissions', role.myPermissions);

// ============================================================
// EMPLOYEE SELF SERVICE
// ============================================================
router.get('/me/profile', p('self.profile.view'), me.profile);
router.put('/me/profile', p('self.profile.edit'), me.updateProfile);
router.get('/me/attendance', p('self.attendance.view'), me.attendance);
router.get('/me/attendance/status', p('self.attendance.view'), attendance.selfStatus);
router.post('/me/attendance/check-in', p('self.attendance.checkin'), attendance.selfCheckIn);
router.post('/me/attendance/check-out', p('self.attendance.checkout'), attendance.selfCheckOut);
router.get('/me/leaves', p('self.leave.view'), me.leaves);
router.get('/me/leave-summary', p('self.leave.view'), me.leaveSummary);

// ============================================================
// ROLE / PERMISSION MANAGEMENT
// ============================================================
router.get('/permissions/catalog', p('roles.view'), role.catalog);
router.get('/permissions/templates', p('roles.view'), role.templates);
router.get('/roles', p('roles.view'), role.list);
router.post('/roles', p('roles.create'), role.create);
router.get('/roles/:id', p('roles.view'), role.getOne);
router.put('/roles/:id', p('roles.edit'), role.update);
router.put('/roles/:id/permissions', p('roles.edit'), role.updatePermissions);
router.put('/roles/:id/scope', p('roles.edit'), role.updateScope);
router.delete('/roles/:id', p('roles.delete'), role.remove);
router.post('/roles/:id/duplicate', p('roles.duplicate'), role.duplicate);
router.get('/roles/:id/users', p('roles.view'), role.users);
router.post('/roles/:id/assign-users', p('roles.assign'), role.assignUsers);
router.delete('/roles/:id/users/:userId', p('roles.assign'), role.unassignUser);

// ============================================================
// DASHBOARD / SYSTEM
// ============================================================
router.get('/dashboard/summary', p('dashboard.view'), dashboard.summary);
router.post('/dashboard/sync', p('dashboard.sync'), dashboard.sync);
router.get('/system/info', p('system.view'), system.info);

// ============================================================
// SETTINGS
// ============================================================
router.get('/settings', p('settings.view'), settings.get);
router.put('/settings', p('settings.edit'), settings.update);
router.get('/settings/:section', settings.getSection);
router.put('/settings/:section', settings.updateSection);

// ============================================================
// NOTIFICATIONS / AUDIT
// ============================================================
router.get('/notifications/config', p('notifications.view'), notification.config);
router.post('/notifications/test-email', p('notifications.test'), notification.testEmail);
router.post('/notifications/test-whatsapp', p('notifications.test'), notification.testWhatsApp);
router.get('/audit-logs', p('audit.view'), audit.list);

// ============================================================
// ADMIN USERS
// ============================================================
router.get('/admin-users', p('admin.users.view'), adminUser.list);
router.post('/admin-users', p('admin.users.create'), adminUser.create);
router.put('/admin-users/:id', p('admin.users.edit'), adminUser.update);
router.delete('/admin-users/:id', p('admin.users.delete'), adminUser.remove);

// ============================================================
// BACKUPS
// ============================================================
router.get('/backups', p('backup.view'), backup.list);
router.post('/backups', p('backup.create'), backup.create);
router.get('/backups/:filename/download', p('backup.download'), backup.download);
router.post('/backups/restore', p('backup.restore'), backup.restore);

// ============================================================
// F28 DEVICE
// ============================================================
router.get('/device/status', p('device.view'), device.status);
router.get('/device/users', p('device.users.view'), device.users);
router.post('/device/users', p('device.users.create'), device.createUser);
router.put('/device/users/:uid', p('device.users.edit'), device.updateUser);
router.delete('/device/users/:uid', p('device.users.delete'), device.deleteUser);
router.get('/device/time', p('device.time.view'), device.time);
router.get('/device/attendance', p('device.attendance.view'), device.attendance);
router.get('/device/attendance/diagnostics', p('device.attendance.view'), device.attendanceDiagnostics);
router.post('/device/time', p('device.time.edit'), device.setTime);
router.post('/device/sync', p('device.sync'), device.sync);
router.post('/device/sync/users', p('device.sync'), device.syncUsers);

// ============================================================
// EMPLOYEES
// ============================================================
router.get('/employees', p('employees.view'), employee.list);
router.post('/employees', p('employees.create'), employee.create);
router.post('/employees/sync-to-device', p('employees.sync'), employee.syncAllToDevice);
router.get('/employees/:id/login', p('employees.view'), employee.getLogin);
router.post('/employees/:id/login', p('employees.edit'), employee.createLogin);
router.put('/employees/:id/login', p('employees.edit'), employee.updateLogin);
router.get('/employees/:id', p('employees.view'), employee.getOne);
router.put('/employees/:id', p('employees.edit'), employee.update);
router.delete('/employees/:id', p('employees.delete'), employee.remove);
router.post('/employees/:id/sync-to-device', p('employees.sync'), employee.syncToDevice);

// ============================================================
// ATTENDANCE
// ============================================================
router.get('/attendance', p('attendance.view'), attendance.list);
router.get('/attendance/latest', p('attendance.live.view'), attendance.latest);
router.get('/attendance/stream', p('attendance.live.view'), attendance.stream);
router.get('/attendance/employee/:employeeId/day/:date', p('attendance.employee.view'), attendance.employeeDay);
router.put('/attendance/:id', p('attendance.edit'), attendance.update);

// ============================================================
// SHIFTS
// ============================================================
router.get('/shifts', p('shifts.view'), shift.list);
router.post('/shifts', p('shifts.create'), shift.create);
router.put('/shifts/:id', p('shifts.edit'), shift.update);
router.delete('/shifts/:id', p('shifts.delete'), shift.remove);

// ============================================================
// RULES
// ============================================================
router.get('/rules', p('rules.view'), rule.get);
router.put('/rules', p('rules.edit'), rule.update);
router.post('/rules', p('rules.edit'), rule.update);

// ============================================================
// LEAVES
// ============================================================
router.get('/leaves', p('leave.requests.view'), leave.list);
router.get('/leaves/calendar', p('leave.calendar.view'), leave.calendar);
router.get('/leaves/balances', p('leave.balances.view'), leave.balances);
router.post('/leaves', requireAnyPermission('self.leave.create', 'leave.requests.create', 'leave.grant'), async (req, res) => {
  if (req.access.permissions.includes('self.leave.create') && !req.access.permissions.includes('leave.requests.create') && !req.access.permissions.includes('leave.grant')) {
    if (!req.user.employeeId) return res.status(400).json({ success: false, message: 'No employee profile is linked to this account' });
    if (req.body.employeeId && String(req.body.employeeId) !== String(req.user.employeeId)) {
      return res.status(403).json({ success: false, message: 'Employees may create leave only for themselves', code: 'PERMISSION_FORBIDDEN' });
    }
    req.body.employeeId = req.user.employeeId;
  } else if (!req.body.employeeId && req.access.permissions.includes('self.leave.create')) {
    req.body.employeeId = req.user.employeeId;
  }
  return leave.create(req, res);
});
router.put('/leaves/:id', p('leave.requests.edit'), leave.update);
router.put('/leaves/:id/approve', p('leave.approve'), leave.approve);
router.put('/leaves/:id/reject', p('leave.reject'), leave.reject);
router.delete('/leaves/:id', p('leave.requests.delete'), leave.remove);
router.get('/leave-types', p('leave.types.view'), leaveType.list);
router.post('/leave-types', p('leave.types.create'), leaveType.create);
router.put('/leave-types/:id', p('leave.types.edit'), leaveType.update);
router.delete('/leave-types/:id', p('leave.types.delete'), leaveType.remove);

// =========================================================
// REPORTS
// =========================================================

router.get(
  '/reports/dashboard',
  p('reports.daily.view'),
  report.dashboard
);

router.get(
  '/reports/daily',
  p('reports.daily.view'),
  report.daily
);

router.get(
  '/reports/weekly',
  p('reports.weekly.view'),
  report.weekly
);

router.get(
  '/reports/monthly',
  p('reports.monthly.view'),
  report.monthly
);

router.get(
  '/reports/employee',
  p('reports.employee.view'),
  report.employee
);

// Backwards-compatible employee deep-dive route.
router.get(
  '/reports/employee/:employeeId',
  p('reports.employee.view'),
  (req, res) => {
    req.query.employeeId = req.params.employeeId;
    return report.employee(req, res);
  }
);

router.get(
  '/reports/department',
  p('reports.department.view'),
  report.department
);

router.get(
  '/reports/late',
  p('reports.late.view'),
  (req, res) =>
    report.filtered(
      req,
      res,
      row =>
        Number(
          row.lateMinutes || 0
        ) > 0
    )
);

router.get(
  '/reports/overtime',
  p('reports.overtime.view'),
  (req, res) =>
    report.filtered(
      req,
      res,
      row =>
        Number(
          row.overtimeMinutes || 0
        ) > 0
    )
);

router.get(
  '/reports/absent',
  p('reports.absence.view'),
  (req, res) =>
    report.filtered(
      req,
      res,
      row =>
        row.status === 'ABSENT'
    )
);

router.get(
  '/reports/export',
  requireAnyPermission(
    'reports.export',
    'reports.export.csv',
    'reports.export.xlsx',
    'reports.export.pdf'
  ),
  report.exportReport
);

router.attachBroadcaster = (app) => {
  setBroadcaster((record) => {
    const clients = app.locals.sseClients || new Set();
    for (const client of clients) {
      try {
        const allowed = client?.allowedEmployeeIds;
        if (Array.isArray(allowed) && !allowed.includes(String(record.employeeId))) continue;
        client.res.write(`data: ${JSON.stringify(record)}\n\n`);
      } catch (_) { }
    }
  });
};

module.exports = router;
