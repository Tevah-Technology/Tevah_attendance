const deviceService = require('../services/device.service');
const { syncAttendance } = require('../services/attendance.service');
const { Employee } = require('../models');
const { config } = require('../config/zkteco');

async function status(req, res) {
  try {
    res.json({
      success: true,
      device: {
        ip: config.ip,
        port: config.port,
        ...(await deviceService.getInfo())
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function users(req, res) {
  try {
    const data = await deviceService.getUsers();

    res.json({
      success: true,
      count: data.length,
      users: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function createUser(req, res) {
  try {
    res.status(201).json({
      success: true,
      user: await deviceService.saveUser(req.body)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function updateUser(req, res) {
  try {
    res.json({
      success: true,
      user: await deviceService.saveUser({
        ...req.body,
        uid: req.params.uid
      })
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function deleteUser(req, res) {
  try {
    res.json({
      success: true,
      result: await deviceService.deleteUser(req.params.uid)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function attendance(req, res) {
  try {
    const data = await deviceService.getAttendanceLogs();

    res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function attendanceDiagnostics(req, res) {
  try {
    const data = await deviceService.getAttendanceLogs();
    const verificationCounts = {};
    const stateCounts = {};
    for (const row of data) {
      const vm = row.verifyMode == null ? 'UNKNOWN' : String(row.verifyMode);
      verificationCounts[vm] = (verificationCounts[vm] || 0) + 1;
      const st = row.attState ?? row.inOutStatus ?? 'UNKNOWN';
      const key = String(st);
      stateCounts[key] = (stateCounts[key] || 0) + 1;
    }
    res.json({ success: true, count: data.length, verificationCounts, stateCounts, sample: data.slice(-20) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function time(req, res) {
  try {
    res.json({
      success: true,
      time: await deviceService.getTime()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Set ZKTeco device time
 *
 * POST /api/device/time
 *
 * Body:
 * {
 *   "time": "2026-09-25T12:30:00+05:30"
 * }
 */
async function setTime(req, res) {
  try {
    const { time } = req.body;

    if (!time) {
      return res.status(400).json({
        success: false,
        message: 'time is required'
      });
    }

    const result = await deviceService.setTime(time);

    res.json({
      success: true,
      message: 'Device time updated successfully',
      result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function sync(req, res) {
  try {
    res.json({
      success: true,
      result: await syncAttendance()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

async function syncUsers(req, res) {
  try {
    const users = await deviceService.getUsers();

    let created = 0;
    let updated = 0;

    for (const user of users) {
      const data = {
        name: user.name || user.userId,
        deviceIp: config.ip,
        deviceUid: user.uid,
        deviceUserId: user.userId,
        cardNo: user.cardNo,
        deviceRole: user.role
      };

      const matchers = [
        { deviceUid: user.uid }
      ];

      if (user.userId) {
        matchers.push({ deviceUserId: user.userId });
        matchers.push({ employeeId: user.userId });
      }

      const old = await Employee.findOne({
        $or: matchers
      });

      if (old) {
        await Employee.updateOne(
          { _id: old._id },
          { $set: data }
        );

        updated++;
      } else {
        await Employee.create({
          ...data,
          employeeId: user.userId || `ZK-${user.uid}`
        });

        created++;
      }
    }

    res.json({
      success: true,
      result: {
        deviceUsers: users.length,
        created,
        updated
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  status,
  users,
  createUser,
  updateUser,
  deleteUser,
  attendance,
  attendanceDiagnostics,
  time,
  setTime,
  sync,
  syncUsers
};