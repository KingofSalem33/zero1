# Backend Architecture Analysis & Refactoring Plan

## Executive Summary

The current backend architecture has several areas requiring refactoring to improve modularity, scalability, and maintainability. This document provides a comprehensive analysis and actionable refactoring plan.

---

## Current Architecture Analysis

### Current Structure

```
apps/api/src/
├── ai/                      # AI-related functionality
│   ├── tools/              # AI tool implementations
│   ├── runModel.ts         # AI model execution
│   ├── runModelStream.ts   # Streaming AI responses
│   └── schemas.ts          # Zod validation schemas
├── engine/                 # Core orchestration logic
│   ├── orchestrator.ts     # Main orchestrator (2000+ LOC)
│   └── types.ts
├── lib/                    # Shared libraries
│   └── ai/                 # AI client wrappers
├── middleware/             # Express middleware
├── routes/                 # API route handlers
├── scripts/                # Database scripts
├── services/               # Business logic services
├── utils/                  # Utility functions
├── db.ts                   # Database client & utilities
├── env.ts                  # Environment configuration
├── files.ts                # File handling
├── index.ts                # Express app setup (500+ LOC)
└── memory.ts               # In-memory storage
```

---

## Critical Issues Identified

### 1. **Tight Coupling & God Objects**

#### Problem Areas:

- **`index.ts`** (500+ LOC): Combines route definitions, business logic, middleware setup, and AI integration
- **`orchestrator.ts`** (2000+ LOC): Handles too many responsibilities:
  - Project creation
  - Phase/substep generation
  - AI orchestration
  - Streaming responses
  - Database operations
  - State management
- **Global singleton exports**: `export const orchestrator = new StepOrchestrator()` in routes/projects.ts

#### Impact:

- Difficult to test in isolation
- Changes ripple across multiple concerns
- Impossible to swap implementations
- Memory leaks from global state

---

### 2. **Poor Dependency Injection**

#### Problem Patterns:

```typescript
// Direct imports create hard dependencies
import { supabase } from "../db";
import { threadService } from "../services/threadService";
import { orchestrator } from "../routes/projects";

// Singletons everywhere
export const threadService = new ThreadService();
export const orchestrator = new StepOrchestrator();
```

#### Impact:

- Cannot mock dependencies for testing
- Circular dependency risks
- Difficult to configure different implementations per environment

---

### 3. **Business Logic in Routes**

#### Examples:

```typescript
// index.ts - Complex AI logic directly in route handler
app.post("/api/chat", async (req, res) => {
  // 100+ lines of business logic here
  const conversationMessages = [...];
  const result = await runModel(...);
  await pushToThread(...);
  // ...
});
```

#### Impact:

- Cannot reuse logic outside HTTP context
- Difficult to test business rules
- Routes become bloated

---

### 4. **Inconsistent Error Handling**

#### Problems:

- Mix of try/catch, error callbacks, and unhandled promises
- No centralized error types or error handling strategy
- Database errors sometimes swallowed silently
- No structured logging for errors

---

### 5. **No Clear Domain Boundaries**

#### Observations:

- Services directory is a catch-all
- No clear separation between:
  - Domain logic (business rules)
  - Application logic (orchestration)
  - Infrastructure (database, AI clients)
  - Presentation (HTTP routes)

---

### 6. **Missing Design Patterns**

Current code lacks:

- **Factory Pattern**: For creating AI clients, tools, services
- **Repository Pattern**: Database access is scattered
- **Strategy Pattern**: Tool selection logic is hardcoded
- **Observer Pattern**: No event system for project state changes
- **Builder Pattern**: Complex object construction is inline

---

## Recommended Architecture: Layered + DDD

### Proposed Structure

```
apps/api/src/
├── domain/                      # Core business logic (framework-agnostic)
│   ├── projects/
│   │   ├── entities/           # Domain entities
│   │   │   ├── Project.ts
│   │   │   ├── Phase.ts
│   │   │   └── Substep.ts
│   │   ├── repositories/       # Repository interfaces
│   │   │   └── IProjectRepository.ts
│   │   ├── services/           # Domain services (pure business logic)
│   │   │   ├── ProjectCreationService.ts
│   │   │   ├── PhaseExpansionService.ts
│   │   │   └── CompletionDetectionService.ts
│   │   ├── events/             # Domain events
│   │   │   ├── ProjectCreated.ts
│   │   │   ├── SubstepCompleted.ts
│   │   │   └── PhaseCompleted.ts
│   │   └── value-objects/      # Value objects
│   │       ├── ProjectGoal.ts
│   │       └── ProjectStatus.ts
│   ├── threads/
│   │   ├── entities/
│   │   │   ├── Thread.ts
│   │   │   └── Message.ts
│   │   ├── repositories/
│   │   │   └── IThreadRepository.ts
│   │   └── services/
│   │       ├── ThreadService.ts
│   │       └── ContextBuilderService.ts
│   ├── artifacts/
│   │   ├── entities/
│   │   ├── repositories/
│   │   └── services/
│   └── shared/
│       ├── events/
│       │   └── EventBus.ts       # Observer pattern
│       └── errors/
│           ├── DomainError.ts
│           └── ValidationError.ts
│
├── application/                 # Application/use case layer
│   ├── projects/
│   │   ├── use-cases/
│   │   │   ├── CreateProjectUseCase.ts
│   │   │   ├── CompleteSubstepUseCase.ts
│   │   │   └── GeneratePhaseUseCase.ts
│   │   ├── dto/                # Data transfer objects
│   │   │   ├── CreateProjectDto.ts
│   │   │   └── CompleteSubstepDto.ts
│   │   └── services/           # Application services (orchestration)
│   │       └── ProjectOrchestrationService.ts
│   ├── threads/
│   │   └── use-cases/
│   │       ├── CreateThreadUseCase.ts
│   │       └── SendMessageUseCase.ts
│   └── shared/
│       ├── interfaces/
│       │   ├── IUseCase.ts
│       │   └── IEventPublisher.ts
│       └── decorators/
│           └── Transactional.ts
│
├── infrastructure/              # External concerns
│   ├── persistence/
│   │   ├── supabase/
│   │   │   ├── SupabaseClient.ts
│   │   │   ├── repositories/
│   │   │   │   ├── SupabaseProjectRepository.ts
│   │   │   │   ├── SupabaseThreadRepository.ts
│   │   │   │   └── SupabaseArtifactRepository.ts
│   │   │   └── migrations/
│   │   └── in-memory/          # For testing
│   │       ├── InMemoryProjectRepository.ts
│   │       └── InMemoryThreadRepository.ts
│   ├── ai/
│   │   ├── clients/
│   │   │   ├── IAIClient.ts         # Interface
│   │   │   ├── OpenAIClient.ts      # Implementation
│   │   │   └── MockAIClient.ts      # For testing
│   │   ├── tools/
│   │   │   ├── ITool.ts             # Tool interface
│   │   │   ├── ToolRegistry.ts      # Factory pattern
│   │   │   ├── CalculatorTool.ts
│   │   │   ├── WebSearchTool.ts
│   │   │   └── FileSearchTool.ts
│   │   └── services/
│   │       ├── AIOrchestrationService.ts
│   │       └── ToolSelectionService.ts  # Strategy pattern
│   ├── events/
│   │   ├── EventBusImpl.ts          # Observer implementation
│   │   └── handlers/
│   │       ├── ProjectCreatedHandler.ts
│   │       └── SubstepCompletedHandler.ts
│   ├── storage/
│   │   ├── IFileStorage.ts
│   │   └── LocalFileStorage.ts
│   └── logging/
│       ├── ILogger.ts
│       └── PinoLogger.ts
│
├── presentation/                # API/Interface layer
│   ├── http/
│   │   ├── controllers/
│   │   │   ├── ProjectsController.ts
│   │   │   ├── ThreadsController.ts
│   │   │   └── ArtifactsController.ts
│   │   ├── middleware/
│   │   │   ├── AuthMiddleware.ts
│   │   │   ├── RateLimitMiddleware.ts
│   │   │   ├── ErrorHandler.ts
│   │   │   └── ValidationMiddleware.ts
│   │   ├── routes/
│   │   │   ├── projects.routes.ts
│   │   │   ├── threads.routes.ts
│   │   │   └── artifacts.routes.ts
│   │   ├── dto/                 # HTTP-specific DTOs
│   │   │   └── validators/
│   │   └── Server.ts            # Express app setup
│   └── streaming/
│       ├── SSEController.ts
│       └── StreamingService.ts
│
├── shared/                      # Cross-cutting concerns
│   ├── config/
│   │   ├── Config.ts            # Configuration interface
│   │   └── EnvConfig.ts         # Implementation
│   ├── errors/
│   │   ├── AppError.ts
│   │   ├── HttpError.ts
│   │   └── ErrorMapper.ts
│   ├── utils/
│   │   ├── tokenCounter.ts
│   │   └── contextTrimmer.ts
│   └── types/
│       └── common.types.ts
│
├── di/                          # Dependency Injection
│   ├── Container.ts             # DI container
│   ├── types.ts                 # DI symbols/tokens
│   └── bindings/
│       ├── infrastructure.bindings.ts
│       ├── application.bindings.ts
│       └── domain.bindings.ts
│
└── main.ts                      # Application entry point
```

---

## Design Patterns to Apply

### 1. **Repository Pattern** (Infrastructure Layer)

**Purpose**: Abstract database access, enable testing with in-memory implementations

```typescript
// domain/projects/repositories/IProjectRepository.ts
export interface IProjectRepository {
  findById(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  update(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
  findByUserId(userId: string): Promise<Project[]>;
}

// infrastructure/persistence/supabase/repositories/SupabaseProjectRepository.ts
export class SupabaseProjectRepository implements IProjectRepository {
  constructor(private supabase: SupabaseClient) {}

  async findById(id: string): Promise<Project | null> {
    const result = await withRetry(() =>
      this.supabase.from("projects").select("*").eq("id", id).single(),
    );
    return result ? this.toDomain(result) : null;
  }

  private toDomain(raw: any): Project {
    // Map database model to domain entity
  }
}
```

**Benefits**:

- Database logic isolated from business logic
- Easy to test with InMemoryProjectRepository
- Can swap Supabase for Postgres/MongoDB without changing domain

---

### 2. **Factory Pattern** (Infrastructure - AI Tools)

**Purpose**: Create AI tools dynamically, manage tool lifecycle

```typescript
// infrastructure/ai/tools/ToolRegistry.ts
export class ToolRegistry {
  private tools = new Map<string, () => ITool>();

  register(name: string, factory: () => ITool): void {
    this.tools.set(name, factory);
  }

  create(name: string): ITool {
    const factory = this.tools.get(name);
    if (!factory) throw new Error(`Tool ${name} not registered`);
    return factory();
  }

  createAll(names: string[]): ITool[] {
    return names.map((name) => this.create(name));
  }
}

// Usage in dependency injection
container.register("ToolRegistry", () => {
  const registry = new ToolRegistry();
  registry.register("calculator", () => new CalculatorTool());
  registry.register("web_search", () => new WebSearchTool(apiKey));
  registry.register("file_search", () => new FileSearchTool(storage));
  return registry;
});
```

**Benefits**:

- Tools created on-demand (lazy initialization)
- Easy to add new tools without modifying core code
- Centralized tool configuration

---

### 3. **Strategy Pattern** (Infrastructure - Tool Selection)

**Purpose**: Different strategies for selecting tools based on context

```typescript
// infrastructure/ai/services/IToolSelectionStrategy.ts
export interface IToolSelectionStrategy {
  selectTools(message: string, history: Message[]): string[];
}

export class KeywordBasedStrategy implements IToolSelectionStrategy {
  selectTools(message: string, history: Message[]): string[] {
    const tools: string[] = [];
    if (/calculate|math|\d+\s*[\+\-\*\/]/.test(message)) {
      tools.push("calculator");
    }
    if (/search|google|find/i.test(message)) {
      tools.push("web_search");
    }
    return tools;
  }
}

export class LLMBasedStrategy implements IToolSelectionStrategy {
  constructor(private aiClient: IAIClient) {}

  async selectTools(message: string, history: Message[]): Promise<string[]> {
    // Use LLM to decide which tools to use
  }
}

// Application service uses strategy
export class ToolSelectionService {
  constructor(private strategy: IToolSelectionStrategy) {}

  selectTools(message: string, history: Message[]): string[] {
    return this.strategy.selectTools(message, history);
  }

  // Can swap strategy at runtime
  setStrategy(strategy: IToolSelectionStrategy): void {
    this.strategy = strategy;
  }
}
```

**Benefits**:

- Can switch between keyword-based and LLM-based selection
- A/B test different strategies
- Strategy can be configured per user

---

### 4. **Observer Pattern** (Domain Events)

**Purpose**: Decouple components, enable event-driven architecture

```typescript
// domain/shared/events/EventBus.ts
export interface IDomainEvent {
  occurredAt: Date;
  aggregateId: string;
}

export interface IEventHandler<T extends IDomainEvent> {
  handle(event: T): Promise<void>;
}

export class EventBus {
  private handlers = new Map<string, IEventHandler<any>[]>();

  subscribe<T extends IDomainEvent>(
    eventType: string,
    handler: IEventHandler<T>,
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async publish<T extends IDomainEvent>(event: T): Promise<void> {
    const eventType = event.constructor.name;
    const handlers = this.handlers.get(eventType) || [];

    await Promise.all(handlers.map((h) => h.handle(event)));
  }
}

// Domain event
export class SubstepCompletedEvent implements IDomainEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly substepId: string,
    public readonly phaseId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

// Event handler
export class SubstepCompletedHandler
  implements IEventHandler<SubstepCompletedEvent>
{
  constructor(
    private threadService: ThreadService,
    private celebrationService: CelebrationService,
  ) {}

  async handle(event: SubstepCompletedEvent): Promise<void> {
    // Send celebration message
    await this.celebrationService.celebrate(event);

    // Update thread context
    await this.threadService.updateContext(event.aggregateId, {
      last_substep_context: {
        phase: event.phaseId,
        substep: event.substepId,
      },
    });
  }
}
```

**Benefits**:

- Orchestrator doesn't need to know about celebration logic
- Easy to add new behaviors (logging, metrics, notifications)
- Async event processing

---

### 5. **Builder Pattern** (Domain Entities)

**Purpose**: Construct complex objects step-by-step with validation

```typescript
// domain/projects/entities/Project.ts
export class ProjectBuilder {
  private id?: string;
  private goal?: string;
  private status?: ProjectStatus;
  private phases: Phase[] = [];

  setId(id: string): this {
    this.id = id;
    return this;
  }

  setGoal(goal: string): this {
    if (goal.trim().length < 5) {
      throw new ValidationError("Goal must be at least 5 characters");
    }
    this.goal = goal.trim();
    return this;
  }

  setStatus(status: ProjectStatus): this {
    this.status = status;
    return this;
  }

  addPhase(phase: Phase): this {
    this.phases.push(phase);
    return this;
  }

  build(): Project {
    if (!this.id || !this.goal || !this.status) {
      throw new ValidationError("Missing required fields");
    }

    return new Project(
      this.id,
      this.goal,
      this.status,
      this.phases,
      new Date(),
      new Date(),
    );
  }
}

// Usage
const project = new ProjectBuilder()
  .setId(uuid())
  .setGoal("Build a todo app")
  .setStatus(ProjectStatus.Active)
  .addPhase(phase1)
  .addPhase(phase2)
  .build();
```

**Benefits**:

- Validation at each step
- Clear, readable construction
- Immutable result

---

### 6. **Use Case Pattern** (Application Layer)

**Purpose**: Encapsulate business use cases, enforce single responsibility

```typescript
// application/projects/use-cases/CreateProjectUseCase.ts
export interface IUseCase<TRequest, TResponse> {
  execute(request: TRequest): Promise<TResponse>;
}

export class CreateProjectUseCase
  implements IUseCase<CreateProjectDto, ProjectDto>
{
  constructor(
    private projectRepository: IProjectRepository,
    private phaseGenerator: PhaseGenerationService,
    private eventBus: EventBus,
    private logger: ILogger,
  ) {}

  async execute(dto: CreateProjectDto): Promise<ProjectDto> {
    this.logger.info("Creating project", { goal: dto.goal });

    // 1. Generate phases
    const phases = await this.phaseGenerator.generate(dto.goal);

    // 2. Build project entity
    const project = new ProjectBuilder()
      .setId(uuid())
      .setGoal(dto.goal)
      .setStatus(ProjectStatus.Active)
      .addPhases(phases)
      .build();

    // 3. Persist
    await this.projectRepository.save(project);

    // 4. Publish event
    await this.eventBus.publish(
      new ProjectCreatedEvent(project.id, project.goal),
    );

    this.logger.info("Project created", { projectId: project.id });

    // 5. Return DTO
    return this.toDto(project);
  }

  private toDto(project: Project): ProjectDto {
    // Map entity to DTO
  }
}
```

**Benefits**:

- Single purpose: create project
- All dependencies injected (testable)
- Orchestrates domain services
- Clear transaction boundaries

---

## Dependency Injection Strategy

### Recommended: InversifyJS or TSyringe

**Example with TSyringe**:

```typescript
// di/types.ts - Define injection tokens
export const TYPES = {
  // Repositories
  ProjectRepository: Symbol.for("ProjectRepository"),
  ThreadRepository: Symbol.for("ThreadRepository"),

  // Services
  AIClient: Symbol.for("AIClient"),
  ToolRegistry: Symbol.for("ToolRegistry"),
  EventBus: Symbol.for("EventBus"),

  // Use Cases
  CreateProjectUseCase: Symbol.for("CreateProjectUseCase"),
  CompleteSubstepUseCase: Symbol.for("CompleteSubstepUseCase"),

  // Infrastructure
  Logger: Symbol.for("Logger"),
  Config: Symbol.for("Config"),
};

// di/Container.ts
import { container } from "tsyringe";
import { TYPES } from "./types";

// Register infrastructure
container.register(TYPES.Config, { useClass: EnvConfig });
container.register(TYPES.Logger, { useClass: PinoLogger });

// Register repositories
container.register(TYPES.ProjectRepository, {
  useFactory: (c) =>
    new SupabaseProjectRepository(
      c.resolve(SupabaseClient),
      c.resolve(TYPES.Logger),
    ),
});

// Register services
container.register(TYPES.AIClient, {
  useFactory: (c) =>
    new OpenAIClient(
      c.resolve(TYPES.Config).openAiKey,
      c.resolve(TYPES.Logger),
    ),
});

container.register(TYPES.EventBus, { useClass: EventBus });

// Register use cases
container.register(TYPES.CreateProjectUseCase, {
  useFactory: (c) =>
    new CreateProjectUseCase(
      c.resolve(TYPES.ProjectRepository),
      c.resolve(PhaseGenerationService),
      c.resolve(TYPES.EventBus),
      c.resolve(TYPES.Logger),
    ),
});

export { container };

// presentation/http/controllers/ProjectsController.ts
@controller("/api/projects")
export class ProjectsController {
  constructor(
    @inject(TYPES.CreateProjectUseCase)
    private createProject: CreateProjectUseCase,

    @inject(TYPES.Logger)
    private logger: ILogger,
  ) {}

  @httpPost("/")
  async create(@request() req: Request, @response() res: Response) {
    try {
      const dto = CreateProjectDto.fromRequest(req.body);
      const result = await this.createProject.execute(dto);
      return res.status(201).json(result);
    } catch (error) {
      this.logger.error("Project creation failed", { error });
      throw error;
    }
  }
}
```

**Benefits**:

- Constructor injection (clear dependencies)
- Easy to swap implementations (Supabase → Postgres)
- Testable (mock dependencies)
- Scoped lifecycles (singleton, transient, request)

---

## Migration Strategy

### Phase 1: Foundation (Week 1-2)

**Goals**: Set up new structure without breaking existing code

1. **Create new folder structure** (parallel to existing)

   ```
   apps/api/src/
   ├── _old/                 # Move existing code here
   └── domain/               # New structure
       ├── projects/
       ├── threads/
       └── shared/
   ```

2. **Set up DI container**
   - Install `tsyringe` or `inversify`
   - Create `di/Container.ts`
   - Register first services (Config, Logger)

3. **Create domain entities**
   - `Project`, `Phase`, `Substep`
   - Value objects: `ProjectGoal`, `ProjectStatus`
   - No database dependencies yet

4. **Create repository interfaces**
   - `IProjectRepository`
   - `IThreadRepository`
   - No implementations yet

**Deliverables**:

- New folder structure
- DI container working
- Domain entities + interfaces

---

### Phase 2: Repository Layer (Week 3-4)

**Goals**: Abstract database access

1. **Implement Supabase repositories**
   - `SupabaseProjectRepository implements IProjectRepository`
   - `SupabaseThreadRepository implements IThreadRepository`
   - Move `withRetry` logic into base class

2. **Create in-memory repositories for testing**
   - `InMemoryProjectRepository`
   - `InMemoryThreadRepository`

3. **Write unit tests**
   - Test repositories with in-memory implementations
   - Test domain entities

**Deliverables**:

- Working repositories with retry logic
- Test coverage >80% for repositories

---

### Phase 3: Use Cases (Week 5-6)

**Goals**: Extract business logic from routes

1. **Create use cases**
   - `CreateProjectUseCase` (extract from `POST /api/projects`)
   - `CompleteSubstepUseCase` (extract from orchestrator)
   - `GeneratePhaseUseCase`

2. **Refactor one route at a time**
   - Start with `POST /api/projects`
   - Controller calls use case
   - Remove business logic from route handler

3. **Add integration tests**
   - Test use cases with real repositories
   - Test HTTP endpoints

**Deliverables**:

- 3-5 use cases implemented
- 1-2 routes refactored to use new architecture

---

### Phase 4: Event System (Week 7-8)

**Goals**: Decouple components with events

1. **Implement EventBus**
   - Observer pattern implementation
   - Async event handling

2. **Define domain events**
   - `ProjectCreatedEvent`
   - `SubstepCompletedEvent`
   - `PhaseCompletedEvent`

3. **Create event handlers**
   - `SubstepCompletedHandler` (celebration logic)
   - `ProjectCreatedHandler` (analytics tracking)

4. **Integrate with use cases**
   - Use cases publish events
   - Remove direct coupling

**Deliverables**:

- Working event bus
- 3-5 domain events + handlers

---

### Phase 5: AI Layer Refactoring (Week 9-10)

**Goals**: Apply Factory and Strategy patterns to AI tools

1. **Create `ITool` interface**
2. **Implement `ToolRegistry` (Factory pattern)**
3. **Implement `IToolSelectionStrategy` (Strategy pattern)**
4. **Refactor tool selection logic**
5. **Create `AIOrchestrationService`**

**Deliverables**:

- Tools registered in factory
- Tool selection strategies configurable
- AI client abstracted behind interface

---

### Phase 6: Controller Layer (Week 11-12)

**Goals**: Clean HTTP layer, remove business logic

1. **Create controllers**
   - `ProjectsController`
   - `ThreadsController`
   - `ArtifactsController`

2. **Extract validation**
   - Move Zod schemas to DTOs
   - Validation middleware

3. **Centralized error handling**
   - `ErrorHandlerMiddleware`
   - Map domain errors to HTTP errors

**Deliverables**:

- All routes use controllers
- Validation separated from routes
- Centralized error handling

---

### Phase 7: Remove Old Code (Week 13)

**Goals**: Delete legacy code, finalize migration

1. **Verify all routes use new architecture**
2. **Run full test suite**
3. **Delete `_old/` directory**
4. **Update documentation**

**Deliverables**:

- Legacy code removed
- Test coverage >85%
- Architecture documentation

---

## Key Benefits Summary

### Before Refactoring:

- ❌ 2000+ line orchestrator class
- ❌ Business logic in route handlers
- ❌ Hard to test (global singletons)
- ❌ Tight coupling between layers
- ❌ No event system

### After Refactoring:

- ✅ Clear separation of concerns
- ✅ <200 line classes (SRP)
- ✅ 100% testable (DI everywhere)
- ✅ Event-driven architecture
- ✅ Swappable implementations (Repository pattern)
- ✅ Easy to add features (Factory, Strategy patterns)

---

## Immediate Quick Wins (Can Start Today)

### 1. Extract Configuration (1 hour)

Move from `env.ts` global to injectable `Config` class

### 2. Create Repository Interfaces (2 hours)

Define `IProjectRepository`, `IThreadRepository` without implementations

### 3. Add Centralized Error Handling (2 hours)

Create `ErrorHandlerMiddleware`, map errors to HTTP codes

### 4. Extract One Use Case (4 hours)

Move `POST /api/projects` logic to `CreateProjectUseCase`

### 5. Set Up DI Container (3 hours)

Install TSyringe, register first 3 services

---

## Metrics to Track

| Metric                     | Before  | Target     |
| -------------------------- | ------- | ---------- |
| Largest file (LOC)         | 2000+   | <300       |
| Test coverage              | ~20%    | >85%       |
| Circular dependencies      | Several | 0          |
| Routes with business logic | All     | 0          |
| Singletons                 | 10+     | 0 (use DI) |
| Time to add new feature    | Days    | Hours      |

---

## Recommended Reading

1. **Domain-Driven Design** by Eric Evans
2. **Clean Architecture** by Robert Martin
3. **Dependency Injection Principles** by Mark Seemann
4. **Enterprise Patterns** by Martin Fowler

---

## Conclusion

This refactoring will transform the codebase from a monolithic, tightly-coupled architecture to a modular, testable, and scalable system. The migration strategy is incremental and low-risk, allowing the team to deliver features while improving architecture.

**Estimated Timeline**: 13 weeks (3 months)
**Risk Level**: Low (incremental, parallel development)
**Complexity**: Medium (well-established patterns)
**ROI**: High (faster development, fewer bugs, easier onboarding)
