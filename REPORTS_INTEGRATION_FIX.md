# Reports integration fix

Updated report integration for Flutter:

- Weekly report returns one aggregate row per employee.
- Monthly report returns one aggregate object per employee with `daily` entries.
- Department report returns flattened aggregate fields expected by Flutter.
- Employee report supports the canonical query form `/api/reports/employee?employeeId=EMP001`.
- A backwards-compatible `/api/reports/employee/:employeeId` route is also available.
- Report service now honors access-scoped `employeeIds` when building reports.
