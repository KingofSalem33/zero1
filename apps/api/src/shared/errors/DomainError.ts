import { AppError } from "./AppError";

/**
 * Domain-level errors
 *
 * These represent business rule violations
 */

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
    };
  }
}

export class BusinessRuleViolation extends AppError {
  constructor(
    message: string,
    public readonly rule: string,
  ) {
    super(message, "BUSINESS_RULE_VIOLATION");
    this.name = "BusinessRuleViolation";
  }

  toJSON() {
    return {
      ...super.toJSON(),
      rule: this.rule,
    };
  }
}

export class EntityNotFoundError extends AppError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id ${id} not found`, "ENTITY_NOT_FOUND");
    this.name = "EntityNotFoundError";
  }
}

export class DuplicateEntityError extends AppError {
  constructor(entityName: string, field: string, value: string) {
    super(
      `${entityName} with ${field}='${value}' already exists`,
      "DUPLICATE_ENTITY",
    );
    this.name = "DuplicateEntityError";
  }
}
