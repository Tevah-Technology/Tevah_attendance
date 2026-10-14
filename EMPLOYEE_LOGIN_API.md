# Employee App Login (without ZKTeco password)

ZKTeco device credentials and the web/mobile application login are separate.
Normal employees receive an application login account with the `EMPLOYEE` role.
The existing Mongo model is still named `AdminUser` for backward compatibility;
that model name does not grant administrator permissions.

## Existing employee: create login

Milan already exists as `EMP005`, so an authorized manager/admin can create the
login account with:

```http
POST /api/employees/EMP005/login
Authorization: Bearer <admin-or-authorized-token>
Content-Type: application/json

{
  "email": "milan@tevah.technology",
  "password": "Milan@12345",
  "mustChangePassword": true
}
```

After that Milan logs in normally:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "milan@tevah.technology",
  "password": "Milan@12345"
}
```

## Check whether an employee already has a login

```http
GET /api/employees/EMP005/login
Authorization: Bearer <authorized-token>
```

## Reset/update an existing employee login

```http
PUT /api/employees/EMP005/login
Authorization: Bearer <admin-or-authorized-token>
Content-Type: application/json

{
  "password": "NewPassword@123",
  "mustChangePassword": true,
  "active": true
}
```

You may also include `email` in this request to change the application login email.

## Create employee + login in one request

```http
POST /api/employees
Authorization: Bearer <authorized-token>
Content-Type: application/json

{
  "employeeId": "EMP010",
  "name": "New Employee",
  "email": "employee@example.com",
  "department": "IT & Systems",
  "designation": "Developer",
  "active": true,
  "createLogin": true,
  "loginPassword": "Temporary@123",
  "mustChangePassword": true
}
```

The employee login is always created with role `EMPLOYEE`; it is never given
admin privileges by this endpoint.
