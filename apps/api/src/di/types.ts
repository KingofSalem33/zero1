/**
 * Dependency Injection Types/Tokens
 *
 * All injectable dependencies are registered here using symbols
 * to avoid string-based injection which is error-prone
 */

export const TYPES = {
  // Configuration
  Config: Symbol.for("Config"),

  // Logging
  Logger: Symbol.for("Logger"),

  // Database
  SupabaseClient: Symbol.for("SupabaseClient"),

  // Repositories
  ProjectRepository: Symbol.for("ProjectRepository"),
  ThreadRepository: Symbol.for("ThreadRepository"),
  ArtifactRepository: Symbol.for("ArtifactRepository"),

  // Domain Services
  ProjectCreationService: Symbol.for("ProjectCreationService"),
  PhaseExpansionService: Symbol.for("PhaseExpansionService"),
  CompletionDetectionService: Symbol.for("CompletionDetectionService"),

  // Application Services
  AIOrchestrationService: Symbol.for("AIOrchestrationService"),
  ToolSelectionService: Symbol.for("ToolSelectionService"),

  // AI Infrastructure
  AIClient: Symbol.for("AIClient"),
  ToolRegistry: Symbol.for("ToolRegistry"),

  // Events
  EventBus: Symbol.for("EventBus"),

  // Use Cases
  CreateProjectUseCase: Symbol.for("CreateProjectUseCase"),
  CompleteSubstepUseCase: Symbol.for("CompleteSubstepUseCase"),
  GeneratePhaseUseCase: Symbol.for("GeneratePhaseUseCase"),
  CreateThreadUseCase: Symbol.for("CreateThreadUseCase"),
  SendMessageUseCase: Symbol.for("SendMessageUseCase"),

  // Storage
  FileStorage: Symbol.for("FileStorage"),
} as const;

export type DITypes = typeof TYPES;
