const {
  Employee,
  Attendance,
  Shift,
  Rule,
  Leave
} = require('../models');

const {
  buildIntervals
} = require('../utils/punches');

const {
  getAttendancePolicy,
  classifyDay,
  aggregateAttendanceUnits
} = require('../utils/attendance-policy');

const {
  startOfDay,
  endOfDay,
  minutesBetween,
  atTime,
  dateKey,
  iterateDays
} = require('../utils/time');


// ============================================================
// EMPLOYEE SHIFT
// ============================================================

async function getEmployeeShift(employee) {
  if (employee.shiftId) {
    const shift = await Shift
      .findById(employee.shiftId)
      .lean();

    if (shift) {
      return shift;
    }
  }

  const rule = await Rule
    .findOne()
    .lean();

  if (rule?.defaultShiftId) {
    return Shift
      .findById(rule.defaultShiftId)
      .lean();
  }

  return null;
}


// ============================================================
// BUILD ONE DAY SUMMARY
// ============================================================

function makeDaySummary(
  date,
  punches,
  employee,
  shift,
  leave,
  attendanceRule = {}
) {
  const sorted = [...punches]
    .filter((punch) => punch && punch.timestamp)
    .sort(
      (a, b) =>
        new Date(a.timestamp) -
        new Date(b.timestamp)
    );

  const intervals = buildIntervals(sorted);

  const workedMinutes = intervals.reduce(
    (sum, item) =>
      sum + Number(item.minutes || 0),
    0
  );

  const policy = getAttendancePolicy(attendanceRule);
  const completedIntervals = intervals.filter(item => !item.open);
  const halfDayIntervals = completedIntervals.filter(item => {
    const c = classifyDay({ workedMinutes: Number(item.minutes || 0), completedIntervals: 1, hasOpenInterval: false }, policy);
    return c.halfDay;
  }).length;

  let attendanceClassification = classifyDay({
    workedMinutes,
    completedIntervals: completedIntervals.length,
    hasOpenInterval: intervals.some(item => item.open)
  }, policy);

  if (policy.halfDayEnabled && policy.twoHalfDaysEqualOneDay && halfDayIntervals >= 2) {
    attendanceClassification = {
      ...attendanceClassification,
      status: 'FULL_DAY',
      label: 'Full Day',
      attendanceUnits: 1,
      halfDay: false,
      fullDay: true
    };
  }

  // In split-day mode, attendance credit is based on participating in the
  // configured morning/afternoon sessions rather than requiring exactly 480
  // worked minutes. This preserves the 09:30 grace window: an employee who
  // checks in at 09:20 and completes both sessions is still a full day.
  if (attendanceRule.halfDayEnabled !== false) {
    const morningStart = atTime(date, attendanceRule.morningStartTime || '09:00');
    const midday = atTime(date, attendanceRule.middayAutoCheckoutTime || '13:00');
    const afternoonStart = atTime(date, attendanceRule.afternoonStartTime || '13:30');
    const dayEnd = atTime(date, attendanceRule.dayEndAutoCheckoutTime || '17:30');
    const now = new Date();

    const overlaps = (item, start, end) => {
      const intervalStart = new Date(item.in);
      const intervalEnd = item.out ? new Date(item.out) : now;
      return intervalStart < end && intervalEnd > start;
    };

    const morningSessionPresent = intervals.some(item => overlaps(item, morningStart, midday));
    const afternoonSessionPresent = intervals.some(item => overlaps(item, afternoonStart, dayEnd));
    const splitSessions = Number(morningSessionPresent) + Number(afternoonSessionPresent);
    const hasOpen = intervals.some(item => item.open);

    if (!hasOpen && policy.twoHalfDaysEqualOneDay && splitSessions >= 2) {
      attendanceClassification = { status: 'FULL_DAY', label: 'Full Day', attendanceUnits: 1, halfDay: false, fullDay: true, halfDayEligible: true };
    } else if (!hasOpen && splitSessions === 1) {
      attendanceClassification = { status: 'HALF_DAY', label: 'Half Day', attendanceUnits: 0.5, halfDay: true, fullDay: false, halfDayEligible: true };
    }
  }

  const firstInPunch = sorted.find((punch) => punch.punchType === 'IN') || null;
  const lastOutPunch = [...sorted].reverse().find((punch) => punch.punchType === 'OUT') || null;

  const firstPunch = firstInPunch?.timestamp || (sorted.length > 0 ? sorted[0].timestamp : null);
  const lastPunch = lastOutPunch?.timestamp || (sorted.length > 0 ? sorted[sorted.length - 1].timestamp : null);

  const shiftStart = shift
    ? atTime(date, shift.startTime)
    : null;

  const shiftEnd = shift
    ? atTime(date, shift.endTime)
    : null;

  // ----------------------------------------------------------
  // LATE
  // ----------------------------------------------------------

  const ruleLateCutoff = atTime(date, attendanceRule.lateAfterTime || '09:30');
  const lateMinutes = firstInPunch
    ? Math.max(0, minutesBetween(ruleLateCutoff, firstInPunch.timestamp))
    : 0;
  const lateByRule = lateMinutes > 0;

  // ----------------------------------------------------------
  // EARLY DEPARTURE
  // ----------------------------------------------------------

  const earlyDepartureMinutes =
    lastPunch && shiftEnd
      ? Math.max(
          0,
          minutesBetween(
            lastPunch,
            shiftEnd
          )
        )
      : 0;

  // ----------------------------------------------------------
  // BREAK
  // ----------------------------------------------------------

  const breakMinutes =
    firstPunch && lastPunch
      ? Math.max(
          0,
          minutesBetween(
            firstPunch,
            lastPunch
          ) -
            workedMinutes
        )
      : 0;

  // ----------------------------------------------------------
  // OVERTIME
  // ----------------------------------------------------------

  const overtimeLimit = Number(
    shift?.overtimeAfterMinutes ??
      shift?.requiredMinutes ??
      480
  );

  const overtimeMinutes = Math.max(
    0,
    workedMinutes - overtimeLimit
  );

  // ----------------------------------------------------------
  // WORKING DAY
  //
  // JS:
  // Sunday = 0
  // Monday = 1
  // ...
  // Saturday = 6
  //
  // Project shifts use:
  // Monday = 1 ... Sunday = 7
  // ----------------------------------------------------------

  const dayOfWeek =
    new Date(date).getDay() || 7;

  const workingDays =
    Array.isArray(shift?.workingDays)
      ? shift.workingDays
      : [1, 2, 3, 4, 5, 6];

  const workingDay =
    !shift ||
    workingDays.includes(dayOfWeek);

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  let status;

  if (leave) {
    status = 'LEAVE';
  } else if (sorted.length > 0) {
    status = 'PRESENT';
  } else if (workingDay) {
    status = 'ABSENT';
  } else {
    status = 'OFF';
  }

  return {
    date: startOfDay(date),

    employeeId:
      employee.employeeId,

    employeeName:
      employee.name,

    department:
      employee.department || '',

    designation:
      employee.designation || '',

    status,

    // Detailed day classification used by the frontend/reports.
    attendanceDayStatus: attendanceClassification.status,
    attendanceDayLabel: attendanceClassification.label,
    attendanceUnits: attendanceClassification.attendanceUnits,
    halfDay: attendanceClassification.halfDay,
    fullDay: attendanceClassification.fullDay,
    halfDayEligible: attendanceClassification.halfDayEligible,
    halfDaySessions: halfDayIntervals,

    firstPunch,

    lastPunch,

    // Explicit aliases used by the employee-day API and web UI.
    firstIn: firstInPunch?.timestamp || null,
    lastOut: lastOutPunch?.timestamp || null,

    punches: sorted,

    intervals,

    workedMinutes,

    breakMinutes,

    lateMinutes,

    lateByRule,
    lateCutoffTime: attendanceRule.lateAfterTime || '09:30',
    consecutiveLateCount: 0,
    latePenaltyApplied: false,

    earlyDepartureMinutes,

    overtimeMinutes,

    requiredMinutes: Number(
      shift?.requiredMinutes ?? 480
    ),

    shift: shift
      ? {
          id: shift._id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes:
            Number(
              shift.breakMinutes || 0
            ),
          requiredMinutes:
            Number(
              shift.requiredMinutes ?? 480
            ),
          graceMinutes:
            Number(
              shift.graceMinutes || 0
            )
        }
      : null
  };
}


// ============================================================
// ATTENDANCE QUERY FOR EMPLOYEE
//
// IMPORTANT:
//
// Older records may contain:
//
// employeeId = EMP001
//
// while raw F28 synced records may contain:
//
// userId = 1
//
// and Employee.deviceUserId = "1"
//
// Therefore we search BOTH.
// ============================================================

async function getEmployeeAttendance(
  employee,
  fromDate,
  endDate
) {
  const or = [
    {
      employeeId:
        employee.employeeId
    }
  ];

  if (
    employee.deviceUserId !==
      undefined &&
    employee.deviceUserId !==
      null &&
    String(employee.deviceUserId)
      .trim() !== ''
  ) {
    or.push({
      userId:
        String(employee.deviceUserId)
    });
  }

  if (
    employee.deviceUid !==
      undefined &&
    employee.deviceUid !==
      null
  ) {
    or.push({
      userId:
        String(employee.deviceUid)
    });
  }

  const punches = await Attendance
    .find({
      $or: or,

      timestamp: {
        $gte: fromDate,
        $lt: endDate
      }
    })
    .sort({
      timestamp: 1
    })
    .lean();

  return punches;
}


// ============================================================
// BUILD REPORT
// ============================================================

async function buildReport({
  from,
  to,
  employeeId,
  employeeIds
} = {}) {
  const fromDate =
    startOfDay(
      from || new Date()
    );

  const toDate =
    startOfDay(
      to || fromDate
    );

  const endDate =
    endOfDay(toDate);

  const attendanceRule = (await Rule.findOne().lean()) || {};
  const lateThreshold = Math.max(1, Number(attendanceRule.consecutiveLateThreshold || 4));
  const lookbackDays = Math.max(30, lateThreshold * 10);
  const queryStartDate = startOfDay(fromDate);
  queryStartDate.setDate(queryStartDate.getDate() - lookbackDays);

  // ----------------------------------------------------------
  // Employee filter
  // ----------------------------------------------------------

  let employeeFilter;

  if (employeeId) {
    employeeFilter = {
      employeeId: String(employeeId),
    };
  } else if (Array.isArray(employeeIds)) {
    employeeFilter = {
      active: true,
      employeeId: {
        $in: employeeIds.map((id) => String(id)),
      },
    };
  } else {
    employeeFilter = {
      active: true,
    };
  }

  const employees =
    await Employee
      .find(employeeFilter)
      .sort({
        employeeId: 1
      })
      .lean();

  const rows = [];

  // ----------------------------------------------------------
  // Build each employee
  // ----------------------------------------------------------

  for (const employee of employees) {
    const shift =
      await getEmployeeShift(
        employee
      );

    const punches =
      await getEmployeeAttendance(
        employee,
        queryStartDate,
        endDate
      );

    const leaves =
      await Leave.find({
        employeeId:
          employee.employeeId,

        date: {
          $gte: queryStartDate,
          $lt: endDate
        },

        approved: true
      })
      .lean();

    // --------------------------------------------------------
    // Group punches by day
    // --------------------------------------------------------

    const punchesByDay =
      new Map();

    for (const punch of punches) {
      if (!punch.timestamp) {
        continue;
      }

      const key =
        dateKey(
          punch.timestamp
        );

      if (
        !punchesByDay.has(key)
      ) {
        punchesByDay.set(
          key,
          []
        );
      }

      punchesByDay
        .get(key)
        .push(punch);
    }

    // --------------------------------------------------------
    // Group leaves by day
    // --------------------------------------------------------

    const leaveByDay =
      new Map();

    for (const leave of leaves) {
      if (!leave.date) {
        continue;
      }

      leaveByDay.set(
        dateKey(leave.date),
        leave
      );
    }

    // --------------------------------------------------------
    // Generate every day. Keep a lookback window so a one-day report can
    // still know whether today is the 4th consecutive late working day.
    // --------------------------------------------------------

    let lateStreak = 0;

    for (
      const date of iterateDays(
        queryStartDate,
        toDate
      )
    ) {
      const key =
        dateKey(date);

      const dayPunches =
        punchesByDay.get(key) ||
        [];

      const leave =
        leaveByDay.get(key) ||
        null;

      const row = makeDaySummary(
        date,
        dayPunches,
        employee,
        shift,
        leave,
        attendanceRule
      );

      // OFF days (for example Sunday) do not break a late-arrival streak.
      if (row.status === 'PRESENT' && row.lateByRule) {
        lateStreak += 1;
        row.consecutiveLateCount = lateStreak;
        if (attendanceRule.halfDayEnabled !== false && lateStreak >= lateThreshold) {
          row.latePenaltyApplied = true;
          row.attendanceDayStatus = 'HALF_DAY';
          row.attendanceDayLabel = `Half Day (${lateThreshold} consecutive late arrivals)`;
          row.attendanceUnits = Math.min(Number(row.attendanceUnits || 1), Number(attendanceRule.consecutiveLatePenaltyUnits ?? 0.5));
          row.halfDay = true;
          row.fullDay = false;
          lateStreak = 0;
        }
      } else if (row.status !== 'OFF') {
        lateStreak = 0;
      }

      if (date >= fromDate) rows.push(row);
    }
  }

  return rows;
}


// ============================================================
// AGGREGATE
// ============================================================

function aggregate(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const workingRows =
    safeRows.filter(
      (row) =>
        row.status !== 'OFF'
    );

  const presentRows =
    workingRows.filter(
      (row) =>
        row.status === 'PRESENT'
    );

  const absentRows =
    workingRows.filter(
      (row) =>
        row.status === 'ABSENT'
    );

  const leaveRows =
    workingRows.filter(
      (row) =>
        row.status === 'LEAVE'
    );

  const totalWorkingMinutes =
    presentRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.workedMinutes || 0
        ),
      0
    );

  const totalOvertimeMinutes =
    presentRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.overtimeMinutes || 0
        ),
      0
    );

  const totalBreakMinutes =
    presentRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.breakMinutes || 0
        ),
      0
    );

  const lateDays =
    presentRows.filter(
      (row) =>
        Number(
          row.lateMinutes || 0
        ) > 0
    ).length;

  const earlyCheckoutDays =
    presentRows.filter(
      (row) =>
        Number(
          row.earlyDepartureMinutes ||
            0
        ) > 0
    ).length;

  const halfDayRows = presentRows.filter(row => row.attendanceDayStatus === 'HALF_DAY');
  const fullDayRows = presentRows.filter(row => row.attendanceDayStatus === 'FULL_DAY');
  const incompleteRows = presentRows.filter(row => row.attendanceDayStatus === 'INCOMPLETE' || row.attendanceDayStatus === 'IN_PROGRESS');
  const attendanceEquivalentDays = presentRows.reduce(
    (sum, row) => sum + Number(row.attendanceUnits || 0),
    0
  );

  return {
    totalRows:
      safeRows.length,

    totalWorkingDays:
      workingRows.length,

    presentDays:
      presentRows.length,

    // Attendance equivalent: 2 half-day records = 1 full day.
    attendanceEquivalentDays,
    halfDayDays: halfDayRows.length,
    fullDayDays: fullDayRows.length,
    incompleteAttendanceDays: incompleteRows.length,

    absentDays:
      absentRows.length,

    leaveDays:
      leaveRows.length,

    offDays:
      safeRows.filter(
        (row) =>
          row.status === 'OFF'
      ).length,

    lateDays,

    earlyCheckoutDays,

    totalWorkingMinutes,

    totalBreakMinutes,

    totalOvertimeMinutes,

    averageWorkingMinutes:
      presentRows.length > 0
        ? Math.round(
            totalWorkingMinutes /
              presentRows.length
          )
        : 0,

    averageOvertimeMinutes:
      presentRows.length > 0
        ? Math.round(
            totalOvertimeMinutes /
              presentRows.length
          )
        : 0
  };
}


module.exports = {
  buildReport,
  aggregate,
  makeDaySummary,
  getEmployeeShift,
  getEmployeeAttendance
};