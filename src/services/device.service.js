const { withDevice, config } = require('../config/zkteco');
const { stateToPunchType, verificationLabel, attendanceStateLabel } = require('../utils/punches');

// ============================================================
// ZKTeco command constants
// ============================================================

const CMD_DISABLEDEVICE = 1003;
const CMD_ENABLEDEVICE = 1002;

const CMD_USER_WRQ = 8;
const CMD_DELETE_USER = 18;

const CMD_GET_TIME = 201;
const CMD_SET_TIME = 202;

const CMD_REFRESHDATA = 1013;

const CMD_ACK_OK = 2000;

// ============================================================
// USER NORMALIZATION
// ============================================================

function normalizeUser(user) {
  return {
    uid: Number(
      user.uid ??
      user.userSn ??
      user.userSN ??
      0
    ),

    userId: String(
      user.userid ??
      user.userId ??
      user.deviceUserId ??
      ''
    ),

    name: String(
      user.name ??
      ''
    ),


    role: Number(
      user.role ??
      0
    ),

    cardNo: String(
      user.cardno ??
      user.cardNo ??
      '0'
    )
  };
}

// ============================================================
// DEVICE INFO
// ============================================================

async function getInfo() {
  return withDevice(async (device) => {
    return await device.getInfo();
  });
}

// ============================================================
// GET ALL USERS
// ============================================================

async function getUsers() {
  const result = await withDevice(async (device) => {
    return await device.getUsers();
  });

  const users = Array.isArray(result)
    ? result
    : (result?.data || []);

  return users.map(normalizeUser);
}

// ============================================================
// BUILD USER BUFFER
//
// ZKTeco user record:
//
//   0  - 1   UID
//   2        privilege / role
//   3  - 10  password
//   11 - 38  name
//   39       enabled
//   40 - 43  card number
//   44 - 47  reserved
//   48 - 71  user ID
//
// Total = 72 bytes
// ============================================================

function buildUserBuffer(user) {
  const buffer = Buffer.alloc(72, 0);

  const uid = Number(user.uid);

  const role = Number(
    user.role ?? 0
  );

  const password = String(
    user.password ?? ''
  );

  const name = String(
    user.name ?? ''
  );

  const userId = String(
    user.userId ??
    user.userid ??
    ''
  );

  // UID
  buffer.writeUInt16LE(
    uid,
    0
  );

  // Role / privilege
  buffer.writeUInt8(
    role,
    2
  );

  // Password
  Buffer
    .from(password, 'utf8')
    .subarray(0, 8)
    .copy(buffer, 3);

  // Name
  Buffer
    .from(name, 'utf8')
    .subarray(0, 28)
    .copy(buffer, 11);

  // Enabled
  buffer.writeUInt8(
    1,
    39
  );

  // Card number
  const cardNo = Number(
    user.cardNo ??
    user.cardno ??
    0
  );

  if (
    Number.isFinite(cardNo) &&
    cardNo >= 0 &&
    cardNo <= 0xffffffff
  ) {
    buffer.writeUInt32LE(
      cardNo,
      40
    );
  }

  // User ID
  Buffer
    .from(userId, 'utf8')
    .subarray(0, 24)
    .copy(buffer, 48);

  return buffer;
}

// ============================================================
// CREATE / UPDATE USER
// ============================================================

async function saveUser(user) {
  const payload = {
    uid: Number(
      user.uid
    ),

    userId: String(
      user.userId ??
      user.userid ??
      ''
    ),

    name: String(
      user.name ??
      ''
    ),


    role: Number(
      user.role ??
      0
    ),

    cardNo: Number(
      user.cardNo ??
      user.cardno ??
      0
    )
  };

  // ----------------------------------------------------------
  // Validation
  // ----------------------------------------------------------

  if (
    !Number.isInteger(payload.uid) ||
    payload.uid <= 0 ||
    payload.uid > 65535
  ) {
    throw new Error(
      'Valid numeric uid between 1 and 65535 is required'
    );
  }

  if (!payload.userId) {
    throw new Error(
      'userId is required'
    );
  }

  if (!payload.name) {
    throw new Error(
      'name is required'
    );
  }

  if (
    Buffer.byteLength(
      payload.userId,
      'utf8'
    ) > 24
  ) {
    throw new Error(
      'userId must be 24 bytes or fewer'
    );
  }

  if (
    Buffer.byteLength(
      payload.name,
      'utf8'
    ) > 28
  ) {
    throw new Error(
      'name must be 28 bytes or fewer'
    );
  }

  if (
    Buffer.byteLength(
      payload.password,
      'utf8'
    ) > 8
  ) {
    throw new Error(
      'password must be 8 bytes or fewer'
    );
  }

  if (
    !Number.isFinite(payload.cardNo) ||
    payload.cardNo < 0 ||
    payload.cardNo > 0xffffffff
  ) {
    throw new Error(
      'cardNo must be a valid number between 0 and 4294967295'
    );
  }

  // ----------------------------------------------------------
  // Send user to device
  // ----------------------------------------------------------

  return withDevice(async (device) => {

    // Disable device while modifying users
    await device.executeCmd(
      CMD_DISABLEDEVICE,
      ''
    );

    try {

      const userBuffer =
        buildUserBuffer(payload);

      const result =
        await device.executeCmd(
          CMD_USER_WRQ,
          userBuffer
        );

      // ------------------------------------------------------
      // Refresh device data
      // ------------------------------------------------------

      try {

        await device.executeCmd(
          CMD_REFRESHDATA,
          ''
        );

      } catch (refreshError) {

        console.warn(
          'ZKTeco refresh failed:',
          refreshError.message
        );
      }

      return {
        ...payload,

        command:
          CMD_USER_WRQ,

        deviceResponse:
          Buffer.isBuffer(result)
            ? result.toString('hex')
            : result
      };

    } finally {

      // Always enable device again
      try {

        await device.executeCmd(
          CMD_ENABLEDEVICE,
          ''
        );

      } catch (enableError) {

        console.error(
          'Failed to re-enable ZKTeco device:',
          enableError.message
        );
      }
    }
  });
}

// ============================================================
// DELETE USER
// ============================================================

async function deleteUser(uid) {

  const numericUid =
    Number(uid);

  if (
    !Number.isInteger(numericUid) ||
    numericUid <= 0 ||
    numericUid > 65535
  ) {
    throw new Error(
      'Valid numeric uid between 1 and 65535 is required'
    );
  }

  return withDevice(async (device) => {

    await device.executeCmd(
      CMD_DISABLEDEVICE,
      ''
    );

    try {

      const buffer =
        Buffer.alloc(2);

      buffer.writeUInt16LE(
        numericUid,
        0
      );

      const result =
        await device.executeCmd(
          CMD_DELETE_USER,
          buffer
        );

      // Refresh
      try {

        await device.executeCmd(
          CMD_REFRESHDATA,
          ''
        );

      } catch (refreshError) {

        console.warn(
          'ZKTeco refresh failed:',
          refreshError.message
        );
      }

      return {
        uid:
          numericUid,

        deleted:
          true,

        command:
          CMD_DELETE_USER,

        deviceResponse:
          Buffer.isBuffer(result)
            ? result.toString('hex')
            : result
      };

    } finally {

      try {

        await device.executeCmd(
          CMD_ENABLEDEVICE,
          ''
        );

      } catch (enableError) {

        console.error(
          'Failed to re-enable ZKTeco device:',
          enableError.message
        );
      }
    }
  });
}

// ============================================================
// DECODE ZKTeco TIME
// ============================================================

function decodeZkTimeComponents(value) {

  let remaining =
    Number(value);

  if (
    !Number.isFinite(remaining) ||
    remaining < 0
  ) {
    throw new Error(
      `Invalid ZKTeco encoded time: ${value}`
    );
  }

  remaining =
    Math.floor(remaining);

  const second =
    remaining % 60;

  remaining =
    Math.floor(
      remaining / 60
    );

  const minute =
    remaining % 60;

  remaining =
    Math.floor(
      remaining / 60
    );

  const hour =
    remaining % 24;

  remaining =
    Math.floor(
      remaining / 24
    );

  const day =
    (remaining % 31) + 1;

  remaining =
    Math.floor(
      remaining / 31
    );

  const month =
    (remaining % 12) + 1;

  remaining =
    Math.floor(
      remaining / 12
    );

  const year =
    2000 + remaining;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second
  };
}

// ============================================================
// FORMAT CLOCK
// ============================================================

function formatClock(
  hour,
  minute,
  second
) {
  return [
    String(hour).padStart(2, '0'),
    String(minute).padStart(2, '0'),
    String(second).padStart(2, '0')
  ].join(':');
}

// ============================================================
// GET DEVICE TIME
//
// F28 response:
//
// bytes 0-1   = ACK
// bytes 8-11  = encoded ZKTeco time
// ============================================================

async function getTime() {

  return withDevice(async (device) => {

    const result =
      await device.executeCmd(
        CMD_GET_TIME,
        ''
      );

    if (!Buffer.isBuffer(result)) {

      return {
        command:
          CMD_GET_TIME,

        data:
          result
      };
    }

    if (result.length < 12) {

      throw new Error(
        `Invalid ZKTeco time response. Expected at least 12 bytes, received ${result.length}: ${result.toString('hex')}`
      );
    }

    const ack =
      result.readUInt16LE(0);

    if (ack !== CMD_ACK_OK) {

      throw new Error(
        `ZKTeco returned ACK ${ack} while requesting device time. Raw response: ${result.toString('hex')}`
      );
    }

    // IMPORTANT:
    // F28 timestamp is at bytes 8-11.
    const TIME_OFFSET = 8;

    const encodedTime =
      result.readUInt32LE(
        TIME_OFFSET
      );

    const decoded =
      decodeZkTimeComponents(
        encodedTime
      );

    const clock =
      formatClock(
        decoded.hour,
        decoded.minute,
        decoded.second
      );

    const datetime =
      `${decoded.year}-` +
      `${String(decoded.month).padStart(2, '0')}-` +
      `${String(decoded.day).padStart(2, '0')} ` +
      `${String(decoded.hour).padStart(2, '0')}:` +
      `${String(decoded.minute).padStart(2, '0')}:` +
      `${String(decoded.second).padStart(2, '0')}`;

    const localDate =
      new Date(
        decoded.year,
        decoded.month - 1,
        decoded.day,
        decoded.hour,
        decoded.minute,
        decoded.second
      );

    return {

      command:
        CMD_GET_TIME,

      ack,

      ackHex:
        result
          .subarray(0, 2)
          .toString('hex'),

      encoded:
        encodedTime,

      encodedHex:
        result
          .subarray(
            TIME_OFFSET,
            TIME_OFFSET + 4
          )
          .toString('hex'),

      decoded,

      clock,

      datetime,

      timestamp:
        localDate.toISOString(),

      timeOffset:
        TIME_OFFSET,

      raw:
        result.toString('hex'),

      bytes:
        Array.from(result),

      littleEndian:
        result.readUInt32LE(
          TIME_OFFSET
        ),

      bigEndian:
        result.readUInt32BE(
          TIME_OFFSET
        )
    };
  });
}

// ============================================================
// GET ATTENDANCE LOGS
// ============================================================

async function getAttendanceLogs() {
  const result = await withDevice((device) => device.getAttendances());

  const rows = Array.isArray(result)
    ? result
    : (result?.data || []);

  // The standard 40-byte TCP record does not reliably carry an IN/OUT state.
  // Preserve the device verification method (fingerprint/card/etc.) and derive
  // a chronological punch direction per user for this response. The attendance
  // service performs the same derivation when persisting records.
  const counters = new Map();
  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.recordTime ?? a.attTime ?? a.timestamp).getTime();
    const tb = new Date(b.recordTime ?? b.attTime ?? b.timestamp).getTime();
    return ta - tb;
  });

  return sorted.map((row) => {
    const userId = String(row.deviceUserId ?? row.userId ?? row.userid ?? row.userSn ?? '').trim();
    const explicitState = row.attState ?? row.inOutStatus ?? row.state ?? row.status ?? null;
    const key = userId;
    const count = counters.get(key) || 0;
    const punchType = stateToPunchType(explicitState, count);
    counters.set(key, count + 1);

    return {
      ...row,
      source: 'DEVICE',
      punchType,
      attendanceState: explicitState,
      attendanceStateLabel: attendanceStateLabel(explicitState),
      verificationLabel: verificationLabel(row.verifyMode ?? row.verificationMode ?? row.verify),
    };
  });
}

// ============================================================
// SET TIME BUFFER
// ============================================================

function encodeZkTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid datetime');
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours();
  const minute = d.getMinutes();
  const second = d.getSeconds();
  if (year < 2000 || year > 2155) throw new Error('ZKTeco datetime year must be between 2000 and 2155');
  const encoded = (((((year - 2000) * 12 + (month - 1)) * 31 + (day - 1)) * 24 + hour) * 60 + minute) * 60 + second;
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(encoded >>> 0, 0);
  return { buffer, encoded, datetime: d.toISOString() };
}

async function setTime(value) {
  const encoded = encodeZkTime(value);
  const result = await setTimeBuffer(encoded.buffer);
  return { ...result, ...encoded, buffer: undefined };
}

async function setTimeBuffer(buffer) {

  if (!Buffer.isBuffer(buffer)) {

    throw new Error(
      'setTimeBuffer requires a Buffer'
    );
  }

  return withDevice(async (device) => {

    const result =
      await device.executeCmd(
        CMD_SET_TIME,
        buffer
      );

    return {

      command:
        CMD_SET_TIME,

      deviceResponse:
        Buffer.isBuffer(result)
          ? result.toString('hex')
          : result
    };
  });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  config,

  normalizeUser,

  getInfo,

  getUsers,

  saveUser,

  deleteUser,

  getTime,

  setTimeBuffer,

  getAttendanceLogs
};