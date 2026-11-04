/** Integrate into the existing authenticated web/mobile UI.
 * Geolocation only works over HTTPS or localhost and requires user permission.
 * Never hardcode a JWT; pass the current authenticated user's token.
 */
export async function submitAttendance({ apiBaseUrl, token, action }) {
  if (!['check-in', 'check-out'].includes(action)) throw new Error('Unsupported attendance action');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const configResponse = await fetch(`${apiBaseUrl}/me/attendance/config`, { headers });
  if (!configResponse.ok) throw new Error('Could not load attendance settings');
  const config = await configResponse.json();
  let location = null;
  if (navigator.geolocation) {
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0
        })
      );
      location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        capturedAt: new Date(position.timestamp).toISOString()
      };
    } catch (error) {
      if (config.webLocationRequired) throw new Error('Allow location permission to record attendance');
    }
  } else if (config.webLocationRequired) {
    throw new Error('Geolocation is not supported by this browser');
  }
  const response = await fetch(`${apiBaseUrl}/me/attendance/${action}`, {
    method: 'POST', headers, body: JSON.stringify({ location })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Attendance request failed');
  return data;
}
