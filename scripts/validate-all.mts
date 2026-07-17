await import("./validate-analysis-contract.mts");
await import("./validate-analysis-orchestration.mts");
await import("./validate-menu-image-analysis.mts");
await import("./validate-menu-image-hardening.mts");
await import("./validate-home-entry-ui.mts");
await import("./validate-menu-analysis-completion.mts");
await import("./validate-live-analysis-results.mts");
await import("./validate-menu-analysis-response-boundaries.mts");
await import("./validate-mvp-scope.mts");
await import("./validate-analysis-consistency.mts");
await import("./validate-consistency-integration.mts");
await import("./validate-menu-cache-contract.mts");
await import("./validate-analysis-cache-schema.mts");
await import("./validate-structured-menu-schema-draft.mts");
await import("./validate-analysis-cache-repositories.mts");
await import("./validate-analysis-cache-integration.mts");

const { reportValidationTotal } = await import("./test-support/validation.mts");
reportValidationTotal("Foodseyo full network-free validation");
