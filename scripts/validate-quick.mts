import { reportValidationTotal } from "./test-support/validation.mts";

await import("./validate-analysis-contract.mts");
await import("./validate-home-entry-ui.mts");
await import("./validate-mvp-scope.mts");

reportValidationTotal("Foodseyo quick regression validation");
