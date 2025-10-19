# API Specification - Zero-to-One Builder

## Design Philosophy

This API follows OpenAI's API design patterns as the source of truth, ensuring consistency with industry-standard REST practices.

## Core Principles

### 1. Response Format (OpenAI Standard)

**Success Response:**

```json
{
  "id": "resource_id",
  "object": "resource_type",
  ...resource_fields
}
```

**List Response:**

```json
{
  "object": "list",
  "data": [...],
  "has_more": false
}
```

**Deletion Response:**

```json
{
  "id": "resource_id",
  "object": "resource_type.deleted",
  "deleted": true
}
```

**Error Response:**

```json
{
  "error": {
    "message": "Human-readable error message",
    "type": "error_type",
    "param": "parameter_name",
    "code": "error_code"
  }
}
```

### 2. Error Types

- `invalid_request_error` - Validation errors, missing parameters, malformed input
- `authentication_error` - API key issues
- `permission_denied` - Authorization failures
- `not_found_error` - Resource doesn't exist
- `rate_limit_error` - Too many requests
- `internal_server_error` - Server-side errors
- `service_unavailable_error` - Database or external service errors

### 3. HTTP Status Codes

- `200 OK` - Successful GET, POST (actions), PATCH
- `201 Created` - Successful resource creation (POST)
- `204 No Content` - Successful DELETE (when no body returned)
- `400 Bad Request` - Validation errors
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Business rule violations
- `404 Not Found` - Resource doesn't exist
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Unexpected errors
- `503 Service Unavailable` - Database/external service errors

### 4. URL Structure

```
# Resource Collections
GET    /api/{resources}              # List all
POST   /api/{resources}              # Create new

# Single Resource
GET    /api/{resources}/{id}         # Get one
PATCH  /api/{resources}/{id}         # Update
DELETE /api/{resources}/{id}         # Delete

# Nested Resources (ALWAYS nest under parent)
GET    /api/{parent}/{parentId}/{children}
POST   /api/{parent}/{parentId}/{children}

# Resource Actions
POST   /api/{resources}/{id}/{action}
```

### 5. Naming Conventions

- **URLs**: kebab-case for multi-word resources (`/artifact-actions`)
- **Parameters**: snake_case for request/response fields (`project_id`, `max_tokens`)
- **IDs**: camelCase in URL parameters (`:projectId`, `:threadId`)
- **Object types**: dot notation for events (`artifact.deleted`, `thread.created`)

---

## API Endpoints

### Projects

| Method   | Endpoint                                       | Description                     | Status |
| -------- | ---------------------------------------------- | ------------------------------- | ------ |
| `POST`   | `/api/projects`                                | Create a new project            | 201    |
| `GET`    | `/api/projects`                                | List all projects               | 200    |
| `GET`    | `/api/projects/:projectId`                     | Get project details             | 200    |
| `PATCH`  | `/api/projects/:projectId`                     | Update project                  | 200    |
| `DELETE` | `/api/projects/:projectId`                     | Delete project                  | 200    |
| `POST`   | `/api/projects/:projectId/execute-step`        | Execute AI-guided step          | 200    |
| `POST`   | `/api/projects/:projectId/execute-step/stream` | Execute step with streaming     | 200    |
| `POST`   | `/api/projects/:projectId/complete-substep`    | Mark substep complete           | 200    |
| `POST`   | `/api/projects/:projectId/expand`              | Expand phase with master prompt | 200    |

**Nested Resources:**

- `GET /api/projects/:projectId/threads` - List threads for project
- `GET /api/projects/:projectId/checkpoints` - List checkpoints for project
- `GET /api/projects/:projectId/artifacts` - List artifacts for project

---

### Threads

| Method   | Endpoint                          | Description         | Status |
| -------- | --------------------------------- | ------------------- | ------ |
| `POST`   | `/api/threads`                    | Create a new thread | 201    |
| `GET`    | `/api/threads/:threadId`          | Get thread details  | 200    |
| `DELETE` | `/api/threads/:threadId`          | Delete thread       | 200    |
| `GET`    | `/api/threads/:threadId/messages` | Get thread messages | 200    |

**Deprecated:**

- `GET /api/threads/project/:projectId` → Use `GET /api/projects/:projectId/threads`

---

### Artifacts

| Method | Endpoint                     | Description                   | Status |
| ------ | ---------------------------- | ----------------------------- | ------ |
| `POST` | `/api/artifacts/upload`      | Upload file for analysis      | 200    |
| `POST` | `/api/artifacts/repo`        | Clone and analyze GitHub repo | 200    |
| `GET`  | `/api/artifacts/:artifactId` | Get artifact details          | 200    |

**Deprecated:**

- `GET /api/artifacts/project/:projectId` → Use `GET /api/projects/:projectId/artifacts`

---

### Artifact Actions

| Method | Endpoint                                           | Description                    | Status |
| ------ | -------------------------------------------------- | ------------------------------ | ------ |
| `POST` | `/api/artifact-actions/apply-analysis/:artifactId` | Apply LLM analysis to roadmap  | 200    |
| `GET`  | `/api/artifact-actions/status/:artifactId`         | Check artifact analysis status | 200    |

---

### Checkpoints

| Method   | Endpoint                                                    | Description            | Status |
| -------- | ----------------------------------------------------------- | ---------------------- | ------ |
| `POST`   | `/api/checkpoints`                                          | Create a checkpoint    | 201    |
| `GET`    | `/api/checkpoints/:checkpointId`                            | Get checkpoint details | 200    |
| `POST`   | `/api/checkpoints/:checkpointId/restore`                    | Restore to checkpoint  | 200    |
| `GET`    | `/api/checkpoints/:checkpointId/compare/:otherCheckpointId` | Compare checkpoints    | 200    |
| `DELETE` | `/api/checkpoints/:checkpointId`                            | Delete checkpoint      | 200    |

**Deprecated:**

- `GET /api/checkpoints/project/:projectId` → Use `GET /api/projects/:projectId/checkpoints`

---

## Request/Response Examples

### Create Project

**Request:**

```http
POST /api/projects
Content-Type: application/json

{
  "goal": "Build a task management app"
}
```

**Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "object": "project",
  "goal": "Build a task management app",
  "status": "active",
  "current_phase": 1,
  "current_substep": 1,
  "phases": [],
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
```

---

### List Threads for Project

**Request:**

```http
GET /api/projects/550e8400-e29b-41d4-a716-446655440000/threads
```

**Response (200 OK):**

```json
{
  "object": "list",
  "data": [
    {
      "id": "thread_abc123",
      "object": "thread",
      "project_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Main conversation",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

### Error Example

**Request:**

```http
GET /api/threads/nonexistent_id
```

**Response (404 Not Found):**

```json
{
  "error": {
    "message": "Thread not found",
    "type": "invalid_request_error",
    "param": "threadId",
    "code": "resource_not_found"
  }
}
```

---

## Validation Rules

### Common Validations

1. **project_id**: Required, must be valid UUID string
2. **goal**: Required, 5-500 characters
3. **thread title**: Optional, 3-100 characters if provided
4. **checkpoint name**: Required, minimum 3 characters

### Request Parameters

- **snake_case** for all request body fields
- **camelCase** for URL parameters
- All IDs should be UUIDs (except legacy integer IDs)

---

## Rate Limiting

| Endpoint Type     | Limit                     |
| ----------------- | ------------------------- |
| General mutations | 100 requests / 15 minutes |
| AI operations     | 10 requests / minute      |
| Uploads           | 20 requests / 15 minutes  |

**Rate Limit Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642245000
```

**Rate Limit Error (429):**

```json
{
  "error": {
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}
```

---

## Migration Guide

### For Frontend Clients

Replace old endpoints with new ones:

```javascript
// OLD
GET /api/threads/project/:projectId

// NEW
GET /api/projects/:projectId/threads
```

### Error Handling

Update error parsing:

```javascript
// OLD
if (response.error) {
  console.error(response.error);
}

// NEW
if (response.error) {
  console.error(response.error.message);
  console.log("Error code:", response.error.code);
  console.log("Error type:", response.error.type);
}
```

### Response Parsing

Update success response handling:

```javascript
// OLD
const threads = response.threads;

// NEW
const threads = response.data;
```

---

## Future Enhancements

1. **Pagination**: Add `limit`, `offset`, `after` parameters to list endpoints
2. **Field Selection**: Support `?fields=id,name` query parameter
3. **Sorting**: Support `?sort=created_at:desc`
4. **Filtering**: Support `?status=active&phase=P2`
5. **Webhooks**: Event notifications for async operations
6. **Batch Operations**: `/api/batch` endpoint for multiple operations
7. **API Versioning**: `/v1/projects` for backwards compatibility

---

## References

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference/responses)
- [REST API Best Practices](https://restfulapi.net/)
- [HTTP Status Codes](https://httpstatuses.com/)
