const { Holiday } = require('../models');

function normalizeDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('A valid holiday date is required');
  d.setHours(0, 0, 0, 0);
  return d;
}

async function list(req, res) {
  try {
    const filter = {};
    if (req.query.active !== undefined) filter.active = String(req.query.active) !== 'false';
    if (req.query.year) {
      const year = Number(req.query.year);
      if (!Number.isInteger(year)) return res.status(400).json({ success: false, message: 'year must be a number' });
      filter.$or = [
        { date: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) } },
        { recurringAnnual: true }
      ];
    }
    const holidays = await Holiday.find(filter).sort({ date: 1, name: 1 }).lean();
    res.json({ success: true, count: holidays.length, holidays });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function create(req, res) {
  try {
    const holiday = await Holiday.create({
      ...req.body,
      date: normalizeDate(req.body.date),
      name: String(req.body.name || '').trim()
    });
    res.status(201).json({ success: true, holiday });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function update(req, res) {
  try {
    const patch = { ...req.body };
    if (patch.date !== undefined) patch.date = normalizeDate(patch.date);
    if (patch.name !== undefined) patch.name = String(patch.name).trim();
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true }).lean();
    if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
    res.json({ success: true, holiday });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function remove(req, res) {
  try {
    const deleted = await Holiday.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Holiday not found' });
    res.json({ success: true, deleted: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { list, create, update, remove };
