'use strict';

const { Employee } = require('../models');
const { buildReport, aggregate } = require('../services/report.service');
const { syncAttendance } = require('../services/attendance.service');
const deviceService = require('../services/device.service');
const { getAllowedEmployeeIds } = require('../services/access-scope.service');

// Merge duplicate employee rows while retaining the most informative fields.
function dedupeRowsByEmployee(rows) {
  const unique = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.employeeId || row?.id || '').trim();
    if (!key) continue;

    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, row);
      continue;
    }

    unique.set(key, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(row).filter(
          ([, value]) => value !== null && value !== undefined && value !== ''
        )
      )
    });
  }

  return Array.from(unique.values());
}

// One timing span per request; unlike console.time labels these do not collide
// when the dashboard is requested more than once concurrently.
async function timedStep(requestId, label, task) {
  const startedAt = Date.now();
  console.log(`[DASHBOARD ${requestId}] START ${label}`);
  try {
    const result = await task();
    console.log(
      `[DASHBOARD ${requestId}] DONE  ${label} (${Date.now() - startedAt} ms)`
    );
    return result;
  } catch (error) {
    console.error(
      `[DASHBOARD ${requestId}] FAIL  ${label} (${Date.now() - startedAt} ms):`,
      error
    );
    throw error;
  }
}

let requestSequence = 0;

async function summary(req, res) {
  const requestId = ++requestSequence;
  const startedAt = Date.now();
  console.log(`[DASHBOARD ${requestId}] Summary started`);

  try {
    const date = req.query.date || new Date();

    const employeeIds = await timedStep(
      requestId,
      'Employee access scope',
      () => getAllowedEmployeeIds(req)
    );

    const rows = await timedStep(
      requestId,
      'buildReport',
      () => buildReport({ from: date, to: date, employeeIds })
    );

    const data = dedupeRowsByEmployee(rows);
    const summaryData = aggregate(data);
    console.log(
      `[DASHBOARD ${requestId}] Report rows: ${Array.isArray(rows) ? rows.length : 'non-array'}, unique employees: ${data.length}`
    );

    const permissions = Array.isArray(req.access?.permissions)
      ? req.access.permissions
      : [];

    const canViewDevice =
      permissions.includes('*') ||
      permissions.includes('dashboard.deviceHealth.view') ||
      permissions.includes('operations.deviceHealth.view') ||
      permissions.includes('device.view') ||
      req.access?.roleCode === 'SUPER_ADMIN';

    // Preserve current behavior: device info is optional if the device is unavailable.
    const device = canViewDevice
      ? await timedStep(requestId, 'Device information', async () => {
          try {
            return await deviceService.getInfo();
          } catch (error) {
            console.warn(
              `[DASHBOARD ${requestId}] Optional device info unavailable:`,
              error?.message || error
            );
            return null;
          }
        })
      : null;

    const employees = await timedStep(requestId, 'Employee count', async () => {
      if (employeeIds === null) {
        const activeEmployeeIds = await Employee.distinct('employeeId', {
          active: true
        });
        return activeEmployeeIds
          .map((id) => String(id || '').trim())
          .filter(Boolean).length;
      }

      return new Set(
        employeeIds
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      ).size;
    });

    const present = data.filter((row) => row.status === 'PRESENT').length;
    const absent = data.filter((row) => row.status === 'ABSENT').length;
    const leave = data.filter((row) => row.status === 'LEAVE').length;
    const late = data.filter((row) => Number(row.lateMinutes || 0) > 0).length;
    const overtime = data.filter(
      (row) => Number(row.overtimeMinutes || 0) > 0
    ).length;

    const attendanceRatio = employees > 0 ? (present / employees) * 100 : 0;

    console.log(
      `[DASHBOARD ${requestId}] Summary completed (${Date.now() - startedAt} ms)`
    );

    return res.json({
      success: true,
      date,
      employees,
      totalHeadcount: employees,
      present,
      presentToday: present,
      absent,
      absentees: absent,
      leave,
      approvedLeaves: leave,
      late,
      lateArrivals: late,
      overtime,
      activeOvertime: overtime,
      attendanceRatio,
      summary: summaryData,
      data,
      device
    });
  } catch (error) {
    console.error(
      `[DASHBOARD ${requestId}] Summary failed (${Date.now() - startedAt} ms):`,
      error
    );
    return res.status(500).json({
      success: false,
      message: 'Failed to generate dashboard summary'
    });
  }
}

async function sync(req, res) {
  try {
    return res.json({ success: true, result: await syncAttendance() });
  } catch (error) {
    console.error('[DASHBOARD] Device sync failed:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = { summary, sync };
