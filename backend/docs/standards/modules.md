# Module Standards

---

## 1. Module Anatomy

Every feature module follows the same internal structure:

```
src/modules/<feature>/
├── <feature>.module.ts          # Module definition
├── <feature>.controller.ts      # HTTP layer
├── <feature>.service.ts         # Business logic
├── <feature>.repository.ts      # Database access
└── dto/
    ├── create-<feature>.dto.ts
    ├── update-<feature>.dto.ts
    ├── filter-<feature>.dto.ts
    └── <feature>-response.dto.ts
```

If the module does not expose HTTP routes (e.g., `WalletsModule`, `NoncesModule`), omit the controller.

---

## 2. Module File (`.module.ts`)

```typescript
// src/modules/publications/publications.module.ts

import { Module } from '@nestjs/common';
import { PublicationsController } from './publications.controller';
import { PublicationsService }    from './publications.service';
import { PublicationsRepository } from './publications.repository';
import { DatabaseModule }         from '../../database/database.module';

@Module({
  imports:     [DatabaseModule],                // External dependencies
  controllers: [PublicationsController],
  providers:   [PublicationsService, PublicationsRepository],
  exports:     [PublicationsService],           // Only export what other modules actually need
})
export class PublicationsModule {}
```

Rules:
- Import `DatabaseModule` in any module that needs Supabase access.
- Only add a class to `exports` if another module explicitly needs to inject it.
- Do not export repositories — they are an implementation detail of the module.

---

## 3. Controller Layer (`.controller.ts`)

Responsibilities:
- Parse and validate incoming HTTP requests.
- Call the service with clean, typed inputs.
- Return the service result.

The controller must **not**:
- Contain business logic or conditions.
- Access the repository directly.
- Interact with Supabase or Stellar.

```typescript
@ApiTags('publications')
@Controller('publications')
export class PublicationsController {

  constructor(private readonly publicationsService: PublicationsService) {}

  @Get()
  findAll(@Query() filterDto: FilterPublicationsDto) {
    return this.publicationsService.findAll(filterDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicationsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createDto: CreatePublicationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.publicationsService.create(createDto, user.sub);
  }
}
```

---

## 4. Service Layer (`.service.ts`)

Responsibilities:
- Orchestrate business logic.
- Call repository methods.
- Emit domain events.
- Throw `AppException` on domain rule violations.
- Transform raw data into response DTOs using `plainToInstance`.

```typescript
@Injectable()
export class PublicationsService {
  private readonly logger = new Logger(PublicationsService.name);

  constructor(
    private readonly publicationsRepository: PublicationsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findOne(id: string): Promise<PublicationResponseDto> {
    const publication = await this.publicationsRepository.findById(id);
    if (!publication) {
      throw new AppException('PUBLICATION_NOT_FOUND', `Publication '${id}' not found`, HttpStatus.NOT_FOUND);
    }
    return plainToInstance(PublicationResponseDto, publication, { excludeExtraneousValues: true });
  }

  async create(dto: CreatePublicationDto, userId: string): Promise<PublicationResponseDto> {
    const created = await this.publicationsRepository.create({ ...dto, userId });
    this.logger.log(`Publication created: ${created.id}`);
    return plainToInstance(PublicationResponseDto, created, { excludeExtraneousValues: true });
  }
}
```

---

## 5. Repository Layer (`.repository.ts`)

Responsibilities:
- All Supabase queries live here, and **only here**.
- Map database column names (snake_case) to TypeScript properties (camelCase).
- Return raw entities or `null` — never throw business exceptions.
- Never contain business logic or conditions.

```typescript
@Injectable()
export class PublicationsRepository {

  constructor(private readonly supabase: SupabaseService) {}

  async findById(id: string): Promise<Publication | null> {
    const { data, error } = await this.supabase.client
      .from('publications')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async create(payload: Omit<Publication, 'id' | 'createdAt' | 'updatedAt'>): Promise<Publication> {
    const { data, error } = await this.supabase.client
      .from('publications')
      .insert(this.toRow(payload))
      .select()
      .single();

    if (error) throw error;
    return this.mapRow(data);
  }

  // ─── Private Mappers ───────────────────────────────────────────────────────
  private mapRow(row: Record<string, unknown>): Publication {
    return {
      id:           row['id'] as string,
      title:        row['title'] as string,
      description:  row['description'] as string,
      category:     row['category'] as AnimalCategory,
      goalAmount:   row['goal_amount'] as number,
      raisedAmount: row['raised_amount'] as number,
      status:       row['status'] as PublicationStatus,
      userId:       row['user_id'] as string,
      createdAt:    new Date(row['created_at'] as string),
      updatedAt:    new Date(row['updated_at'] as string),
    };
  }

  private toRow(entity: Partial<Publication>): Record<string, unknown> {
    return {
      title:        entity.title,
      description:  entity.description,
      category:     entity.category,
      goal_amount:  entity.goalAmount,
      raised_amount: entity.raisedAmount,
      status:       entity.status,
      user_id:      entity.userId,
    };
  }
}
```

---

## 6. Dependency Rules

The flow of dependencies is always **one direction** and must never be reversed:

```
Controller → Service → Repository → SupabaseService
```

```
Service → BlockchainModule (for Stellar/Trustless Work)
Service → NoncesModule (for nonce validation)
Service → EventEmitter2 (for domain events)
```

**Forbidden:**
- Repository importing a Service.
- Controller importing a Repository.
- Two feature modules importing each other (circular dependency).

If two modules need to communicate, use `EventEmitter2` events instead of direct imports.

---

## 7. Shared Modules

Modules in `src/common/` and `src/database/` are shared utilities.
They must be imported by feature modules, never the reverse.

| Shared Module | What it provides |
|---|---|
| `DatabaseModule` | `SupabaseService` — Supabase client |
| `BlockchainModule` | `StellarService`, `TrustlessWorkService` |
| `NoncesModule` | `NoncesService` — generate and consume nonces |

---

## 8. Root App Module

`AppModule` imports all feature modules and shared modules.
It should contain **no providers** or business logic of its own.

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    BlockchainModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    NoncesModule,
    PublicationsModule,
    DonationsModule,
    EscrowModule,
    CommentsModule,
    NotificationsModule,
    MediaModule,
    CategoriesModule,
  ],
})
export class AppModule {}
```
