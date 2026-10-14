const ZKLib = require('node-zklib');

const config = {
  ip: process.env.ZK_DEVICE_IP || '192.168.0.136',
  port: Number(process.env.ZK_DEVICE_PORT || 4370),
  timeout: Number(process.env.ZK_DEVICE_TIMEOUT || 10000),
  inport: Number(process.env.ZK_DEVICE_INPORT || 4000),
  commKey: Number(process.env.ZK_COMM_KEY || 0)
};

function createDevice() {
  return new ZKLib(
    config.ip,
    config.port,
    config.timeout,
    config.inport,
    config.commKey,
    'tcp'
  );
}

async function withDevice(callback) {
  const device = createDevice();
  await device.createSocket();
  try {
    return await callback(device);
  } finally {
    try { await device.disconnect(); } catch (_) {}
  }
}

module.exports = { config, createDevice, withDevice };
