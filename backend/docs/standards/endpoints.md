# Endpoint Standards

## 1. URL Design

### 1.1 General Rules

- Use **lowercase kebab-case** for all URL segments.
- Use **plural nouns** for resource collections. Never use verbs.
- Never end a URL with a trailing slash.
- Never include the word "get", "create", "delete" in a URL — the HTTP method carries that meaning.

```
✅  GET    /publications
✅  GET    /publications/:id
✅  POST   /publications
✅  PATCH  /publications/:id
✅  DELETE /publications/:id

❌  GET    /getPublications
❌  POST   /createPublication
❌  GET    /publication          ← singular
❌  GET    /Publications/        ← trailing slash, uppercase
```

### 1.2 Nested Resources

Use nesting only for resources that are always accessed in the context of a parent.
Limit nesting to **one level deep**.

```
✅  GET   /publications/:id/comments
✅  POST  /publications/:id/comments
✅  GET   /publications/:id/donations

❌  GET   /publications/:id/comments/:commentId/replies/:replyId   ← too deep
```

For deeply nested resources, flatten the route and accept the parent ID as a query param or body field.

### 1.3 Actions that Don't Fit CRUD

Use a sub-resource noun or a specific action segment when a true CRUD mapping doesn't apply.
Always prefer nouns over verbs, but use verbs only when there is no reasonable noun.

```
✅  POST  /donations/:id/proof-request
✅  POST  /donations/:id/proof-submission
✅  POST  /escrow/:id/release
✅  POST  /escrow/:id/dispute
✅  PATCH /notifications/read-all
```

---

## 2. HTTP Methods

| Method | Semantics | Body | Idempotent |
|---|---|---|---|
| `GET` | Read one or many resources | None | Yes |
| `POST` | Create a new resource | Required | No |
| `PATCH` | Partial update of an existing resource | Required | Yes |
| `PUT` | Full replacement of a resource | Required | Yes |
| `DELETE` | Remove a resource | None | Yes |

> `PUT` is rarely needed. Prefer `PATCH` for updates. Only use `PUT` when replacing an entire resource is semantically correct.

---

## 3. HTTP Status Codes

### Success

| Code | Name | When to use |
|---|---|---|
| `200` | OK | Successful `GET`, `PATCH`, `PUT`, `DELETE` with a response body |
| `201` | Created | Successful `POST` that creates a resource |
| `204` | No Content | Successful `DELETE` or action with no response body |

### Client Errors

| Code | Name | When to use |
|---|---|---|
| `400` | Bad Request | Invalid request body, malformed JSON, failed DTO validation |
| `401` | Unauthorized | Missing or invalid JWT token |
| `403` | Forbidden | Valid token but insufficient permissions |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Duplicate resource (e.g., username already taken) |
| `422` | Unprocessable Entity | Semantically invalid input (e.g., donation amount exceeds goal) |
| `429` | Too Many Requests | Rate limit exceeded |

### Server Errors

| Code | Name | When to use |
|---|---|---|
| `500` | Internal Server Error | Unexpected server-side failure |
| `502` | Bad Gateway | Upstream service (Supabase, Stellar) is unreachable |
| `503` | Service Unavailable | Planned maintenance or circuit breaker open |

---

## 4. API Versioning

All routes are prefixed with `/api/v1`. This is set globally in `main.ts`.

```typescript
app.setGlobalPrefix('api/v1');
```

When breaking changes are introduced in the future, a new version prefix is introduced (`/api/v2`). Old versions are kept alive for a deprecation window before removal.

---

## 5. Query Parameters

### 5.1 Filtering

Use camelCase query parameter names. Keep filter names descriptive.

```
GET /publications?category=DOG&status=ACTIVE
GET /donations?userId=abc&status=IN_ESCROW
```

### 5.2 Cursor-Based Pagination (Infinite Scroll)

The platform uses **cursor-based pagination** for feeds. Do not use offset/page-number pagination for public feeds — it does not scale and produces inconsistent results on concurrent writes.

```
GET /publications?cursor=<last_seen_id>&limit=10
```

**Response shape:**

```json
{
  "data": [...],
  "meta": {
    "nextCursor": "uuid-of-last-item",
    "hasMore": true,
    "limit": 10
  }
}
```

Rules:
- Default `limit` is `10`. Maximum allowed is `50`.
- `cursor` is the `id` (UUID) of the last item from the previous page.
- If `cursor` is absent, return the first page.
- Items are ordered by `created_at DESC` by default.

### 5.3 Sorting

```
GET /publications?sortBy=createdAt&order=desc
```

Only expose sorting on fields that have a database index. Document which fields are sortable.

---

## 6. Controller Structure

Every controller must follow this layout:

```typescript
@ApiTags('publications')                 // Swagger grouping
@Controller('publications')
export class PublicationsController {

  constructor(private readonly publicationsService: PublicationsService) {}

  @Get()
  findAll(@Query() filterDto: FilterPublicationsDto) { ... }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { ... }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createDto: CreatePublicationDto, @CurrentUser() user: JwtPayload) { ... }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdatePublicationDto) { ... }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) { ... }
}
```

Rules:
- Always use `ParseUUIDPipe` on `:id` path parameters.
- Always apply `@UseGuards(JwtAuthGuard)` on mutation endpoints (`POST`, `PATCH`, `DELETE`).
- Use `@HttpCode(HttpStatus.NO_CONTENT)` on delete endpoints.
- Always use `@ApiTags()` for Swagger grouping.
- Controllers must **not contain business logic** — delegate everything to the service.

---

## 7. Route Map Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register new user |
| `POST` | `/api/v1/auth/login` | Public | Login with credentials |
| `POST` | `/api/v1/auth/refresh` | Refresh token | Issue new access token |
| `POST` | `/api/v1/auth/logout` | JWT | Revoke refresh token |
| `GET` | `/api/v1/users/me` | JWT | Get current user profile |
| `PATCH` | `/api/v1/users/me` | JWT | Update current user profile |
| `GET` | `/api/v1/publications` | Public | List publications (paginated) |
| `GET` | `/api/v1/publications/:id` | Public | Get single publication |
| `POST` | `/api/v1/publications` | JWT | Create publication |
| `PATCH` | `/api/v1/publications/:id` | JWT | Update publication |
| `DELETE` | `/api/v1/publications/:id` | JWT | Delete publication |
| `GET` | `/api/v1/publications/:id/comments` | Public | List comments |
| `POST` | `/api/v1/publications/:id/comments` | JWT | Create comment |
| `POST` | `/api/v1/donations` | JWT | Create donation |
| `POST` | `/api/v1/donations/:id/proof-request` | JWT | Donor requests proof |
| `POST` | `/api/v1/donations/:id/proof-submission` | JWT | Fundraiser submits proof |
| `POST` | `/api/v1/escrow/:id/release` | JWT | Release escrow funds |
| `POST` | `/api/v1/escrow/:id/dispute` | JWT | Dispute escrow |
| `GET` | `/api/v1/notifications` | JWT | Get user notifications |
| `PATCH` | `/api/v1/notifications/read-all` | JWT | Mark all as read |
| `GET` | `/api/v1/categories` | Public | List animal categories |
| `POST` | `/api/v1/media/upload` | JWT | Upload file to storage |
