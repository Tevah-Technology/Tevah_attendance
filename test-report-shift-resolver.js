'use strict';
// Small, dependency-free regression test for the report-only shift resolver.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const code = fs.readFileSync(__dirname + '/src/services/shift-assignment.service.js', 'utf8');
const shifts = [
  { _id: 'shift-employee', active: true, name: 'Employee' },
  { _id: 'shift-company', active: true, name: 'Company' },
  { _id: 'shift-range', active: true, name: 'Range' },
  { _id: 'shift-recurring', active: true, name: 'Recurring' },
  { _id: 'shift-single', active: true, name: 'Single' },
  { _id: 'shift-inactive', active: false, name: 'Inactive' }
];
const make = (type, id, extra = {}) => ({
  employeeId: '007', assignmentType: type, shiftId: id,
  active: true, updatedAt: new Date('2026-11-02T00:00:00Z'),
  createdAt: new Date('2026-11-01T00:00:00Z'), ...extra
});
const assignments = [
  make('single_date', 'shift-single', { date: new Date(2026, 10, 3) }),
  make('date_range', 'shift-range', { startDate: new Date(2026, 10, 2), endDate: new Date(2026, 10, 5) }),
  make('recurring', 'shift-recurring', { recurringDays: [1,2,3,4,5] }),
  make('recurring', 'shift-inactive', { recurringDays: [6] })
];
function query(value) {
  const q = { sort() { return q; }, lean: async () => value };
  return q;
}
const models = {
  ShiftAssignment: { find: () => query(assignments) },
  Shift: { find: () => query(shifts), findById: (id) => query(shifts.find(s => s._id === String(id))) },
  Rule: { findOne: () => query({ defaultShiftId: 'shift-company' }) }
};
const moduleMock = { exports: {} };
vm.runInNewContext('(function(require,module,exports){' + code + '\n})', {
  Date, String, Set, Map, Array, Number, console
})(name => {
  if (name === '../models') return models;
  if (name === '../utils/time') return {
    startOfDay: d => new Date(new Date(d).setHours(0,0,0,0)),
    endOfDay: d => new Date(new Date(d).setHours(23,59,59,999))
  };
  throw new Error('unexpected dependency ' + name);
}, moduleMock, moduleMock.exports);
(async () => {
  const resolve = await moduleMock.exports.createReportShiftResolver(
    { employeeId: '007', shiftId: 'shift-employee' },
    { defaultShiftId: 'shift-company' }
  );
  const selected = (y, m, d) => resolve(new Date(y, m, d)).shift?.name;
  assert.strictEqual(selected(2026,10,3), 'Single');
  assert.strictEqual(selected(2026,10,4), 'Range');
  assert.strictEqual(selected(2026,10,6), 'Recurring');
  assert.strictEqual(selected(2026,10,7), 'Employee');
  assert.strictEqual(selected(2026,10,8), 'Employee');
  console.log('PASS: single-date, range, recurring, inactive and default shift precedence');
})().catch(e => { console.error(e); process.exitCode = 1; });
