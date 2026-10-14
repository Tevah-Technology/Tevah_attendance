# Attendance Rules

Attendance policy is stored in MongoDB through the global Rules document and is editable at runtime.
No restart is required after changing rules.

## Endpoints

- `GET /api/rules` — read current rules
- `PUT /api/rules` — update rules
- `POST /api/rules` — update rules (supported as an alias for clients that prefer POST)

Authentication and the `rules.edit` permission are required for updates.

## Default split-day schedule

```json
{
  "halfDayEnabled": true,
  "halfDayMinutes": 240,
  "fullDayMinutes": 480,
  "twoHalfDaysEqualOneDay": true,
  "attendanceUseEnvHours": false,
  "morningStartTime": "09:00",
  "lateAfterTime": "09:30",
  "consecutiveLateThreshold": 4,
  "consecutiveLatePenaltyUnits": 0.5,
  "middayAutoCheckoutTime": "13:00",
  "afternoonStartTime": "13:30",
  "dayEndAutoCheckoutTime": "17:30",
  "autoCheckoutEnabled": true
}
```

### Duration rules

- `halfDayEnabled`: enable/disable half-day classification.
- `halfDayMinutes`: minutes required for duration-based half-day classification. Default 240.
- `fullDayMinutes`: minutes required for duration-based full-day classification. Default 480.
- `twoHalfDaysEqualOneDay`: allows two qualifying half-day sessions to count as a full attendance day.
- `attendanceUseEnvHours`: legacy-compatible field name. It is **stored in Rules and no longer reads `.env`**. When `true`, `fullDayMinutes` is used as the required-minutes basis for overtime; when `false`, the assigned/default Shift's `requiredMinutes` is preferred.

### Split schedule

- Morning starts at 09:00.
- Arrival after 09:30 counts as late.
- On the 4th consecutive late working day, the configured 0.5 attendance-unit penalty is applied and the streak resets.
- If automatic checkout is enabled, an open morning session closes at 13:00.
- Afternoon starts at 13:30.
- An open afternoon session closes at 17:30.
- Device, web and automatic punches are stored in the same Attendance collection.

## Example update

```bash
curl -X POST http://localhost:3000/api/rules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "halfDayEnabled": true,
    "halfDayMinutes": 240,
    "fullDayMinutes": 480,
    "twoHalfDaysEqualOneDay": true,
    "attendanceUseEnvHours": false,
    "morningStartTime": "09:00",
    "lateAfterTime": "09:30",
    "consecutiveLateThreshold": 4,
    "consecutiveLatePenaltyUnits": 0.5,
    "middayAutoCheckoutTime": "13:00",
    "afternoonStartTime": "13:30",
    "dayEndAutoCheckoutTime": "17:30",
    "autoCheckoutEnabled": true
  }'
```
