# Error Handling Standards

---

## 1. Global Exception Filter

All unhandled exceptions are caught by the `HttpExceptionFilter` registered globally in `main.ts`.
It normalizes every error into the standard error envelope (see [responses.md](responses.md)).

```typescript
// src/common/filters/http-exception.filter.ts

import {
  ArgumentsHost, Catch, ExceptionFilter,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    const isHttp   = exception instanceof HttpException;
    const status   = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttp ? exception.getResponse() : null;

    const message = isHttp
      ? (typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>)['message'] ?? 'An error occurred')
      : 'Internal server error';

    const details = Array.isArray(message) ? message : null;
    const singleMessage = Array.isArray(message) ? 'Validation failed' : message;

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      error: {
        statusCode: status,
        code: this.resolveCode(exception, status),
        message: singleMessage,
        details: details as string[] | null,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }

  private resolveCode(exception: unknown, status: number): string {
    if (exception instanceof AppException) return exception.code;
    if (status === 400)  return 'VALIDATION_ERROR';
    if (status === 401)  return 'UNAUTHORIZED';
    if (status === 403)  return 'FORBIDDEN';
    if (status === 404)  return 'NOT_FOUND';
    if (status === 409)  return 'CONFLICT';
    if (status === 422)  return 'UNPROCESSABLE';
    if (status === 429)  return 'RATE_LIMIT_EXCEEDED';
    return 'INTERNAL_SERVER_ERROR';
  }
}
```

Register in `main.ts`:

```typescript
app.useGlobalFilters(new HttpExceptionFilter());
```

---

## 2. Application Exception Class

For domain-specific errors, use `AppException` — a custom class that extends `HttpException`
and carries a typed error `code`.

```typescript
// src/common/filters/http-exception.filter.ts  (or a separate file)

import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}
```

---

## 3. Error Codes Reference

Error codes are SCREAMING_SNAKE_CASE strings that identify the exact error type.
They are stable across API versions — clients may depend on them.

### Auth

| Code | HTTP | Description |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Username or password is incorrect |
| `TOKEN_EXPIRED` | 401 | JWT access token has expired |
| `TOKEN_INVALID` | 401 | JWT is malformed or signature is wrong |
| `REFRESH_TOKEN_INVALID` | 401 | Refresh token not found or revoked |
| `ACCOUNT_NOT_FOUND` | 404 | No account matches the given username |

### Users

| Code | HTTP | Description |
|---|---|---|
| `USERNAME_TAKEN` | 409 | Username is already registered |
| `EMAIL_TAKEN` | 409 | Email is already registered |
| `USER_NOT_FOUND` | 404 | User ID does not exist |

### Publications

| Code | HTTP | Description |
|---|---|---|
| `PUBLICATION_NOT_FOUND` | 404 | Publication ID does not exist |
| `PUBLICATION_NOT_OWNED` | 403 | User does not own this publication |
| `PUBLICATION_ALREADY_COMPLETED` | 409 | Publication goal already reached |

### Donations

| Code | HTTP | Description |
|---|---|---|
| `DONATION_NOT_FOUND` | 404 | Donation ID does not exist |
| `DONATION_NOT_OWNED` | 403 | User is not the donor of this donation |
| `AMOUNT_INVALID` | 422 | Donation amount must be a positive number |
| `SELF_DONATION` | 422 | User cannot donate to their own publication |

### Escrow

| Code | HTTP | Description |
|---|---|---|
| `ESCROW_NOT_FOUND` | 404 | Escrow record does not exist |
| `ESCROW_ALREADY_RELEASED` | 409 | Funds have already been released |
| `ESCROW_DISPUTED` | 409 | Escrow is under dispute, cannot release |
| `PROOF_NOT_SUBMITTED` | 422 | Cannot release escrow without submitted proof |
| `NONCE_INVALID` | 422 | Transaction nonce is expired or already used |
| `STELLAR_TRANSACTION_FAILED` | 502 | Stellar network rejected the transaction |

### Media

| Code | HTTP | Description |
|---|---|---|
| `FILE_TOO_LARGE` | 400 | Uploaded file exceeds the size limit |
| `FILE_TYPE_NOT_ALLOWED` | 400 | File MIME type is not accepted |
| `UPLOAD_FAILED` | 502 | Supabase Storage upload failed |

---

## 4. Throwing Errors in Services

Always throw `AppException` with the appropriate code and HTTP status.
**Never** throw generic `Error` objects — they produce unformatted 500 responses.

```typescript
// ✅ Correct
import { AppException } from '../../common/filters/http-exception.filter';
import { HttpStatus } from '@nestjs/common';

const publication = await this.publicationsRepository.findById(id);
if (!publication) {
  throw new AppException('PUBLICATION_NOT_FOUND', `Publication '${id}' not found`, HttpStatus.NOT_FOUND);
}

if (publication.userId !== currentUserId) {
  throw new AppException('PUBLICATION_NOT_OWNED', 'You do not own this publication', HttpStatus.FORBIDDEN);
}

// ❌ Wrong
throw new Error('not found');
throw new HttpException('not found', 404);  // No typed code
```

---

## 5. Logging Rules

| Error level | When |
|---|---|
| `logger.error()` | 5xx errors, unexpected exceptions, blockchain failures |
| `logger.warn()` | 4xx errors that indicate potential abuse (401, 403, 429) |
| `logger.log()` | Normal informational events |
| `logger.debug()` | Detailed tracing — development only, never in production |

Use NestJS built-in `Logger`. Never use `console.log` or `console.error` in committed code.

```typescript
// ✅ Correct
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PublicationsService {
  private readonly logger = new Logger(PublicationsService.name);

  async create(dto: CreatePublicationDto): Promise<PublicationResponseDto> {
    this.logger.log(`Creating publication: ${dto.title}`);
    // ...
  }
}

// ❌ Wrong
console.log('Creating publication');
```

---

## 6. Never Swallow Exceptions

Do not catch exceptions without re-throwing or logging.

```typescript
// ❌ Wrong — exception is silently swallowed
try {
  await this.stellarService.sendTransaction(tx);
} catch (_e) {
  return null;
}

// ✅ Correct — catch, log, re-throw as domain error
try {
  await this.stellarService.sendTransaction(tx);
} catch (error) {
  this.logger.error('Stellar transaction failed', error);
  throw new AppException('STELLAR_TRANSACTION_FAILED', 'Could not process blockchain transaction', HttpStatus.BAD_GATEWAY);
}
```
