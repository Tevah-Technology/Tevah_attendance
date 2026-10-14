const crypto = require('crypto');
const { config, createDevice } = require('../config/zkteco');
const { Attendance, Employee, Shift, Rule } = require('../models');
const { stateToPunchType, verificationLabel, attendanceStateLabel } = require('../utils/punches');
const { startOfDay, endOfDay } = require('../utils/time');
const { getAttendancePolicy, classifyDay } = require('../utils/attendance-policy');

let broadcaster = null;

function setBroadcaster(fn) { broadcaster = fn; }

function makeSessionId() {
  return crypto.randomUUID();
}

function normalizeLog(log) {
  const timestamp = new Date(log.recordTime ?? log.attTime ?? log.timestamp);
  return {
    userId: String(log.deviceUserId ?? log.userId ?? log.userid ?? log.userSn ?? '').trim(),
    userSn: log.userSn == null ? null : Number(log.userSn),
    timestamp,
    state: log.attState ?? log.inOutStatus ?? log.state ?? log.status ?? null,
    attendanceState: log.attState ?? log.inOutStatus ?? log.state ?? null,
    verificationMode: log.verifyMode ?? log.verificationMode ?? log.verify ?? null,
    verificationLabel: verificationLabel(log.verifyMode ?? log.verificationMode ?? log.verify),
    workCode: log.workCode ?? null,
    rawRecordHex: log.rawRecordHex ?? null,
    rawData: log
  };
}

async function getEmployeeByDevice(userId, userSn) {
  const value = String(userId ?? '').trim();
  const employeeQuery = [];

  if (value) {
    employeeQuery.push({ deviceUserId: value });
    employeeQuery.push({ employeeId: value });
  }

  // Some F28 firmware stores the numeric terminal UID/PIN in the
  // attendance record even though the Users table exposes a different
  // employee ID (for example: attendance value "4" -> UID 4 -> EMP003).
  if (/^\d+$/.test(value)) {
    employeeQuery.push({ deviceUid: Number(value) });
  }

  if (!employeeQuery.length) return null;
  return Employee.findOne({ $or: employeeQuery }).lean();
}

async function getEmployeeShift(employee) {
  if (employee?.shiftId) {
    const shift = await Shift.findById(employee.shiftId).lean();
    if (shift) return shift;
  }
  const rule = await Rule.findOne().lean();
  if (rule?.defaultShiftId) return Shift.findById(rule.defaultShiftId).lean();
  return null;
}

async function getRule() {
  let rule = await Rule.findOne().lean();
  if (!rule) rule = (await Rule.create({})).toObject();
  return rule;
}

function timeOnDate(date, hhmm) {
  const d = startOfDay(date);
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

async function getScheduledCheckoutAt(timestamp) {
  const rule = await getRule();
  if (!rule.autoCheckoutEnabled) return null;

  const punchAt = new Date(timestamp);
  const midday = timeOnDate(punchAt, rule.middayAutoCheckoutTime || '13:00');
  const dayEnd = timeOnDate(punchAt, rule.dayEndAutoCheckoutTime || '17:30');

  // Split-day mode closes the morning session at 13:00. The employee then
  // checks in again for the afternoon session (normally from 13:30).
  if (rule.halfDayEnabled && punchAt < midday) return midday;
  if (punchAt < dayEnd) return dayEnd;
  return null;
}

async function getRequiredMinutes(employee) {
  const rule = await getRule();

  // Legacy-compatible flag name, but the value now comes from /api/rules.
  // true  -> use Rules.fullDayMinutes
  // false -> use the employee/default shift requiredMinutes
  if (rule.attendanceUseEnvHours === true) {
    const configured = Number(rule.fullDayMinutes ?? 480);
    return Math.max(1, Number.isFinite(configured) ? configured : 480);
  }

  const shift = await getEmployeeShift(employee);
  const required = Number(shift?.requiredMinutes ?? rule.fullDayMinutes ?? 480);
  return Math.max(1, Number.isFinite(required) ? required : 480);
}

async function getLatestEmployeePunch(employeeId, before = null) {
  const filter = { employeeId: String(employeeId) };
  if (before) filter.timestamp = { $lt: before };
  return Attendance.findOne(filter).sort({ timestamp: -1, _id: -1 }).lean();
}

function isActivePunch(punch) {
  return punch && punch.punchType === 'IN';
}

async function emit(record) {
  if (broadcaster) {
    try { broadcaster(record.toObject ? record.toObject() : record); } catch (error) {
      console.error('Attendance broadcaster error:', error.message);
    }
  }
}

async function createPunch({
  employee,
  punchType,
  timestamp = new Date(),
  source = 'WEB',
  state = null,
  rawData = null,
  userId = null,
  userSn = null,
  sessionId = '',
  isAutoCheckout = false,
  force = false,
  attendanceState = null,
  verificationMode = null,
  verificationLabelText = '',
  workCode = null,
  rawRecordHex = null,
  explicitPunchType = null,
  allowDeviceSequence = false
}) {
  if (!employee?.employeeId) throw new Error('Employee profile is required');

  const employeeId = String(employee.employeeId);
  const resolvedUserId = String(userId ?? employee.deviceUserId ?? employeeId);
  const previous = await getLatestEmployeePunch(employeeId);
  const active = isActivePunch(previous);

  // Web/manual actions enforce an open-session rule. Device imports do not:
  // every F28 punch is a real terminal event and must be persisted, even when
  // the terminal produced consecutive IN/OUT-like events or when historical
  // records are being replayed after the backend was offline.
  if (!allowDeviceSequence) {
    if (!force && punchType === 'IN' && active) {
      return { alreadyCheckedIn: true, record: previous };
    }

    if (!force && punchType === 'OUT' && !active) {
      return { notCheckedIn: true, record: previous || null };
    }
  }

  punchType = explicitPunchType || punchType;

  let resolvedSessionId = sessionId;
  let autoCheckoutAt = null;

  if (punchType === 'IN') {
    // Every IN starts a fresh session. Auto-checkout is tied to the configured
    // workday boundary (13:00 or 17:30), not to a duration from first check-in.
    resolvedSessionId = resolvedSessionId || makeSessionId();
    autoCheckoutAt = await getScheduledCheckoutAt(timestamp);
  } else {
    resolvedSessionId = resolvedSessionId || previous?.sessionId || makeSessionId();
  }

  const recordData = {
    deviceIp: source === 'DEVICE' ? config.ip : source === 'AUTO' ? 'SYSTEM' : 'WEB',
    userId: resolvedUserId,
    userSn: userSn == null ? (employee.deviceUid ?? null) : userSn,
    employeeId,
    employeeName: employee.name || '',
    timestamp,
    punchType,
    state,
    attendanceState: attendanceState == null ? state : attendanceState,
    verificationMode,
    verificationLabel: verificationLabelText || verificationLabel(verificationMode),
    workCode,
    rawRecordHex,
    rawData,
    source,
    autoCheckoutAt,
    sessionId: resolvedSessionId,
    isAutoCheckout: Boolean(isAutoCheckout)
  };

  try {
    const record = await Attendance.create(recordData);
    await emit(record);
    return { inserted: true, record: record.toObject() };
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await Attendance.findOne({
        deviceIp: recordData.deviceIp,
        userId: recordData.userId,
        timestamp: recordData.timestamp
      }).lean();
      return { duplicate: true, record: duplicate };
    }
    throw error;
  }
}

async function saveAttendanceLog(rawLog, options = {}) {
  const normalized = normalizeLog(rawLog);
  if (!normalized.userId || Number.isNaN(normalized.timestamp.getTime())) return { skipped: 1 };

  const employee = await getEmployeeByDevice(normalized.userId, normalized.userSn);
  const employeeId = employee?.employeeId || normalized.userId;

  // Merge F28 and web/AUTO events into one chronological state machine.
  // Explicit F28 states win. If the terminal does not provide a reliable
  // state, infer IN/OUT from the latest event before this timestamp, including
  // web and automatic punches.
  const hasExplicitState = normalized.state !== null && normalized.state !== undefined && normalized.state !== '' && Number.isFinite(Number(normalized.state));
  let punchType = options.punchType || null;
  if (!punchType && hasExplicitState) punchType = stateToPunchType(normalized.state, 0);
  if (!punchType) {
    const previousAtTime = await getLatestEmployeePunch(employeeId, normalized.timestamp);
    punchType = previousAtTime?.punchType === 'IN' ? 'OUT' : 'IN';
  }

  if (!employee) {
    console.warn(`F28 punch received for unlinked user ${normalized.userId}; saving it as employee ${employeeId}`);
  }

  return createPunch({
    employee: employee || { employeeId, name: '' },
    punchType,
    explicitPunchType: punchType,
    allowDeviceSequence: true,
    timestamp: normalized.timestamp,
    source: 'DEVICE',
    state: normalized.state,
    attendanceState: normalized.attendanceState,
    verificationMode: normalized.verificationMode,
    verificationLabelText: normalized.verificationLabel,
    workCode: normalized.workCode,
    rawRecordHex: normalized.rawRecordHex,
    rawData: normalized.rawData,
    userId: normalized.userId,
    userSn: normalized.userSn
  });
}

async function webCheckIn(employeeId, metadata = {}) {
  const employee = await Employee.findOne({ employeeId: String(employeeId), active: true }).lean();
  if (!employee) throw new Error('Active employee profile not found');

  return createPunch({
    employee,
    punchType: 'IN',
    timestamp: new Date(),
    source: 'WEB',
    rawData: { source: 'WEB', ...(metadata || {}) },
    userId: employee.deviceUserId || employee.employeeId,
    userSn: employee.deviceUid
  });
}

async function webCheckOut(employeeId, metadata = {}) {
  const employee = await Employee.findOne({ employeeId: String(employeeId), active: true }).lean();
  if (!employee) throw new Error('Active employee profile not found');

  return createPunch({
    employee,
    punchType: 'OUT',
    timestamp: new Date(),
    source: 'WEB',
    rawData: { source: 'WEB', ...(metadata || {}) },
    userId: employee.deviceUserId || employee.employeeId,
    userSn: employee.deviceUid
  });
}

async function getTodayStatus(employeeId) {
  const employee = await Employee.findOne({ employeeId: String(employeeId) }).lean();
  if (!employee) throw new Error('Employee profile not found');

  const from = startOfDay(new Date());
  const to = endOfDay(new Date());
  const punches = await Attendance.find({ employeeId: employee.employeeId, timestamp: { $gte: from, $lt: to } })
    .sort({ timestamp: 1, _id: 1 }).lean();
  const latest = punches[punches.length - 1] || null;
  const active = isActivePunch(latest);
  const firstIn = punches.find(p => p.punchType === 'IN') || null;
  const lastOut = [...punches].reverse().find(p => p.punchType === 'OUT') || null;

  let workingMinutes = 0;
  let openIn = null;
  const intervals = [];
  for (const punch of punches) {
    if (punch.punchType === 'IN' && !openIn) openIn = punch;
    if (punch.punchType === 'OUT' && openIn) {
      const minutes = Math.max(0, Math.round((new Date(punch.timestamp) - new Date(openIn.timestamp)) / 60000));
      workingMinutes += minutes;
      intervals.push({
        in: openIn.timestamp,
        out: punch.timestamp,
        minutes,
        inSource: openIn.source || null,
        outSource: punch.source || null,
        halfDay: false,
        fullDay: false
      });
      openIn = null;
    }
  }
  if (openIn) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(openIn.timestamp)) / 60000));
    workingMinutes += minutes;
    intervals.push({
      in: openIn.timestamp,
      out: null,
      minutes,
      inSource: openIn.source || null,
      outSource: null,
      halfDay: false,
      fullDay: false,
      open: true
    });
  }

  const attendanceRule = await getRule();
  const policy = getAttendancePolicy(attendanceRule);
  const completedIntervals = intervals.filter(i => !i.open);
  const intervalClassifications = completedIntervals.map(i => classifyDay({ workedMinutes: i.minutes, completedIntervals: 1, hasOpenInterval: false }, policy));
  let halfDayCount = 0;
  let fullDayCount = 0;
  completedIntervals.forEach((interval, index) => {
    const c = intervalClassifications[index];
    interval.halfDay = c.halfDay;
    interval.fullDay = c.fullDay;
    if (c.halfDay) halfDayCount++;
    if (c.fullDay) fullDayCount++;
  });

  const dayClassification = classifyDay({
    workedMinutes: workingMinutes,
    completedIntervals: completedIntervals.length,
    hasOpenInterval: Boolean(openIn)
  }, policy);

  // Two qualifying half-day sessions on the same day are a full attendance
  // day. A split day such as 09:00-13:00 + 14:00-18:00 therefore reports FULL_DAY.
  if (policy.halfDayEnabled && policy.twoHalfDaysEqualOneDay && halfDayCount >= 2 && dayClassification.status !== 'FULL_DAY') {
    dayClassification.status = 'FULL_DAY';
    dayClassification.label = 'Full Day';
    dayClassification.attendanceUnits = 1;
    dayClassification.halfDay = false;
    dayClassification.fullDay = true;
  }

  const requiredMinutes = await getRequiredMinutes(employee);
  const overtimeMinutes = Math.max(0, workingMinutes - requiredMinutes);

  // Reuse the report engine for today's final attendance credit and late-streak
  // penalty so the self-service status and reports cannot disagree.
  let reportRow = null;
  try {
    const { buildReport } = require('./report.service');
    reportRow = (await buildReport({ from: new Date(), to: new Date(), employeeId: employee.employeeId }))[0] || null;
  } catch (error) {
    console.error('Today attendance classification error:', error.message);
  }
  return {
    employeeId: employee.employeeId,
    employeeName: employee.name,
    checkedIn: active,
    status: active ? 'IN_OFFICE' : (punches.length ? 'CHECKED_OUT' : 'NOT_CHECKED_IN'),
    attendanceDayStatus: reportRow?.attendanceDayStatus || dayClassification.status,
    attendanceDayLabel: reportRow?.attendanceDayLabel || dayClassification.label,
    attendanceUnits: reportRow?.attendanceUnits ?? dayClassification.attendanceUnits,
    halfDay: reportRow?.halfDay ?? dayClassification.halfDay,
    fullDay: reportRow?.fullDay ?? dayClassification.fullDay,
    halfDayEligible: dayClassification.halfDayEligible,
    halfDaySessions: halfDayCount,
    fullDaySessions: fullDayCount,
    firstIn: firstIn?.timestamp || null,
    lastOut: lastOut?.timestamp || null,
    workingMinutes,
    requiredMinutes,
    overtimeMinutes,
    intervals,
    punches,
    activePunch: active ? latest : null,
    autoCheckoutAt: active ? (latest.autoCheckoutAt || null) : null,
    lateByRule: reportRow?.lateByRule || false,
    consecutiveLateCount: reportRow?.consecutiveLateCount || 0,
    latePenaltyApplied: reportRow?.latePenaltyApplied || false,
    attendancePolicy: policy,
    attendanceRule
  };
}
async function autoCheckoutOpenSessions(now = new Date()) {
  const rule = await getRule();
  if (!rule.autoCheckoutEnabled) return { checkedOut: 0, skipped: 0, candidates: 0, disabled: true };

  const candidates = await Attendance.find({
    punchType: 'IN',
    autoCheckoutAt: { $ne: null, $lte: now }
  }).sort({ employeeId: 1, timestamp: -1, _id: -1 }).lean();

  const latestByEmployee = new Map();
  for (const candidate of candidates) {
    if (!latestByEmployee.has(candidate.employeeId)) latestByEmployee.set(candidate.employeeId, candidate);
  }

  let checkedOut = 0;
  let skipped = 0;

  for (const [employeeId, openPunch] of latestByEmployee) {
    const latest = await getLatestEmployeePunch(employeeId);
    if (!latest || latest._id.toString() !== openPunch._id.toString() || latest.punchType !== 'IN') {
      skipped++;
      continue;
    }

    const employee = await Employee.findOne({ employeeId, active: true }).lean();
    if (!employee) {
      skipped++;
      continue;
    }

    const result = await createPunch({
      employee,
      punchType: 'OUT',
      timestamp: new Date(openPunch.autoCheckoutAt),
      source: 'AUTO',
      rawData: {
        source: 'AUTO_CHECKOUT',
        reason: 'Required working duration reached',
        closedFromAttendanceId: String(openPunch._id)
      },
      userId: employee.deviceUserId || employee.employeeId,
      userSn: employee.deviceUid,
      sessionId: openPunch.sessionId,
      isAutoCheckout: true,
      force: true
    });

    if (result.inserted) checkedOut++;
  }

  return { checkedOut, skipped, candidates: candidates.length };
}

async function syncAttendance() {
  const deviceService = require('./device.service');
  const logs = await deviceService.getAttendanceLogs();

  // Always process device history in chronological order. The complete device
  // history is used to determine IN/OUT when the F28 record does not contain a
  // reliable punch-state value. This avoids using MongoDB's latest state as a
  // gate, which previously caused valid historical punches to be discarded.
  const ordered = [...logs].sort((a, b) => {
    const ta = new Date(a.recordTime ?? a.attTime ?? a.timestamp).getTime();
    const tb = new Date(b.recordTime ?? b.attTime ?? b.timestamp).getTime();
    return ta - tb;
  });

  // saveAttendanceLog reconciles state against the combined DEVICE/WEB/AUTO history.
  let inserted = 0, duplicates = 0, skipped = 0;
  const errors = [];
  for (const log of ordered) {
    try {
      const result = await saveAttendanceLog(log);
      inserted += result.inserted ? 1 : 0;
      duplicates += result.duplicate ? 1 : 0;
      skipped += result.skipped ? 1 : 0;
    } catch (error) {
      errors.push({
        userId: String(log.deviceUserId ?? log.userId ?? ''),
        timestamp: log.recordTime ?? log.attTime ?? log.timestamp ?? null,
        message: error.message
      });
      console.error('F28 attendance import error:', error.message);
    }
  }

  let info = null;
  try { info = await deviceService.getInfo(); } catch (_) {}

  return {
    totalFromDevice: ordered.length,
    inserted,
    duplicates,
    skipped,
    failed: errors.length,
    errors,
    device: info,
    deviceIp: config.ip
  };
}

async function startRealtimeListener() {
  if (String(process.env.ZK_REALTIME).toLowerCase() !== 'true') return null;
  const device = createDevice();
  await device.createSocket();
  if (typeof device.getRealTimeLogs !== 'function') {
    try { await device.disconnect(); } catch (_) {}
    throw new Error('getRealTimeLogs is not available in this node-zklib build');
  }
  await device.getRealTimeLogs((log) => {
    saveAttendanceLog(log).catch((error) => console.error('Realtime attendance error:', error.message));
  });
  console.log('ZKTeco real-time attendance listener started');
  return device;
}

module.exports = {
  setBroadcaster,
  normalizeLog,
  saveAttendanceLog,
  syncAttendance,
  startRealtimeListener,
  webCheckIn,
  webCheckOut,
  getTodayStatus,
  autoCheckoutOpenSessions,
  getEmployeeShift,
  getRequiredMinutes,
  getRule,
  getScheduledCheckoutAt
};
