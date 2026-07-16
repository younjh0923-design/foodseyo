import { reportValidationTotal } from "./test-support/validation.mts";

await import("./validate-home-entry-ui.mts");
await import("./validate-menu-image-analysis.mts");
await import("./validate-menu-image-hardening.mts");
await import("./validate-menu-analysis-completion.mts");
await import("./validate-menu-analysis-response-boundaries.mts");

reportValidationTotal("Foodseyo menu regression validation");
