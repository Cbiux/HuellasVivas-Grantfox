# Database Standards

The project uses **Supabase** (PostgreSQL under the hood) as its database.
Schema changes are managed through versioned SQL migration files.

---

## 1. Migration Files

### 1.1 Naming Convention

```
YYYYMMDDHHMMSS_<action>_<description>.sql
```

| Part | Rules | Example |
|---|---|---|
| Timestamp | UTC, no separators | `20250115120000` |
| Action | `create`, `add`, `drop`, `rename`, `alter` | `create` |
| Description | snake_case noun phrase | `users_table` |

**Examples:**

```
20250115120000_create_users_table.sql
20250115120100_create_wallets_table.sql
20250116080000_add_avatar_url_to_users.sql
20250120090000_create_publications_table.sql
```

### 1.2 Migration File Structure

Every migration file must contain **both** the forward migration and a rollback comment.

```sql
-- Migration: 20250115120000_create_users_table.sql
-- Description: Create the users table for Huellas Vivas

-- ────────────────────────────────────────────────────────────
-- UP
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username       VARCHAR(50)  NOT NULL UNIQUE,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email    ON users (email);

-- ────────────────────────────────────────────────────────────
-- DOWN (rollback — do not run automatically)
-- DROP TABLE IF EXISTS users;
-- ────────────────────────────────────────────────────────────
```

---

## 2. Schema Conventions

### 2.1 Primary Keys

- Always `UUID`. Never use serial integers as primary keys.
- Use `gen_random_uuid()` as the default.

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### 2.2 Timestamps

Every table must have `created_at` and `updated_at`.

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Add a trigger to auto-update `updated_at`:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 2.3 Column Naming

- All column names use `snake_case`.
- Foreign keys use `<referenced_table_singular>_id` naming.

```sql
user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
```

### 2.4 Soft Deletes

For publications, comments, and notifications — use soft deletes instead of hard deletes to preserve history.

```sql
deleted_at TIMESTAMPTZ DEFAULT NULL   -- NULL = not deleted
```

Query for active records:

```sql
SELECT * FROM publications WHERE deleted_at IS NULL;
```

### 2.5 Enums

Prefer `VARCHAR` with a `CHECK` constraint over PostgreSQL `ENUM` types.
PostgreSQL `ENUM` types are painful to alter; `VARCHAR + CHECK` is simpler to evolve.

```sql
-- ✅ Preferred
status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
  CHECK (status IN ('ACTIVE', 'COMPLETED')),

-- ❌ Avoid
status publication_status NOT NULL DEFAULT 'ACTIVE',  -- requires ALTER TYPE to add values
```

---

## 3. Table Reference

| Table | Description |
|---|---|
| `users` | User accounts |
| `wallets` | Stellar wallets linked to users |
| `nonces` | One-time nonces for blockchain operations |
| `refresh_tokens` | JWT refresh tokens (for revocation) |
| `categories` | Animal categories (DOG, CAT, RABBIT, OTHER) |
| `publications` | Donation request posts |
| `publication_media` | Files (photos, docs) attached to publications |
| `donations` | Individual donation records |
| `escrows` | Trustless Work escrow records per donation |
| `comments` | Comments and replies on publications |
| `notifications` | In-app notifications per user |

---

## 4. Indexes

Add indexes for every column used in:
- `WHERE` clauses (filtering)
- `ORDER BY` clauses (sorting)
- Foreign key lookups

```sql
-- Publications: most common queries
CREATE INDEX idx_publications_user_id    ON publications (user_id);
CREATE INDEX idx_publications_category   ON publications (category);
CREATE INDEX idx_publications_status     ON publications (status);
CREATE INDEX idx_publications_created_at ON publications (created_at DESC);

-- Composite for feed queries (category + status + created_at)
CREATE INDEX idx_publications_feed
  ON publications (category, status, created_at DESC)
  WHERE deleted_at IS NULL;
```

Do **not** index every column by default. Only index based on actual query patterns.

---

## 5. Supabase Client Usage

### 5.1 SupabaseService

There is a single `SupabaseService` with two clients:
- `client` — uses the `anon` key (respects Row Level Security)
- `adminClient` — uses the `service_role` key (bypasses RLS, use sparingly)

```typescript
// src/database/supabase.service.ts

@Injectable()
export class SupabaseService {
  readonly client:      SupabaseClient;
  readonly adminClient: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    this.client = createClient(
      config.get('SUPABASE_URL'),
      config.get('SUPABASE_ANON_KEY'),
    );
    this.adminClient = createClient(
      config.get('SUPABASE_URL'),
      config.get('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }
}
```

### 5.2 When to Use Each Client

| Client | Use case |
|---|---|
| `client` (anon) | Public reads (list publications, get categories) |
| `adminClient` | Writes, reads that bypass RLS (auth operations, wallet creation) |

### 5.3 Always Handle Errors

```typescript
// ✅ Always check for error
const { data, error } = await this.supabase.adminClient
  .from('users')
  .insert(payload)
  .select()
  .single();

if (error) {
  this.logger.error('Failed to insert user', error);
  throw error;                         // Propagate — service layer will catch
}

// ❌ Never ignore the error field
const { data } = await this.supabase.client.from('users').select();
return data;   // data could be null if there was an error
```

### 5.4 Select Only Needed Columns

```typescript
// ✅ Select only needed columns — reduces payload
.select('id, title, category, goal_amount, raised_amount, status, created_at')

// ❌ Avoid wildcard selects in production queries
.select('*')
```

---

## 6. Row Level Security (RLS)

Enable RLS on all tables. Define policies in a dedicated migration file.

```sql
-- Enable RLS
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read active publications
CREATE POLICY "Public can read publications"
  ON publications FOR SELECT
  USING (deleted_at IS NULL);

-- Only the owner can update or delete
CREATE POLICY "Owner can update publication"
  ON publications FOR UPDATE
  USING (auth.uid()::text = user_id::text);
```

The backend uses the `service_role` key for writes (bypassing RLS at the API layer),
so backend-enforced authorization logic in the service is the primary security gate.
RLS provides an additional layer for direct DB access.
