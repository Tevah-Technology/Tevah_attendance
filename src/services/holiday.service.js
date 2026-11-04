const { Holiday } = require('../models');

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(value) {
  const d = startOfDay(value);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function listActiveHolidays(fromDate, toDate) {
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  to.setHours(23, 59, 59, 999);

  const rows = await Holiday.find({
    active: true,
    $or: [
      { date: { $gte: from, $lte: to } },
      { recurringAnnual: true }
    ]
  }).sort({ date: 1 }).lean();

  return rows.filter(h => {
    if (!h.recurringAnnual) return true;
    const key = dateKey(h.date);
    const cursor = new Date(from);
    while (cursor <= to) {
      if (dateKey(cursor) === key) return true;
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  });
}

async function holidayDateKeys(fromDate, toDate) {
  const holidays = await listActiveHolidays(fromDate, toDate);
  const exact = new Set();
  const recurring = new Set();
  for (const h of holidays) {
    if (h.recurringAnnual) recurring.add(dateKey(h.date));
    else exact.add(startOfDay(h.date).toISOString().slice(0, 10));
  }
  return { exact, recurring, holidays };
}

async function isHolidayDate(value) {
  const d = startOfDay(value);
  const { exact, recurring } = await holidayDateKeys(d, d);
  return exact.has(d.toISOString().slice(0, 10)) || recurring.has(dateKey(d));
}

module.exports = { startOfDay, dateKey, listActiveHolidays, holidayDateKeys, isHolidayDate };
