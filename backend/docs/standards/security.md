# Security Standards

---

## 1. Authentication Flow

### 1.1 Registration

1. Client sends `POST /api/v1/auth/register` with `{ username, email, password, firstName, lastName }`.
2. Backend validates all fields via `RegisterDto`.
3. Check for duplicate `username` and `email` — throw `409 CONFLICT` if taken.
4. Hash the password with **bcrypt** at cost factor `12`.
5. Insert the user into the `users` table.
6. **In background**: generate a Stellar keypair, encrypt the `secretKey`, save to `wallets`.
7. Return `201 Created` with no tokens — client must log in separately.

### 1.2 Login

1. Client sends `POST /api/v1/auth/login` with `{ username, password }`.
2. Look up the user by `username`.
3. Verify password against `password_hash` with `bcrypt.compare()`.
4. On success, issue:
   - **Access token** — JWT, signed with RS256, TTL `15 minutes`.
   - **Refresh token** — opaque random string (`crypto.randomBytes(64).toString('hex')`), hashed and stored in `refresh_tokens` table, TTL `7 days`.
5. Return both tokens in the response body.

### 1.3 Token Refresh

1. Client sends `POST /api/v1/auth/refresh` with the refresh token in `Authorization: Bearer <token>`.
2. Look up the hashed refresh token in the database — validate it is not expired or revoked.
3. Issue a new access token and a new refresh token (rotation).
4. Invalidate the old refresh token.

### 1.4 Logout

1. Client sends `POST /api/v1/auth/logout`.
2. Delete the current refresh token from the database.

---

## 2. JWT Standards

### 2.1 Algorithm

Use **RS256** (asymmetric) — not HS256. This allows the frontend and other services to verify
tokens without sharing the secret.

```typescript
JwtModule.registerAsync({
  useFactory: (config: ConfigService) => ({
    privateKey: config.get('JWT_PRIVATE_KEY'),  // PEM format
    publicKey:  config.get('JWT_PUBLIC_KEY'),   // PEM format
    signOptions: {
      algorithm:  'RS256',
      expiresIn:  '15m',
      issuer:     'huellas-vivas-api',
      audience:   'huellas-vivas-client',
    },
  }),
  inject: [ConfigService],
}),
```

Generate keypair:

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
```

Store the key contents in environment variables (not files) in production.

### 2.2 JWT Payload

Keep the payload **minimal**. Never store sensitive data in JWT payloads — they are base64-encoded, not encrypted.

```typescript
// src/common/interfaces/jwt-payload.interface.ts

export interface JwtPayload {
  sub:      string;   // User UUID
  username: string;
  iat:      number;   // Issued at
  exp:      number;   // Expiration
}
```

### 2.3 Access Guard Usage

All mutation endpoints (`POST`, `PATCH`, `DELETE`) must be protected with `JwtAuthGuard`.
Apply `@Public()` only to routes that are intentionally public.

```typescript
// Protecting a route
@Post()
@UseGuards(JwtAuthGuard)
create(@Body() dto: CreatePublicationDto) { ... }

// Marking a route as explicitly public
@Get()
@Public()
findAll() { ... }
```

---

## 3. Password Handling

### 3.1 Hashing

Always use `bcrypt` with cost factor `12`.

```typescript
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

// Hashing (on registration)
const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

// Verification (on login)
const isMatch = await bcrypt.compare(plainPassword, storedHash);
```

### 3.2 Forbidden Practices

- **Never** store plain-text passwords.
- **Never** log passwords, tokens, or secret keys — not even partially.
- **Never** return `password_hash` in any API response.
- **Never** compare passwords with `===` — always use `bcrypt.compare()`.

---

## 4. Stellar Secret Key Encryption

User Stellar secret keys (`S...`) are generated on registration and must be stored encrypted.
They are only decrypted in memory when the backend needs to sign a transaction.

### 4.1 Encryption at Rest

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export function encryptSecretKey(secretKey: string, encryptionKey: Buffer): string {
  const iv         = randomBytes(16);
  const cipher     = createCipheriv(ALGORITHM, encryptionKey, iv);
  const encrypted  = Buffer.concat([cipher.update(secretKey, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  // Store as: iv:authTag:ciphertext (all base64)
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecretKey(stored: string, encryptionKey: Buffer): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(':');
  const iv         = Buffer.from(ivB64, 'base64');
  const authTag    = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
```

`WALLET_ENCRYPTION_KEY` must be a 32-byte key stored as a hex string in the environment.

### 4.2 Key in Environment

```env
WALLET_ENCRYPTION_KEY=your_64_char_hex_string_here   # 32 bytes = 64 hex chars
```

Generate securely:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. Input Validation and Sanitization

### 5.1 Global ValidationPipe

The global `ValidationPipe` (see [dtos.md](dtos.md)) is the primary line of defense:
- `whitelist: true` — strips any property not declared in the DTO.
- `forbidNonWhitelisted: true` — throws `400` if unexpected properties are present.
- `transform: true` — converts raw strings to typed values.

### 5.2 SQL Injection

Supabase's client library uses parameterized queries internally.
**Never** use string interpolation to build raw SQL strings.

```typescript
// ✅ Safe — Supabase handles parameterization
.eq('username', username)
.filter('category', 'eq', category)

// ❌ Dangerous — never do this
.rpc(`SELECT * FROM users WHERE username = '${username}'`)
```

### 5.3 File Uploads

Enforce MIME type and file size limits in `MediaService`:

```
Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
Max file size:      5 MB
```

---

## 6. Rate Limiting

Apply rate limiting globally to prevent brute-force and abuse.

```typescript
import * as rateLimit from 'express-rate-limit';

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max:      100,               // 100 requests per window per IP
    message:  { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
  }),
);
```

Tighter limits for auth endpoints:

```typescript
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));
```

---

## 7. Security Headers

Apply `helmet` globally to set secure HTTP headers:

```typescript
import helmet from 'helmet';
app.use(helmet());
```

This sets: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Strict-Transport-Security`, `Referrer-Policy`, and others automatically.

---

## 8. CORS

Configure CORS explicitly. Do not use wildcard `*` in production.

```typescript
app.enableCors({
  origin:      config.get('ALLOWED_ORIGINS').split(','),
  methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});
```

---

## 9. Environment Variables Security

- **Never** commit `.env` files to version control.
- **Never** log environment variable values at startup.
- Validate all required environment variables on bootstrap using `Joi` schema validation in `ConfigModule`.
- Separate keys by environment: development, staging, production each have their own key sets.

```typescript
// src/config/config.module.ts — validation schema example
const envSchema = Joi.object({
  PORT:                   Joi.number().default(3000),
  NODE_ENV:               Joi.string().valid('development', 'production', 'test').required(),
  SUPABASE_URL:           Joi.string().uri().required(),
  SUPABASE_ANON_KEY:      Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  JWT_PRIVATE_KEY:        Joi.string().required(),
  JWT_PUBLIC_KEY:         Joi.string().required(),
  WALLET_ENCRYPTION_KEY:  Joi.string().length(64).required(),
  STELLAR_NETWORK:        Joi.string().valid('testnet', 'mainnet').required(),
  TRUSTLESS_WORK_API_KEY: Joi.string().required(),
});
```
