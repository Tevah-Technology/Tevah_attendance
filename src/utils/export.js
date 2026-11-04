const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { formatMinutes } = require('./time');

function flatten(rows) {
  return rows.map((row) => ({
    Date: new Date(row.date).toISOString().slice(0, 10),
    EmployeeID: row.employeeId,
    EmployeeName: row.employeeName,
    Department: row.department,
    Status: row.status,
    FirstPunch: row.firstPunch ? new Date(row.firstPunch).toLocaleTimeString() : '',
    LastPunch: row.lastPunch ? new Date(row.lastPunch).toLocaleTimeString() : '',
    AllPunches: row.punches.map((p) => `${new Date(p.timestamp).toLocaleTimeString()} ${p.punchType}`).join(' | '),
    WorkingHours: formatMinutes(row.workedMinutes),
    BreakDuration: formatMinutes(row.breakMinutes),
    LateMinutes: row.lateMinutes,
    EarlyDepartureMinutes: row.earlyDepartureMinutes,
    Overtime: formatMinutes(row.overtimeMinutes)
  }));
}

function toExcel(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(flatten(rows));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function toCsv(rows) {
  const data = flatten(rows);
  if (!data.length) return Buffer.from('');
  const headers = Object.keys(data[0]);
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return Buffer.from([
    headers.map(quote).join(','),
    ...data.map((row) => headers.map((key) => quote(row[key])).join(','))
  ].join('\n'));
}

function toPdf(rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('ZKTeco Attendance Report');
    doc.moveDown();
    rows.forEach((row) => {
      if (doc.y > 750) doc.addPage();
      doc.fontSize(9).text(
        `${new Date(row.date).toISOString().slice(0, 10)} | ${row.employeeId} | ${row.employeeName} | ${row.status}`
      );
      doc.fontSize(8).text(
        `First: ${row.firstPunch ? new Date(row.firstPunch).toLocaleTimeString() : '-'}  ` +
        `Last: ${row.lastPunch ? new Date(row.lastPunch).toLocaleTimeString() : '-'}  ` +
        `Work: ${formatMinutes(row.workedMinutes)}  Break: ${formatMinutes(row.breakMinutes)}  ` +
        `Late: ${row.lateMinutes}m  Early: ${row.earlyDepartureMinutes}m  OT: ${formatMinutes(row.overtimeMinutes)}`
      );
      doc.moveDown(0.6);
    });
    doc.end();
  });
}

module.exports = { flatten, toExcel, toCsv, toPdf };
