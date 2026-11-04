# Tevah attendance backend – noon checkout switch and web location

## Included
- Independent `noonAutoCheckoutEnabled` (default `true` to retain existing behavior).
- `autoCheckoutEnabled` still controls **all** automatic checkout, including day-end.
- `halfDayEnabled` remains for **half-day reporting**, not noon auto checkout.
- `webLocationRequired` (default `false` for compatibility), governing only WEB check-in/out.
- A logged-in employee can fetch `GET /api/me/attendance/config` to learn if browser location is mandatory.
- `POST /api/me/attendance/check-in` and `/check-out` accept `{ "location": { "latitude": 8.5241, "longitude": 76.9366, "accuracyMeters": 15, "capturedAt": "<current ISO datetime>" } }`.
- Saved attendance records include `rawData.location` for WEB punches; DEVICE and AUTO punches have no fabricated location.
- Changes to rules reschedule currently open sessions. The polling scheduler also re-checks calculated due times before creating an automatic OUT.

## Admin API examples (authenticated user with `rules.edit` permission)
`GET /api/rules` returns current settings.

Disable 1 PM checkout, retain 5:30 PM day-end checkout:
```http
PUT /api/rules
Content-Type: application/json
Authorization: Bearer <admin access token>

{"noonAutoCheckoutEnabled":false,"autoCheckoutEnabled":true}
```
Enable noon checkout:
```json
{"noonAutoCheckoutEnabled":true}
```
Require browser location:
```json
{"webLocationRequired":true}
```
The existing admin frontend must be updated to display switches. There is no full admin frontend in the supplied ZIP, only Node backend code.

## Web/mobile frontend
Copy/adapt `examples/web-attendance-client.js` in your existing frontend. Invoke `submitAttendance({ apiBaseUrl: 'https://your-api-domain/api', token, action: 'check-in' })` in response to a user button click; use `check-out` for checkout. Browser location permission requires HTTPS (except localhost), and can be denied. The backend independently checks mandatory location when enabled. Do not send background tracking data.

## Setup and deployment
1. Back up your MongoDB database and deployed project. Deploy these updated source files onto your Node server, keeping its existing environment variables and secrets in place.
2. Run `npm ci` and `npm run check`. Restart the backend process (`pm2 restart <your-app-name>` where applicable).
3. Enable `webLocationRequired` after integrating the browser UI. Test employee login, web check-in/out, location denial, ZKTeco punches, and both noon switch states.
4. Confirm the runtime uses the configured local timezone for the shift/day boundaries; review server timezone especially if hosted in UTC.

**Privacy and reliability:** Browser location is user-consented and may be approximate or spoofed. Restrict admin access to attendance location, decide a retention policy, and use HTTPS. This does not create an automatic afternoon IN punch; employees still check in again manually or with the F28 device.

**Verification:** JavaScript syntax checked; no live MongoDB or ZKTeco device tests were run.
