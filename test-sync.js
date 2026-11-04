require('dotenv').config();

const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const { syncAttendance } = require('./src/services/attendance.service');

(async () => {
  try {
    console.log('==============================================');
    console.log('ZKTeco F28 -> MongoDB attendance sync test');
    console.log('==============================================');
    console.log(`IP: ${process.env.ZK_DEVICE_IP}`);
    console.log(`Port: ${process.env.ZK_DEVICE_PORT || 4370}`);
    console.log('Connecting to MongoDB...');
    await connectDatabase();
    console.log('MongoDB connected.');

    const result = await syncAttendance();

    console.log('\nSYNC RESULT');
    console.dir(result, { depth: null });
    console.log(`\nDevice records: ${result.totalFromDevice}`);
    console.log(`Inserted:       ${result.inserted}`);
    console.log(`Duplicates:     ${result.duplicates}`);
    console.log(`Skipped:        ${result.skipped}`);
    console.log(`Failed:         ${result.failed || 0}`);

    process.exitCode = result.failed ? 1 : 0;
  } catch (error) {
    console.error('\nSYNC FAILED');
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  } finally {
    try { await disconnectDatabase(); } catch (_) {}
  }
})();
