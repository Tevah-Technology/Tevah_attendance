const { minutesBetween } = require('./time');

function stateToPunchType(state, existingCount = 0) {
  const n = Number(state);
  if (n === 0 || n === 3 || n === 4) return 'IN';
  if (n === 1 || n === 2 || n === 5) return 'OUT';
  return existingCount % 2 === 0 ? 'IN' : 'OUT';
}

function verificationLabel(mode) {
  const n = Number(mode);
  const labels = {
    0: 'Password',
    1: 'Fingerprint',
    2: 'Card',
    3: 'Password',
    4: 'Card',
    5: 'Fingerprint + Card',
    6: 'Fingerprint + Password',
    7: 'Card + Password',
    8: 'Card + Fingerprint + Password',
    9: 'Other',
    15: 'Face'
  };
  return Number.isFinite(n) && labels[n] ? labels[n] : '';
}

function attendanceStateLabel(state) {
  const n = Number(state);
  return ({ 0: 'Check In', 1: 'Check Out', 2: 'Break Out', 3: 'Break In', 4: 'Overtime In', 5: 'Overtime Out' })[n] || '';
}

// Build real IN -> OUT working intervals. This intentionally does not
// blindly pair every two rows, because a device/web client can occasionally
// send duplicate IN punches. An unmatched IN remains an open session.
function buildIntervals(punches) {
  const sorted = [...punches]
    .filter((p) => p && p.timestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const intervals = [];
  let openIn = null;

  for (const punch of sorted) {
    const type = String(punch.punchType || 'UNKNOWN').toUpperCase();

    if (type === 'IN') {
      if (!openIn) openIn = punch;
      continue;
    }

    if (type === 'OUT' && openIn) {
      intervals.push({
        in: openIn.timestamp,
        out: punch.timestamp,
        minutes: minutesBetween(openIn.timestamp, punch.timestamp),
        inPunchId: openIn._id || openIn.id || null,
        outPunchId: punch._id || punch.id || null,
        outSource: punch.source || null,
        autoCheckout: Boolean(punch.isAutoCheckout || punch.source === 'AUTO')
      });
      openIn = null;
    }
  }

  if (openIn) {
    intervals.push({
      in: openIn.timestamp,
      out: null,
      minutes: minutesBetween(openIn.timestamp, new Date()),
      inPunchId: openIn._id || openIn.id || null,
      outPunchId: null,
      outSource: null,
      autoCheckout: false,
      open: true
    });
  }

  return intervals;
}

module.exports = { stateToPunchType, verificationLabel, attendanceStateLabel, buildIntervals };
