import type {
  AnalysisMetadata,
  AnalysisIssue,
  FoodseyoAnalysisPayload,
  InputContext,
  InputType,
  FoodseyoAnalysisSchemaVersion,
} from "../../domain/foodseyo-analysis.ts";

export interface TransientImageInput {
  readonly id: string;
  readonly fileName: string | null;
  readonly mediaType: string | null;
  readonly byteLength: number | null;
  read(): Promise<Uint8Array>;
}

export interface TransientLocationContext {
  readonly latitude: number;
  readonly longitude: number;
  readonly label: string | null;
}

export interface MenuImagesAnalyzeRequest {
  type: "menu_images";
  images: readonly TransientImageInput[];
  userEnteredRestaurantName: string | null;
  location: TransientLocationContext | null;
}

/** @deprecated Compatibility-only request; the default analyzer is unavailable. */
export interface RestaurantPhotoAnalyzeRequest {
  type: "restaurant_photo";
  image: TransientImageInput;
  userEnteredRestaurantName: string | null;
  location: TransientLocationContext | null;
}

/** @deprecated Compatibility-only request; the default analyzer is unavailable. */
export interface RestaurantScreenAnalyzeRequest {
  type: "restaurant_screen";
  image: TransientImageInput;
  sourcePlatformLabel: string | null;
  userEnteredRestaurantName: string | null;
  location: TransientLocationContext | null;
}

export interface RestaurantLinkAnalyzeRequest {
  type: "restaurant_link";
  submittedUrl: string;
  userEnteredRestaurantName: string | null;
}

export interface NearbySearchAnalyzeRequest {
  type: "nearby_search";
  location: TransientLocationContext;
  selectedCandidateId: string | null;
  selectedByUser: boolean;
}

export interface DemoAnalyzeRequest {
  type: "demo";
  fixtureId: string;
}

export type AnalyzeFoodseyoRequest =
  | MenuImagesAnalyzeRequest
  | RestaurantPhotoAnalyzeRequest
  | RestaurantScreenAnalyzeRequest
  | RestaurantLinkAnalyzeRequest
  | NearbySearchAnalyzeRequest
  | DemoAnalyzeRequest;

export type AnalyzeRequestByType<TInputType extends InputType> = Extract<
  AnalyzeFoodseyoRequest,
  { type: TInputType }
>;

export type AnalysisCapability =
  | "demo_analysis"
  | "menu_analysis"
  | "restaurant_photo_analysis"
  | "restaurant_screen_analysis"
  | "restaurant_link_analysis"
  | "nearby_search"
  | "external_research";

export interface AnalyzerExecutionContext {
  readonly signal: AbortSignal | null;
}

export interface AnalysisDraft {
  readonly schemaVersion?: FoodseyoAnalysisSchemaVersion;
  readonly analysisMetadata?: AnalysisMetadata;
  readonly inputContext: InputContext;
  readonly payloadCandidate: unknown;
  readonly operationalIssues: readonly AnalysisIssue[];
  readonly completedCapabilities: readonly AnalysisCapability[];
  readonly degradedCapabilities: readonly AnalysisCapability[];
  readonly coreCapability: AnalysisCapability;
}

export interface AnalysisAnalyzer<TRequest extends AnalyzeFoodseyoRequest> {
  readonly inputType: TRequest["type"];
  analyze(request: TRequest, context: AnalyzerExecutionContext): Promise<AnalysisDraft>;
}

export type AnalysisAnalyzerRegistry = {
  readonly [TInputType in InputType]: AnalysisAnalyzer<
    AnalyzeRequestByType<TInputType>
  >;
};

export interface AnalyzeFoodseyoOptions {
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
  readonly createAnalysisId?: () => string;
  readonly analyzerRegistry?: AnalysisAnalyzerRegistry;
}

export type SemanticRuleCode =
  | "DUPLICATE_EVIDENCE_ID"
  | "EVIDENCE_REFERENCE_MISSING"
  | "AVAILABLE_CLAIM_WITHOUT_EVIDENCE"
  | "CONFIRMED_RESTAURANT_MISSING"
  | "CONFIRMED_BY_MISSING"
  | "CONFIRMED_EVIDENCE_MISSING"
  | "LIKELY_CANDIDATE_MISSING"
  | "LIKELY_HAS_CONFIRMED_BY"
  | "UNCONFIRMED_HAS_CONFIRMED_BY"
  | "NOT_ATTEMPTED_HAS_CONFIRMED_BY"
  | "RESTAURANT_PROVENANCE_INVALID"
  | "RESTAURANT_SCOPE_INVALID"
  | "RESTAURANT_CONFLICT_INVALID"
  | "SELECTED_CANDIDATE_MISSING"
  | "MULTIPLE_USER_SELECTED_CANDIDATES"
  | "RESTAURANT_SPECIFIC_FACT_UNCONFIRMED"
  | "DUPLICATE_DISH_ID"
  | "DUPLICATE_CATEGORY_ID"
  | "DISH_CATEGORY_REFERENCE_MISSING"
  | "FEATURED_DISH_REFERENCE_MISSING"
  | "DUPLICATE_FEATURED_DISH_ID"
  | "PRICE_EVIDENCE_MISMATCH"
  | "PRICE_EVIDENCE_SOURCE_MISSING"
  | "ORDERING_DISH_REFERENCE_MISSING"
  | "ESTIMATED_TOTAL_EVIDENCE_MISMATCH"
  | "ESTIMATED_TOTAL_WITH_UNKNOWN_PRICE"
  | "REVIEW_INSUFFICIENT_CONTEXT_MISSING"
  | "REVIEW_COUNT_MISMATCH"
  | "REVIEW_EVIDENCE_MISSING"
  | "MIXED_REVIEW_DISAGREEMENT_MISSING"
  | "FRESHNESS_CHECK_MISSING"
  | "FRESHNESS_SOURCE_MISSING"
  | "FRESHNESS_OFFICIAL_SOURCE_MISSING"
  | "FRESHNESS_DIFFERENCE_CONTEXT_MISSING"
  | "IMAGE_UNAVAILABLE_MISMATCH"
  | "IMAGE_ATTRIBUTION_MISSING"
  | "GENERAL_REFERENCE_RESTAURANT_SPECIFIC"
  | "GENERAL_REFERENCE_LIMITATION_MISSING"
  | "GENERAL_REFERENCE_RIGHTS_INVALID"
  | "GENERAL_REFERENCE_SOURCE_MISSING"
  | "SCREEN_IMAGE_RIGHTS_UNVERIFIED"
  | "SESSION_IMAGE_PERSISTED"
  | "RESTAURANT_SPECIFIC_IMAGE_SOURCE_INVALID"
  | "RESTAURANT_SPECIFIC_IMAGE_RESTAURANT_UNCONFIRMED"
  | "DIETARY_CONFIRMATION_EVIDENCE_MISSING"
  | "DIETARY_GENERAL_KNOWLEDGE_CONFIRMED"
  | "DIETARY_STAFF_CONTEXT_MISSING";

export interface SemanticProblem {
  readonly code: SemanticRuleCode;
  readonly message: string;
  readonly relatedEntityIds: readonly string[];
}

export interface SemanticValidationResult {
  readonly errors: readonly SemanticProblem[];
  readonly warnings: readonly AnalysisIssue[];
}

export interface ValidatedAnalysisDraft extends AnalysisDraft {
  readonly payload: FoodseyoAnalysisPayload;
}
