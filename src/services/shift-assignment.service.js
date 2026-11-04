const { Shift, ShiftAssignment, Rule } = require('../models');
const { startOfDay, endOfDay } = require('../utils/time');

function projectDayNumber(date) {
  return new Date(date).getDay() || 7; // Monday=1 ... Sunday=7
}

async function getDefaultShift(employee) {
  if (employee?.shiftId) {
    const employeeShift = await Shift.findById(employee.shiftId).lean();
    if (employeeShift?.active !== false) return employeeShift;
  }

  const rule = await Rule.findOne().lean();
  if (rule?.defaultShiftId) {
    const defaultShift = await Shift.findById(rule.defaultShiftId).lean();
    if (defaultShift?.active !== false) return defaultShift;
  }

  return null;
}

async function getAssignmentForDate(employeeId, date = new Date()) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const weekday = projectDayNumber(date);

  // Highest priority: exact single-date assignment.
  let assignment = await ShiftAssignment.findOne({
    employeeId: String(employeeId),
    active: true,
    assignmentType: 'single_date',
    date: { $gte: dayStart, $lt: dayEnd }
  }).sort({ updatedAt: -1, createdAt: -1 }).lean();

  if (assignment) return assignment;

  // Second priority: a date range covering this day.
  assignment = await ShiftAssignment.findOne({
    employeeId: String(employeeId),
    active: true,
    assignmentType: 'date_range',
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart }
  }).sort({ updatedAt: -1, createdAt: -1 }).lean();

  if (assignment) return assignment;

  // Third priority: recurring assignment. startDate/endDate are optional bounds.
  assignment = await ShiftAssignment.findOne({
    employeeId: String(employeeId),
    active: true,
    assignmentType: 'recurring',
    recurringDays: weekday,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: dayEnd } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: dayStart } }] }
    ]
  }).sort({ updatedAt: -1, createdAt: -1 }).lean();

  return assignment || null;
}

async function getEffectiveShift(employee, date = new Date()) {
  const assignment = await getAssignmentForDate(employee?.employeeId, date);

  if (assignment) {
    const shift = await Shift.findById(assignment.shiftId).lean();
    if (shift?.active !== false) {
      return {
        shift,
        assignment,
        source: assignment.assignmentType
      };
    }
  }

  const shift = await getDefaultShift(employee);
  return {
    shift,
    assignment: null,
    source: employee?.shiftId ? 'employee_default' : 'company_default'
  };
}


// Read-only report optimization: preload the employee's assignments and shifts
// once, instead of making up to four MongoDB queries for every report day.
// The normal getEffectiveShift API above remains unchanged for live attendance.
async function createReportShiftResolver(employee, attendanceRule = {}) {
  const employeeId = String(employee?.employeeId || '');
  const assignments = await ShiftAssignment.find({
    employeeId,
    active: true
  }).sort({ updatedAt: -1, createdAt: -1 }).lean();

  const shiftIds = new Set();
  for (const assignment of assignments) {
    if (assignment.shiftId) shiftIds.add(String(assignment.shiftId));
  }
  if (employee?.shiftId) shiftIds.add(String(employee.shiftId));
  if (attendanceRule?.defaultShiftId) {
    shiftIds.add(String(attendanceRule.defaultShiftId));
  }

  const shifts = shiftIds.size
    ? await Shift.find({ _id: { $in: [...shiftIds] } }).lean()
    : [];
  const shiftMap = new Map(shifts.map(shift => [String(shift._id), shift]));

  function findAssignmentForDate(date) {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const weekday = projectDayNumber(date);
    // Assignments are already sorted by updatedAt and createdAt descending.
    // Match the existing MongoDB precedence: single date > range > recurring.
    const single = assignments.find(a =>
      a.assignmentType === 'single_date' &&
      a.date != null && new Date(a.date) >= dayStart && new Date(a.date) < dayEnd
    );
    if (single) return single;

    const range = assignments.find(a =>
      a.assignmentType === 'date_range' &&
      a.startDate != null && a.endDate != null &&
      new Date(a.startDate) <= dayEnd && new Date(a.endDate) >= dayStart
    );
    if (range) return range;

    return assignments.find(a =>
      a.assignmentType === 'recurring' &&
      Array.isArray(a.recurringDays) && a.recurringDays.includes(weekday) &&
      (a.startDate == null || new Date(a.startDate) <= dayEnd) &&
      (a.endDate == null || new Date(a.endDate) >= dayStart)
    ) || null;
  }

  function getEffectiveShiftForDate(date) {
    const assignment = findAssignmentForDate(date);
    if (assignment) {
      const shift = shiftMap.get(String(assignment.shiftId));
      // Preserve the existing getEffectiveShift behavior for missing shifts.
      if (shift?.active !== false) {
        return { shift, assignment, source: assignment.assignmentType };
      }
    }

    let shift = employee?.shiftId
      ? shiftMap.get(String(employee.shiftId))
      : null;
    if (shift?.active === false) shift = null;
    if (!shift && attendanceRule?.defaultShiftId) {
      shift = shiftMap.get(String(attendanceRule.defaultShiftId));
      if (shift?.active === false) shift = null;
    }
    return {
      shift: shift || null,
      assignment: null,
      source: employee?.shiftId ? 'employee_default' : 'company_default'
    };
  }

  return getEffectiveShiftForDate;
}

module.exports = {
  getDefaultShift,
  getAssignmentForDate,
  getEffectiveShift,
  projectDayNumber,
  createReportShiftResolver
};
