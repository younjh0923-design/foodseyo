import type { InputType } from "../../domain/foodseyo-analysis.ts";
import type { SemanticProblem } from "./analysis-types.ts";

export type AnalysisOrchestrationErrorCode =
  | "ANALYZER_CAPABILITY_UNAVAILABLE"
  | "UNSUPPORTED_INPUT_TYPE"
  | "DEMO_FIXTURE_NOT_FOUND"
  | "ANALYSIS_ABORTED"
  | "STRUCTURAL_VALIDATION_FAILED"
  | "SEMANTIC_VALIDATION_FAILED"
  | "ENVELOPE_VALIDATION_FAILED"
  | "ID_GENERATION_FAILED"
  | "SERIALIZATION_FAILED";

export class AnalysisOrchestrationError extends Error {
  readonly code: AnalysisOrchestrationErrorCode;

  constructor(
    code: AnalysisOrchestrationErrorCode,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "AnalysisOrchestrationError";
  }
}

export class AnalysisCapabilityUnavailableError extends AnalysisOrchestrationError {
  readonly inputType: Exclude<InputType, "demo">;

  constructor(inputType: Exclude<InputType, "demo">) {
    super(
      "ANALYZER_CAPABILITY_UNAVAILABLE",
      `The ${inputType} analyzer is not implemented in T4.`,
    );
    this.inputType = inputType;
    this.name = "AnalysisCapabilityUnavailableError";
  }
}

export class UnsupportedAnalysisInputError extends AnalysisOrchestrationError {
  constructor() {
    super("UNSUPPORTED_INPUT_TYPE", "Unsupported Foodseyo analysis input type.");
    this.name = "UnsupportedAnalysisInputError";
  }
}

export class DemoFixtureNotFoundError extends AnalysisOrchestrationError {
  readonly fixtureId: string;

  constructor(fixtureId: string) {
    super("DEMO_FIXTURE_NOT_FOUND", `Unknown Foodseyo demo fixture: ${fixtureId}`);
    this.fixtureId = fixtureId;
    this.name = "DemoFixtureNotFoundError";
  }
}

export class AnalysisAbortedError extends AnalysisOrchestrationError {
  constructor() {
    super("ANALYSIS_ABORTED", "Foodseyo analysis was aborted.");
    this.name = "AnalysisAbortedError";
  }
}

export interface StructuralValidationDetail {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export class AnalysisStructuralValidationError extends AnalysisOrchestrationError {
  readonly details: readonly StructuralValidationDetail[];

  constructor(details: readonly StructuralValidationDetail[]) {
    super(
      "STRUCTURAL_VALIDATION_FAILED",
      `Analysis payload failed structural validation (${details.length} issue(s)).`,
    );
    this.details = details;
    this.name = "AnalysisStructuralValidationError";
  }
}

export class AnalysisSemanticValidationError extends AnalysisOrchestrationError {
  readonly problems: readonly SemanticProblem[];

  constructor(problems: readonly SemanticProblem[]) {
    super(
      "SEMANTIC_VALIDATION_FAILED",
      `Analysis payload failed semantic validation (${problems.length} issue(s)).`,
    );
    this.problems = problems;
    this.name = "AnalysisSemanticValidationError";
  }
}

export class AnalysisEnvelopeValidationError extends AnalysisOrchestrationError {
  readonly details: readonly StructuralValidationDetail[];

  constructor(details: readonly StructuralValidationDetail[]) {
    super(
      "ENVELOPE_VALIDATION_FAILED",
      `Analysis envelope failed validation (${details.length} issue(s)).`,
    );
    this.details = details;
    this.name = "AnalysisEnvelopeValidationError";
  }
}

export class AnalysisSerializationError extends AnalysisOrchestrationError {
  constructor() {
    super("SERIALIZATION_FAILED", "Foodseyo analysis is not JSON serializable.");
    this.name = "AnalysisSerializationError";
  }
}

export class AnalysisIdGenerationError extends AnalysisOrchestrationError {
  constructor() {
    super("ID_GENERATION_FAILED", "A secure analysis ID generator is unavailable.");
    this.name = "AnalysisIdGenerationError";
  }
}
