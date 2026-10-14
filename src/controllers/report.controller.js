const { buildReport, aggregate } = require('../services/report.service');
const { toExcel, toCsv, toPdf } = require('../utils/export');
const { getAllowedEmployeeIds } = require('../services/access-scope.service');

/**
 * ---------------------------------------------------------
 * DATE HELPERS
 * ---------------------------------------------------------
 */

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function parseDate(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (value instanceof Date) {
    return isValidDate(value) ? value : fallback;
  }

  const parsed = new Date(value);

  return isValidDate(parsed) ? parsed : fallback;
}

function startOfDay(date) {
  const d = new Date(date);

  d.setHours(0, 0, 0, 0);

  return d;
}

function endOfDay(date) {
  const d = new Date(date);

  d.setHours(23, 59, 59, 999);

  return d;
}

/**
 * Parse monthly request.
 *
 * Supported:
 *
 *   ?year=2026&month=9
 *
 * and:
 *
 *   ?month=2026-09
 */
function parseMonthlyRange(req) {
  const now = new Date();

  let year;
  let monthNumber;

  /*
   * Preferred Flutter format:
   *
   * /reports/monthly?year=2026&month=9
   */
  if (
    req.query.year !== undefined &&
    req.query.month !== undefined
  ) {
    year = Number(req.query.year);
    monthNumber = Number(req.query.month);
  }

  /*
   * Backwards-compatible format:
   *
   * /reports/monthly?month=2026-09
   */
  else if (
    typeof req.query.month === 'string' &&
    req.query.month.includes('-')
  ) {
    const parts = req.query.month.split('-');

    year = Number(parts[0]);
    monthNumber = Number(parts[1]);
  }

  /*
   * No month supplied:
   * use current month.
   */
  else {
    year = now.getFullYear();
    monthNumber = now.getMonth() + 1;
  }

  /*
   * Validate year.
   */
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    throw new Error(
      `Invalid year: ${req.query.year ?? year}`
    );
  }

  /*
   * Validate month.
   */
  if (
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new Error(
      `Invalid month: ${req.query.month ?? monthNumber}. Expected 1-12.`
    );
  }

  /*
   * First day of requested month.
   */
  const from = new Date(
    year,
    monthNumber - 1,
    1,
    0,
    0,
    0,
    0
  );

  /*
   * Last millisecond of requested month.
   *
   * Using day 0 of the next month safely handles:
   *
   * Jan  -> 31
   * Feb  -> 28/29
   * Apr  -> 30
   * etc.
   */
  const to = new Date(
    year,
    monthNumber,
    0,
    23,
    59,
    59,
    999
  );

  return {
    year,
    monthNumber,
    month: `${year}-${String(monthNumber).padStart(2, '0')}`,
    from,
    to,
  };
}

/**
 * ---------------------------------------------------------
 * ACCESS-SCOPED REPORT ROWS
 * ---------------------------------------------------------
 */

async function rows(req, options = {}) {
  const now = new Date();

  const defaultFrom = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0
  );

  const defaultTo = endOfDay(now);

  const from = parseDate(
    options.from ?? req.query.from ?? req.query.startDate,
    defaultFrom
  );

  const to = parseDate(
    options.to ?? req.query.to ?? req.query.endDate,
    defaultTo
  );

  if (!isValidDate(from)) {
    throw new Error('Invalid report start date');
  }

  if (!isValidDate(to)) {
    throw new Error('Invalid report end date');
  }

  if (from > to) {
    throw new Error(
      'Report start date cannot be after end date'
    );
  }

  const employeeIds = await getAllowedEmployeeIds(req);

  const requestedEmployeeId =
    options.employeeId ??
    req.query.employeeId;

  /*
   * If an employee is requested but is outside the
   * current user's allowed scope, return no records.
   */
  if (
    requestedEmployeeId &&
    Array.isArray(employeeIds) &&
    !employeeIds.includes(String(requestedEmployeeId))
  ) {
    return [];
  }

  return buildReport({
    from,
    to,
    employeeId: requestedEmployeeId,
    employeeIds,
  });
}

/**
 * ---------------------------------------------------------
 * DAILY
 * ---------------------------------------------------------
 *
 * GET:
 * /api/reports/daily?date=2026-09-24
 */
async function daily(req, res) {
  try {
    const requestedDate =
      parseDate(
        req.query.date,
        new Date()
      );

    if (!requestedDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date',
      });
    }

    const from = startOfDay(requestedDate);
    const to = endOfDay(requestedDate);

    const data = await rows(req, {
      from,
      to,
    });

    res.json({
      success: true,
      date: from.toISOString().slice(0, 10),
      summary: aggregate(data),
      data,
    });
  } catch (error) {
    console.error('[Reports] daily error:', error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * ---------------------------------------------------------
 * WEEKLY
 * ---------------------------------------------------------
 *
 * GET:
 * /api/reports/weekly?startDate=2026-09-18&endDate=2026-09-24
 */
async function weekly(req, res) {
  try {
    const now = new Date();

    const defaultFrom = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6,
      0,
      0,
      0,
      0
    );

    const defaultTo = endOfDay(now);

    const from = parseDate(
      req.query.from ?? req.query.startDate,
      defaultFrom
    );

    const to = parseDate(
      req.query.to ?? req.query.endDate,
      defaultTo
    );

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Invalid weekly date range',
      });
    }

    if (from > to) {
      return res.status(400).json({
        success: false,
        message: 'Weekly start date cannot be after end date',
      });
    }

    const rawRows = await rows(req, {
      from: startOfDay(from),
      to: endOfDay(to),
    });

    const grouped = new Map();

    for (const row of rawRows) {
      const employeeId = String(row.employeeId || '').trim();
      if (!employeeId) continue;

      if (!grouped.has(employeeId)) {
        grouped.set(employeeId, []);
      }

      grouped.get(employeeId).push(row);
    }

    const data = [...grouped.entries()]
      .map(([employeeId, items]) => {
        const stats = aggregate(items);
        const first = items[0] || {};

        return {
          employeeId,
          employeeName: first.employeeName || '',
          department: first.department || '',
          designation: first.designation || '',
          workingDays: stats.totalWorkingDays,
          presentDays: stats.presentDays,
          absentDays: stats.absentDays,
          leaveDays: stats.leaveDays,
          offDays: stats.offDays,
          lateDays: stats.lateDays,
          halfDayDays: stats.halfDayDays,
          fullDayDays: stats.fullDayDays,
          attendanceEquivalentDays: stats.attendanceEquivalentDays,
          workMinutes: stats.totalWorkingMinutes,
          breakMinutes: stats.totalBreakMinutes,
          overtimeMinutes: stats.totalOvertimeMinutes,
        };
      })
      .sort((a, b) =>
        a.employeeId.localeCompare(b.employeeId, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );

    return res.json({
      success: true,
      from: startOfDay(from).toISOString(),
      to: endOfDay(to).toISOString(),
      summary: aggregate(rawRows),
      data,
    });
  } catch (error) {
    console.error('[Reports] weekly error:', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * ---------------------------------------------------------
 * MONTHLY
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 *
 * Flutter sends:
 *
 * /reports/monthly?year=2026&month=9
 *
 * This function now supports that format correctly.
 */
async function monthly(req, res) {
  try {
    const range = parseMonthlyRange(req);

    console.log(
      `[Reports] Monthly range: ${range.month} ` +
      `${range.from.toISOString()} -> ${range.to.toISOString()}`
    );

    // buildReport() returns one row per employee per calendar day.
    // Keep those raw rows for summary/export compatibility, but expose an
    // employee-grouped structure for the Monthly Timesheet Matrix.
    const data = await rows(req, {
      from: range.from,
      to: range.to,
    });

    const grouped = new Map();

    for (const row of data) {
      const employeeId = String(row.employeeId || '').trim();

      if (!employeeId) continue;

      if (!grouped.has(employeeId)) {
        grouped.set(employeeId, {
          employeeId,
          employeeName: row.employeeName || '',
          department: row.department || '',
          designation: row.designation || '',
          daily: [],
          workMinutes: 0,
          overtimeMinutes: 0,
          breakMinutes: 0,
          presentDays: 0,
          absentDays: 0,
          leaveDays: 0,
          offDays: 0,
          lateDays: 0,
          fullDayDays: 0,
          halfDayDays: 0,
          attendanceUnits: 0,
        });
      }

      const employee = grouped.get(employeeId);
      const date = new Date(row.date);
      const day = date.getDate();

      let code = '—';

      if (row.status === 'LEAVE') {
        code = 'L';
      } else if (row.status === 'ABSENT') {
        code = 'A';
      } else if (row.status === 'OFF') {
        code = 'WO';
      } else if (row.status === 'PRESENT') {
        code = Number(row.lateMinutes || 0) > 0 ? 'LT' : 'P';
      }

      employee.daily.push({
        day,
        date: row.date,
        code,
        status: row.status,
        attendanceDayStatus: row.attendanceDayStatus || null,
        attendanceDayLabel: row.attendanceDayLabel || null,
        attendanceUnits: Number(row.attendanceUnits || 0),
        halfDay: Boolean(row.halfDay),
        fullDay: Boolean(row.fullDay),
        firstIn: row.firstIn || null,
        lastOut: row.lastOut || null,
        workedMinutes: Number(row.workedMinutes || 0),
        breakMinutes: Number(row.breakMinutes || 0),
        overtimeMinutes: Number(row.overtimeMinutes || 0),
        lateMinutes: Number(row.lateMinutes || 0),
        earlyDepartureMinutes: Number(row.earlyDepartureMinutes || 0),
        consecutiveLateCount: Number(row.consecutiveLateCount || 0),
        latePenaltyApplied: Boolean(row.latePenaltyApplied),
      });

      employee.workMinutes += Number(row.workedMinutes || 0);
      employee.overtimeMinutes += Number(row.overtimeMinutes || 0);
      employee.breakMinutes += Number(row.breakMinutes || 0);
      employee.attendanceUnits += Number(row.attendanceUnits || 0);

      if (row.status === 'PRESENT') employee.presentDays += 1;
      if (row.status === 'ABSENT') employee.absentDays += 1;
      if (row.status === 'LEAVE') employee.leaveDays += 1;
      if (row.status === 'OFF') employee.offDays += 1;
      if (Number(row.lateMinutes || 0) > 0) employee.lateDays += 1;
      if (row.attendanceDayStatus === 'FULL_DAY') employee.fullDayDays += 1;
      if (row.attendanceDayStatus === 'HALF_DAY') employee.halfDayDays += 1;
    }

    const employees = [...grouped.values()]
      .map((employee) => ({
        ...employee,
        daily: employee.daily.sort((a, b) => a.day - b.day),
      }))
      .sort((a, b) =>
        a.employeeId.localeCompare(b.employeeId, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );

    return res.json({
      success: true,
      month: range.month,
      year: range.year,
      monthNumber: range.monthNumber,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      summary: aggregate(data),

      // One item per employee for the Monthly Summary frontend.
      employees,

      // Retained for backwards compatibility and raw export/debug use.
      data,
    });
  } catch (error) {
    console.error('[Reports] monthly error:', error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}


/**
 * ---------------------------------------------------------
 * EMPLOYEE
 * ---------------------------------------------------------
 *
 * Supports:
 *
 * /reports/employee?employeeId=EMP001
 *
 * Also preserves the existing access-scope filtering.
 */
async function employee(req, res) {
  try {
    const employeeId =
      req.query.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message:
          'employeeId is required for employee report',
      });
    }

    const data = await rows(req);

    const grouped = new Map();

    for (const row of data) {
      const id =
        String(
          row.employeeId ??
          employeeId
        );

      if (!grouped.has(id)) {
        grouped.set(id, []);
      }

      grouped.get(id).push(row);
    }

    const result = [
      ...grouped.entries(),
    ].map(([id, items]) => ({
      employeeId: id,

      employeeName:
        items[0]?.employeeName || '',

      department:
        items[0]?.department || '',

      summary:
        aggregate(items),

      data: items,
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Reports] employee error:', error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * ---------------------------------------------------------
 * DEPARTMENT
 * ---------------------------------------------------------
 */
async function department(req, res) {
  try {
    const rawRows = await rows(req);
    const grouped = new Map();

    for (const row of rawRows) {
      const key = row.department && String(row.department).trim()
        ? String(row.department).trim()
        : 'Unassigned';

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(row);
    }

    const data = [...grouped.entries()]
      .map(([departmentName, items]) => {
        const stats = aggregate(items);
        const uniqueEmployees = new Set(
          items
            .map((item) => String(item.employeeId || '').trim())
            .filter(Boolean)
        );

        return {
          department: departmentName,
          employeeCount: uniqueEmployees.size,
          presentDays: stats.presentDays,
          absentDays: stats.absentDays,
          leaveDays: stats.leaveDays,
          offDays: stats.offDays,
          lateDays: stats.lateDays,
          halfDayDays: stats.halfDayDays,
          fullDayDays: stats.fullDayDays,
          attendanceEquivalentDays: stats.attendanceEquivalentDays,
          workMinutes: stats.totalWorkingMinutes,
          breakMinutes: stats.totalBreakMinutes,
          overtimeMinutes: stats.totalOvertimeMinutes,
        };
      })
      .sort((a, b) => a.department.localeCompare(b.department));

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Reports] department error:', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * ---------------------------------------------------------
 * FILTERED REPORTS
 * ---------------------------------------------------------
 */

async function filtered(req, res, predicate) {
  try {
    const data =
      (
        await rows(req)
      ).filter(predicate);

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(
      '[Reports] filtered error:',
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * ---------------------------------------------------------
 * DASHBOARD
 * ---------------------------------------------------------
 *
 * The Flutter Reports module calls:
 *
 * /reports/dashboard
 *
 * We build the dashboard from the current month.
 */
async function dashboard(req, res) {
  try {
    const range = parseMonthlyRange(req);

    const data = await rows(req, {
      from: range.from,
      to: range.to,
    });

    const summary = aggregate(data);

    res.json({
      success: true,

      dashboard: {
        ...summary,

        month: range.month,

        year: range.year,

        monthNumber: range.monthNumber,
      },

      data,
    });
  } catch (error) {
    console.error(
      '[Reports] dashboard error:',
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * ---------------------------------------------------------
 * EXPORT
 * ---------------------------------------------------------
 *
 * Flutter sends:
 *
 * /reports/export
 *
 * Examples:
 *
 * ?type=monthly&year=2026&month=9&format=xlsx
 *
 * ?type=daily&date=2026-09-24&format=csv
 *
 * ?type=weekly&startDate=2026-09-18&endDate=2026-09-24&format=pdf
 */
async function exportReport(req, res) {
  try {
    const format =
      String(
        req.query.format || 'xlsx'
      ).toLowerCase();

    const type =
      String(
        req.query.type || 'daily'
      ).toLowerCase();

    const validFormats = [
      'xlsx',
      'csv',
      'pdf',
    ];

    if (!validFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        message:
          'format must be xlsx, csv or pdf',
      });
    }

    const requiredPermission =
      `reports.export.${format}`;

    /*
     * Keep the existing permission model.
     */
    if (
      req.access?.roleCode !==
        'SUPER_ADMIN' &&
      !req.permissions?.includes(
        'reports.export'
      ) &&
      !req.permissions?.includes(
        requiredPermission
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          `Missing permission: ${requiredPermission}`,
        code:
          'PERMISSION_FORBIDDEN',
      });
    }

    let data = [];

    /**
     * -----------------------------------------------------
     * MONTHLY EXPORT
     * -----------------------------------------------------
     */
    if (type === 'monthly') {
      const range =
        parseMonthlyRange(req);

      data = await rows(req, {
        from: range.from,
        to: range.to,
      });
    }

    /**
     * -----------------------------------------------------
     * DAILY / ABSENT EXPORT
     * -----------------------------------------------------
     */
    else if (
      type === 'daily' ||
      type === 'absent'
    ) {
      const date =
        parseDate(
          req.query.date,
          new Date()
        );

      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date',
        });
      }

      data = await rows(req, {
        from: startOfDay(date),
        to: endOfDay(date),
      });

      if (type === 'absent') {
        data =
          data.filter(
            row =>
              row.status ===
              'ABSENT'
          );
      }
    }

    /**
     * -----------------------------------------------------
     * WEEKLY / EMPLOYEE / DEPARTMENT /
     * LATE / OVERTIME
     * -----------------------------------------------------
     */
    else {
      data = await rows(req);
    }

    /**
     * -----------------------------------------------------
     * ADDITIONAL TYPE FILTERS
     * -----------------------------------------------------
     */

    if (type === 'late') {
      data =
        data.filter(
          row =>
            Number(
              row.lateMinutes || 0
            ) > 0
        );
    }

    if (type === 'overtime') {
      data =
        data.filter(
          row =>
            Number(
              row.overtimeMinutes || 0
            ) > 0
        );
    }

    /**
     * -----------------------------------------------------
     * XLSX
     * -----------------------------------------------------
     */
    if (format === 'xlsx') {
      const buffer =
        toExcel(data);

      res.type(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.attachment(
        `attendance-${type}-report.xlsx`
      );

      return res.send(buffer);
    }

    /**
     * -----------------------------------------------------
     * CSV
     * -----------------------------------------------------
     */
    if (format === 'csv') {
      const csv =
        toCsv(data);

      res.type('text/csv');

      res.attachment(
        `attendance-${type}-report.csv`
      );

      return res.send(csv);
    }

    /**
     * -----------------------------------------------------
     * PDF
     * -----------------------------------------------------
     */
    if (format === 'pdf') {
      const pdf =
        await toPdf(data);

      res.type('application/pdf');

      res.attachment(
        `attendance-${type}-report.pdf`
      );

      return res.send(pdf);
    }
  } catch (error) {
    console.error(
      '[Reports] export error:',
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * ---------------------------------------------------------
 * EXPORTS
 * ---------------------------------------------------------
 */

module.exports = {
  dashboard,
  daily,
  weekly,
  monthly,
  employee,
  department,
  filtered,
  exportReport,
};