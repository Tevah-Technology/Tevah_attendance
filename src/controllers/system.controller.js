const os = require('os');
const mongoose = require('mongoose');
const { config } = require('../config/zkteco');
async function info(req, res) {
  res.json({ success: true, system: {
    application: 'ZKTeco F28 Attendance Backend',
    version: '4.0.0',
    node: process.version,
    platform: process.platform,
    hostname: os.hostname(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    device: { ip: config.ip, port: config.port },
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage()
  }});
}
module.exports = { info };
