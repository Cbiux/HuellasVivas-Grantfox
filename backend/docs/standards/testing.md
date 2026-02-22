# Testing Standards

---

## 1. Philosophy

- Tests exist to **give confidence**, not to hit a coverage number.
- Write tests for behavior, not implementation details.
- A test that tests the wrong thing is worse than no test.
- If code is hard to test, it is a signal that the code needs to be refactored.

---

## 2. Test Types

| Type | Location | Tool | Purpose |
|---|---|---|---|
| Unit | `src/**/*.spec.ts` | Jest | Test a single class/function in isolation |
| Integration | `src/**/*.spec.ts` | Jest + Supabase test DB | Test service + repository together |
| E2E | `test/*.e2e-spec.ts` | Jest + Supertest | Test full HTTP request/response cycle |

---

## 3. Coverage Thresholds

Minimum enforced thresholds (configured in `jest` section of `package.json`):

```json
"coverageThreshold": {
  "global": {
    "branches":   70,
    "functions":  80,
    "lines":      80,
    "statements": 80
  }
}
```

Priority areas for coverage:
1. Services (business logic) — aim for **90%+**
2. Guards and interceptors — **100%**
3. Exception filter — **100%**
4. Controllers — tested via E2E, not unit tests

---

## 4. File Naming

| What is being tested | File name |
|---|---|
| `publications.service.ts` | `publications.service.spec.ts` |
| `jwt-auth.guard.ts` | `jwt-auth.guard.spec.ts` |
| `response.interceptor.ts` | `response.interceptor.spec.ts` |
| E2E for publications routes | `test/publications.e2e-spec.ts` |

The spec file lives **next to** the file it tests.

---

## 5. Unit Test Structure

Follow the **Arrange → Act → Assert** pattern inside every test.
Use `describe` blocks to group by class and method.

```typescript
// src/modules/publications/publications.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { PublicationsService } from './publications.service';
import { PublicationsRepository } from './publications.repository';
import { AppException } from '../../common/filters/http-exception.filter';
import { publicationStub } from './__stubs__/publication.stub';

describe('PublicationsService', () => {
  let service: PublicationsService;
  let repository: jest.Mocked<PublicationsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicationsService,
        {
          provide: PublicationsRepository,
          useValue: {
            findAll:  jest.fn(),
            findById: jest.fn(),
            create:   jest.fn(),
            update:   jest.fn(),
            remove:   jest.fn(),
          },
        },
      ],
    }).compile();

    service    = module.get(PublicationsService);
    repository = module.get(PublicationsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────
  describe('findById', () => {

    it('returns the publication when it exists', async () => {
      // Arrange
      const stub = publicationStub();
      repository.findById.mockResolvedValue(stub);

      // Act
      const result = await service.findById(stub.id);

      // Assert
      expect(result).toMatchObject({ id: stub.id, title: stub.title });
      expect(repository.findById).toHaveBeenCalledWith(stub.id);
      expect(repository.findById).toHaveBeenCalledTimes(1);
    });

    it('throws PUBLICATION_NOT_FOUND when publication does not exist', async () => {
      // Arrange
      repository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findById('non-existent-id'))
        .rejects
        .toThrow(AppException);

      await expect(service.findById('non-existent-id'))
        .rejects
        .toMatchObject({ code: 'PUBLICATION_NOT_FOUND' });
    });

  });
  // ─────────────────────────────────────
});
```

---

## 6. Stubs

Stubs are factory functions that return realistic test data.
They live in a `__stubs__/` folder inside the module being tested.

```typescript
// src/modules/publications/__stubs__/publication.stub.ts

import { AnimalCategory } from '../../../common/enums/animal-category.enum';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';

export const publicationStub = (overrides: Partial<Publication> = {}): Publication => ({
  id:           '550e8400-e29b-41d4-a716-446655440000',
  title:        'Operación urgente para Luna',
  description:  'Luna necesita una operación de urgencia.',
  category:     AnimalCategory.DOG,
  goalAmount:   1500,
  raisedAmount: 0,
  status:       PublicationStatus.ACTIVE,
  userId:       'user-uuid-123',
  createdAt:    new Date('2025-01-01T00:00:00.000Z'),
  updatedAt:    new Date('2025-01-01T00:00:00.000Z'),
  ...overrides,
});
```

Rules:
- Never hardcode test data inline — always use stubs.
- Stubs must cover the full shape of the entity.
- Use `overrides` to customize specific fields per test case.

---

## 7. Mocking

### 7.1 Mocking Dependencies

Always mock at the module level using `useValue` with `jest.fn()`. Do not mock at the function level with `jest.spyOn` for primary dependencies.

```typescript
// ✅ Correct — mock at module level
{
  provide: PublicationsRepository,
  useValue: {
    findById: jest.fn(),
    create:   jest.fn(),
  },
}

// ❌ Wrong — mocking after the fact is fragile
jest.spyOn(repository, 'findById').mockResolvedValue(stub);
```

### 7.2 Resetting Mocks

Always call `jest.clearAllMocks()` in `afterEach` to prevent state leaking between tests.

```typescript
afterEach(() => jest.clearAllMocks());
```

### 7.3 Asserting Calls

Always assert both the call count and the call arguments when the call itself matters:

```typescript
expect(repository.create).toHaveBeenCalledTimes(1);
expect(repository.create).toHaveBeenCalledWith(
  expect.objectContaining({ title: 'Operación urgente para Luna' }),
);
```

---

## 8. E2E Tests

E2E tests start the full NestJS application and make real HTTP requests.

```typescript
// test/publications.e2e-spec.ts

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Publications (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Apply the same global pipes/filters/interceptors as main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  describe('GET /api/v1/publications', () => {

    it('returns 200 with a paginated list', async () => {
      const { status, body } = await request(app.getHttpServer())
        .get('/api/v1/publications')
        .expect(200);

      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toHaveProperty('hasMore');
      expect(body.meta).toHaveProperty('nextCursor');
    });

    it('filters by category', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/v1/publications?category=DOG')
        .expect(200);

      body.data.forEach((pub: { category: string }) => {
        expect(pub.category).toBe('DOG');
      });
    });

  });

  describe('POST /api/v1/publications', () => {

    it('returns 401 when not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/publications')
        .send({ title: 'Test', category: 'DOG', goalAmount: 500 })
        .expect(401);
    });

  });
});
```

---

## 9. Testing Guards and Interceptors

Guards and interceptors are small, focused — they must have 100% coverage.

```typescript
// src/common/guards/jwt-auth.guard.spec.ts

describe('JwtAuthGuard', () => {
  it('allows access when a valid token is present', () => { ... });
  it('throws UnauthorizedException when no token is present', () => { ... });
  it('throws UnauthorizedException when token is expired', () => { ... });
  it('calls super.canActivate for @Public() decorated routes', () => { ... });
});
```

---

## 10. What NOT to Test

- NestJS framework internals (`app.listen`, module wiring).
- One-liner getters/setters with no logic.
- DTO class structure — the `ValidationPipe` E2E tests cover this.
- Third-party libraries (Stellar SDK, Supabase client) — mock them at the boundary.

---

## 11. Running Tests

```bash
# Run all unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:cov

# Run E2E tests
npm run test:e2e
```
