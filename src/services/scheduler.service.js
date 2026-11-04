const { syncAttendance, startRealtimeListener, autoCheckoutOpenSessions } = require('./attendance.service');

let realtimeDevice = null;

function startSchedulers() {
  const interval = Math.max(10000, Number(process.env.SYNC_INTERVAL_MS || 300000));
  const autoCheckoutInterval = Math.max(10000, Number(process.env.AUTO_CHECKOUT_CHECK_INTERVAL_MS || 30000));

  setTimeout(async () => {
    try {
      console.log('Initial attendance sync:', await syncAttendance());
    } catch (error) {
      console.error('Initial attendance sync failed:', error.message);
    }
    try {
      realtimeDevice = await startRealtimeListener();
    } catch (error) {
      console.error('Realtime listener failed:', error.message);
    }
  }, 500);

  setInterval(async () => {
    try {
      console.log('Automatic attendance sync:', await syncAttendance());
    } catch (error) {
      console.error('Automatic attendance sync failed:', error.message);
    }
  }, interval);

  // The Rules document is the source of truth for whether automatic checkout
  // is enabled and for the 13:00/17:30 boundaries. Keep this lightweight poll
  // running so a frontend rule change takes effect without restarting Node.
  setTimeout(async () => {
    try { await autoCheckoutOpenSessions(); }
    catch (error) { console.error('Initial automatic checkout failed:', error.message); }
  }, 1000);

  setInterval(async () => {
    try {
      const result = await autoCheckoutOpenSessions();
      if (result.checkedOut) console.log('Automatic attendance checkout:', result);
    } catch (error) {
      console.error('Automatic attendance checkout failed:', error.message);
    }
  }, autoCheckoutInterval);

  process.on('SIGINT', async () => {
    if (realtimeDevice) {
      try { await realtimeDevice.disconnect(); } catch (_) {}
    }
    process.exit(0);
  });
}

module.exports = { startSchedulers };
