const { AdminUser, AuditLog, Role } = require('../models');
const { verifyToken } = require('../services/auth.service');
const { getEffectiveAccess, hasPermission, hasAnyPermission, hasAllPermissions } = require('../services/permission.service');

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const payload = verifyToken(token);
    const user = await AdminUser.findById(payload.sub).lean();
    if (!user || !user.active) return res.status(401).json({ success: false, message: 'Account is inactive or no longer exists' });
    const access = await getEffectiveAccess(user);
    if (access.role && access.role.active === false) return res.status(401).json({ success: false, message: 'Assigned role is inactive' });
    req.user = user;
    req.access = access;
    req.permissions = access.permissions;
    req.role = access.role;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message || 'Invalid authentication token' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.map(r => String(r).toUpperCase()).includes(String(req.access?.roleCode || req.user.role).toUpperCase())) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions', code: 'ROLE_FORBIDDEN' });
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.access || !hasPermission(req.access, permission)) {
      return res.status(403).json({ success: false, message: `Missing permission: ${permission}`, code: 'PERMISSION_FORBIDDEN', permission });
    }
    next();
  };
}

function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.access || !hasAnyPermission(req.access, permissions)) {
      return res.status(403).json({ success: false, message: 'None of the required permissions are assigned', code: 'PERMISSION_FORBIDDEN', permissions });
    }
    next();
  };
}

function requireAllPermissions(...permissions) {
  return (req, res, next) => {
    if (!req.access || !hasAllPermissions(req.access, permissions)) {
      return res.status(403).json({ success: false, message: 'All required permissions must be assigned', code: 'PERMISSION_FORBIDDEN', permissions });
    }
    next();
  };
}

function requireSelfOrPermission(permission, getEmployeeId) {
  return (req, res, next) => {
    if (req.access && hasPermission(req.access, permission)) return next();
    const employeeId = getEmployeeId(req);
    if (req.access && req.access.permissions.includes('self.profile.view') && employeeId && employeeId === req.user.employeeId) return next();
    return res.status(403).json({ success: false, message: 'You may only access your own records', code: 'SCOPE_FORBIDDEN' });
  };
}

function requireSelfOrRoles(getEmployeeId, ...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.access?.roleCode || req.user.role)) return next();
    const employeeId = getEmployeeId(req);
    if (req.user?.role === 'EMPLOYEE' && employeeId && employeeId === req.user.employeeId) return next();
    return res.status(403).json({ success: false, message: 'You may only access your own records' });
  };
}

async function audit(req, action, metadata = {}) {
  try {
    const settings = require('../models').Settings;
    const s = await settings.findOne({ key: 'system' }).lean();
    if (s?.security?.auditLogging === false) return;
    await AuditLog.create({ actorId: String(req.user?._id || ''), actorEmail: req.user?.email || '', actorRole: req.access?.roleCode || req.user?.role || '', action, method: req.method, path: req.originalUrl, ip: req.ip, targetId: metadata.targetId, metadata });
  } catch (e) { console.error('Audit log failed:', e.message); }
}

module.exports = { authenticate, requireRoles, requirePermission, requireAnyPermission, requireAllPermissions, requireSelfOrPermission, requireSelfOrRoles, audit };
