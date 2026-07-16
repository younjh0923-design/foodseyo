import { reportValidationTotal } from "./test-support/validation.mts";

await import("./validate-menu-analysis-completion.mts");
await import("./validate-live-analysis-results.mts");

reportValidationTotal("Foodseyo result regression validation");
