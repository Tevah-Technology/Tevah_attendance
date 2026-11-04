const { Employee } = require('../models');

async function getAllowedEmployeeIds(req, scope = req.access?.dataScope) {
  const type = scope?.type || 'ALL';
  if (type === 'ALL' || req.access?.roleCode === 'SUPER_ADMIN') return null;
  if (type === 'OWN_RECORDS') return req.user?.employeeId ? [String(req.user.employeeId)] : [];
  if (type === 'SELECTED_EMPLOYEES' || type === 'ASSIGNED_EMPLOYEES') return (scope.employeeIds || []).map(String);
  if (type === 'SELECTED_DEPARTMENTS') {
    const employees = await Employee.find({ department: { $in: scope.departments || [] }, active: true }).select('employeeId').lean();
    return employees.map(e => String(e.employeeId));
  }
  if (type === 'OWN_DEPARTMENT') {
    if (!req.user?.employeeId) return [];
    const actor = await Employee.findOne({ employeeId: req.user.employeeId }).select('department').lean();
    if (!actor?.department) return [];
    const employees = await Employee.find({ department: actor.department, active: true }).select('employeeId').lean();
    return employees.map(e => String(e.employeeId));
  }
  return null;
}

async function restrictEmployeeFilter(req, filter = {}) {
  const ids = await getAllowedEmployeeIds(req);
  if (ids === null) return filter;
  if (filter.employeeId) {
    if (!ids.includes(String(filter.employeeId))) return { ...filter, employeeId: '__NO_ACCESS__' };
    return filter;
  }
  return { ...filter, employeeId: { $in: ids } };
}

async function assertEmployeeAllowed(req, employeeId) {
  const ids = await getAllowedEmployeeIds(req);
  return ids === null || ids.includes(String(employeeId));
}

module.exports = { getAllowedEmployeeIds, restrictEmployeeFilter, assertEmployeeAllowed };
