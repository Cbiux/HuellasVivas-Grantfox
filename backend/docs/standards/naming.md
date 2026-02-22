# Naming Conventions

Consistent naming makes a codebase scannable and approachable for new contributors.
These conventions apply to every file in the project.

---

## 1. Files and Folders

| Thing | Convention | Example |
|---|---|---|
| All source files | `kebab-case` | `publications.service.ts` |
| Folders | `kebab-case` | `trustless-work/` |
| Spec files | same name as source + `.spec` | `publications.service.spec.ts` |
| Stub files | `<resource>.stub.ts` inside `__stubs__/` | `publication.stub.ts` |
| Migration files | `YYYYMMDDHHMMSS_<description>.sql` | `20250115120000_create_users.sql` |
| Enum files | `<name>.enum.ts` | `animal-category.enum.ts` |
| Interface files | `<name>.interface.ts` | `jwt-payload.interface.ts` |
| Type files | `<name>.types.ts` | `stellar.types.ts` |
| Constant files | `<name>.constants.ts` | `stellar.constants.ts` |

---

## 2. TypeScript Constructs

### Classes

PascalCase. Class names must describe **what** the class is, not what it does.

```typescript
✅  class PublicationsService
✅  class CreatePublicationDto
✅  class JwtAuthGuard
✅  class HttpExceptionFilter

❌  class publicationsService      ← camelCase
❌  class handlePublication        ← verb-first
❌  class Pub                      ← abbreviation
```

### Interfaces

PascalCase. Do **not** prefix with `I` (this is a Go convention, not a TypeScript convention).

```typescript
✅  interface JwtPayload
✅  interface PaginatedResponse<T>

❌  interface IJwtPayload          ← I-prefix
```

### Enums

PascalCase for the enum name. SCREAMING_SNAKE_CASE for all member values.

```typescript
✅
export enum AnimalCategory {
  DOG    = 'DOG',
  CAT    = 'CAT',
  RABBIT = 'RABBIT',
  OTHER  = 'OTHER',
}

❌
export enum animalCategory {    ← camelCase name
  dog    = 'dog',               ← lowercase values
  Cat    = 'cat',               ← mixed case values
}
```

Enum values must be **strings**, not numbers.
This makes database storage and API payloads human-readable and avoids magic numbers.

### Types

PascalCase. Use `type` for unions, intersections, and mapped types.
Use `interface` for object shapes that may be extended.

```typescript
type DonationStatus = 'PENDING' | 'IN_ESCROW' | 'RELEASED';   // union
type AuthTokens = { accessToken: string; refreshToken: string }; // object shape → prefer interface
```

### Constants

SCREAMING_SNAKE_CASE for module-level constants.
camelCase is acceptable for local constants inside a function scope.

```typescript
// Module-level
export const STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const JWT_ACCESS_EXPIRY          = '15m';
export const MAX_UPLOAD_SIZE_BYTES      = 5 * 1024 * 1024; // 5 MB

// Local scope — camelCase is fine
const maxRetries = 3;
```

---

## 3. Variables and Parameters

camelCase for all variables, function parameters, and object properties.

```typescript
✅  const userId = 'abc-123';
✅  const raisedAmount = 500;
✅  function findById(publicationId: string) { ... }

❌  const user_id = 'abc-123';      ← snake_case
❌  const RaisedAmount = 500;       ← PascalCase
❌  const raised-amount = 500;      ← kebab-case (invalid)
```

### Booleans

Boolean variables must start with `is`, `has`, `can`, `should`, or `was`.

```typescript
✅  const isCompleted = true;
✅  const hasProofBeenSubmitted = false;
✅  const canReleaseEscrow = true;

❌  const completed = true;
❌  const proofSubmitted = false;
```

### Arrays

Use a plural noun that describes the element type.

```typescript
✅  const publications: Publication[] = [];
✅  const userIds: string[] = [];

❌  const publicationList = [];     ← "list" suffix is redundant
❌  const arr = [];                 ← meaningless name
```

---

## 4. Functions and Methods

camelCase. Functions must describe **what they do**, ideally starting with a verb.

```typescript
✅  async findAll()
✅  async findById(id: string)
✅  async createPublication(dto: CreatePublicationDto)
✅  async releaseEscrowFunds(escrowId: string)
✅  private buildTransactionEnvelope()

❌  async publication()             ← noun, not descriptive
❌  async getPublicationById()      ← "get" prefix is implicit; use "find" or "fetch"
❌  async data()                    ← meaningless
```

**Preferred verb prefixes:**

| Verb | When to use |
|---|---|
| `find` | Query for one or more records (may return null/undefined) |
| `get` | Retrieve something that is expected to always exist (throws if not found) |
| `create` | Create a new resource |
| `update` | Modify an existing resource |
| `remove` | Delete a resource |
| `build` | Construct an object or value without side effects |
| `generate` | Produce a value algorithmically (key, token, nonce) |
| `send` | Dispatch a message, email, or transaction |
| `emit` | Emit a domain event |
| `validate` | Check validity and throw if invalid |
| `is` / `has` / `can` | Predicate — returns boolean |

---

## 5. NestJS-Specific Names

| Thing | Convention | Example |
|---|---|---|
| Module | `<Feature>Module` | `PublicationsModule` |
| Controller | `<Feature>Controller` | `PublicationsController` |
| Service | `<Feature>Service` | `PublicationsService` |
| Repository | `<Feature>Repository` | `PublicationsRepository` |
| Guard | `<Name>Guard` | `JwtAuthGuard` |
| Interceptor | `<Name>Interceptor` | `ResponseInterceptor` |
| Filter | `<Name>Filter` | `HttpExceptionFilter` |
| Pipe | `<Name>Pipe` | `ParseUUIDPipe` |
| Decorator | `<name>` (camelCase) | `currentUser`, `public` |
| Strategy | `<Name>Strategy` | `JwtStrategy`, `JwtRefreshStrategy` |

---

## 6. Database Columns vs TypeScript Properties

Database columns use `snake_case`. TypeScript properties use `camelCase`.
The repository layer is responsible for mapping between them.

```
Database column      TypeScript property
──────────────────   ───────────────────
user_id           →  userId
goal_amount       →  goalAmount
raised_amount     →  raisedAmount
created_at        →  createdAt
password_hash     →  passwordHash
```

---

## 7. Event Names (EventEmitter2)

Event names use `<domain>.<action>` format in dot-notation, all lowercase.

```typescript
✅  'donation.completed'
✅  'donation.proof-requested'
✅  'publication.goal-reached'
✅  'escrow.released'

❌  'DONATION_COMPLETED'       ← uppercase
❌  'donationCompleted'        ← camelCase
```
