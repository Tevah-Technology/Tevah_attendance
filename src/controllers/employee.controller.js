const { Employee, AdminUser, Role, Settings } = require('../models');
const deviceService = require('../services/device.service');
const { restrictEmployeeFilter, assertEmployeeAllowed } = require('../services/access-scope.service');
const { hashPassword } = require('../services/auth.service');



// ============================================================
// EMPLOYEE APP LOGIN HELPERS
//
// ZKTeco device credentials are intentionally separate from the
// web/mobile application login. Application login accounts live in
// AdminUser for backward compatibility, but normal employees are
// assigned the EMPLOYEE role and do not receive admin permissions.
// ============================================================

async function passwordMinLength() {
  const settings = await Settings.findOne({ key: 'system' })
    .select('security.passwordMinLength')
    .lean();
  return Math.max(8, Number(settings?.security?.passwordMinLength || 10));
}

async function employeeRole() {
  const role = await Role.findOne({ code: 'EMPLOYEE', active: true });
  if (!role) throw new Error('EMPLOYEE role is not available');
  return role;
}

function publicLoginAccount(user) {
  if (!user) return null;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    role: user.role,
    roleId: user.roleId,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function getLogin(req, res) {
  try {
    if (!(await assertEmployeeAllowed(req, req.params.id))) {
      return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    }

    const employee = await Employee.findOne({ employeeId: req.params.id }).lean();
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const user = await AdminUser.findOne({ employeeId: employee.employeeId });
    return res.json({
      success: true,
      employeeId: employee.employeeId,
      hasLogin: Boolean(user),
      login: publicLoginAccount(user)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function createLogin(req, res) {
  try {
    if (!(await assertEmployeeAllowed(req, req.params.id))) {
      return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    }

    const employee = await Employee.findOne({ employeeId: req.params.id });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const email = String(req.body.email || employee.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const minLength = await passwordMinLength();

    if (!email) return res.status(400).json({ success: false, message: 'Employee email is required before creating a login account' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'A valid email address is required' });
    if (password.length < minLength) return res.status(400).json({ success: false, message: `Password must be at least ${minLength} characters` });

    const existingForEmployee = await AdminUser.findOne({ employeeId: employee.employeeId });
    if (existingForEmployee) {
      return res.status(409).json({
        success: false,
        message: 'This employee already has an application login account',
        login: publicLoginAccount(existingForEmployee)
      });
    }

    const existingEmail = await AdminUser.findOne({ email });
    if (existingEmail) return res.status(409).json({ success: false, message: 'Email is already used by another login account' });

    const role = await employeeRole();
    const user = await AdminUser.create({
      name: employee.name,
      email,
      passwordHash: await hashPassword(password),
      role: 'EMPLOYEE',
      roleId: role._id,
      employeeId: employee.employeeId,
      active: employee.active !== false,
      mustChangePassword: req.body.mustChangePassword !== false
    });

    if (employee.email !== email) {
      employee.email = email;
      await employee.save();
    }

    return res.status(201).json({
      success: true,
      message: 'Employee login account created successfully',
      login: publicLoginAccount(user)
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: 'Email is already used by another login account' });
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function updateLogin(req, res) {
  try {
    if (!(await assertEmployeeAllowed(req, req.params.id))) {
      return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    }

    const employee = await Employee.findOne({ employeeId: req.params.id });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const user = await AdminUser.findOne({ employeeId: employee.employeeId });
    if (!user) return res.status(404).json({ success: false, message: 'Employee does not have an application login account yet' });

    if (req.body.email != null) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'A valid email address is required' });
      const duplicate = await AdminUser.findOne({ email, _id: { $ne: user._id } }).lean();
      if (duplicate) return res.status(409).json({ success: false, message: 'Email is already used by another login account' });
      user.email = email;
      employee.email = email;
    }

    if (req.body.password != null && String(req.body.password) !== '') {
      const password = String(req.body.password);
      const minLength = await passwordMinLength();
      if (password.length < minLength) return res.status(400).json({ success: false, message: `Password must be at least ${minLength} characters` });
      user.passwordHash = await hashPassword(password);
      user.mustChangePassword = req.body.mustChangePassword !== false;
    } else if (req.body.mustChangePassword != null) {
      user.mustChangePassword = Boolean(req.body.mustChangePassword);
    }

    if (req.body.active != null) user.active = Boolean(req.body.active);
    user.name = employee.name;
    user.role = 'EMPLOYEE';
    const role = await employeeRole();
    user.roleId = role._id;

    await Promise.all([user.save(), employee.save()]);

    return res.json({
      success: true,
      message: 'Employee login account updated successfully',
      login: publicLoginAccount(user)
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: 'Email is already used by another login account' });
    return res.status(400).json({ success: false, message: error.message });
  }
}

// ============================================================
// LIST EMPLOYEES
// GET /api/employees
// ============================================================

async function list(req, res) {
  try {
    const filter = {};
    if (req.query.department) filter.department = req.query.department;
    if (req.query.designation) filter.designation = req.query.designation;
    if (req.query.active !== undefined) filter.active = String(req.query.active) === 'true';
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) filter.$or = [
        { employeeId: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ];
    }
    if (req.query.shiftId) filter.shiftId = req.query.shiftId;
    const scopedFilter = await restrictEmployeeFilter(req, filter);

    const employees = await Employee
      .find(scopedFilter)
      .populate('shiftId')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      count: employees.length,
      employees
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

// ============================================================
// GET ONE EMPLOYEE
// GET /api/employees/:id
// ============================================================

async function getOne(req, res) {
  try {
    if (!(await assertEmployeeAllowed(req, req.params.id))) return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    const employee = await Employee
      .findOne({
        employeeId: req.params.id
      })
      .populate('shiftId')
      .lean();

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      employee
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

// ============================================================
// CREATE EMPLOYEE
// POST /api/employees
//
// Creates employee in MongoDB.
// Does NOT automatically write to F28.
// ============================================================

async function create(req, res) {
  let employee = null;
  let login = null;

  try {
    if (req.body.employeeId && !(await assertEmployeeAllowed(req, req.body.employeeId)) && req.access?.dataScope?.type !== 'ALL') {
      return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    }

    // Login-only fields are not part of the Employee document.
    const {
      createLogin: shouldCreateLogin,
      password,
      loginPassword,
      mustChangePassword,
      ...employeeData
    } = req.body || {};

    employee = await Employee.create(employeeData);

    if (shouldCreateLogin === true) {
      const chosenPassword = String(loginPassword || password || '');
      const email = String(employee.email || '').trim().toLowerCase();
      const minLength = await passwordMinLength();

      if (!email) throw new Error('Email is required when createLogin is true');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email address is required when createLogin is true');
      if (chosenPassword.length < minLength) throw new Error(`Login password must be at least ${minLength} characters`);

      const role = await employeeRole();
      login = await AdminUser.create({
        name: employee.name,
        email,
        passwordHash: await hashPassword(chosenPassword),
        role: 'EMPLOYEE',
        roleId: role._id,
        employeeId: employee.employeeId,
        active: employee.active !== false,
        mustChangePassword: mustChangePassword !== false
      });
    }

    return res.status(201).json({
      success: true,
      message: login ? 'Employee and login account created successfully' : 'Employee created successfully',
      employee,
      login: publicLoginAccount(login)
    });

  } catch (error) {
    // If login creation failed after the employee was created, roll back the
    // new employee so callers never get a half-created account pair.
    if (employee && req.body?.createLogin === true && !login) {
      await Employee.deleteOne({ _id: employee._id }).catch(() => {});
    }

    return res.status(error?.code === 11000 ? 409 : 400).json({
      success: false,
      message: error?.code === 11000 ? 'Employee ID or login email already exists' : error.message
    });
  }
}

// ============================================================
// UPDATE EMPLOYEE
// PUT /api/employees/:id
//
// Updates MongoDB.
// Use /:id/sync-to-device afterward to update F28.
// ============================================================

async function update(req, res) {
  try {
    if (!(await assertEmployeeAllowed(req, req.params.id))) return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    const employee = await Employee.findOneAndUpdate(
      {
        employeeId: req.params.id
      },
      {
        $set: req.body
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Keep an existing application login aligned with personnel status/name.
    // Email/password changes remain explicit through /employees/:id/login.
    const login = await AdminUser.findOne({ employeeId: employee.employeeId });
    if (login) {
      login.name = employee.name;
      if (req.body.active != null) login.active = employee.active !== false;
      await login.save();
    }

    res.json({
      success: true,
      message: 'Employee updated successfully',
      employee,
      login: publicLoginAccount(login)
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

// ============================================================
// DELETE EMPLOYEE
// DELETE /api/employees/:id
//
// Deletes from MongoDB.
// Does NOT automatically delete from F28.
// ============================================================

async function remove(req, res) {
  try {
    if (!(await assertEmployeeAllowed(req, req.params.id))) return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });
    const employee = await Employee.findOneAndDelete({
      employeeId: req.params.id
    });

    // Do not leave a deleted employee with an active application account.
    if (employee) {
      await AdminUser.updateMany(
        { employeeId: employee.employeeId },
        { $set: { active: false } }
      );
    }

    res.json({
      success: true,
      deleted: Boolean(employee),
      loginDeactivated: Boolean(employee),
      message: employee
        ? 'Employee deleted from database and linked login deactivated'
        : 'Employee not found'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

// ============================================================
// FIND AVAILABLE ZKTeco UID
// ============================================================

async function findAvailableDeviceUid() {

  // ----------------------------------------------------------
  // Get UIDs already used in MongoDB
  // ----------------------------------------------------------

  const employees = await Employee.find(
    {
      deviceUid: {
        $exists: true,
        $ne: null
      }
    },
    {
      deviceUid: 1
    }
  ).lean();

  const usedUids = new Set();

  for (const employee of employees) {
    const uid = Number(employee.deviceUid);

    if (
      Number.isInteger(uid) &&
      uid > 0
    ) {
      usedUids.add(uid);
    }
  }

  // ----------------------------------------------------------
  // Get UIDs actually existing on F28
  // ----------------------------------------------------------

  const deviceUsers =
    await deviceService.getUsers();

  for (const user of deviceUsers) {
    const uid = Number(user.uid);

    if (
      Number.isInteger(uid) &&
      uid > 0
    ) {
      usedUids.add(uid);
    }
  }

  // ----------------------------------------------------------
  // Find first free UID
  // ----------------------------------------------------------

  for (
    let uid = 1;
    uid <= 65535;
    uid++
  ) {
    if (!usedUids.has(uid)) {
      return uid;
    }
  }

  throw new Error(
    'No available ZKTeco UID found'
  );
}

// ============================================================
// VALIDATE EMPLOYEE FOR F28
// ============================================================

function validateEmployeeForDevice(employee) {

  if (!employee.employeeId) {
    throw new Error(
      'Employee ID is required'
    );
  }

  if (!employee.name) {
    throw new Error(
      'Employee name is required'
    );
  }

  if (
    Buffer.byteLength(
      String(employee.employeeId),
      'utf8'
    ) > 24
  ) {
    throw new Error(
      'Employee ID must be 24 bytes or fewer for ZKTeco'
    );
  }

  if (
    Buffer.byteLength(
      String(employee.name),
      'utf8'
    ) > 28
  ) {
    throw new Error(
      'Employee name must be 28 bytes or fewer for ZKTeco'
    );
  }
}

// ============================================================
// SYNC ONE EMPLOYEE TO F28
//
// POST /api/employees/:id/sync-to-device
//
// Example:
// POST /api/employees/EMP001/sync-to-device
// ============================================================

async function syncToDevice(req, res) {
  try {
    if (!(await assertEmployeeAllowed(req, req.params.id))) return res.status(403).json({ success: false, message: 'Employee is outside your assigned data scope', code: 'SCOPE_FORBIDDEN' });

    // --------------------------------------------------------
    // Find employee
    // --------------------------------------------------------

    const employee = await Employee.findOne({
      employeeId: req.params.id
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // --------------------------------------------------------
    // Active check
    // --------------------------------------------------------

    if (!employee.active) {
      return res.status(400).json({
        success: false,
        message:
          'Inactive employee cannot be synchronized to ZKTeco'
      });
    }

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    validateEmployeeForDevice(employee);

    // --------------------------------------------------------
    // Use existing UID if available.
    // Otherwise allocate a new UID.
    // --------------------------------------------------------

    let deviceUid = Number(
      employee.deviceUid
    );

    if (
      !Number.isInteger(deviceUid) ||
      deviceUid <= 0 ||
      deviceUid > 65535
    ) {
      deviceUid =
        await findAvailableDeviceUid();
    }

    // --------------------------------------------------------
    // Card number
    // --------------------------------------------------------

    const cardNo = Number(
      employee.cardNo || 0
    );

    // --------------------------------------------------------
    // Write employee to F28
    // --------------------------------------------------------

    const deviceUser =
      await deviceService.saveUser({
        uid: deviceUid,

        userId:
          employee.employeeId,

        name:
          employee.name,

        password:
          '',

        role:
          Number(employee.deviceRole || 0),

        cardNo:
          Number.isFinite(cardNo)
            ? cardNo
            : 0
      });

    // --------------------------------------------------------
    // Save device mapping into MongoDB
    // --------------------------------------------------------

    employee.deviceUid =
      deviceUid;

    employee.deviceUserId =
      employee.employeeId;

    employee.deviceIp =
      deviceService.config.ip;

    await employee.save();

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.json({
      success: true,

      message:
        'Employee synchronized to ZKTeco successfully',

      employee: {
        employeeId:
          employee.employeeId,

        name:
          employee.name,

        department:
          employee.department,

        deviceUid:
          employee.deviceUid,

        deviceUserId:
          employee.deviceUserId,

        deviceIp:
          employee.deviceIp
      },

      deviceUser
    });

  } catch (error) {

    console.error(
      'Employee → ZKTeco sync failed:',
      error
    );

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

// ============================================================
// SYNC ALL ACTIVE EMPLOYEES
//
// POST /api/employees/sync-to-device
// ============================================================

async function syncAllToDevice(req, res) {
  try {

    const employees = await Employee
      .find({
        active: true
      })
      .sort({
        employeeId: 1
      });

    const results = [];

    let synced = 0;
    let failed = 0;

    // --------------------------------------------------------
    // Sync one by one
    // --------------------------------------------------------

    for (const employee of employees) {

      try {

        validateEmployeeForDevice(
          employee
        );

        let deviceUid =
          Number(employee.deviceUid);

        if (
          !Number.isInteger(deviceUid) ||
          deviceUid <= 0 ||
          deviceUid > 65535
        ) {
          deviceUid =
            await findAvailableDeviceUid();
        }

        const cardNo =
          Number(employee.cardNo || 0);

        await deviceService.saveUser({
          uid: deviceUid,

          userId:
            employee.employeeId,

          name:
            employee.name,

          password:
            '',

          role:
            Number(employee.deviceRole || 0),

          cardNo:
            Number.isFinite(cardNo)
              ? cardNo
              : 0
        });

        employee.deviceUid =
          deviceUid;

        employee.deviceUserId =
          employee.employeeId;

        employee.deviceIp =
          deviceService.config.ip;

        await employee.save();

        synced++;

        results.push({
          success: true,

          employeeId:
            employee.employeeId,

          name:
            employee.name,

          deviceUid
        });

      } catch (error) {

        failed++;

        results.push({
          success: false,

          employeeId:
            employee.employeeId,

          name:
            employee.name,

          error:
            error.message
        });
      }
    }

    res.json({
      success: true,

      message:
        'Employee synchronization completed',

      summary: {
        total:
          employees.length,

        synced,

        failed
      },

      results
    });

  } catch (error) {

    console.error(
      'Bulk employee → ZKTeco sync failed:',
      error
    );

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  getLogin,
  createLogin,
  updateLogin,
  syncToDevice,
  syncAllToDevice
};