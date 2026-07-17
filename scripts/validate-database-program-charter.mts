import { readdir, readFile } from "node:fs/promises";

import {
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo database program charter validation",
  "Database program charter validation failed",
);
const networkGuard = installNetworkGuard(
  "Database program charter validation must remain network-free.",
);

const [
  agents,
  charter,
  overview,
  productRules,
  logicalModel,
  schemaDraft,
  structuredMenuProjection,
  decisionLog,
  handoff,
  readme,
  activeSchemaIndex,
] = await Promise.all([
  readFile("AGENTS.md", "utf8"),
  readFile("docs/database-program-charter.md", "utf8"),
  readFile("docs/PROJECT_OVERVIEW.md", "utf8"),
  readFile("docs/product-rules.md", "utf8"),
  readFile("docs/database-logical-model-v3.md", "utf8"),
  readFile("docs/database-schema-draft.md", "utf8"),
  readFile("docs/database-structured-menu-projection.md", "utf8"),
  readFile("docs/decision-log.md", "utf8"),
  readFile("docs/CODEX_HANDOFF.md", "utf8"),
  readFile("README.md", "utf8"),
  readFile("src/lib/database/schema/index.ts", "utf8"),
]);

const compact = (value: string): string => value.replace(/\s+/gu, " ").trim();
const compactCharter = compact(charter);

verify(
  charter.includes("## Primary database objective") &&
    compactCharter.includes(
      "faster, semantically consistent, evidence-aware, versioned, and safely reusable",
    ) &&
    compactCharter.includes("reducing unnecessary repeated full-provider reasoning"),
  "charter defines the corrected primary database objective",
);
verify(
  charter.includes("### Path A — exact analysis reuse") &&
    charter.includes("### Path B — semantic dish and culinary-knowledge reuse") &&
    charter.includes("### Path C — restaurant- and branch-scoped reuse"),
  "charter defines all three distinct reuse paths",
);
verify(
  charter.includes("## GPT and deterministic application ownership") &&
    charter.includes("### Before provider execution") &&
    charter.includes("### During provider execution") &&
    charter.includes("### After provider execution") &&
    charter.includes("Navigation to Overview or Dish Detail") &&
    charter.includes("never makes another GPT call"),
  "charter assigns GPT and deterministic application responsibilities",
);
verify(
  charter.includes("## Current core program scope") &&
    charter.includes("restaurant and branch identity candidates") &&
    charter.includes("dish concepts and aliases") &&
    charter.includes("versioned culinary profiles") &&
    charter.includes("pre-provider reusable context retrieval") &&
    charter.includes("post-provider validation"),
  "restaurant, culinary knowledge, and GPT-aware reuse are current core work",
);
verify(
  charter.includes("## Deferred product scope") &&
    charter.includes("Food Passport") &&
    charter.includes("personalized compatibility") &&
    charter.includes("community reviews"),
  "user, personalization, Passport, and community remain deferred",
);
verify(
  charter.includes(
    "source_stated",
  ) &&
    compactCharter.includes(
      "source_stated > inferred_from_source > reviewed culinary_baseline > unknown",
    ) &&
    compactCharter.includes(
      "`unknown` never means absent, false, allergen-safe, dietary-safe, confirmed, or",
    ),
  "charter freezes evidence precedence and unknown semantics",
);
verify(
  charter.includes(
    "basic tastes: `sweet`, `salty`, `sour`, `bitter`, `savory`",
  ) &&
    charter.includes(
      "heat: `none`, `mild`, `medium`, `hot`, `very_hot`, `unknown`",
    ) &&
    charter.includes(
      "richness: `light`, `moderate`, `rich`, `unknown`",
    ) &&
    charter.includes("There is no generic relational `taste` bucket"),
  "charter preserves the separate C1 sensory axes",
);
verify(
  compactCharter.includes(
    "core typical optional regional_variant preparation_dependent",
  ) &&
    compactCharter.includes("exactly one allowed relational typed detail") &&
    charter.includes("unrestricted EAV") &&
    charter.includes("arbitrary claim-value JSON"),
  "charter preserves ingredient roles and relational typed claims",
);
verify(
  charter.includes("## Version and provenance ledger") &&
    charter.includes("source fingerprint and source-fingerprint version") &&
    charter.includes("projector version") &&
    charter.includes("dish-profile version") &&
    charter.includes("merge-policy version") &&
    charter.includes("restaurant-resolution method/version"),
  "charter records the complete version and provenance families",
);
verify(
  charter.includes("## Evaluation program") &&
    charter.includes("Same dish, different restaurant") &&
    charter.includes("Same dish, conflicting preparation") &&
    charter.includes("Aliases and multilingual names") &&
    charter.includes("Changed model, prompt, schema, or profile") &&
    charter.includes("Concurrency and failure"),
  "charter defines the required three-path evaluation categories",
);
verify(
  charter.includes("## Program completion definition") &&
    charter.includes("## Migration and rollout boundaries") &&
    charter.includes("Development success never authorizes Preview or Production"),
  "charter defines completion and per-environment rollout gates",
);
verify(
  agents.includes("docs/database-program-charter.md") &&
    agents.includes("must read the charter first"),
  "repository guide requires the charter for database and consistency work",
);
verify(
  overview.includes("Core consistency database program") &&
    productRules.includes("Core database program") &&
    logicalModel.includes("C2.2-E program scope correction") &&
    schemaDraft.includes("Historical C2.2-D static review") &&
    schemaDraft.includes("exact four-table boundary promoted by C2.3") &&
    structuredMenuProjection.includes(
      "C2.3 Structured-Menu Projection",
    ) &&
    readme.includes("database-program-charter.md"),
  "active durable documentation is aligned with the charter",
);
verify(
  decisionLog.includes("## D-080") &&
    decisionLog.includes("Core Consistency Database Program Charter") &&
    decisionLog.includes("supersedes only"),
  "decision history records the narrow scope and timing supersession",
);
verify(
  handoff.includes("Current checkpoint:** C2.3") &&
    handoff.includes("## Next boundary") &&
    handoff.includes("T7") &&
    handoff.includes("source-acquisition contract"),
  "handoff records completed C2.3 and the separately authorized next boundary",
);
verify(
  !activeSchemaIndex.includes("structured-menu-draft") &&
    !activeSchemaIndex.includes("menuSnapshotsDraft") &&
    activeSchemaIndex.includes('from "./structured-menu.ts"'),
  "C2.3 promotes only the reviewed structured-menu schema",
);

const migrationFiles = (await readdir("database/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
verify(
  migrationFiles.join(",") ===
    [
      "0000_c2_1_b_analysis_cache_schema.sql",
      "0001_c2_3_structured_menu_projection.sql",
    ].join(","),
  "active migration set contains only the reviewed C2.1 and C2.3 migrations",
);
verify(
  networkGuard.callCount === 0,
  "database program charter validation makes zero external network calls",
);
networkGuard.restore();

report();
