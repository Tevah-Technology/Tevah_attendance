const { LeaveType } = require('../models');

async function list(req, res) {
  try { res.json({ success: true, leaveTypes: await LeaveType.find().sort({ name: 1 }).lean() }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
}
async function create(req, res) {
  try { res.status(201).json({ success: true, leaveType: await LeaveType.create(req.body) }); }
  catch (e) { res.status(400).json({ success: false, message: e.message }); }
}
async function update(req, res) {
  try {
    const leaveType = await LeaveType.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!leaveType) return res.status(404).json({ success: false, message: 'Leave type not found' });
    res.json({ success: true, leaveType });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
}
async function remove(req, res) {
  try {
    const result = await LeaveType.findByIdAndDelete(req.params.id);
    res.json({ success: true, deleted: Boolean(result) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}
module.exports = { list, create, update, remove };
