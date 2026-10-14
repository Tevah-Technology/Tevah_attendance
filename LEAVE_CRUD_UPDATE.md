# Leave CRUD update

Added backend endpoint:

`PUT /api/leaves/:id`

Permission: `leave.requests.edit`

Behavior:
- Only PENDING leave requests can be edited.
- Employee scope is enforced.
- Dates, duration, leave type, half-day data, and reason are revalidated.
- Leave-balance validation excludes the leave request being edited so the current pending request is not double-counted.

Existing endpoints used by the updated frontend:
- DELETE `/api/leaves/:id`
- PUT `/api/leave-types/:id`
- DELETE `/api/leave-types/:id`
