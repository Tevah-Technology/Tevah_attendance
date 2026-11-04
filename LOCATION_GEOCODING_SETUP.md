# Browser attendance location and place names

The check-in and check-out APIs still accept the same browser JSON:

```json
{"location":{"latitude":8.5241,"longitude":76.9366,"accuracyMeters":15,"capturedAt":"2026-10-31T05:00:00.000Z"}}
```

Only WEB check-in/out locations are enriched. The original latitude, longitude, accuracy and capture time stay in `Attendance.rawData.location`. Added fields: `placeName`, `city`, `state`, `country`, `countryCode`, `postcode`, `formattedAddress`, `mapsUrl`, `geocodingProvider`, and `addressResolved`.

## Enable address lookup

Add these to your existing backend `.env` (do NOT replace your existing secrets):

```
GEOCODING_ENABLED=true
GEOCODING_CONTACT_EMAIL=your-real-operations-contact@example.com
```

**Replace the placeholder email with a real monitored address.** The public OpenStreetMap Nominatim API requires an identifying User-Agent/contact, has strict limits (max 1 request/second) and is not guaranteed for high-volume production use. This code serializes requests and caches rounded coordinates for 24 hours in memory, but very high traffic requires a commercial or self-hosted provider. Do not send location or other personal data to this service without appropriate employee notice and privacy controls. Do not use this public service for bulk geocoding. Observe the provider's published terms/attribution requirements.

If the email is not set, lookup is disabled; the API still records coordinates and a Maps link. If lookup times out or fails, attendance proceeds and `addressResolved` is false. Inaccuracy from desktop browsers and spoofable geolocation are possible. Only authorized roles should read location data; define a retention policy.

Start the backend with `npm install` then `npm run dev`. No additional npm dependency is required on Node 18+. Use a separate test database when testing, and do not deploy to production without checking the reporting access controls and CORS configuration.

## Verify stored records

After an authenticated web check-in, inspect the new attendance document's `rawData.location` field. The check-in response itself returns the current attendance status, not necessarily the full enriched location record. The Flutter frontend needs no additional API fields: it already sends latitude, longitude, accuracy and capture time.
