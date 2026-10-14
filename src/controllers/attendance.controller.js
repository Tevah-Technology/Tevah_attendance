const { Attendance } = require('../models');
const attendanceService = require('../services/attendance.service');

const {
  buildReport,
} = require('../services/report.service');

const {
  restrictEmployeeFilter,
  assertEmployeeAllowed,
  getAllowedEmployeeIds,
} = require('../services/access-scope.service');


// ============================================================
// LIST ATTENDANCE
// ============================================================

async function list(req, res) {
  try {
    let filter = {};

    if (req.query.employeeId) {
      filter.employeeId = req.query.employeeId;
    }

    if (req.query.userId) {
      filter.userId = req.query.userId;
    }

    if (req.query.punchType) {
      filter.punchType = req.query.punchType;
    }

    if (req.query.from || req.query.to) {
      filter.timestamp = {};

      if (req.query.from) {
        filter.timestamp.$gte = new Date(req.query.from);
      }

      if (req.query.to) {
        filter.timestamp.$lte = new Date(req.query.to);
      }
    }

    // Apply employee access scope.
    filter = await restrictEmployeeFilter(
      req,
      filter
    );

    const page = Math.max(
      Number(req.query.page || 1),
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit || 100),
        1
      ),
      500
    );

    const skip =
      (page - 1) * limit;

    const [data, total] =
      await Promise.all([
        Attendance.find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),

        Attendance.countDocuments(filter),
      ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      data,
    });
  } catch (error) {
    console.error(
      'Attendance list error:',
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}


// ============================================================
// LATEST ATTENDANCE
// ============================================================

async function latest(req, res) {
  try {
    let filter = {};

    filter = await restrictEmployeeFilter(
      req,
      filter
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit || 20),
        1
      ),
      100
    );

    const data =
      await Attendance.find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      'Attendance latest error:',
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}


// ============================================================
// LIVE ATTENDANCE SSE STREAM
// ============================================================

async function stream(req, res) {
  try {
    const ids =
      await getAllowedEmployeeIds(req);

    res.setHeader(
      'Content-Type',
      'text/event-stream'
    );

    res.setHeader(
      'Cache-Control',
      'no-cache'
    );

    res.setHeader(
      'Connection',
      'keep-alive'
    );

    res.setHeader(
      'X-Accel-Buffering',
      'no'
    );

    res.flushHeaders?.();

    res.write(
      'data: {"connected":true}\n\n'
    );

    const client = {
      res,
      allowedEmployeeIds: ids,
      roleCode: req.access?.roleCode,
    };

    req.app.locals.sseClients.add(
      client
    );

    req.on('close', () => {
      req.app.locals.sseClients.delete(
        client
      );
    });
  } catch (error) {
    console.error(
      'Attendance stream error:',
      error
    );

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    } else {
      res.end();
    }
  }
}


// ============================================================
// EMPLOYEE DAY / PUNCH LOGS
// ============================================================
//
// GET:
//
// /api/attendance/employee/:employeeId/day/:date
//
// Example:
//
// /api/attendance/employee/EMP001/day/2026-09-25
//
// Returns:
//
// 1. Calculated attendance summary from buildReport()
// 2. Every raw Attendance punch for that employee/date
//
// ============================================================

async function employeeDay(req, res) {
  try {
    const employeeId =
      String(req.params.employeeId || '')
        .trim();

    const date =
      String(req.params.date || '')
        .trim();

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required',
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required',
      });
    }

    // --------------------------------------------------------
    // Validate date format
    // --------------------------------------------------------

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Date must use YYYY-MM-DD format',
      });
    }

    // --------------------------------------------------------
    // Security / employee scope
    // --------------------------------------------------------

    const allowed =
      await assertEmployeeAllowed(
        req,
        employeeId
      );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message:
          'Employee is outside your assigned data scope',
        code: 'SCOPE_FORBIDDEN',
      });
    }

    // --------------------------------------------------------
    // BUILD ATTENDANCE REPORT
    // --------------------------------------------------------
    //
    // We keep your existing reporting engine.
    //
    // This is important because your dashboard/reports
    // already depend on buildReport().
    //

    const rows =
      await buildReport({
        from: date,
        to: date,
        employeeId,
      });

    const reportRows =
      Array.isArray(rows)
        ? rows
        : [];

    /*
     * Usually there will be one report row for the
     * employee/date combination.
     *
     * We keep the complete data array in the response
     * for compatibility.
     */

    const record =
      reportRows.length > 0
        ? reportRows[0]
        : null;

    // --------------------------------------------------------
    // DATE RANGE
    // --------------------------------------------------------
    //
    // We use a local calendar range here instead of relying
    // on string matching.
    //

    const start =
      new Date(`${date}T00:00:00.000`);

    const end =
      new Date(`${date}T23:59:59.999`);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date',
      });
    }

    // --------------------------------------------------------
    // RAW F28 / ATTENDANCE PUNCHES
    // --------------------------------------------------------
    //
    // These are the actual Attendance documents stored
    // by the synchronization process.
    //

    const employeeDoc = await require('../models').Employee.findOne({ employeeId }).lean();
    const identityFilters = [{ employeeId }];
    if (employeeDoc?.deviceUserId) identityFilters.push({ userId: String(employeeDoc.deviceUserId) });
    if (employeeDoc?.deviceUid != null) identityFilters.push({ userId: String(employeeDoc.deviceUid) });

    const punches =
      await Attendance.find({
        $or: identityFilters,
        timestamp: {
          $gte: start,
          $lte: end,
        },
      })
        .sort({ timestamp: 1 })
        .lean();

    // --------------------------------------------------------
    // ATTENDANCE CALCULATED SUMMARY
    // --------------------------------------------------------

    const attendance = record
      ? {
          status:
            record.status ||
            'ABSENT',

          firstIn:
            record.firstIn ||
            record.firstPunch ||
            null,

          lastOut:
            record.lastOut ||
            record.lastPunch ||
            null,

          workingMinutes:
            Number(
              record.workedMinutes ||
              record.workingMinutes ||
              record.totalWorkingMinutes ||
              0
            ),

          overtimeMinutes:
            Number(
              record.overtimeMinutes ||
              0
            ),

          lateMinutes:
            Number(
              record.lateMinutes ||
              0
            ),

          earlyDepartureMinutes:
            Number(
              record.earlyDepartureMinutes ||
              0
            ),
        }
      : {
          status: 'ABSENT',

          firstIn: null,

          lastOut: null,

          workingMinutes: 0,

          overtimeMinutes: 0,

          lateMinutes: 0,

          earlyDepartureMinutes: 0,
        };

    // --------------------------------------------------------
    // NORMALIZE RAW PUNCHES
    // --------------------------------------------------------

    const normalizedPunches =
      punches.map((punch) => ({
        id:
          punch._id
            ? String(punch._id)
            : null,

        employeeId:
          punch.employeeId ||
          employeeId,

        userId:
          punch.userId ||
          null,

        employeeName:
          punch.employeeName ||
          null,

        timestamp:
          punch.timestamp ||
          null,

        punchType:
          punch.punchType ||
          null,

        state:
          punch.state ??
          null,

        source:
          punch.source ||
          null,

        correctionReason:
          punch.correctionReason ||
          null,

        correctedAt:
          punch.correctedAt ||
          null,
      }));

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.json({
      success: true,

      date,

      employeeId,

      attendance,

      punches:
        normalizedPunches,

      /*
       * Keep original report data.
       *
       * This allows the endpoint to remain compatible
       * with anything already consuming `data`.
       */
      data: reportRows,

      meta: {
        punchCount:
          normalizedPunches.length,

        hasPunches:
          normalizedPunches.length > 0,

        source:
          normalizedPunches.length > 0
            ? 'ATTENDANCE_DATABASE'
            : 'NO_ATTENDANCE_RECORDS',
      },
    });
  } catch (error) {
    console.error(
      'Employee day attendance error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        'Failed to load employee attendance',
    });
  }
}


// ============================================================
// UPDATE ATTENDANCE
// ============================================================

async function update(req, res) {
  try {
    const existing =
      await Attendance.findById(
        req.params.id
      )
        .select('employeeId')
        .lean();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message:
          'Attendance record not found',
      });
    }

    // --------------------------------------------------------
    // SECURITY
    // --------------------------------------------------------

    if (
      !(await assertEmployeeAllowed(
        req,
        existing.employeeId
      ))
    ) {
      return res.status(403).json({
        success: false,
        message:
          'Attendance is outside your assigned data scope',
        code: 'SCOPE_FORBIDDEN',
      });
    }

    if (
      req.body.employeeId &&
      !(await assertEmployeeAllowed(
        req,
        req.body.employeeId
      ))
    ) {
      return res.status(403).json({
        success: false,
        message:
          'Target employee is outside your assigned data scope',
        code: 'SCOPE_FORBIDDEN',
      });
    }

    // --------------------------------------------------------
    // ALLOWED FIELDS
    // --------------------------------------------------------

    const allowed = [
      'timestamp',
      'punchType',
      'employeeId',
      'employeeName',
      'userId',
      'state',
    ];

    const changes = {};

    for (const key of allowed) {
      if (
        req.body[key] !== undefined
      ) {
        changes[key] =
          req.body[key];
      }
    }

    if (req.body.timestamp) {
      changes.timestamp =
        new Date(
          req.body.timestamp
        );
    }

    if (
      req.body.correctionReason
    ) {
      changes.correctionReason =
        String(
          req.body.correctionReason
        );
    }

    // --------------------------------------------------------
    // AUDIT
    // --------------------------------------------------------

    changes.source =
      'MANUAL_ADMIN';

    changes.correctedAt =
      new Date();

    // --------------------------------------------------------
    // UPDATE
    // --------------------------------------------------------

    const record =
      await Attendance.findByIdAndUpdate(
        req.params.id,
        {
          $set: changes,
        },
        {
          new: true,
          runValidators: true,
        }
      ).lean();

    return res.json({
      success: true,
      message:
        'Attendance record updated',
      data: record,
    });
  } catch (error) {
    console.error(
      'Attendance update error:',
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}



// ============================================================
// EMPLOYEE SELF-SERVICE CHECK IN / CHECK OUT
// ============================================================

function getSelfEmployeeId(req) {
  return String(req.user?.employeeId || '').trim();
}

async function selfStatus(req, res) {
  try {
    const employeeId = getSelfEmployeeId(req);
    if (!employeeId) {
      return res.status(404).json({
        success: false,
        message: 'No employee profile is linked to this account'
      });
    }

    const status = await attendanceService.getTodayStatus(employeeId);
    return res.json({ success: true, data: status });
  } catch (error) {
    console.error('Attendance self status error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function selfCheckIn(req, res) {
  try {
    const employeeId = getSelfEmployeeId(req);
    if (!employeeId) {
      return res.status(404).json({
        success: false,
        message: 'No employee profile is linked to this account'
      });
    }

    const result = await attendanceService.webCheckIn(employeeId, {
      accountId: String(req.user?._id || ''),
      ip: req.ip,
      userAgent: req.get('user-agent') || ''
    });

    if (result.alreadyCheckedIn) {
      return res.status(409).json({
        success: false,
        message: 'Employee is already checked in',
        data: await attendanceService.getTodayStatus(employeeId)
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Attendance check-in recorded',
      data: await attendanceService.getTodayStatus(employeeId)
    });
  } catch (error) {
    console.error('Attendance self check-in error:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function selfCheckOut(req, res) {
  try {
    const employeeId = getSelfEmployeeId(req);
    if (!employeeId) {
      return res.status(404).json({
        success: false,
        message: 'No employee profile is linked to this account'
      });
    }

    const result = await attendanceService.webCheckOut(employeeId, {
      accountId: String(req.user?._id || ''),
      ip: req.ip,
      userAgent: req.get('user-agent') || ''
    });

    if (result.notCheckedIn) {
      return res.status(409).json({
        success: false,
        message: 'Employee is not currently checked in',
        data: await attendanceService.getTodayStatus(employeeId)
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Attendance check-out recorded',
      data: await attendanceService.getTodayStatus(employeeId)
    });
  } catch (error) {
    console.error('Attendance self check-out error:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  list,
  latest,
  stream,
  employeeDay,
  update,
  selfStatus,
  selfCheckIn,
  selfCheckOut,
};