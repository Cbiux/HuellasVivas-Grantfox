# DTO Standards

DTOs (Data Transfer Objects) define the shape of data entering and leaving the API.
They are the **first line of defense** against invalid input.

---

## 1. Naming Conventions

| Purpose | Suffix | Example |
|---|---|---|
| Create resource | `Create<Resource>Dto` | `CreatePublicationDto` |
| Update resource (partial) | `Update<Resource>Dto` | `UpdatePublicationDto` |
| Filter / query params | `Filter<Resource>Dto` | `FilterPublicationsDto` |
| API response shape | `<Resource>ResponseDto` | `PublicationResponseDto` |
| Auth-specific | descriptive name | `LoginDto`, `RegisterDto`, `AuthTokensDto` |

---

## 2. Required Packages

```bash
npm install class-validator class-transformer
```

Enable global validation pipe in `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,       // Strip properties not in the DTO
    forbidNonWhitelisted: true,  // Throw if unknown properties are sent
    transform: true,       // Auto-transform payloads to DTO class instances
    transformOptions: {
      enableImplicitConversion: true,  // Convert query param strings to numbers/booleans
    },
  }),
);
```

---

## 3. Input DTOs (Create / Update)

### 3.1 CreateDto

All fields that are **required to create** a resource must be present and validated.

```typescript
// src/modules/publications/dto/create-publication.dto.ts

import { IsString, IsNotEmpty, IsNumber, IsEnum, Min, MaxLength } from 'class-validator';
import { AnimalCategory } from '../../../common/enums/animal-category.enum';

export class CreatePublicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @IsEnum(AnimalCategory)
  category: AnimalCategory;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  goalAmount: number;
}
```

Rules:
- Every field must have **at least one validator**.
- Always validate string length with `@MaxLength()` to prevent payload bloat.
- Use `@IsEnum()` for fields backed by an enum — never accept raw strings for typed values.
- Use `@IsNotEmpty()` in addition to `@IsString()` to reject empty strings.
- Use `@IsOptional()` only when the field is truly optional for creation.

### 3.2 UpdateDto

Always extend `PartialType` from the `CreateDto`. This makes all fields optional and inherits all validators — no duplication.

```typescript
// src/modules/publications/dto/update-publication.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { CreatePublicationDto } from './create-publication.dto';

export class UpdatePublicationDto extends PartialType(CreatePublicationDto) {}
```

> Do not manually re-declare fields from `CreatePublicationDto` in the `UpdateDto`.

---

## 4. Query / Filter DTOs

Used for `@Query()` parameters. All fields must be optional since query params are never required.

```typescript
// src/modules/publications/dto/filter-publications.dto.ts

import { IsEnum, IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AnimalCategory } from '../../../common/enums/animal-category.enum';
import { PublicationStatus } from '../../../common/enums/publication-status.enum';

export class FilterPublicationsDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(AnimalCategory)
  category?: AnimalCategory;

  @IsOptional()
  @IsEnum(PublicationStatus)
  status?: PublicationStatus;
}
```

Rules:
- Use `@Type(() => Number)` with `@IsInt()` for numeric query params — they arrive as strings.
- Provide default values directly in the class property definition.
- Always cap numeric pagination fields with `@Max()`.

---

## 5. Response DTOs

Response DTOs control **exactly what data is returned** to the client.
They prevent accidental exposure of sensitive fields.

```typescript
// src/modules/publications/dto/publication-response.dto.ts

import { Expose, Type } from 'class-transformer';
import { UserSummaryDto } from '../../users/dto/user-response.dto';

export class PublicationResponseDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() description: string;
  @Expose() category: string;
  @Expose() goalAmount: number;
  @Expose() raisedAmount: number;
  @Expose() status: string;
  @Expose() createdAt: Date;

  @Expose()
  @Type(() => UserSummaryDto)
  author: UserSummaryDto;

  // NOT exposed: internal fields like supabase row metadata, etc.
}
```

```typescript
// src/modules/users/dto/user-response.dto.ts

export class UserSummaryDto {
  @Expose() id: string;
  @Expose() username: string;
  @Expose() avatarUrl: string;

  // NOT exposed: passwordHash, encryptedSecretKey, refreshTokens
}
```

Rules:
- Use `@Expose()` on every field you want to return — anything without `@Expose()` is stripped.
- **Never expose**: `password_hash`, `encrypted_secret_key`, internal DB metadata.
- Use `@Type()` for nested objects to trigger recursive transformation.
- Use `plainToInstance(ResponseDto, data, { excludeExtraneousValues: true })` in the service layer.

---

## 6. Validation Decorators Reference

| Decorator | Use case |
|---|---|
| `@IsString()` | Value must be a string |
| `@IsNotEmpty()` | Value must not be an empty string |
| `@IsEmail()` | Value must be a valid email address |
| `@IsUUID()` | Value must be a valid UUID v4 |
| `@IsEnum(Enum)` | Value must be one of the enum members |
| `@IsNumber()` | Value must be a number |
| `@IsInt()` | Value must be an integer |
| `@IsBoolean()` | Value must be a boolean |
| `@IsOptional()` | Field is optional; skip validation if absent |
| `@IsUrl()` | Value must be a valid URL |
| `@IsDateString()` | Value must be an ISO 8601 date string |
| `@IsArray()` | Value must be an array |
| `@ArrayMaxSize(n)` | Array must not exceed n elements |
| `@Min(n)` | Number must be >= n |
| `@Max(n)` | Number must be <= n |
| `@MinLength(n)` | String must be >= n characters |
| `@MaxLength(n)` | String must be <= n characters |
| `@Matches(regex)` | String must match the regular expression |

---

## 7. Custom Validators

For complex validations not covered by the built-in decorators, create a custom validator inside the relevant module's `dto/` folder.

```typescript
// src/modules/donations/dto/validators/positive-amount.validator.ts

import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsPositiveAmount(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isPositiveAmount',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return typeof value === 'number' && value > 0 && Number.isFinite(value);
        },
        defaultMessage() {
          return 'Amount must be a finite positive number';
        },
      },
    });
  };
}
```

---

## 8. DTO File Location

Each DTO lives inside the `dto/` subfolder of the module that owns it.

```
src/modules/publications/
└── dto/
    ├── create-publication.dto.ts
    ├── update-publication.dto.ts
    ├── filter-publications.dto.ts
    └── publication-response.dto.ts
```

Shared DTOs (like `PaginationDto`) live in `src/common/dto/`.

---

## 9. Checklist Before Submitting a DTO

- [ ] Every input field has at least one validator
- [ ] String fields have `@MaxLength()`
- [ ] Numeric fields have `@Min()` and, where applicable, `@Max()`
- [ ] Enum fields use `@IsEnum()` instead of `@IsString()`
- [ ] Optional fields are marked `@IsOptional()`
- [ ] `UpdateDto` extends `PartialType(CreateDto)` — no field duplication
- [ ] Response DTO never exposes sensitive fields
- [ ] File is named in kebab-case and placed in the correct `dto/` folder
