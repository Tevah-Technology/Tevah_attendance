const { Settings } = require('../models');

const DEFAULTS = {
  key: 'system',
  general: {}, company: {}, attendance: {}, notifications: {}, leave: {}, reports: {}, security: {}
};

const SECTION_PERMISSIONS = {
  general: 'settings.general',
  company: 'settings.company',
  attendance: 'settings.attendance',
  notifications: 'settings.notifications',
  leave: 'settings.leave',
  reports: 'settings.reports',
  security: 'settings.security'
};

const ALLOWED = Object.keys(SECTION_PERMISSIONS);

function can(req, section, action) {
  if (req.access?.roleCode === 'SUPER_ADMIN') return true;
  if (req.permissions?.includes(`settings.${action}`)) return true;
  return req.permissions?.includes(`${SECTION_PERMISSIONS[section]}.${action}`) || false;
}

function filterSettings(req, settings) {
  const output = { _id: settings._id, key: settings.key, updatedAt: settings.updatedAt, createdAt: settings.createdAt };
  for (const section of ALLOWED) if (can(req, section, 'view')) output[section] = settings[section];
  return output;
}

async function ensureSettings() {
  let settings = await Settings.findOne({ key: 'system' });
  if (!settings) settings = await Settings.create(DEFAULTS);
  return settings;
}

async function get(req, res) {
  try {
    const settings = await ensureSettings();
    res.json({ success: true, settings: filterSettings(req, settings.toObject()) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
}

async function update(req, res) {
  try {
    const update = {};
    for (const key of ALLOWED) {
      if (!req.body[key] || typeof req.body[key] !== 'object' || Array.isArray(req.body[key])) continue;
      if (!can(req, key, 'edit')) return res.status(403).json({ success: false, message: `Missing permission: settings.${key}.edit`, code: 'PERMISSION_FORBIDDEN' });
      for (const [field, value] of Object.entries(req.body[key])) update[`${key}.${field}`] = value;
    }
    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: 'No valid settings supplied' });
    const settings = await Settings.findOneAndUpdate({ key: 'system' }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }).lean();
    res.json({ success: true, message: 'Settings updated successfully', settings: filterSettings(req, settings) });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
}

async function getSection(req, res) {
  try {
    const section = String(req.params.section || '').toLowerCase();
    if (!ALLOWED.includes(section)) return res.status(404).json({ success: false, message: 'Unknown settings section' });
    if (!can(req, section, 'view')) return res.status(403).json({ success: false, message: `Missing permission: settings.${section}.view`, code: 'PERMISSION_FORBIDDEN' });
    const settings = await ensureSettings();
    res.json({ success: true, section, settings: settings[section] || {} });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
}

async function updateSection(req, res) {
  try {
    const section = String(req.params.section || '').toLowerCase();
    if (!ALLOWED.includes(section)) return res.status(404).json({ success: false, message: 'Unknown settings section' });
    if (!can(req, section, 'edit')) return res.status(403).json({ success: false, message: `Missing permission: settings.${section}.edit`, code: 'PERMISSION_FORBIDDEN' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ success: false, message: 'Section settings must be an object' });
    const update = {};
    for (const [field, value] of Object.entries(req.body)) update[`${section}.${field}`] = value;
    const settings = await Settings.findOneAndUpdate({ key: 'system' }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }).lean();
    res.json({ success: true, message: `${section} settings updated successfully`, section, settings: settings[section] || {} });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
}

module.exports = { get, update, getSection, updateSection };
