# Monthly Report Fix

The `/api/reports/monthly` endpoint now returns two arrays:

- `employees`: one aggregated object per employee for the Flutter Monthly Summary matrix.
- `data`: the original raw employee-per-day rows for backward compatibility and exports/debugging.

Flutter should prefer `employees`, which the current reports module already does.

Example:

```bash
curl -X GET "http://localhost:3000/api/reports/monthly?year=2026&month=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Each item in `employees` contains a `daily` array with day/code/status and monthly totals such as `workMinutes` and `overtimeMinutes`.
