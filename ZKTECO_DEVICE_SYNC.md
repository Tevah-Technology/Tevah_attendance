# ZKTeco F28 device sync

This backend reads the F28 attendance log over the device's TCP/UDP protocol and stores the punches in MongoDB.

## Important device mapping

The employee record must contain the same `deviceUserId` as the PIN/User ID registered on the F28. When employees are synchronized to the F28 by this backend, `deviceUserId` is set to the employee ID.

## Device configuration

The current `.env` is configured for the F28 used by this project:

```env
ZK_DEVICE_IP=192.168.0.136
ZK_DEVICE_PORT=4370
ZK_DEVICE_TIMEOUT=10000
ZK_DEVICE_INPORT=4000
ZK_COMM_KEY=0
ZK_REALTIME=true
SYNC_INTERVAL_MS=60000
```

If the terminal has a different IP, change only `ZK_DEVICE_IP` before starting the server.

## Direct F28 test

From the project folder:

```bash
npm run zk:test
```

A successful test prints:

- device information / log count
- F28 users
- latest attendance records
- verification mode, including `Fingerprint` for mode `1`
- raw 40-byte record hex

If it reports `NO ATTENDANCE RECORDS WERE RETURNED BY THE F28`, check the device IP and make one new fingerprint punch on the terminal, then run the test again.

## Synchronization

The server performs:

1. an initial attendance download at startup;
2. real-time listener registration when `ZK_REALTIME=true`;
3. a complete device-log safety sync every 60 seconds.

The safety sync is idempotent; the same device/user/timestamp is not inserted twice.

## 40-byte F28 record

The standard TCP attendance record contains the internal user serial, device PIN, verification method and packed timestamp. The published 40-byte format does not reliably contain a separate IN/OUT state. The backend therefore preserves the verification method and derives IN/OUT chronologically when no explicit punch state is supplied.

Common verification modes include:

- `0` Password
- `1` Fingerprint
- `2` Card
- `4` Card
- `15` Face

## API diagnostics

After login and permission checks:

```text
GET /api/device/status
GET /api/device/attendance
GET /api/device/attendance/diagnostics
POST /api/device/sync
```

`/api/device/attendance/diagnostics` is especially useful for confirming that the backend can read F28 records before checking the web dashboard.

## Web/mobile attendance

Web/mobile Check In and Check Out are stored separately as `WEB` source records. F28 punches are stored as `DEVICE`. Automatic 8-hour checkout is stored as `AUTO`.
