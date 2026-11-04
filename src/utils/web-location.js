// Only web attendance uses browser geolocation; biometric device events remain unchanged.
function validateWebLocation(body, required) {
  const provided = body && Object.prototype.hasOwnProperty.call(body, 'location');
  if (!provided || body.location == null) {
    if (required) throw new Error('Location permission is required for web attendance');
    return null;
  }
  const l = body.location;
  if (!l || typeof l !== 'object' || Array.isArray(l)) throw new Error('Invalid location object');
  const { latitude, longitude, accuracyMeters, capturedAt } = l;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100000) {
    throw new Error('Location must contain valid numeric latitude, longitude and accuracyMeters');
  }
  if (typeof capturedAt !== 'string') throw new Error('capturedAt ISO timestamp is required');
  const timestamp = new Date(capturedAt);
  if (Number.isNaN(timestamp.getTime()) || Math.abs(Date.now() - timestamp.getTime()) > 120000) {
    throw new Error('Location must be captured within two minutes of attendance');
  }
  return { latitude, longitude, accuracyMeters, capturedAt: timestamp.toISOString() };
}
module.exports = { validateWebLocation };
