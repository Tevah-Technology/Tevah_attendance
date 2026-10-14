const MODULES = [
  {
    key: 'dashboard', name: 'Operations Matrix', permissions: [
      ['dashboard.view', 'View Operations Matrix'],
      ['dashboard.sync', 'Synchronize Dashboard'],
      ['dashboard.deviceHealth.view', 'View F28 Terminal Health'],
      ['dashboard.console.access', 'Launch Terminal Console']
    ]
  },
  {
    key: 'employees', name: 'Personnel Directory', permissions: [
      ['employees.view', 'View Personnel'],
      ['employees.create', 'Create Personnel'],
      ['employees.edit', 'Edit Personnel'],
      ['employees.delete', 'Delete Personnel'],
      ['employees.activate', 'Activate Personnel'],
      ['employees.deactivate', 'Deactivate Personnel'],
      ['employees.sync', 'Synchronize Personnel to F28'],
      ['employees.viewDeviceState', 'View F28 State'],
      ['employees.manageBiometrics', 'Manage Biometrics'],
      ['employees.assignShift', 'Assign Shift']
    ]
  },
  {
    key: 'attendance', name: 'Attendance Logs', permissions: [
      ['attendance.view', 'View Attendance'],
      ['attendance.history.view', 'View Attendance History'],
      ['attendance.live.view', 'View Live Attendance'],
      ['attendance.employee.view', 'View Employee Attendance'],
      ['attendance.create', 'Create Manual Attendance'],
      ['attendance.edit', 'Edit Attendance'],
      ['attendance.delete', 'Delete Attendance'],
      ['attendance.override', 'Override Attendance'],
      ['attendance.sync', 'Synchronize Attendance'],
      ['attendance.export', 'Export Attendance']
    ]
  },
  {
    key: 'device', name: 'F28 Terminal Node', permissions: [
      ['device.view', 'View Device Status'],
      ['device.users.view', 'View Device Users'],
      ['device.users.create', 'Create Device User'],
      ['device.users.edit', 'Edit Device User'],
      ['device.users.delete', 'Delete Device User'],
      ['device.attendance.view', 'View Device Attendance'],
      ['device.attendance.sync', 'Pull Device Attendance'],
      ['device.sync', 'Synchronize Device'],
      ['device.time.view', 'View Device Time'],
      ['device.time.edit', 'Set Device Time'],
      ['device.console.access', 'Launch Terminal Console']
    ]
  },
  {
    key: 'shifts', name: 'Shift Management', permissions: [
      ['shifts.view', 'View Shifts'],
      ['shifts.create', 'Create Shift'],
      ['shifts.edit', 'Edit Shift'],
      ['shifts.delete', 'Delete Shift'],
      ['shifts.assign', 'Assign Employees to Shift'],
      ['shifts.activate', 'Activate Shift'],
      ['shifts.deactivate', 'Deactivate Shift'],
      ['shifts.breaks.configure', 'Configure Shift Breaks']
    ]
  },
  {
    key: 'rules', name: 'Attendance Engine Rules', permissions: [
      ['rules.view', 'View Attendance Rules'],
      ['rules.edit', 'Edit Attendance Rules'],
      ['rules.general.view', 'View General Rules'],
      ['rules.general.edit', 'Edit General Rules'],
      ['rules.lateEarly.view', 'View Late & Early Rules'],
      ['rules.lateEarly.edit', 'Edit Late & Early Rules'],
      ['rules.workingHours.view', 'View Working Hours Rules'],
      ['rules.workingHours.edit', 'Edit Working Hours Rules'],
      ['rules.overtime.view', 'View Overtime Rules'],
      ['rules.overtime.edit', 'Edit Overtime Rules'],
      ['rules.breakPolicy.view', 'View Break Policy'],
      ['rules.breakPolicy.edit', 'Edit Break Policy'],
      ['rules.absence.view', 'View Absence & Half-Day Rules'],
      ['rules.absence.edit', 'Edit Absence & Half-Day Rules'],
      ['rules.punchLogic.view', 'View Punch Logic'],
      ['rules.punchLogic.edit', 'Edit Punch Logic'],
      ['rules.holidays.view', 'View Holidays & Off'],
      ['rules.holidays.edit', 'Edit Holidays & Off'],
      ['rules.audit.view', 'View Rules Audit Log']
    ]
  },
  {
    key: 'leave', name: 'Leave Management', permissions: [
      ['leave.view', 'View Leave Management'],
      ['leave.requests.view', 'View Leave Requests'],
      ['leave.requests.create', 'Create Leave Request'],
      ['leave.requests.edit', 'Edit Leave Request'],
      ['leave.requests.delete', 'Delete Leave Request'],
      ['leave.approve', 'Approve Leave'],
      ['leave.reject', 'Reject Leave'],
      ['leave.grant', 'Grant Leave'],
      ['leave.calendar.view', 'View Leave Calendar'],
      ['leave.types.view', 'View Leave Types'],
      ['leave.types.create', 'Create Leave Type'],
      ['leave.types.edit', 'Edit Leave Type'],
      ['leave.types.delete', 'Delete Leave Type'],
      ['leave.balances.view', 'View Employee Balances'],
      ['leave.balances.edit', 'Edit Employee Balances'],
      ['leave.export', 'Export Leave Records']
    ]
  },
  {
    key: 'reports', name: 'Reports & Audits', permissions: [
      ['reports.view', 'View Reports'],
      ['reports.overview.view', 'View Overview Dashboard'],
      ['reports.daily.view', 'View Daily Report'],
      ['reports.weekly.view', 'View Weekly Report'],
      ['reports.monthly.view', 'View Monthly Summary'],
      ['reports.employee.view', 'View Employee Deep-Dive'],
      ['reports.department.view', 'View Departmental Report'],
      ['reports.late.view', 'View Late Report'],
      ['reports.overtime.view', 'View Overtime Report'],
      ['reports.absence.view', 'View Absence Exceptions'],
      ['reports.export', 'Export Reports'],
      ['reports.export.csv', 'Export CSV'],
      ['reports.export.xlsx', 'Export Excel'],
      ['reports.export.pdf', 'Export PDF']
    ]
  },
  {
    key: 'settings', name: 'System Settings', permissions: [
      ['settings.view', 'View System Settings'],
      ['settings.edit', 'Edit System Settings'],
      ['settings.general.view', 'View General Settings'],
      ['settings.general.edit', 'Edit General Settings'],
      ['settings.company.view', 'View Company Profile'],
      ['settings.company.edit', 'Edit Company Profile'],
      ['settings.users.view', 'View Admin & Users Settings'],
      ['settings.users.create', 'Create Admin User'],
      ['settings.users.edit', 'Edit Admin User'],
      ['settings.users.delete', 'Delete Admin User'],
      ['settings.attendance.view', 'View Attendance Defaults'],
      ['settings.attendance.edit', 'Edit Attendance Defaults'],
      ['settings.device.view', 'View F28 Device Settings'],
      ['settings.device.edit', 'Edit F28 Device Settings'],
      ['settings.notifications.view', 'View Notification Settings'],
      ['settings.notifications.edit', 'Edit Notification Settings'],
      ['settings.leave.view', 'View Leave Defaults'],
      ['settings.leave.edit', 'Edit Leave Defaults'],
      ['settings.reports.view', 'View Reports & Export Settings'],
      ['settings.reports.edit', 'Edit Reports & Export Settings'],
      ['settings.security.view', 'View Security Settings'],
      ['settings.security.edit', 'Edit Security Settings'],
      ['settings.backup.view', 'View Backup Settings'],
      ['settings.backup.create', 'Create Backup'],
      ['settings.backup.restore', 'Restore Backup'],
      ['settings.backup.delete', 'Delete Backup'],
      ['settings.system.view', 'View System Diagnostics'],
      ['settings.system.execute', 'Execute System Diagnostics']
    ]
  },
  {
    key: 'administration', name: 'Administration', permissions: [
      ['admin.users.view', 'View Admin Users'],
      ['admin.users.create', 'Create Admin User'],
      ['admin.users.edit', 'Edit Admin User'],
      ['admin.users.delete', 'Delete Admin User'],
      ['roles.view', 'View Roles'],
      ['roles.create', 'Create Roles'],
      ['roles.edit', 'Edit Roles'],
      ['roles.delete', 'Delete Roles'],
      ['roles.assign', 'Assign Roles to Users'],
      ['roles.duplicate', 'Duplicate Roles'],
      ['audit.view', 'View Audit Logs']
    ]
  },
  {
    key: 'backup', name: 'Data & Backup', permissions: [
      ['backup.view', 'View Backups'],
      ['backup.create', 'Create Backup'],
      ['backup.download', 'Download Backup'],
      ['backup.restore', 'Restore Backup']
    ]
  },
  {
    key: 'notifications', name: 'Notifications', permissions: [
      ['notifications.view', 'View Notification Configuration'],
      ['notifications.test', 'Send Notification Test']
    ]
  },
  {
    key: 'system', name: 'System', permissions: [
      ['system.view', 'View System Information']
    ]
  },
  {
    key: 'self', name: 'Employee Self Service', permissions: [
      ['self.profile.view', 'View Own Profile'],
      ['self.profile.edit', 'Edit Own Profile'],
      ['self.attendance.view', 'View Own Attendance'],
      ['self.attendance.checkin', 'Check In From Web'],
      ['self.attendance.checkout', 'Check Out From Web'],
      ['self.leave.view', 'View Own Leave'],
      ['self.leave.create', 'Create Own Leave']
    ]
  }
];

const PERMISSION_CATALOG = MODULES.flatMap(module => module.permissions.map(([key, label]) => ({
  key,
  label,
  module: module.key,
  moduleName: module.name,
  sensitive: [
    'employees.delete', 'attendance.delete', 'attendance.override',
    'device.users.delete', 'device.time.edit', 'device.console.access',
    'backup.restore', 'settings.security.edit', 'settings.backup.restore',
    'roles.delete', 'roles.assign', 'admin.users.delete'
  ].includes(key)
})));

const ALL_PERMISSIONS = PERMISSION_CATALOG.map(p => p.key);

const rolePermissions = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter(p => !['backup.restore', 'settings.backup.restore'].includes(p)),
  MANAGER: [
    'dashboard.view', 'dashboard.deviceHealth.view',
    'employees.view', 'employees.viewDeviceState',
    'attendance.view', 'attendance.history.view', 'attendance.live.view', 'attendance.employee.view', 'attendance.export',
    'shifts.view', 'rules.view',
    'leave.view', 'leave.requests.view', 'leave.requests.create', 'leave.approve', 'leave.reject', 'leave.calendar.view', 'leave.balances.view', 'leave.export',
    'reports.view', 'reports.overview.view', 'reports.daily.view', 'reports.weekly.view', 'reports.monthly.view', 'reports.employee.view', 'reports.department.view', 'reports.late.view', 'reports.overtime.view', 'reports.absence.view', 'reports.export',
    'system.view', 'notifications.view'
  ],
  EMPLOYEE: [
    'self.profile.view', 'self.profile.edit', 'self.attendance.view', 'self.attendance.checkin', 'self.attendance.checkout', 'self.leave.view', 'self.leave.create'
  ]
};

const ROLE_TEMPLATES = {
  FULL_ADMINISTRATOR: rolePermissions.SUPER_ADMIN,
  HR_MANAGER: [
    'dashboard.view', 'employees.view', 'employees.create', 'employees.edit', 'employees.activate', 'employees.deactivate', 'employees.assignShift',
    'attendance.view', 'attendance.history.view', 'attendance.employee.view', 'attendance.export',
    'shifts.view', 'shifts.assign',
    'leave.view', 'leave.requests.view', 'leave.requests.create', 'leave.requests.edit', 'leave.approve', 'leave.reject', 'leave.grant', 'leave.calendar.view', 'leave.types.view', 'leave.types.create', 'leave.types.edit', 'leave.balances.view', 'leave.export',
    'reports.view', 'reports.overview.view', 'reports.daily.view', 'reports.weekly.view', 'reports.monthly.view', 'reports.employee.view', 'reports.department.view', 'reports.late.view', 'reports.overtime.view', 'reports.absence.view', 'reports.export',
    'settings.general.view', 'settings.company.view', 'settings.leave.view', 'notifications.view', 'audit.view'
  ],
  ATTENDANCE_MANAGER: [
    'dashboard.view', 'dashboard.deviceHealth.view',
    'employees.view', 'employees.viewDeviceState',
    'attendance.view', 'attendance.history.view', 'attendance.live.view', 'attendance.employee.view', 'attendance.edit', 'attendance.override', 'attendance.sync', 'attendance.export',
    'device.view', 'device.users.view', 'device.attendance.view', 'device.attendance.sync', 'device.sync', 'device.time.view',
    'shifts.view', 'shifts.assign', 'rules.view', 'rules.overtime.view',
    'reports.view', 'reports.overview.view', 'reports.daily.view', 'reports.weekly.view', 'reports.monthly.view', 'reports.employee.view', 'reports.department.view', 'reports.late.view', 'reports.overtime.view', 'reports.absence.view', 'reports.export',
    'audit.view'
  ],
  DEPARTMENT_MANAGER: [
    'dashboard.view', 'employees.view', 'attendance.view', 'attendance.history.view', 'attendance.live.view', 'attendance.employee.view',
    'leave.view', 'leave.requests.view', 'leave.approve', 'leave.reject', 'leave.calendar.view', 'leave.balances.view',
    'reports.view', 'reports.overview.view', 'reports.employee.view', 'reports.department.view', 'reports.late.view', 'reports.overtime.view'
  ],
  AUDITOR: [
    'dashboard.view', 'employees.view', 'attendance.view', 'attendance.history.view', 'attendance.employee.view',
    'shifts.view', 'rules.view', 'leave.view', 'leave.requests.view', 'leave.calendar.view', 'leave.types.view', 'leave.balances.view',
    'reports.view', 'reports.overview.view', 'reports.daily.view', 'reports.weekly.view', 'reports.monthly.view', 'reports.employee.view', 'reports.department.view', 'reports.late.view', 'reports.overtime.view', 'reports.absence.view', 'reports.export',
    'audit.view'
  ],
  READ_ONLY: [
    'dashboard.view', 'employees.view', 'attendance.view', 'attendance.history.view', 'attendance.employee.view', 'shifts.view', 'rules.view', 'leave.view', 'leave.requests.view', 'leave.calendar.view', 'leave.types.view', 'leave.balances.view', 'reports.view', 'reports.overview.view', 'reports.daily.view', 'reports.weekly.view', 'reports.monthly.view', 'reports.employee.view', 'reports.department.view', 'reports.late.view', 'reports.overtime.view', 'reports.absence.view'
  ]
};

const DEFAULT_ROLES = [
  { code: 'SUPER_ADMIN', name: 'Super Administrator', description: 'Full system access', system: true, permissions: rolePermissions.SUPER_ADMIN },
  { code: 'ADMIN', name: 'Administrator', description: 'Administrative access', system: true, permissions: rolePermissions.ADMIN },
  { code: 'MANAGER', name: 'Manager', description: 'Operational management access', system: true, permissions: rolePermissions.MANAGER },
  { code: 'EMPLOYEE', name: 'Employee', description: 'Employee self-service access', system: true, permissions: rolePermissions.EMPLOYEE }
];

function normalizePermissions(input) {
  const valid = new Set(ALL_PERMISSIONS);
  return [...new Set((Array.isArray(input) ? input : []).map(String).filter(p => valid.has(p)))];
}

module.exports = { MODULES, PERMISSION_CATALOG, ALL_PERMISSIONS, DEFAULT_ROLES, ROLE_TEMPLATES, rolePermissions, normalizePermissions };
