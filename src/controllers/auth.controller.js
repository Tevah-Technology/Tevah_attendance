const { AdminUser, Employee, Settings, Role } = require('../models');
const {
  hashPassword,
  verifyPassword,
  createToken,
  getTokenTtlSeconds,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens
} = require('../services/auth.service');
const { getEffectiveAccess } = require('../services/permission.service');

async function publicUser(user) {
  const access = await getEffectiveAccess(user);
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: access.roleCode,
    roleId: user.roleId || access.role?._id || null,
    roleName: access.role?.name || access.roleCode,
    employeeId: user.employeeId || '',
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    permissions: access.permissions,
    dataScope: access.dataScope,
    approvalScope: access.approvalScope
  };
}

const attempts = new Map();
function attemptKey(req, email) { return `${req.ip}:${email}`; }

async function login(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
    const key = attemptKey(req, email);
    const existing = attempts.get(key);
    const settings = await Settings.findOne({ key: 'system' }).select('security').lean();
    const maxAttempts = Math.max(1, Number(settings?.security?.maxLoginAttempts || 5));
    const lockoutMs = Math.max(1, Number(settings?.security?.lockoutMinutes || 15)) * 60 * 1000;
    if (existing && existing.lockedUntil > Date.now()) return res.status(429).json({ success: false, message: 'Too many login attempts. Try again later.' });
    const user = await AdminUser.findOne({ email });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      const next = existing && existing.lockedUntil <= Date.now() ? { count: 1, lockedUntil: 0 } : { count: (existing?.count || 0) + 1, lockedUntil: 0 };
      if (next.count >= maxAttempts) next.lockedUntil = Date.now() + lockoutMs;
      attempts.set(key, next);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    attempts.delete(key);
    user.lastLoginAt = new Date();
    await user.save();
    const token = await createToken(user);
    const rememberMe = req.body.rememberMe !== false;
    const refresh = await createRefreshToken(user, {
      rememberMe,
      ip: req.ip,
      userAgent: req.get('user-agent') || ''
    });
    const expiresIn = await getTokenTtlSeconds();
    res.json({
      success: true,
      token,
      accessToken: token,
      refreshToken: refresh.refreshToken,
      expiresIn,
      refreshExpiresIn: refresh.refreshExpiresIn,
      user: await publicUser(user)
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}


async function generateEmployeeId() {
  // Generate a readable EMP### identifier. Retry-safe against the unique
  // employeeId index if two registrations happen at nearly the same time.
  const employees = await Employee.find(
    { employeeId: { $regex: /^EMP\d+$/i } },
    { employeeId: 1 }
  ).lean();

  let max = 0;
  for (const employee of employees) {
    const match = String(employee.employeeId || '').match(/^EMP(\d+)$/i);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > max) max = value;
  }

  for (let offset = 1; offset <= 1000; offset++) {
    const value = max + offset;
    const employeeId = `EMP${String(value).padStart(3, '0')}`;
    const exists = await Employee.exists({ employeeId });
    if (!exists) return employeeId;
  }

  throw new Error('Unable to allocate a new employee ID');
}

async function register(req, res) {
  let createdEmployee = null;
  let createdUser = null;

  try {
    const registrationEnabled = String(process.env.PUBLIC_REGISTRATION_ENABLED ?? 'true')
      .trim()
      .toLowerCase() !== 'false';

    if (!registrationEnabled) {
      return res.status(403).json({
        success: false,
        message: 'Public registration is disabled'
      });
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const department = String(req.body.department || '').trim();
    const designation = String(req.body.designation || '').trim();
    const phone = String(req.body.phone || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required'
      });
    }

    if (name.length > 120) {
      return res.status(400).json({
        success: false,
        message: 'Name must be 120 characters or fewer'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required'
      });
    }

    const settings = await Settings.findOne({ key: 'system' })
      .select('security.passwordMinLength')
      .lean();
    const minLength = Math.max(
      8,
      Number(settings?.security?.passwordMinLength || 10)
    );

    if (password.length < minLength) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${minLength} characters`
      });
    }

    const [existingUser, existingEmployee] = await Promise.all([
      AdminUser.findOne({ email }).select('_id').lean(),
      Employee.findOne({ email }).select('_id employeeId').lean()
    ]);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered'
      });
    }

    // Do not silently claim an existing employee profile from a public route.
    // An administrator must link pre-existing employee records after identity
    // verification.
    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        message: 'An employee profile already exists for this email. Ask an administrator to link your login account.'
      });
    }

    const employeeRole = await Role.findOne({ code: 'EMPLOYEE', active: true }).lean();
    if (!employeeRole) {
      return res.status(503).json({
        success: false,
        message: 'Employee role is not available. Ask an administrator to check role configuration.'
      });
    }

    // SECURITY: employeeId is generated by the server. Public callers cannot
    // choose an employeeId, role, roleId, permissions, active state, F28 UID,
    // shift, or any other privilege/device-binding field.
    let employeeId;
    let lastEmployeeError;

    for (let attempt = 0; attempt < 5; attempt++) {
      employeeId = await generateEmployeeId();
      try {
        createdEmployee = await Employee.create({
          employeeId,
          name,
          email,
          department,
          designation,
          phone,
          active: true
        });
        break;
      } catch (error) {
        lastEmployeeError = error;
        if (error?.code !== 11000) throw error;
      }
    }

    if (!createdEmployee) {
      throw lastEmployeeError || new Error('Unable to create employee profile');
    }

    try {
      createdUser = await AdminUser.create({
        name,
        email,
        passwordHash: await hashPassword(password),
        role: 'EMPLOYEE',
        roleId: employeeRole._id,
        employeeId: createdEmployee.employeeId,
        active: true,
        mustChangePassword: false
      });
    } catch (error) {
      // Compensating rollback for deployments that are not running MongoDB as
      // a replica set (and therefore cannot use multi-document transactions).
      await Employee.deleteOne({ _id: createdEmployee._id }).catch(() => {});
      createdEmployee = null;
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Employee profile and login account created.',
      employee: {
        id: createdEmployee._id,
        employeeId: createdEmployee.employeeId,
        name: createdEmployee.name,
        email: createdEmployee.email,
        department: createdEmployee.department,
        designation: createdEmployee.designation,
        phone: createdEmployee.phone,
        active: createdEmployee.active
      },
      user: await publicUser(createdUser)
    });
  } catch (e) {
    if (e && e.code === 11000) {
      // In the unlikely event the user was created but a later response-stage
      // operation failed, avoid deleting it here; only clean up a standalone
      // employee profile that has no linked user.
      if (createdEmployee && !createdUser) {
        await Employee.deleteOne({ _id: createdEmployee._id }).catch(() => {});
      }
      return res.status(409).json({
        success: false,
        message: 'Email or employee ID is already registered'
      });
    }

    if (createdEmployee && !createdUser) {
      await Employee.deleteOne({ _id: createdEmployee._id }).catch(() => {});
    }

    return res.status(500).json({
      success: false,
      message: e.message
    });
  }
}


async function refresh(req, res) {
  try {
    const rawRefreshToken = String(req.body.refreshToken || '');
    if (!rawRefreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    const rotated = await rotateRefreshToken(rawRefreshToken, {
      ip: req.ip,
      userAgent: req.get('user-agent') || ''
    });
    const accessToken = await createToken(rotated.user);
    const expiresIn = await getTokenTtlSeconds();

    return res.json({
      success: true,
      token: accessToken,
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn,
      refreshExpiresIn: rotated.refreshExpiresIn,
      user: await publicUser(rotated.user)
    });
  } catch (e) {
    const status = e?.code === 'INVALID_REFRESH_TOKEN' ? 401 : 500;
    return res.status(status).json({ success: false, message: e.message });
  }
}

async function logout(req, res) {
  try {
    const rawRefreshToken = String(req.body.refreshToken || '');
    if (rawRefreshToken) await revokeRefreshToken(rawRefreshToken);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
}

async function me(req, res) { res.json({ success: true, user: await publicUser(req.user) }); }

async function changePassword(req, res) {
  try {
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');
    const settings = await Settings.findOne({ key: 'system' }).select('security.passwordMinLength').lean();
    const minLength = Math.max(8, Number(settings?.security?.passwordMinLength || 10));
    if (next.length < minLength) return res.status(400).json({ success: false, message: `New password must be at least ${minLength} characters` });
    const user = await AdminUser.findById(req.user._id);
    if (!(await verifyPassword(current, user.passwordHash))) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    user.passwordHash = await hashPassword(next);
    user.mustChangePassword = false;
    await user.save();
    await revokeAllRefreshTokens(user._id);
    res.json({ success: true, message: 'Password changed successfully. Please sign in again.' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}

module.exports = { login, register, refresh, logout, me, changePassword };
