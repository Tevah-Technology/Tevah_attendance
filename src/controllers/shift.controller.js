const {
  Shift,
  ShiftAssignment,
} = require('../models');

const {
  isValidTime,
} = require('../utils/validators');

function printSection() {}

function printRequest() {}

// ============================================================
// HELPERS
// ============================================================

function hoursTextToMinutes(value, fallback = 480) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  const parts = value.trim().split(':');

  if (parts.length !== 2) {
    return fallback;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return fallback;
  }

  return (hours * 60) + minutes;
}

function minutesToHoursText(value) {
  const total = Number(value);

  if (!Number.isFinite(total) || total < 0) {
    return '08:00';
  }

  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0')
  );
}

function normalizeRoundingMinutes(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return Math.max(1, Math.round(value));
  }

  const text = String(value)
    .trim()
    .toLowerCase();

  if (text === 'exact') {
    return 1;
  }

  const match = text.match(/\d+/);

  if (!match) {
    return 1;
  }

  return Math.max(
    1,
    Number(match[0])
  );
}

function normalizeRoundingLabel(minutes) {
  const value = Number(minutes);

  if (!Number.isFinite(value) || value <= 1) {
    return 'Exact';
  }

  if (value === 5) {
    return '5 min';
  }

  if (value === 15) {
    return '15 min';
  }

  if (value === 30) {
    return '30 min';
  }

  if (value === 60) {
    return '60 min';
  }

  return `${value} min`;
}

// ============================================================
// NORMALIZE FLUTTER -> BACKEND
// ============================================================

function normalizeShiftBody(body = {}) {
  const update = {
    ...body,
  };

  // ----------------------------------------------------------
  // REQUIRED MINUTES
  // ----------------------------------------------------------

  if (body.requiredMinutes !== undefined) {
    update.requiredMinutes =
      Number(body.requiredMinutes);

    update.requiredHours =
      minutesToHoursText(
        update.requiredMinutes
      );
  } else if (body.requiredHours !== undefined) {
    update.requiredMinutes =
      hoursTextToMinutes(
        body.requiredHours,
        480
      );
  }

  // ----------------------------------------------------------
  // ATTENDANCE CREDIT
  // ----------------------------------------------------------

  if (body.attendanceUnits !== undefined) {
    update.attendanceUnits =
      Number(body.attendanceUnits);
  }

  // ----------------------------------------------------------
  // BREAK
  // ----------------------------------------------------------

  if (body.breakMinutes !== undefined) {
    update.breakMinutes =
      Number(body.breakMinutes);

    update.breakDurationMinutes =
      Number(body.breakMinutes);
  }

  if (body.breakDurationMinutes !== undefined) {
    update.breakDurationMinutes =
      Number(body.breakDurationMinutes);

    update.breakMinutes =
      Number(body.breakDurationMinutes);
  }

  // ----------------------------------------------------------
  // GRACE
  // ----------------------------------------------------------

  if (body.graceMinutes !== undefined) {
    update.graceMinutes =
      Number(body.graceMinutes);

    update.gracePeriodMinutes =
      Number(body.graceMinutes);
  }

  if (body.gracePeriodMinutes !== undefined) {
    update.gracePeriodMinutes =
      Number(body.gracePeriodMinutes);

    update.graceMinutes =
      Number(body.gracePeriodMinutes);
  }

  // ----------------------------------------------------------
  // OVERTIME
  // ----------------------------------------------------------

  if (body.overtimeAfterMinutes !== undefined) {
    update.overtimeAfterMinutes =
      Number(body.overtimeAfterMinutes);
  } else if (update.requiredMinutes !== undefined) {
    update.overtimeAfterMinutes =
      Number(update.requiredMinutes);
  }

  if (body.minimumOvertimeMinutes !== undefined) {
    update.minimumOvertimeMinutes =
      Number(body.minimumOvertimeMinutes);

    update.minOvertimeMinutes =
      Number(body.minimumOvertimeMinutes);
  }

  if (body.minOvertimeMinutes !== undefined) {
    update.minOvertimeMinutes =
      Number(body.minOvertimeMinutes);

    update.minimumOvertimeMinutes =
      Number(body.minOvertimeMinutes);
  }

  if (body.maximumOvertimeMinutes !== undefined) {
    update.maximumOvertimeMinutes =
      Number(body.maximumOvertimeMinutes);
  }

  if (body.overtimeRoundingMinutes !== undefined) {
    const rounding =
      normalizeRoundingMinutes(
        body.overtimeRoundingMinutes
      );

    update.overtimeRoundingMinutes =
      rounding;

    update.overtimeRounding =
      normalizeRoundingLabel(rounding);
  }

  if (body.overtimeRounding !== undefined) {
    const rounding =
      normalizeRoundingMinutes(
        body.overtimeRounding
      );

    update.overtimeRounding =
      normalizeRoundingLabel(rounding);

    update.overtimeRoundingMinutes =
      rounding;
  }

  // ----------------------------------------------------------
  // ACTIVE STATUS
  // ----------------------------------------------------------

  if (body.active !== undefined) {
    update.active =
      Boolean(body.active);

    update.isActive =
      Boolean(body.active);
  }

  if (body.isActive !== undefined) {
    update.isActive =
      Boolean(body.isActive);

    update.active =
      Boolean(body.isActive);
  }

  // ----------------------------------------------------------
  // WORKING DAYS
  // ----------------------------------------------------------

  if (Array.isArray(body.workingDays)) {
    update.workingDays =
      body.workingDays.map(
        (day) => Number(day)
      );
  }

  // ----------------------------------------------------------
  // OTHER NUMERIC FIELDS
  // ----------------------------------------------------------

  if (
    body.earlyDepartureMinutes !==
    undefined
  ) {
    update.earlyDepartureMinutes =
      Number(
        body.earlyDepartureMinutes
      );
  }

  return update;
}

// ============================================================
// VALIDATION
// ============================================================

function validate(body = {}) {

  if (
    body.startTime !== undefined &&
    !isValidTime(body.startTime)
  ) {
    return 'startTime must be HH:mm';
  }

  if (
    body.endTime !== undefined &&
    !isValidTime(body.endTime)
  ) {
    return 'endTime must be HH:mm';
  }

  if (
    body.overtimeStartTime !== undefined &&
    body.overtimeStartTime !== '' &&
    !isValidTime(body.overtimeStartTime)
  ) {
    return 'overtimeStartTime must be HH:mm';
  }

  if (body.requiredMinutes !== undefined) {

    const required =
      Number(body.requiredMinutes);

    if (
      !Number.isFinite(required) ||
      required <= 0
    ) {
      return (
        'requiredMinutes must be greater than 0'
      );
    }
  }

  if (body.attendanceUnits !== undefined) {

    const units =
      Number(body.attendanceUnits);

    if (
      !Number.isFinite(units) ||
      units < 0 ||
      units > 1
    ) {
      return (
        'attendanceUnits must be between 0 and 1'
      );
    }
  }

  if (
    body.workingDays !== undefined &&
    (
      !Array.isArray(body.workingDays) ||
      body.workingDays.some(
        (day) => {
          const value =
            Number(day);

          return (
            !Number.isInteger(value) ||
            value < 1 ||
            value > 7
          );
        }
      )
    )
  ) {
    return (
      'workingDays must contain numbers 1-7'
    );
  }

  return null;
}

// ============================================================
// NORMALIZE SHIFT FOR API RESPONSE
// ============================================================

function normalizeShiftForResponse(
  shift,
  assignmentCount = 0
) {

  const item =
    shift &&
    typeof shift.toObject === 'function'
      ? shift.toObject()
      : {
          ...shift,
        };

  const requiredMinutes =
    Number(item.requiredMinutes) > 0
      ? Number(item.requiredMinutes)
      : hoursTextToMinutes(
          item.requiredHours,
          480
        );

  const breakMinutes =
    Number(
      item.breakMinutes ??
      item.breakDurationMinutes ??
      0
    );

  const graceMinutes =
    Number(
      item.graceMinutes ??
      item.gracePeriodMinutes ??
      0
    );

  const minOvertime =
    Number(
      item.minimumOvertimeMinutes ??
      item.minOvertimeMinutes ??
      0
    );

  const roundingMinutes =
    Number(
      item.overtimeRoundingMinutes ??
      normalizeRoundingMinutes(
        item.overtimeRounding
      ) ??
      1
    );

  return {
    ...item,

    requiredMinutes,

    requiredHours:
      item.requiredHours ||
      minutesToHoursText(
        requiredMinutes
      ),

    attendanceUnits:
      item.attendanceUnits !==
      undefined
        ? Number(
            item.attendanceUnits
          )
        : 1,

    breakMinutes,

    breakDurationMinutes:
      Number(
        item.breakDurationMinutes ??
        breakMinutes
      ),

    graceMinutes,

    gracePeriodMinutes:
      Number(
        item.gracePeriodMinutes ??
        graceMinutes
      ),

    minimumOvertimeMinutes:
      minOvertime,

    minOvertimeMinutes:
      Number(
        item.minOvertimeMinutes ??
        minOvertime
      ),

    overtimeRoundingMinutes:
      roundingMinutes,

    overtimeRounding:
      item.overtimeRounding ||
      normalizeRoundingLabel(
        roundingMinutes
      ),

    active:
      item.active !== undefined
        ? item.active
        : (
          item.isActive !==
          undefined
            ? item.isActive
            : true
        ),

    isActive:
      item.isActive !== undefined
        ? item.isActive
        : (
          item.active !==
          undefined
            ? item.active
            : true
        ),

    assignedEmployeesCount:
      assignmentCount,
  };
}

// ============================================================
// GET /api/shifts
// ============================================================

async function list(req, res) {

  printRequest(req);

  try {

    const shifts =
      await Shift
        .find()
        .sort({
          name: 1,
        })
        .lean();

    const counts =
      await ShiftAssignment.aggregate([
        {
          $match: {
            active: {
              $ne: false,
            },
          },
        },
        {
          $group: {
            _id: '$shiftId',

            employees: {
              $addToSet:
                '$employeeId',
            },
          },
        },
      ]);

    const countMap =
      new Map(
        counts.map(
          (row) => [
            String(row._id),

            Array.isArray(
              row.employees
            )
              ? row.employees.length
              : 0,
          ]
        )
      );

    const normalizedShifts =
      shifts.map(
        (shift) =>
          normalizeShiftForResponse(
            shift,
            countMap.get(
              String(
                shift._id
              )
            ) || 0
          )
      );

    const response = {
      success: true,
      shifts:
        normalizedShifts,
    };

    printSection(
      'RESPONSE - GET /api/shifts',
      response
    );

    return res.json(
      response
    );

  } catch (e) {

    console.error(
      '[SHIFT API] LIST ERROR'
    );

    console.error(e);

    const response = {
      success: false,

      message:
        e.message ||
        'Failed to load shifts',
    };

    return res
      .status(500)
      .json(response);
  }
}

// ============================================================
// POST /api/shifts
// ============================================================

async function create(req, res) {

  printRequest(req);

  console.log(
    '[SHIFT API] CREATE request received'
  );

  const payload =
    normalizeShiftBody(
      req.body
    );

  const error =
    validate(payload);

  if (error) {

    return res
      .status(400)
      .json({
        success: false,
        message: error,
      });
  }

  try {

    const shift =
      await Shift.create(
        payload
      );

    console.log(
      '[SHIFT API] Shift created successfully'
    );

    console.log(
      '[SHIFT API] MongoDB ID:',
      shift._id
    );

    const response = {
      success: true,

      shift:
        normalizeShiftForResponse(
          shift,
          0
        ),
    };

    return res
      .status(201)
      .json(response);

  } catch (e) {

    console.error(
      '[SHIFT API] CREATE ERROR'
    );

    console.error(e);

    return res
      .status(400)
      .json({
        success: false,

        message:
          e.message ||
          'Failed to create shift',
      });
  }
}

// ============================================================
// PUT /api/shifts/:id
// ============================================================

async function update(req, res) {

  printRequest(req);

  console.log(
    '[SHIFT API] UPDATE request received'
  );

  console.log(
    '[SHIFT API] Shift ID:',
    req.params.id
  );

  const payload =
    normalizeShiftBody(
      req.body
    );

  const error =
    validate(payload);

  if (error) {

    return res
      .status(400)
      .json({
        success: false,
        message: error,
      });
  }

  try {

    const shift =
      await Shift.findByIdAndUpdate(
        req.params.id,

        {
          $set:
            payload,
        },

        {
          new: true,
          runValidators: true,
        }
      );

    if (!shift) {

      return res
        .status(404)
        .json({
          success: false,

          message:
            'Shift not found',
        });
    }

    const assignmentCount =
      await ShiftAssignment
        .distinct(
          'employeeId',
          {
            shiftId:
              shift._id,

            active: {
              $ne: false,
            },
          }
        );

    const response = {
      success: true,

      shift:
        normalizeShiftForResponse(
          shift,
          assignmentCount.length
        ),
    };

    console.log(
      '[SHIFT API] Shift updated successfully'
    );

    return res.json(
      response
    );

  } catch (e) {

    console.error(
      '[SHIFT API] UPDATE ERROR'
    );

    console.error(e);

    return res
      .status(400)
      .json({
        success: false,

        message:
          e.message ||
          'Failed to update shift',
      });
  }
}

// ============================================================
// DELETE /api/shifts/:id
// ============================================================

async function remove(req, res) {

  printRequest(req);

  console.log(
    '[SHIFT API] DELETE request received'
  );

  console.log(
    '[SHIFT API] Shift ID:',
    req.params.id
  );

  try {

    // --------------------------------------------------------
    // PREVENT DELETING SHIFT WITH ACTIVE ASSIGNMENTS
    // --------------------------------------------------------

    const assignmentCount =
      await ShiftAssignment.countDocuments({
        shiftId:
          req.params.id,

        active: {
          $ne: false,
        },
      });

    if (
      assignmentCount > 0
    ) {

      return res
        .status(409)
        .json({
          success: false,

          message:
            'This shift has active employee assignments. Remove those assignments before deleting the shift.',
        });
    }

    const result =
      await Shift.findByIdAndDelete(
        req.params.id
      );

    if (!result) {

      return res
        .status(404)
        .json({
          success: false,

          deleted: false,

          message:
            'Shift not found',
        });
    }

    console.log(
      '[SHIFT API] Shift deleted successfully'
    );

    return res.json({
      success: true,
      deleted: true,
    });

  } catch (e) {

    console.error(
      '[SHIFT API] DELETE ERROR'
    );

    console.error(e);

    return res
      .status(500)
      .json({
        success: false,

        message:
          e.message ||
          'Failed to delete shift',
      });
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
};