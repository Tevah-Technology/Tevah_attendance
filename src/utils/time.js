function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value) {
  const d = startOfDay(value);
  d.setDate(d.getDate() + 1);
  return d;
}

function minutesBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
}

function formatMinutes(value) {
  const minutes = Math.max(0, Number(value) || 0);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function atTime(date, time) {
  const d = startOfDay(date);
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  d.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return d;
}

function dateKey(value) {
  return startOfDay(value).toISOString();
}

function iterateDays(from, to) {
  const days = [];
  const current = startOfDay(from);
  const end = startOfDay(to);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

module.exports = { startOfDay, endOfDay, minutesBetween, formatMinutes, atTime, dateKey, iterateDays };
