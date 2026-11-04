require('dotenv').config();

const { createDevice, config } = require('./src/config/zkteco');
const { verificationLabel } = require('./src/utils/punches');

async function main() {
  console.log('==============================================');
  console.log('ZKTeco F28 direct connection test');
  console.log('==============================================');
  console.log('IP:', config.ip);
  console.log('Port:', config.port);
  console.log('Timeout:', config.timeout);
  console.log('');

  const device = createDevice();

  try {
    console.log('Connecting to F28...');
    await device.createSocket();
    console.log('TCP/UDP socket connected.');

    const info = await device.getInfo();
    console.log('\nDEVICE INFO');
    console.log(JSON.stringify(info, null, 2));

    const usersResult = await device.getUsers();
    const users = Array.isArray(usersResult) ? usersResult : (usersResult?.data || []);
    console.log('\nUSERS:', users.length);
    console.log(users.slice(0, 10));

    const logsResult = await device.getAttendances();
    const logs = Array.isArray(logsResult) ? logsResult : (logsResult?.data || []);
    console.log('\nATTENDANCE RECORDS:', logs.length);

    for (const row of logs.slice(-20)) {
      console.log({
        userSn: row.userSn,
        deviceUserId: row.deviceUserId,
        recordTime: row.recordTime,
        verifyMode: row.verifyMode,
        verification: verificationLabel(row.verifyMode),
        rawRecordHex: row.rawRecordHex
      });
    }

    if (logs.length === 0) {
      console.log('\nNO ATTENDANCE RECORDS WERE RETURNED BY THE F28.');
      console.log('Check that the device IP is correct and that the F28 has attendance logs.');
    }
  } catch (error) {
    console.error('\nF28 CONNECTION/READ FAILED');
    console.error(error?.stack || error);
    process.exitCode = 1;
  } finally {
    try { await device.disconnect(); } catch (_) {}
  }
}

main();
