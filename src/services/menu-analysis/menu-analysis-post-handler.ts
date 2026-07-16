import {
  AnalysisAbortedError,
  AnalysisEnvelopeValidationError,
  AnalysisSemanticValidationError,
  AnalysisStructuralValidationError,
  analyzeFoodseyoInput,
  createAnalyzerRegistry,
} from "../analysis/index.ts";
import { mapMenuAnalysisError } from "./menu-analysis-api-errors.ts";
import {
  MENU_ANALYSIS_CORRELATION_HEADER,
  type MenuAnalysisApiResponse,
} from "./menu-analysis-api.ts";
import { MenuAnalysisError } from "./menu-analysis-errors.ts";
import { createMenuImagesAnalyzer } from "./menu-images-analyzer.ts";
import type { MenuVisionProvider } from "./menu-vision-provider.ts";
import {
  MenuUploadValidationError,
  toTransientImageInputs,
  validateRestaurantName,
  validateUploadedMenuImages,
} from "./menu-upload-validation.ts";

export const MENU_ANALYSIS_NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export type MenuAnalysisObservationStage =
  | "success"
  | "upload_validation"
  | "analysis_aborted"
  | "structural_validation"
  | "semantic_validation"
  | "envelope_validation"
  | "menu_analysis"
  | "internal";

export interface MenuAnalysisObservation {
  readonly correlationId: string;
  readonly httpStatus: number;
  readonly durationMs: number;
  readonly responseByteLength: number;
  readonly failureStageCode: MenuAnalysisObservationStage;
  readonly structuralErrorCount: number;
  readonly semanticErrorCount: number;
}

export interface MenuAnalysisPostHandlerDependencies {
  createProvider(): MenuVisionProvider;
  createCorrelationId?(): string;
  now?(): number;
  logObservation?(observation: MenuAnalysisObservation): void;
}

const responseEncoder = new TextEncoder();

const defaultLogObservation = (observation: MenuAnalysisObservation): void => {
  console.info("[foodseyo-menu-analysis]", observation);
};

const createJsonResponse = (
  body: MenuAnalysisApiResponse,
  status: number,
  correlationId: string,
): { readonly response: Response; readonly byteLength: number } => {
  const serialized = JSON.stringify(body);
  return {
    response: new Response(serialized, {
      status,
      headers: {
        ...MENU_ANALYSIS_NO_STORE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        [MENU_ANALYSIS_CORRELATION_HEADER]: correlationId,
      },
    }),
    byteLength: responseEncoder.encode(serialized).byteLength,
  };
};

export const describeMenuAnalysisFailure = (
  error: unknown,
): Pick<
  MenuAnalysisObservation,
  "failureStageCode" | "structuralErrorCount" | "semanticErrorCount"
> => {
  if (error instanceof MenuUploadValidationError) {
    return {
      failureStageCode: "upload_validation",
      structuralErrorCount: 0,
      semanticErrorCount: 0,
    };
  }
  if (error instanceof AnalysisAbortedError) {
    return {
      failureStageCode: "analysis_aborted",
      structuralErrorCount: 0,
      semanticErrorCount: 0,
    };
  }
  if (error instanceof AnalysisStructuralValidationError) {
    return {
      failureStageCode: "structural_validation",
      structuralErrorCount: error.details.length,
      semanticErrorCount: 0,
    };
  }
  if (error instanceof AnalysisSemanticValidationError) {
    return {
      failureStageCode: "semantic_validation",
      structuralErrorCount: 0,
      semanticErrorCount: error.problems.length,
    };
  }
  if (error instanceof AnalysisEnvelopeValidationError) {
    return {
      failureStageCode: "envelope_validation",
      structuralErrorCount: error.details.length,
      semanticErrorCount: 0,
    };
  }
  if (error instanceof MenuAnalysisError) {
    return {
      failureStageCode: "menu_analysis",
      structuralErrorCount: 0,
      semanticErrorCount: 0,
    };
  }
  return {
    failureStageCode: "internal",
    structuralErrorCount: 0,
    semanticErrorCount: 0,
  };
};

export function createMenuAnalysisPostHandler(
  dependencies: MenuAnalysisPostHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const now = dependencies.now ?? (() => performance.now());
    const startedAt = now();
    const correlationId =
      dependencies.createCorrelationId?.() ?? globalThis.crypto.randomUUID();
    const logObservation =
      dependencies.logObservation ?? defaultLogObservation;
    const observe = (
      status: number,
      byteLength: number,
      details: Pick<
        MenuAnalysisObservation,
        "failureStageCode" | "structuralErrorCount" | "semanticErrorCount"
      >,
    ) => {
      try {
        logObservation({
          correlationId,
          httpStatus: status,
          durationMs: Math.max(0, Math.round(now() - startedAt)),
          responseByteLength: byteLength,
          ...details,
        });
      } catch {
        // Observability must never change the user response.
      }
    };

    try {
      const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("multipart/form-data")) {
        throw new MenuUploadValidationError(
          "INVALID_MULTIPART_REQUEST",
          "Submit menu images as multipart form data.",
          400,
        );
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        throw new MenuUploadValidationError(
          "INVALID_MULTIPART_REQUEST",
          "The uploaded form data could not be read.",
          400,
        );
      }

      const imageEntries = formData.getAll("images");
      if (imageEntries.some((entry) => typeof entry === "string")) {
        throw new MenuUploadValidationError(
          "INVALID_MULTIPART_REQUEST",
          "Every images field must contain an image file.",
          400,
        );
      }

      const validatedImages = await validateUploadedMenuImages(imageEntries as File[]);
      const restaurantName = validateRestaurantName(formData.get("restaurantName"));
      const provider = dependencies.createProvider();
      const registry = createAnalyzerRegistry({
        menu_images: createMenuImagesAnalyzer({ provider }),
      });
      const analysis = await analyzeFoodseyoInput(
        {
          type: "menu_images",
          images: toTransientImageInputs(validatedImages),
          userEnteredRestaurantName: restaurantName,
          location: null,
        },
        {
          signal: request.signal,
          analyzerRegistry: registry,
        },
      );

      const result = createJsonResponse(
        { ok: true, analysis },
        200,
        correlationId,
      );
      observe(200, result.byteLength, {
        failureStageCode: "success",
        structuralErrorCount: 0,
        semanticErrorCount: 0,
      });
      return result.response;
    } catch (error) {
      const safe = mapMenuAnalysisError(error);
      const result = createJsonResponse(
        safe.body,
        safe.status,
        correlationId,
      );
      observe(
        safe.status,
        result.byteLength,
        describeMenuAnalysisFailure(error),
      );
      return result.response;
    }
  };
}
