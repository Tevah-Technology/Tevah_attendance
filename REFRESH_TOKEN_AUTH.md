# Access + Refresh Token Authentication

## Login
POST `/api/auth/login`

```json
{
  "email": "milan@tevah.technology",
  "password": "Milan@12345",
  "rememberMe": true
}
```

Response includes `token` (legacy alias), `accessToken`, `refreshToken`, `expiresIn`, `refreshExpiresIn`, and `user`.

## Refresh
POST `/api/auth/refresh`

```json
{ "refreshToken": "..." }
```

Refresh tokens are opaque random values. Only a SHA-256 hash is stored in MongoDB. Refresh tokens are rotated on every refresh, so the old token becomes invalid immediately.

## Logout
POST `/api/auth/logout`

```json
{ "refreshToken": "..." }
```

## Expiry configuration
Access token lifetime continues to use `Settings.security.sessionTimeoutMinutes` (default 30 minutes).

Optional `.env` values:

```env
REFRESH_TOKEN_EXPIRES_IN_DAYS=7
SESSION_REFRESH_EXPIRES_IN_HOURS=8
```

When `rememberMe=true`, refresh sessions use `REFRESH_TOKEN_EXPIRES_IN_DAYS`. When false, they use `SESSION_REFRESH_EXPIRES_IN_HOURS`.

Changing a password revokes all refresh sessions for that user.
