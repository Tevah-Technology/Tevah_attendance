'use strict';

/**
 * Attendance duration policy.
 *
 * IMPORTANT: the database Rules document is the source of truth.
 * These values are no longer read from .env:
 *   halfDayEnabled
 *   halfDayMinutes
 *   fullDayMinutes
 *   twoHalfDaysEqualOneDay
 *   attendanceUseEnvHours (legacy-compatible field name)
 */

function boolValue(value, defaultValue) {
  return value === undefined || value === null ? defaultValue : Boolean(value);
}

function numberValue(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : defaultValue;
}

function getAttendancePolicy(rule = {}) {
  const halfDayEnabled = boolValue(rule.halfDayEnabled, true);
  const halfDayMinutes = numberValue(rule.halfDayMinutes, 240);
  const fullDayMinutes = numberValue(rule.fullDayMinutes, 480);
  const twoHalfDaysEqualOneDay = boolValue(rule.twoHalfDaysEqualOneDay, true);
  const attendanceUseEnvHours = boolValue(rule.attendanceUseEnvHours, false);

  const safeHalfDayMinutes = Math.max(0, halfDayMinutes);
  const safeFullDayMinutes = Math.max(safeHalfDayMinutes, fullDayMinutes || 480);

  return {
    halfDayEnabled,
    halfDayMinutes: safeHalfDayMinutes,
    fullDayMinutes: safeFullDayMinutes,
    twoHalfDaysEqualOneDay,
    // Kept for compatibility with existing response consumers.
    useEnvHours: attendanceUseEnvHours,
    attendanceUseEnvHours
  };
}

function classifyDay(
  {
    workedMinutes = 0,
    completedIntervals = 0,
    hasOpenInterval = false
  } = {},
  policy = getAttendancePolicy()
) {
  const worked = Math.max(0, Number(workedMinutes) || 0);
  const open = Boolean(hasOpenInterval);

  if (!policy.halfDayEnabled) {
    if (worked >= policy.fullDayMinutes) {
      return { status: 'FULL_DAY', label: 'Full Day', attendanceUnits: 1, halfDay: false, fullDay: true, halfDayEligible: false };
    }
    if (worked > 0) {
      return { status: open ? 'IN_PROGRESS' : 'INCOMPLETE', label: open ? 'In Progress' : 'Incomplete', attendanceUnits: 0, halfDay: false, fullDay: false, halfDayEligible: false };
    }
    return { status: 'ABSENT', label: 'Absent', attendanceUnits: 0, halfDay: false, fullDay: false, halfDayEligible: false };
  }

  if (worked >= policy.fullDayMinutes) {
    return { status: 'FULL_DAY', label: 'Full Day', attendanceUnits: 1, halfDay: false, fullDay: true, halfDayEligible: true };
  }

  if (worked >= policy.halfDayMinutes) {
    return { status: 'HALF_DAY', label: 'Half Day', attendanceUnits: 0.5, halfDay: true, fullDay: false, halfDayEligible: true };
  }

  if (worked > 0) {
    return { status: open ? 'IN_PROGRESS' : 'INCOMPLETE', label: open ? 'In Progress' : 'Incomplete', attendanceUnits: 0, halfDay: false, fullDay: false, halfDayEligible: false };
  }

  return { status: 'ABSENT', label: 'Absent', attendanceUnits: 0, halfDay: false, fullDay: false, halfDayEligible: false };
}

function aggregateAttendanceUnits(rows, policy = getAttendancePolicy()) {
  if (!Array.isArray(rows)) return 0;

  let fullDays = 0;
  let halfDays = 0;
  for (const row of rows) {
    const status = String(row?.attendanceDayStatus || '').toUpperCase();
    if (status === 'FULL_DAY') fullDays += 1;
    else if (status === 'HALF_DAY') halfDays += 1;
  }

  if (!policy.halfDayEnabled) return fullDays;

  if (policy.twoHalfDaysEqualOneDay) {
    return fullDays + Math.floor(halfDays / 2) + (halfDays % 2) * 0.5;
  }

  return fullDays + halfDays * 0.5;
}

function aggregateAttendanceDetails(rows, policy = getAttendancePolicy()) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let fullDayCount = 0;
  let halfDayCount = 0;
  let incompleteCount = 0;
  let inProgressCount = 0;
  let absentCount = 0;

  for (const row of safeRows) {
    switch (String(row?.attendanceDayStatus || '').toUpperCase()) {
      case 'FULL_DAY': fullDayCount++; break;
      case 'HALF_DAY': halfDayCount++; break;
      case 'INCOMPLETE': incompleteCount++; break;
      case 'IN_PROGRESS': inProgressCount++; break;
      case 'ABSENT': absentCount++; break;
      default: break;
    }
  }

  return {
    fullDayCount,
    halfDayCount,
    incompleteCount,
    inProgressCount,
    absentCount,
    attendanceEquivalentDays: aggregateAttendanceUnits(safeRows, policy)
  };
}

module.exports = {
  getAttendancePolicy,
  classifyDay,
  aggregateAttendanceUnits,
  aggregateAttendanceDetails
};
