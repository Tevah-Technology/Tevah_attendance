const { Role, AdminUser } = require('../models');
const { PERMISSION_CATALOG, MODULES, ALL_PERMISSIONS, normalizePermissions } = require('../config/permissions');
const { audit } = require('../middleware/auth');
const { normalizeScope, assertScopeConsistency, getTemplate } = require('../services/role.service');
const { getEffectiveAccess } = require('../services/permission.service');

function sanitizeRole(role, userCount = undefined) {
  const value = role.toObject ? role.toObject() : { ...role };
  delete value.__v;
  if (userCount !== undefined) value.userCount = userCount;
  return value;
}

function assertCanGrant(req, permissions) {
  if (req.access?.roleCode === 'SUPER_ADMIN') return;
  const own = new Set(req.permissions || []);
  const forbidden = permissions.filter(p => !own.has(p));
  if (forbidden.length) {
    const err = new Error(`You cannot grant permissions you do not have: ${forbidden.join(', ')}`);
    err.status = 403;
    throw err;
  }
}

async function catalog(req, res) {
  res.json({ success: true, modules: MODULES, permissions: PERMISSION_CATALOG, allPermissions: ALL_PERMISSIONS });
}

async function templates(req, res) {
  const templates = Object.keys(require('../config/permissions').ROLE_TEMPLATES).map(code => ({ code, permissions: getTemplate(code) }));
  res.json({ success: true, templates });
}

async function list(req, res) {
  const roles = await Role.find().sort({ system: -1, name: 1 }).lean();
  const counts = await AdminUser.aggregate([{ $group: { _id: '$roleId', count: { $sum: 1 } } }]);
  const map = new Map(counts.map(x => [String(x._id), x.count]));
  res.json({ success: true, count: roles.length, roles: roles.map(r => sanitizeRole(r, map.get(String(r._id)) || 0)) });
}

async function getOne(req, res) {
  const role = await Role.findById(req.params.id).lean();
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
  const users = await AdminUser.find({ roleId: role._id }).select('_id name email role employeeId active').sort({ name: 1 }).lean();
  res.json({ success: true, role: sanitizeRole(role, users.length), users });
}

async function create(req, res) {
  try {
    const code = String(req.body.code || req.body.name || '').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    if (!code) return res.status(400).json({ success: false, message: 'Role code is required' });
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'].includes(code)) return res.status(400).json({ success: false, message: 'That code is reserved for a system role' });
    const permissions = normalizePermissions(req.body.permissions || getTemplate(req.body.template));
    assertCanGrant(req, permissions);
    const dataScope = assertScopeConsistency(normalizeScope(req.body.dataScope));
    const approvalScope = assertScopeConsistency(normalizeScope(req.body.approvalScope || dataScope));
    const role = await Role.create({ code, name: String(req.body.name || code), description: String(req.body.description || ''), system: false, active: req.body.active !== false, permissions, dataScope, approvalScope, createdBy: String(req.user._id), updatedBy: String(req.user._id) });
    await audit(req, 'ROLE_CREATED', { targetId: String(role._id), roleCode: role.code, permissionCount: permissions.length });
    res.status(201).json({ success: true, role: sanitizeRole(role, 0) });
  } catch (e) { res.status(e.status || 400).json({ success: false, message: e.message }); }
}

async function update(req, res) {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (req.body.code && String(req.body.code).toUpperCase() !== role.code) return res.status(400).json({ success: false, message: 'Role code cannot be changed' });
    const permissions = req.body.permissions !== undefined ? normalizePermissions(req.body.permissions) : role.permissions;
    assertCanGrant(req, permissions);
    if (req.body.name != null) role.name = String(req.body.name);
    if (req.body.description != null) role.description = String(req.body.description);
    if (req.body.active != null && !role.system) role.active = Boolean(req.body.active);
    if (req.body.permissions !== undefined) role.permissions = permissions;
    if (req.body.dataScope !== undefined) role.dataScope = assertScopeConsistency(normalizeScope(req.body.dataScope));
    if (req.body.approvalScope !== undefined) role.approvalScope = assertScopeConsistency(normalizeScope(req.body.approvalScope));
    role.updatedBy = String(req.user._id);
    await role.save();
    await audit(req, 'ROLE_UPDATED', { targetId: String(role._id), roleCode: role.code, permissionCount: role.permissions.length });
    res.json({ success: true, role: sanitizeRole(role) });
  } catch (e) { res.status(e.status || 400).json({ success: false, message: e.message }); }
}

async function updatePermissions(req, res) {
  req.body = { ...req.body, permissions: req.body.permissions };
  return update(req, res);
}

async function updateScope(req, res) {
  req.body = { ...req.body, dataScope: req.body.dataScope, approvalScope: req.body.approvalScope };
  return update(req, res);
}

async function remove(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
  if (role.system) return res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
  const count = await AdminUser.countDocuments({ roleId: role._id });
  if (count) return res.status(409).json({ success: false, message: 'Role is assigned to users. Reassign users before deleting it.' });
  await role.deleteOne();
  await audit(req, 'ROLE_DELETED', { targetId: String(role._id), roleCode: role.code });
  res.json({ success: true, deleted: true });
}

async function duplicate(req, res) {
  try {
    const source = await Role.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ success: false, message: 'Role not found' });
    const code = String(req.body.code || `${source.code}_COPY`).toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    const permissions = normalizePermissions(source.permissions);
    assertCanGrant(req, permissions);
    const exists = await Role.exists({ code });
    if (exists) return res.status(409).json({ success: false, message: 'Role code already exists' });
    const role = await Role.create({ code, name: String(req.body.name || `${source.name} Copy`), description: String(req.body.description ?? source.description), system: false, active: true, permissions, dataScope: source.dataScope, approvalScope: source.approvalScope, createdBy: String(req.user._id), updatedBy: String(req.user._id) });
    await audit(req, 'ROLE_DUPLICATED', { targetId: String(role._id), sourceRoleId: String(source._id), roleCode: role.code });
    res.status(201).json({ success: true, role: sanitizeRole(role, 0) });
  } catch (e) { res.status(e.status || 400).json({ success: false, message: e.message }); }
}

async function users(req, res) {
  const role = await Role.findById(req.params.id).lean();
  if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
  const users = await AdminUser.find({ roleId: role._id }).select('_id name email role employeeId active lastLoginAt createdAt').sort({ name: 1 }).lean();
  res.json({ success: true, role: sanitizeRole(role, users.length), users });
}

async function assignUsers(req, res) {
  try {
    const role = await Role.findById(req.params.id).lean();
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (!role.active) return res.status(400).json({ success: false, message: 'Cannot assign an inactive role' });
    assertCanGrant(req, role.permissions);
    const userIds = [...new Set((req.body.userIds || []).map(String))];
    if (!userIds.length) return res.status(400).json({ success: false, message: 'userIds is required' });
    const users = await AdminUser.find({ _id: { $in: userIds } });
    if (users.length !== userIds.length) return res.status(404).json({ success: false, message: 'One or more users were not found' });
    if (role.code === 'SUPER_ADMIN' && req.access.roleCode !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'Only a super admin can assign super admins' });
    for (const user of users) { user.roleId = role._id; user.role = role.code; await user.save(); }
    await audit(req, 'ROLE_ASSIGNED', { targetId: String(role._id), roleCode: role.code, userIds });
    res.json({ success: true, assigned: userIds.length, role: sanitizeRole(role) });
  } catch (e) { res.status(e.status || 400).json({ success: false, message: e.message }); }
}

async function unassignUser(req, res) {
  try {
    const role = await Role.findById(req.params.id).lean();
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.system && role.code === 'SUPER_ADMIN') return res.status(400).json({ success: false, message: 'Super admin users must be explicitly assigned to another role' });
    const target = await AdminUser.findById(req.params.userId);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    if (String(target.roleId) !== String(role._id)) return res.status(400).json({ success: false, message: 'User is not assigned to this role' });
    const employeeRole = await Role.findOne({ code: 'EMPLOYEE' }).lean();
    target.roleId = employeeRole?._id || null;
    target.role = 'EMPLOYEE';
    await target.save();
    await audit(req, 'ROLE_UNASSIGNED', { targetId: String(role._id), userId: String(target._id), roleCode: role.code });
    res.json({ success: true, userId: String(target._id), assignedRole: 'EMPLOYEE' });
  } catch (e) { res.status(e.status || 400).json({ success: false, message: e.message }); }
}

async function myPermissions(req, res) {
  const access = await getEffectiveAccess(req.user);
  res.json({ success: true, role: access.roleCode, roleDetails: access.role || null, permissions: access.permissions, dataScope: access.dataScope, approvalScope: access.approvalScope });
}

module.exports = { catalog, templates, list, getOne, create, update, updatePermissions, updateScope, remove, duplicate, users, assignUsers, unassignUser, myPermissions };
