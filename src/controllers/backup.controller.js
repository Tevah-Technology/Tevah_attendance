const { createBackup, listBackups, restoreBackup, backupDir } = require('../services/backup.service');
const { audit } = require('../middleware/auth');
const fs = require('fs');

async function list(req, res) { res.json({ success: true, backupDir, backups: listBackups() }); }
async function create(req, res) {
  try { const backup = await createBackup(); await audit(req, 'DATABASE_BACKUP_CREATED', { targetId: backup.filename }); res.status(201).json({ success: true, backup }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
}
async function download(req, res) {
  try {
    const filename = String(req.params.filename || '');
    if (!/^zkteco-[0-9T_-]+\.archive\.gz$/.test(filename)) return res.status(400).json({ success: false, message: 'Invalid backup file name' });
    const file = require('path').join(backupDir, require('path').basename(filename));
    if (!fs.existsSync(file)) return res.status(404).json({ success: false, message: 'Backup not found' });
    res.download(file, filename);
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}
async function restore(req, res) {
  try {
    if (req.body.confirm !== true) return res.status(400).json({ success: false, message: 'Set confirm=true to restore a backup. This replaces existing collections.' });
    const result = await restoreBackup(req.body.filename); await audit(req, 'DATABASE_RESTORED', { targetId: result.filename }); res.json({ success: true, result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
}
module.exports = { list, create, download, restore };
