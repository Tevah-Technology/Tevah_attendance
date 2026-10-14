const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'));
function ensureDir() { fs.mkdirSync(backupDir, { recursive: true }); }
function safeName(name) {
  const value = path.basename(String(name || ''));
  if (!/^zkteco-[0-9T_-]+\.archive\.gz$/.test(value)) throw new Error('Invalid backup file name');
  return value;
}

async function createBackup() {
  ensureDir();
  const filename = `zkteco-${new Date().toISOString().replace(/[:.]/g, '-')}.archive.gz`;
  const output = path.join(backupDir, filename);
  await execFileAsync(process.env.MONGODUMP_BIN || 'mongodump', ['--uri', process.env.MONGODB_URI, '--archive=' + output, '--gzip'], { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 4 });
  return { filename, path: output, size: fs.statSync(output).size, createdAt: new Date().toISOString() };
}
function listBackups() {
  ensureDir();
  return fs.readdirSync(backupDir).filter(x => x.endsWith('.archive.gz')).map(filename => { const stat = fs.statSync(path.join(backupDir, filename)); return { filename, size: stat.size, createdAt: stat.mtime.toISOString() }; }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
async function restoreBackup(filename) {
  const safe = safeName(filename);
  const file = path.join(backupDir, safe);
  if (!fs.existsSync(file)) throw new Error('Backup not found');
  await execFileAsync(process.env.MONGORESTORE_BIN || 'mongorestore', ['--uri', process.env.MONGODB_URI, '--archive=' + file, '--gzip', '--drop'], { timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 });
  return { filename: safe, restoredAt: new Date().toISOString() };
}
module.exports = { createBackup, listBackups, restoreBackup, backupDir };
