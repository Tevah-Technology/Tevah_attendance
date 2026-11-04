const { AdminUser, Role } = require('../models');
const { hashPassword } = require('../services/auth.service');
const { audit } = require('../middleware/auth');
const { publicUser } = require('./auth.controller');

async function resolveRole({ roleId, role }) {
  if (roleId) {
    const found = await Role.findById(roleId).lean();
    if (!found) throw new Error('Role not found');
    if (!found.active) throw new Error('Role is inactive');
    return found;
  }
  const code = String(role || 'EMPLOYEE').toUpperCase();
  const found = await Role.findOne({ code }).lean();
  if (!found) throw new Error('Role not found');
  if (!found.active) throw new Error('Role is inactive');
  return found;
}

async function list(req, res) {
  const users = await AdminUser.find().select('-passwordHash').populate('roleId', 'code name description permissions dataScope approvalScope active system').sort({ createdAt: -1 }).lean();
  res.json({ success: true, count: users.length, users });
}

async function create(req, res) {
  try {
    const password = String(req.body.password || '');
    if (password.length < 10) return res.status(400).json({ success: false, message: 'Password must be at least 10 characters' });
    const role = await resolveRole({ roleId: req.body.roleId, role: req.body.role });
    if (role.code === 'SUPER_ADMIN' && req.access.roleCode !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'Only a super admin can create super admins' });
    if (req.access.roleCode !== 'SUPER_ADMIN') {
      const own = new Set(req.permissions || []);
      const forbidden = role.permissions.filter(p => !own.has(p));
      if (forbidden.length) return res.status(403).json({ success: false, message: 'You cannot assign a role with permissions you do not have' });
    }
    const user = await AdminUser.create({ name: req.body.name, email: req.body.email, role: role.code, roleId: role._id, employeeId: req.body.employeeId || '', passwordHash: await hashPassword(password), active: req.body.active !== false });
    await audit(req, 'ADMIN_USER_CREATED', { targetId: String(user._id), roleId: String(role._id), roleCode: role.code });
    res.status(201).json({ success: true, user: await publicUser(user) });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}

async function update(req, res) {
  try {
    const user = await AdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const currentRole = await resolveRole({ roleId: user.roleId, role: user.role });
    let nextRole = currentRole;
    if (req.body.roleId || req.body.role) nextRole = await resolveRole({ roleId: req.body.roleId, role: req.body.role });
    if ((currentRole.code === 'SUPER_ADMIN' || nextRole.code === 'SUPER_ADMIN') && req.access.roleCode !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'Only a super admin can manage super admin accounts' });
    if (req.access.roleCode !== 'SUPER_ADMIN') {
      const own = new Set(req.permissions || []);
      const forbidden = nextRole.permissions.filter(p => !own.has(p));
      if (forbidden.length) return res.status(403).json({ success: false, message: 'You cannot assign a role with permissions you do not have' });
    }
    if (req.body.email) user.email = String(req.body.email).toLowerCase();
    if (req.body.name != null) user.name = req.body.name;
    if (req.body.employeeId != null) user.employeeId = req.body.employeeId;
    if (req.body.roleId || req.body.role) { user.roleId = nextRole._id; user.role = nextRole.code; }
    if (req.body.active != null) user.active = Boolean(req.body.active);
    if (req.body.password) {
      if (String(req.body.password).length < 10) return res.status(400).json({ success: false, message: 'Password must be at least 10 characters' });
      user.passwordHash = await hashPassword(String(req.body.password));
      user.mustChangePassword = true;
    }
    await user.save();
    await audit(req, 'ADMIN_USER_UPDATED', { targetId: String(user._id), roleId: String(user.roleId || ''), roleCode: user.role });
    res.json({ success: true, user: await publicUser(user) });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}

async function remove(req, res) {
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
  const target = await AdminUser.findById(req.params.id);
  if (!target) return res.status(404).json({ success: false, message: 'User not found' });
  const targetRole = await resolveRole({ roleId: target.roleId, role: target.role });
  if (targetRole.code === 'SUPER_ADMIN' && req.access.roleCode !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'Only a super admin can delete a super admin' });
  if (targetRole.code === 'SUPER_ADMIN' && await AdminUser.countDocuments({ role: 'SUPER_ADMIN', active: true }) <= 1) return res.status(400).json({ success: false, message: 'At least one active super admin must remain' });
  await target.deleteOne();
  await audit(req, 'ADMIN_USER_DELETED', { targetId: String(target._id) });
  res.json({ success: true, deleted: true });
}

module.exports = { list, create, update, remove };
