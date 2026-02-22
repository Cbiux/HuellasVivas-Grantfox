# Blockchain Standards

This document covers standards for all interactions with the Stellar network
and the Trustless Work escrow protocol.

---

## 1. Architecture Overview

```
DonationsService
    │
    ├─→ NoncesService           (generate/consume one-time nonces)
    ├─→ EscrowService           (orchestration layer)
    │       │
    │       └─→ TrustlessWorkService   (Trustless Work API)
    │                   │
    │                   └─→ StellarService   (Stellar SDK: keypairs, transactions)
    └─→ WalletsService          (keypair generation, balance queries)
```

External integrations (`StellarService`, `TrustlessWorkService`) are fully contained in
`src/blockchain/`. No feature module imports the Stellar SDK directly.

---

## 2. Network Configuration

Always read the network from environment variables. Never hardcode network strings.

```typescript
// src/blockchain/stellar/stellar.constants.ts

export const STELLAR_NETWORKS = {
  testnet: {
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    friendbotUrl: 'https://friendbot.stellar.org',
  },
  mainnet: {
    passphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
    friendbotUrl: null,
  },
} as const;
```

```typescript
// Usage in StellarService constructor
const network = config.get<'testnet' | 'mainnet'>('STELLAR_NETWORK');
this.networkConfig = STELLAR_NETWORKS[network];
```

---

## 3. Wallet Generation

Each user gets a Stellar keypair generated server-side on registration.

```typescript
// src/modules/wallets/wallets.service.ts

import { Keypair } from '@stellar/stellar-sdk';

generateKeypair(): { publicKey: string; secretKey: string } {
  const keypair = Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),      // Begins with 'S' — must be encrypted before storage
  };
}
```

The `secretKey` is **encrypted immediately** after generation and never stored in plain text.
See [security.md](security.md) for the encryption standard.

### 3.1 Testnet Account Funding

On testnet, fund newly created accounts via Friendbot:

```typescript
async fundTestnetAccount(publicKey: string): Promise<void> {
  if (this.network !== 'testnet') return;

  const response = await fetch(
    `${this.networkConfig.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`,
  );
  if (!response.ok) {
    throw new AppException('STELLAR_TRANSACTION_FAILED', 'Friendbot funding failed', HttpStatus.BAD_GATEWAY);
  }
}
```

---

## 4. Nonce Management

Nonces prevent **replay attacks** on blockchain operations.
Every operation that requires a user's wallet signature must consume a nonce.

### 4.1 Nonce Lifecycle

```
1. Client requests a nonce:  GET  /api/v1/nonces?action=ESCROW_RELEASE
2. Backend generates nonce and stores it:
   { id, userId, action, value: randomHex, expiresAt: now + 5min, usedAt: null }
3. Client includes the nonce in the operation request body
4. Backend validates: nonce exists + belongs to user + action matches + not expired + not used
5. Backend marks nonce as used (usedAt = now) BEFORE submitting the transaction
6. Transaction is submitted
```

### 4.2 Nonce Table

```sql
CREATE TABLE nonces (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     VARCHAR(50) NOT NULL,   -- e.g. 'ESCROW_RELEASE', 'ESCROW_CREATE'
  value      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.3 Nonce Service

```typescript
async generate(userId: string, action: NonceAction): Promise<string> {
  const value     = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  await this.noncesRepository.create({ userId, action, value, expiresAt });
  return value;
}

async consume(userId: string, action: NonceAction, value: string): Promise<void> {
  const nonce = await this.noncesRepository.findByValue(value);

  if (!nonce)                          throw new AppException('NONCE_INVALID', 'Nonce not found', HttpStatus.UNPROCESSABLE_ENTITY);
  if (nonce.userId !== userId)         throw new AppException('NONCE_INVALID', 'Nonce does not belong to this user', HttpStatus.UNPROCESSABLE_ENTITY);
  if (nonce.action !== action)         throw new AppException('NONCE_INVALID', 'Nonce action mismatch', HttpStatus.UNPROCESSABLE_ENTITY);
  if (nonce.usedAt !== null)           throw new AppException('NONCE_INVALID', 'Nonce already used', HttpStatus.UNPROCESSABLE_ENTITY);
  if (new Date() > nonce.expiresAt)    throw new AppException('NONCE_INVALID', 'Nonce expired', HttpStatus.UNPROCESSABLE_ENTITY);

  await this.noncesRepository.markUsed(nonce.id);
}
```

---

## 5. Trustless Work Integration

[Trustless Work](https://trustlesswork.com) is an escrow protocol on Stellar.
It holds funds until the donor approves release or a dispute is resolved.

### 5.1 Escrow Lifecycle

```
Donor creates donation
    │
    ├── No escrow requested → funds sent directly to fundraiser wallet
    │
    └── Escrow requested →
          TrustlessWork.createEscrow()
              │
              Donor sends funds to escrow address
              │
              ┌── Donor approves (no proof needed)
              │     → TrustlessWork.releaseEscrow()
              │
              └── Donor requests proof
                    Fundraiser submits proof
                    Donor reviews
                    ├── Donor approves → TrustlessWork.releaseEscrow()
                    └── Donor disputes → TrustlessWork.disputeEscrow()
```

### 5.2 TrustlessWorkService Methods

```typescript
// src/blockchain/trustless-work/trustless-work.service.ts

async createEscrow(params: CreateEscrowParams): Promise<EscrowRecord> {
  // POST to Trustless Work API
  // Returns escrow contract address and transaction XDR
}

async releaseEscrow(params: ReleaseEscrowParams): Promise<void> {
  // Verify nonce before calling
  await this.noncesService.consume(params.userId, 'ESCROW_RELEASE', params.nonce);
  // POST to Trustless Work API to release funds
}

async disputeEscrow(params: DisputeEscrowParams): Promise<void> {
  // POST to Trustless Work API to flag dispute
}
```

### 5.3 Error Handling for Blockchain Operations

Wrap every Trustless Work and Stellar SDK call in a try/catch.
Always translate external errors into `AppException` before propagating.

```typescript
try {
  await this.trustlessWorkService.releaseEscrow(params);
} catch (error) {
  this.logger.error('Failed to release escrow', error);
  throw new AppException(
    'STELLAR_TRANSACTION_FAILED',
    'Could not release escrow funds. Please try again.',
    HttpStatus.BAD_GATEWAY,
  );
}
```

---

## 6. Transaction Signing

When the backend needs to sign a Stellar transaction on behalf of a user:

1. Fetch the user's encrypted secret key from the `wallets` table.
2. Decrypt it in memory using `decryptSecretKey()`.
3. Reconstruct the `Keypair` from the decrypted secret.
4. Sign and submit the transaction.
5. **Zero out** the decrypted secret key after use (mitigates memory exposure).

```typescript
const encryptedKey  = await this.walletsRepository.getEncryptedKey(userId);
const secretKey     = decryptSecretKey(encryptedKey, this.encryptionKey);
const keypair       = Keypair.fromSecret(secretKey);

// Sign transaction
transaction.sign(keypair);

// Zero out sensitive value immediately after use
secretKey.split('').fill('\0');
```

---

## 7. Idempotency

Blockchain operations must be idempotent at the application level.
Before submitting any transaction, check if the operation has already been completed in the database.

```typescript
async releaseEscrow(escrowId: string, userId: string, nonce: string): Promise<void> {
  const escrow = await this.escrowRepository.findById(escrowId);

  // Guard: already released
  if (escrow.status === EscrowStatus.RELEASED) {
    throw new AppException('ESCROW_ALREADY_RELEASED', 'Funds have already been released', HttpStatus.CONFLICT);
  }

  // Consume nonce — prevents replay
  await this.noncesService.consume(userId, 'ESCROW_RELEASE', nonce);

  // Mark as released in DB before the network call
  await this.escrowRepository.updateStatus(escrowId, EscrowStatus.RELEASING);

  try {
    await this.trustlessWorkService.releaseEscrow({ ... });
    await this.escrowRepository.updateStatus(escrowId, EscrowStatus.RELEASED);
  } catch (error) {
    // Revert DB status on failure
    await this.escrowRepository.updateStatus(escrowId, EscrowStatus.FUNDED);
    throw error;
  }
}
```

---

## 8. Testnet vs Mainnet

| Concern | Testnet | Mainnet |
|---|---|---|
| Account funding | Friendbot (free) | Real XLM required |
| Transaction fees | Minimal (test XLM) | Real XLM |
| Trustless Work endpoint | Testnet API | Production API |
| Data persistence | Periodically wiped | Permanent |

**Never** use mainnet credentials in development or CI environments.
The `STELLAR_NETWORK` environment variable must be set to `testnet` in all non-production environments.
