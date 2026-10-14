const { Shift } = require('../models');
const { isValidTime } = require('../utils/validators');

function printSection() {}
function printRequest() {}

// ============================================================
// VALIDATION
// ============================================================

function validate(body = {}) {

  if (
    body.startTime !== undefined &&
    !isValidTime(body.startTime)
  ) {
    const error = 'startTime must be HH:mm';

    return error;
  }

  if (
    body.endTime !== undefined &&
    !isValidTime(body.endTime)
  ) {
    const error = 'endTime must be HH:mm';

    return error;
  }

  if (
    body.workingDays !== undefined &&
    (
      !Array.isArray(body.workingDays) ||
      body.workingDays.some(
        (d) =>
          !Number.isInteger(Number(d)) ||
          Number(d) < 1 ||
          Number(d) > 7
      )
    )
  ) {
    const error = 'workingDays must contain numbers 1-7';

    return error;
  }


  return null;
}

// ============================================================
// GET /api/shifts
// ============================================================

async function list(req, res) {
  printRequest(req);

  try {

    const shifts = await Shift.find()
      .sort({ name: 1 })
      .lean();

    const response = {
      success: true,
      shifts,
    };

    printSection('RESPONSE - GET /api/shifts', response);

    return res.json(response);
  } catch (e) {
    console.error('[SHIFT API] LIST ERROR');
    console.error(e);

    const response = {
      success: false,
      message: e.message || 'Failed to load shifts',
    };

    printSection('ERROR RESPONSE - GET /api/shifts', response);

    return res.status(500).json(response);
  }
}

// ============================================================
// POST /api/shifts
// ============================================================

async function create(req, res) {
  printRequest(req);

  console.log('[SHIFT API] CREATE request received');

  const error = validate(req.body);

  if (error) {
    const response = {
      success: false,
      message: error,
    };

    printSection('VALIDATION ERROR - POST /api/shifts', response);

    return res.status(400).json(response);
  }

  try {
    console.log('[SHIFT API] Creating shift in MongoDB...');

    const shift = await Shift.create(req.body);

    console.log('[SHIFT API] Shift created successfully');
    console.log('[SHIFT API] Created MongoDB ID:', shift._id);

    const response = {
      success: true,
      shift,
    };

    printSection('RESPONSE - POST /api/shifts', response);

    return res.status(201).json(response);
  } catch (e) {
    console.error('\n[SHIFT API] CREATE ERROR');
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    console.error('Full error:', e);

    const response = {
      success: false,
      message: e.message || 'Failed to create shift',
    };

    printSection('ERROR RESPONSE - POST /api/shifts', response);

    return res.status(400).json(response);
  }
}

// ============================================================
// PUT /api/shifts/:id
// ============================================================

async function update(req, res) {
  printRequest(req);

  console.log('[SHIFT API] UPDATE request received');
  console.log('[SHIFT API] Shift ID:', req.params.id);

  const error = validate(req.body);

  if (error) {
    const response = {
      success: false,
      message: error,
    };

    printSection('VALIDATION ERROR - PUT /api/shifts/:id', response);

    return res.status(400).json(response);
  }

  try {
    console.log('[SHIFT API] Updating shift in MongoDB...');

    const shift = await Shift.findByIdAndUpdate(
      req.params.id,
      {
        $set: req.body,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!shift) {
      console.error(
        '[SHIFT API] Shift not found:',
        req.params.id
      );

      const response = {
        success: false,
        message: 'Shift not found',
      };

      printSection('NOT FOUND RESPONSE - PUT /api/shifts/:id', response);

      return res.status(404).json(response);
    }

    console.log('[SHIFT API] Shift updated successfully');
    console.log('[SHIFT API] Updated MongoDB ID:', shift._id);

    const response = {
      success: true,
      shift,
    };

    printSection('RESPONSE - PUT /api/shifts/:id', response);

    return res.json(response);
  } catch (e) {
    console.error('\n[SHIFT API] UPDATE ERROR');
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    console.error('Full error:', e);

    const response = {
      success: false,
      message: e.message || 'Failed to update shift',
    };

    printSection('ERROR RESPONSE - PUT /api/shifts/:id', response);

    return res.status(400).json(response);
  }
}

// ============================================================
// DELETE /api/shifts/:id
// ============================================================

async function remove(req, res) {
  printRequest(req);

  console.log('[SHIFT API] DELETE request received');
  console.log('[SHIFT API] Shift ID:', req.params.id);

  try {
    console.log('[SHIFT API] Deleting shift from MongoDB...');

    const result = await Shift.findByIdAndDelete(
      req.params.id
    );

    const deleted = Boolean(result);

    if (deleted) {
      console.log('[SHIFT API] Shift deleted successfully');
    } else {
      console.log(
        '[SHIFT API] No shift found for ID:',
        req.params.id
      );
    }

    const response = {
      success: true,
      deleted,
    };

    printSection('RESPONSE - DELETE /api/shifts/:id', response);

    return res.json(response);
  } catch (e) {
    console.error('\n[SHIFT API] DELETE ERROR');
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    console.error('Full error:', e);

    const response = {
      success: false,
      message: e.message || 'Failed to delete shift',
    };

    printSection('ERROR RESPONSE - DELETE /api/shifts/:id', response);

    return res.status(500).json(response);
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
};