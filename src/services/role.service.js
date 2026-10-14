const { Role, AdminUser } = require('../models');
const { DEFAULT_ROLES, normalizePermissions, ROLE_TEMPLATES } = require('../config/permissions');

async function ensureDefaultRoles() {
  for (const definition of DEFAULT_ROLES) {
    await Role.updateOne(
      { code: definition.code },
      {
        $setOnInsert: {
          code: definition.code,
          name: definition.name,
          description: definition.description,
          system: definition.system,
          active: true,
          permissions: definition.permissions,
          dataScope: { type: 'ALL', departments: [], employeeIds: [] },
          approvalScope: { type: 'ALL', departments: [], employeeIds: [] }
        }
      },
      { upsert: true }
    );

    // Add newly introduced permissions to existing system roles without
    // replacing any custom permissions already stored on the role.
    await Role.updateOne(
      { code: definition.code, system: true },
      { $addToSet: { permissions: { $each: definition.permissions } } }
    );
  }

  const roles = await Role.find({ code: { $in: DEFAULT_ROLES.map(r => r.code) } }).lean();
  const byCode = new Map(roles.map(r => [r.code, r]));
  const users = await AdminUser.find({ roleId: null }).lean();
  for (const user of users) {
    const role = byCode.get(String(user.role || 'EMPLOYEE').toUpperCase()) || byCode.get('EMPLOYEE');
    if (role) await AdminUser.updateOne({ _id: user._id }, { $set: { roleId: role._id, role: role.code } });
  }
}

function getTemplate(code) {
  return ROLE_TEMPLATES[String(code || '').toUpperCase()] || null;
}

function normalizeScope(scope = {}) {
  const type = String(scope.type || 'ALL').toUpperCase();
  const allowed = ['ALL', 'OWN_DEPARTMENT', 'ASSIGNED_EMPLOYEES', 'OWN_RECORDS', 'SELECTED_DEPARTMENTS', 'SELECTED_EMPLOYEES'];
  if (!allowed.includes(type)) throw new Error(`Invalid scope type: ${type}`);
  return {
    type,
    departments: Array.isArray(scope.departments) ? [...new Set(scope.departments.map(String))] : [],
    employeeIds: Array.isArray(scope.employeeIds) ? [...new Set(scope.employeeIds.map(String))] : []
  };
}

function assertScopeConsistency(scope) {
  if (scope.type === 'SELECTED_DEPARTMENTS' && !scope.departments.length) throw new Error('Selected departments scope requires at least one department');
  if (scope.type === 'SELECTED_EMPLOYEES' && !scope.employeeIds.length) throw new Error('Selected employees scope requires at least one employee');
  if (scope.type !== 'SELECTED_DEPARTMENTS') scope.departments = [];
  if (!['SELECTED_EMPLOYEES', 'ASSIGNED_EMPLOYEES'].includes(scope.type)) scope.employeeIds = [];
  return scope;
}

module.exports = { ensureDefaultRoles, normalizePermissions, normalizeScope, assertScopeConsistency, getTemplate };
