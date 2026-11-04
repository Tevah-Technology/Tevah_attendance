function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(
    String(value || '')
  );
}

function requireFields(body, fields) {
  const missing = fields.filter(
    (field) =>
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ''
  );

  return missing;
}

module.exports = {
  isValidTime,
  requireFields,
};