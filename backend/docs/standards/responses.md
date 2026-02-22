# Response Standards

Every response from the API — success or error — follows a consistent envelope structure.
This makes client-side handling predictable and simplifies error logging.

---

## 1. Success Response Envelope

All successful responses are wrapped in the following structure by the global `ResponseInterceptor`.

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

For **single resource** responses:

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Operación urgente para Luna",
    "category": "DOG",
    "goalAmount": 1500,
    "raisedAmount": 320,
    "status": "ACTIVE",
    "createdAt": "2025-01-14T08:00:00.000Z"
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

---

## 2. Paginated Response Envelope

Used for all list endpoints that support infinite scroll or cursor-based pagination.

```json
{
  "data": [
    { "id": "...", "title": "...", "..." : "..." },
    { "id": "...", "title": "...", "..." : "..." }
  ],
  "meta": {
    "nextCursor": "550e8400-e29b-41d4-a716-446655440099",
    "hasMore": true,
    "limit": 10,
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

When there are no more items:

```json
{
  "data": [],
  "meta": {
    "nextCursor": null,
    "hasMore": false,
    "limit": 10,
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

---

## 3. Error Response Envelope

All errors follow this structure (enforced by `HttpExceptionFilter`):

```json
{
  "error": {
    "statusCode": 400,
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      "title must not be empty",
      "goalAmount must be a positive number"
    ],
    "timestamp": "2025-01-15T10:30:00.000Z",
    "path": "/api/v1/publications"
  }
}
```

For non-validation errors (404, 403, 500...):

```json
{
  "error": {
    "statusCode": 404,
    "code": "PUBLICATION_NOT_FOUND",
    "message": "Publication with id 'abc' not found",
    "details": null,
    "timestamp": "2025-01-15T10:30:00.000Z",
    "path": "/api/v1/publications/abc"
  }
}
```

Rules:
- `statusCode` always mirrors the HTTP status code.
- `code` is a SCREAMING_SNAKE_CASE string identifier (see [error-handling.md](error-handling.md)).
- `message` is a human-readable summary.
- `details` is an array of strings for validation errors, or `null` for single-message errors.
- `path` is the request path that triggered the error.

---

## 4. Response Interceptor Implementation

```typescript
// src/common/interceptors/response.interceptor.ts

import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, StandardResponse<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<StandardResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the service already returns a paginated shape, preserve meta
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return {
            data: data.data,
            meta: { ...data.meta, timestamp: new Date().toISOString() },
          };
        }
        return {
          data,
          meta: { timestamp: new Date().toISOString() },
        };
      }),
    );
  }
}
```

Register globally in `main.ts`:

```typescript
app.useGlobalInterceptors(new ResponseInterceptor());
```

---

## 5. Paginated Response DTO

```typescript
// src/common/dto/paginated-response.dto.ts

export class PaginatedResponseDto<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}
```

Services must return this shape for all list operations:

```typescript
// publications.service.ts

async findAll(filterDto: FilterPublicationsDto): Promise<PaginatedResponseDto<PublicationResponseDto>> {
  // ... query Supabase ...
  return {
    data: plainToInstance(PublicationResponseDto, rows, { excludeExtraneousValues: true }),
    meta: {
      nextCursor: rows.at(-1)?.id ?? null,
      hasMore: rows.length === filterDto.limit,
      limit: filterDto.limit,
    },
  };
}
```

---

## 6. No-Content Responses

For `DELETE` endpoints, return HTTP `204` with no body.
Do **not** wrap `null` in the response envelope.

```typescript
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
  await this.publicationsService.remove(id);
}
```

---

## 7. Timestamps and Dates

- All timestamps in responses are in **ISO 8601 format** with UTC timezone.
- Example: `"2025-01-15T10:30:00.000Z"`
- Never return Unix timestamps (seconds or milliseconds) in response bodies.
- Database columns store timestamps in UTC; the backend must not apply any timezone conversion.
