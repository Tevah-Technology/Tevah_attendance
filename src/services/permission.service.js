const { AdminUser, Role } = require('../models');
const { ALL_PERMISSIONS, rolePermissions } = require('../config/permissions');

async function getRoleForUser(user) {
  if (!user) return null;
  if (user.roleId) {
    const role = await Role.findById(user.roleId).lean();
    if (role) return role;
  }
  return Role.findOne({ code: String(user.role || 'EMPLOYEE').toUpperCase() }).lean();
}

async function getEffectiveAccess(user) {
  const role = await getRoleForUser(user);
  const roleCode = String(user?.role || role?.code || 'EMPLOYEE').toUpperCase();
  const permissions = roleCode === 'SUPER_ADMIN'
    ? ALL_PERMISSIONS
    : (role?.permissions?.length ? role.permissions : (rolePermissions[roleCode] || []));
  return {
    role,
    roleCode,
    permissions: [...new Set(permissions)],
    dataScope: role?.dataScope || { type: roleCode === 'SUPER_ADMIN' ? 'ALL' : 'ALL', departments: [], employeeIds: [] },
    approvalScope: role?.approvalScope || { type: roleCode === 'SUPER_ADMIN' ? 'ALL' : 'ALL', departments: [], employeeIds: [] }
  };
}

async function getEffectiveAccessByUserId(id) {
  const user = await AdminUser.findById(id).lean();
  if (!user) return null;
  return getEffectiveAccess(user);
}

function hasPermission(access, permission) {
  return access?.roleCode === 'SUPER_ADMIN' || access?.permissions?.includes(permission);
}

function hasAnyPermission(access, permissions) {
  if (access?.roleCode === 'SUPER_ADMIN') return true;
  return permissions.some(p => access?.permissions?.includes(p));
}

function hasAllPermissions(access, permissions) {
  if (access?.roleCode === 'SUPER_ADMIN') return true;
  return permissions.every(p => access?.permissions?.includes(p));
}

function scopeToMongoFilter(scope, { employeeField = 'employeeId', departmentField = 'department', userEmployeeId = '' } = {}) {
  const s = scope || { type: 'ALL' };
  switch (s.type) {
    case 'OWN_RECORDS':
      return userEmployeeId ? { [employeeField]: userEmployeeId } : { [employeeField]: '__NO_ACCESS__' };
    case 'SELECTED_EMPLOYEES':
      return { [employeeField]: { $in: s.employeeIds || [] } };
    case 'SELECTED_DEPARTMENTS':
      return { [departmentField]: { $in: s.departments || [] } };
    case 'OWN_DEPARTMENT':
      // Department is attached to Employee records, so controllers should resolve this scope separately.
      return {};
    case 'ASSIGNED_EMPLOYEES':
      return { [employeeField]: { $in: s.employeeIds || [] } };
    case 'ALL':
    default:
      return {};
  }
}

module.exports = { getRoleForUser, getEffectiveAccess, getEffectiveAccessByUserId, hasPermission, hasAnyPermission, hasAllPermissions, scopeToMongoFilter };
