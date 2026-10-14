# Public Registration API

Public registration is available at:

```text
POST /api/auth/register
```

No Bearer token is required.

A successful registration creates **two linked MongoDB records**:

1. `Employee` — visible in Employee Management and `/api/employees`.
2. `AdminUser` — the login account used by `/api/auth/login`.

The backend generates the `employeeId` automatically (for example `EMP009`) and stores that same ID on the login account.

## Request

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "StrongPassword123",
  "department": "IT & Systems",
  "designation": "Developer",
  "phone": "+91 9876543210"
}
```

Only `name`, `email`, and `password` are required. Department, designation, and phone are optional.

For security, the public endpoint ignores/does not accept caller-controlled role, permissions, roleId, employeeId, shiftId, deviceUid, deviceUserId, active state, or other privilege/device assignment fields. New accounts always receive the active `EMPLOYEE` role and a server-generated employee ID.

## cURL

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "StrongPassword123",
    "department": "IT & Systems",
    "designation": "Developer",
    "phone": "+91 9876543210"
  }'
```

## Result

The response includes both the new `employee` and linked `user` objects. The new employee then appears in:

```text
GET /api/employees
```

That employees endpoint remains protected by its normal permission middleware.
