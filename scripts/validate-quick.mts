import { reportValidationTotal } from "./test-support/validation.mts";

await import("./validate-analysis-contract.mts");
await import("./validate-home-entry-ui.mts");
await import("./validate-mvp-scope.mts");
await import("./validate-menu-cache-contract.mts");
await import("./validate-analysis-cache-schema.mts");
await import("./validate-structured-menu-schema.mts");
await import("./validate-structured-menu-projection.mts");
await import("./validate-database-program-charter.mts");
await import("./validate-analysis-cache-repositories.mts");
await import("./validate-analysis-cache-integration.mts");

reportValidationTotal("Foodseyo quick regression validation");
