import { readFile } from "node:fs/promises";
import {
  ANALYSIS_CONSISTENCY_PROFILE,
  ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  ANALYSIS_FINGERPRINT_HASH_ALGORITHM,
  BASIC_TASTES,
  FLAVOR_NOTES,
  HEAT_LEVELS,
  INGREDIENT_EVIDENCE_BASES,
  RICHNESS_LEVELS,
  TEXTURES,
  canonicalSerialize,
  createAnalysisConsistencyVersionMetadata,
  createDishFingerprint,
  createSourceFingerprint,
  isDishFingerprint,
  isSourceFingerprint,
  normalizeDishConsistency,
  renderDishConsistencyWording,
  validateAnalysisConsistency,
  validateCanonicalSerialization,
  validateDishFingerprintInput,
  validateSourceFingerprintInput,
  type DishFingerprintInput,
  type SourceFingerprintInput,
} from "../src/lib/analysis-consistency/index.ts";
import {
  ambiguousConsistencyInput,
  equivalentConsistencyInputA,
  equivalentConsistencyInputB,
  ingredientEvidenceInput,
  repeatabilityFixtureNames,
} from "./fixtures/analysis-consistency-fixtures.mts";
import {
  createValidationSuite,
  installNetworkGuard,
} from "./test-support/validation.mts";

const { verify, report } = createValidationSuite(
  "Foodseyo analysis consistency validation",
  "Consistency validation failed",
);
const network = installNetworkGuard(
  "Analysis consistency validation must remain network-free.",
);

verify(
  ANALYSIS_CONSISTENCY_PROFILE_VERSION === "foodseyo-consistency-v1",
  "profile version is exact",
);
verify(
  ANALYSIS_CONSISTENCY_PROFILE.version === ANALYSIS_CONSISTENCY_PROFILE_VERSION,
  "profile exports one version source",
);
verify(
  canonicalSerialize(BASIC_TASTES) ===
    canonicalSerialize(["sweet", "salty", "sour", "bitter", "savory"]),
  "basic-taste vocabulary is exact",
);
verify(!BASIC_TASTES.includes("spicy" as never), "spicy is not a basic taste");
verify(!BASIC_TASTES.includes("rich" as never), "rich is not a basic taste");
verify(!BASIC_TASTES.includes("fresh" as never), "fresh is not a basic taste");
verify(
  canonicalSerialize(FLAVOR_NOTES) ===
    canonicalSerialize([
      "smoky",
      "herbal",
      "nutty",
      "earthy",
      "garlicky",
      "buttery",
      "cheesy",
      "fruity",
      "citrusy",
      "fermented",
    ]),
  "flavor-note vocabulary is exact",
);
verify(!FLAVOR_NOTES.includes("aromatic" as never), "marketing aroma is excluded");
verify(!FLAVOR_NOTES.includes("fresh" as never), "freshness is not a flavor note");
verify(
  canonicalSerialize(HEAT_LEVELS) ===
    canonicalSerialize(["none", "mild", "medium", "hot", "very_hot", "unknown"]),
  "heat vocabulary is exact",
);
verify(
  canonicalSerialize(RICHNESS_LEVELS) ===
    canonicalSerialize(["light", "moderate", "rich", "unknown"]),
  "richness vocabulary is exact",
);
verify(TEXTURES.length === 16, "texture vocabulary has sixteen values");
verify(TEXTURES[0] === "crispy" && TEXTURES[1] === "crunchy", "crispy and crunchy stay distinct");
verify(TEXTURES.includes("juicy") && TEXTURES.includes("moist"), "juicy and moist stay distinct");
verify(TEXTURES.includes("creamy") && TEXTURES.includes("silky"), "creamy and silky stay distinct");
verify(
  Object.keys(ANALYSIS_CONSISTENCY_PROFILE.textureDefinitions).length === TEXTURES.length,
  "every texture has a meaning boundary",
);
verify(
  canonicalSerialize(INGREDIENT_EVIDENCE_BASES) ===
    canonicalSerialize(["stated", "typical", "uncertain"]),
  "ingredient evidence basis is exact",
);
verify(
  ANALYSIS_CONSISTENCY_PROFILE.tagLimits.basicTastes === 3 &&
    ANALYSIS_CONSISTENCY_PROFILE.tagLimits.flavorNotes === 3 &&
    ANALYSIS_CONSISTENCY_PROFILE.tagLimits.textures === 2,
  "tag limits are exact",
);
verify(
  ANALYSIS_CONSISTENCY_PROFILE.intensityScale[1] === "mild" &&
    ANALYSIS_CONSISTENCY_PROFILE.intensityScale[2] === "noticeable" &&
    ANALYSIS_CONSISTENCY_PROFILE.intensityScale[3] === "prominent",
  "intensity meanings are exact",
);
verify(
  ANALYSIS_CONSISTENCY_PROFILE.contradictions.length === 2,
  "only explicit contradiction pairs are configured",
);
verify(
  !ANALYSIS_CONSISTENCY_PROFILE.contradictions.some(
    ([left, right]) => left === "crispy" || right === "crispy",
  ),
  "crispy is not broadly treated as contradictory",
);

const normalizedA = normalizeDishConsistency(equivalentConsistencyInputA);
const normalizedB = normalizeDishConsistency(equivalentConsistencyInputB);
verify(normalizedA.issues.length === 0, "clear aliases normalize without issues");
verify(
  normalizedB.issues.some((entry) => entry.code === "duplicate_value"),
  "duplicate aliases produce a safe issue",
);
verify(
  canonicalSerialize(normalizedA.value) === canonicalSerialize(normalizedB.value),
  "equivalent inputs normalize identically",
);
verify(normalizedA.value.basicTastes.length === 2, "selected basic tastes stay sparse");
verify(normalizedA.value.basicTastes[0].value === "sweet", "profile order puts sweet first");
verify(normalizedA.value.basicTastes[1].value === "savory", "umami normalizes to savory");
verify(normalizedA.value.basicTastes[1].intensity === 3, "strongest duplicate intensity wins");
verify(
  canonicalSerialize(normalizedA.value.flavorNotes) ===
    canonicalSerialize(["smoky", "garlicky"]),
  "flavor aliases use profile order",
);
verify(
  canonicalSerialize(normalizedA.value.textures) ===
    canonicalSerialize(["tender", "juicy"]),
  "texture input order does not change profile order",
);
verify(normalizedA.value.heatLevel === "mild", "heat normalizes independently");
verify(normalizedA.value.richnessLevel === "rich", "richness normalizes independently");

const empty = normalizeDishConsistency({}).value;
verify(empty.basicTastes.length === 0, "missing basic tastes become an empty array");
verify(empty.flavorNotes.length === 0, "missing flavor notes become an empty array");
verify(empty.textures.length === 0, "missing textures become an empty array");
verify(empty.heatLevel === "unknown", "missing heat becomes unknown");
verify(empty.richnessLevel === "unknown", "missing richness becomes unknown");
verify(empty.ingredients.length === 0, "missing ingredients become an empty array");

const ambiguous = normalizeDishConsistency(ambiguousConsistencyInput);
verify(ambiguous.value.basicTastes.length === 0, "ambiguous taste words are not promoted");
verify(ambiguous.value.flavorNotes.length === 0, "ambiguous flavor words are not promoted");
verify(ambiguous.value.textures.length === 0, "ambiguous texture words are not promoted");
verify(ambiguous.value.heatLevel === "unknown", "warmly spiced does not establish heat");
verify(ambiguous.value.richnessLevel === "unknown", "missing richness stays unknown");
verify(ambiguous.issues.length === 14, "ambiguous values each produce safe issues");

const malformed = normalizeDishConsistency({
  basicTastes: "savory",
  flavorNotes: [42],
  heatLevel: ["hot"],
  richnessLevel: { value: "rich" },
  textures: null,
  ingredients: [{ name: 42, basis: "stated" }],
});
verify(malformed.value.basicTastes.length === 0, "malformed basic-taste axis is safely rejected");
verify(malformed.value.flavorNotes.length === 0, "malformed flavor value is safely rejected");
verify(malformed.value.heatLevel === "unknown", "malformed heat input safely becomes unknown");
verify(malformed.value.richnessLevel === "unknown", "malformed richness input safely becomes unknown");
verify(malformed.value.textures.length === 0, "malformed texture axis is safely rejected");
verify(malformed.value.ingredients.length === 0, "malformed ingredient is safely rejected");

const axisSeparation = normalizeDishConsistency({
  basicTastes: [{ value: "spicy", intensity: 3 }],
  flavorNotes: ["buttery", "earthy"],
  textures: ["moist", "light", "creamy"],
  heatLevel: "spiced",
  richnessLevel: "light",
}).value;
verify(axisSeparation.basicTastes.length === 0, "spicy is rejected from basic tastes");
verify(axisSeparation.flavorNotes.includes("buttery"), "buttery remains a flavor note");
verify(axisSeparation.flavorNotes.includes("earthy"), "earthy is not changed to nutty");
verify(axisSeparation.textures.includes("moist"), "moist remains its own texture");
verify(axisSeparation.textures.includes("creamy"), "creamy remains a texture");
verify(!axisSeparation.textures.includes("airy"), "light does not become airy");
verify(axisSeparation.heatLevel === "unknown", "spiced does not become spicy heat");
verify(axisSeparation.richnessLevel === "light", "light remains a richness level");

const aliases = normalizeDishConsistency({
  flavorNotes: [
    "cheesy flavor",
    "buttery flavor",
    "citrus-forward",
    "smoky flavor",
    "fermented flavor",
  ],
  textures: ["crisp", "velvety", "fluffy", "pillowy"],
}).value;
verify(aliases.flavorNotes[0] === "smoky", "smoky flavor alias is explicit");
verify(aliases.flavorNotes.includes("buttery"), "buttery flavor alias is explicit");
verify(aliases.flavorNotes.includes("cheesy"), "cheesy flavor alias is explicit");
verify(aliases.flavorNotes.length === 3, "flavor alias output respects its tag limit");
verify(aliases.textures[0] === "crispy", "crisp normalizes to crispy");
verify(aliases.textures[1] === "airy", "airy aliases merge under the texture limit");
verify(!aliases.textures.includes("silky"), "profile-order selection is deterministic at the limit");

const excess = normalizeDishConsistency({
  basicTastes: [
    { value: "sweet", intensity: 1 },
    { value: "salty", intensity: 2 },
    { value: "sour", intensity: 3 },
    { value: "bitter", intensity: 3 },
    { value: "savory", intensity: 2 },
  ],
  flavorNotes: ["fermented", "citrusy", "fruity", "smoky"],
  textures: ["moist", "airy", "dense"],
});
verify(
  canonicalSerialize(excess.value.basicTastes.map((entry) => entry.value)) ===
    canonicalSerialize(["salty", "sour", "bitter"]),
  "excess tastes select by intensity then profile order",
);
verify(
  canonicalSerialize(excess.value.flavorNotes) ===
    canonicalSerialize(["smoky", "fruity", "citrusy"]),
  "excess flavor notes select in profile order",
);
verify(
  canonicalSerialize(excess.value.textures) === canonicalSerialize(["dense", "airy"]),
  "excess textures select in profile order",
);
verify(
  excess.issues.filter((entry) => entry.code === "tag_limit_exceeded").length === 3,
  "every exceeded tag axis reports an issue",
);

const ingredients = normalizeDishConsistency(ingredientEvidenceInput);
verify(ingredients.value.ingredients.length === 5, "normalized ingredient duplicates merge");
verify(
  ingredients.value.ingredients[0].name === "cumin" &&
    ingredients.value.ingredients[0].basis === "stated",
  "stated ingredient evidence wins over typical",
);
verify(
  ingredients.value.ingredients[1].name === "lamb" &&
    ingredients.value.ingredients[2].name === "parsley",
  "stated ingredients sort by normalized name",
);
verify(
  ingredients.value.ingredients[3].name === "onion" &&
    ingredients.value.ingredients[3].basis === "typical",
  "limited safe plural normalization is applied",
);
verify(
  ingredients.value.ingredients[4].name === "tomato" &&
    ingredients.value.ingredients[4].basis === "uncertain",
  "uncertain ingredients sort after typical",
);
verify(
  ingredients.issues.some((entry) => entry.code === "ingredient_basis_conflict"),
  "ingredient basis conflict is reported without raw content",
);

const wordingA = renderDishConsistencyWording(normalizedA.value);
const wordingB = renderDishConsistencyWording(normalizedB.value);
verify(canonicalSerialize(wordingA) === canonicalSerialize(wordingB), "equivalent wording is deterministic");
verify(
  wordingA.basicTastes === "Mild sweetness and prominent savory taste.",
  "taste wording follows fixed intensity language",
);
verify(wordingA.flavorNotes === "Smoky and garlicky.", "flavor wording is deterministic");
verify(wordingA.heat === "Mild heat.", "heat wording is deterministic");
verify(wordingA.richness === "Rich.", "richness wording is deterministic");
verify(wordingA.textures === "Tender and juicy.", "texture wording is deterministic");
verify(renderDishConsistencyWording(empty).heat === null, "unknown heat wording is omitted");
verify(renderDishConsistencyWording(empty).richness === null, "unknown richness wording is omitted");

const ingredientWording = renderDishConsistencyWording(ingredients.value);
verify(
  ingredientWording.statedIngredients === "Listed ingredients: Cumin, Lamb, and Parsley.",
  "stated ingredients have separate Oxford-comma wording",
);
verify(
  ingredientWording.typicalIngredients === "Typically may include: Onion.",
  "typical ingredients remain separately qualified",
);
verify(
  ingredientWording.uncertainIngredients ===
    "Other possible ingredients could not be confirmed.",
  "uncertain ingredients use a summary instead of speculative listing",
);

verify(
  canonicalSerialize({ z: 1, a: { d: 2, b: 3 } }) ===
    canonicalSerialize({ a: { b: 3, d: 2 }, z: 1 }),
  "canonical serialization ignores object key order",
);
verify(
  canonicalSerialize(normalizedA.value) === canonicalSerialize(normalizedB.value),
  "canonical serialization is byte-equivalent for repeatable inputs",
);
verify(
  validateCanonicalSerialization(normalizedA.value, canonicalSerialize(normalizedA.value)).length === 0,
  "canonical serialization validates",
);
verify(
  validateCanonicalSerialization(normalizedA.value, JSON.stringify({ basicTastes: [] })).length === 1,
  "non-canonical serialization is detected",
);

const versions = createAnalysisConsistencyVersionMetadata({
  modelVersion: "gpt-5.6",
  promptVersion: "menu-image-v1",
  schemaVersion: "1.0.0",
});
verify(versions.modelVersion === "gpt-5.6", "model version is explicit");
verify(versions.promptVersion === "menu-image-v1", "prompt version is explicit");
verify(versions.schemaVersion === "1.0.0", "schema version is explicit");
verify(
  versions.consistencyProfileVersion === "foodseyo-consistency-v1",
  "profile version is bound into metadata",
);

const validContractIssues = validateAnalysisConsistency({
  versions,
  consistency: normalizedA.value,
});
verify(validContractIssues.length === 0, "normalized versioned contract passes semantic validation");

const invalidContractIssues = validateAnalysisConsistency({
  versions: null,
  consistency: {
    basicTastes: [
      { value: "savory", intensity: 0 },
      { value: "savory", intensity: 3 },
      { value: "spicy", intensity: 2 },
      { value: "sweet", intensity: 2 },
    ],
    flavorNotes: ["smoky", "smoky", "bold", "herbal"],
    heatLevel: ["spiced", "hot"],
    richnessLevel: [],
    textures: ["airy", "dense", "smooth"],
    ingredients: [
      { name: "", basis: "stated" },
      { name: "Secret Menu Text", basis: "typical" },
      { name: "secret menu text", basis: "stated" },
      { name: "onion", basis: "guessed" },
    ],
  },
});
const invalidCodes = new Set(invalidContractIssues.map((entry) => entry.code));
for (const expectedCode of [
  "version_metadata_missing",
  "basic_taste_intensity_invalid",
  "duplicate_value",
  "axis_value_invalid",
  "tag_limit_exceeded",
  "deterministic_order_invalid",
  "heat_level_multiple",
  "spiced_is_not_heat",
  "richness_level_multiple",
  "texture_contradiction",
  "ingredient_name_empty",
  "ingredient_basis_invalid",
  "ingredient_basis_conflict",
  "ingredient_order_invalid",
] as const) {
  verify(invalidCodes.has(expectedCode), `validator detects ${expectedCode}`);
}
verify(
  !JSON.stringify(invalidContractIssues).includes("Secret Menu Text"),
  "validator issues never echo raw ingredient content",
);

const sourceInput: SourceFingerprintInput = {
  sourceType: "menu_images",
  sourceIdentifier: "synthetic-menu-set-001",
  restaurantIdentifier: "synthetic-restaurant-a",
  branchIdentifier: "downtown",
  sourceRevision: "revision-1",
  versions,
};
verify(validateSourceFingerprintInput(sourceInput).length === 0, "source fingerprint input validates");
verify(
  validateSourceFingerprintInput({ ...sourceInput, sourceIdentifier: "" }).some(
    (entry) => entry.code === "fingerprint_input_malformed",
  ),
  "malformed source fingerprint input is detected",
);

const sourceFingerprint = await createSourceFingerprint(sourceInput);
const equivalentSourceFingerprint = await createSourceFingerprint({
  ...sourceInput,
  sourceType: " MENU_IMAGES ",
  sourceIdentifier: "Synthetic-Menu-Set-001",
});
verify(isSourceFingerprint(sourceFingerprint), "source fingerprint has the safe prefixed shape");
verify(sourceFingerprint === equivalentSourceFingerprint, "source identity normalization is deterministic");
verify(
  sourceFingerprint !==
    (await createSourceFingerprint({
      ...sourceInput,
      restaurantIdentifier: "synthetic-restaurant-b",
    })),
  "restaurant identity changes the source fingerprint",
);
verify(
  sourceFingerprint !==
    (await createSourceFingerprint({ ...sourceInput, branchIdentifier: "airport" })),
  "branch identity changes the source fingerprint",
);
verify(
  sourceFingerprint !==
    (await createSourceFingerprint({ ...sourceInput, sourceRevision: "revision-2" })),
  "source revision changes the source fingerprint",
);

const dishInput: DishFingerprintInput = {
  sourceFingerprint,
  dishName: repeatabilityFixtureNames[1],
  originalDescription: "Synthetic fixture description",
  categoryLabel: "Synthetic mains",
  price: { amount: 12, currency: "USD", displayText: "$12" },
  consistency: normalizedA.value,
  versions,
};
verify(validateDishFingerprintInput(dishInput).length === 0, "dish fingerprint input validates");
verify(
  validateDishFingerprintInput({ ...dishInput, sourceFingerprint: "invalid" }).some(
    (entry) => entry.code === "fingerprint_input_malformed",
  ),
  "malformed dish source fingerprint is detected",
);

const dishFingerprint = await createDishFingerprint(dishInput);
const equivalentDishFingerprint = await createDishFingerprint({
  ...dishInput,
  dishName: "  LAMB   KOFTA ",
  consistency: normalizedB.value,
});
verify(isDishFingerprint(dishFingerprint), "dish fingerprint has the safe prefixed shape");
verify(dishFingerprint === equivalentDishFingerprint, "equivalent normalized dish input hashes identically");
verify(
  dishFingerprint !==
    (await createDishFingerprint({
      ...dishInput,
      originalDescription: "Changed synthetic description",
    })),
  "description changes the dish fingerprint",
);
verify(
  dishFingerprint !==
    (await createDishFingerprint({
      ...dishInput,
      price: { ...dishInput.price, amount: 13, displayText: "$13" },
    })),
  "price changes the dish fingerprint",
);
verify(
  dishFingerprint !==
    (await createDishFingerprint({
      ...dishInput,
      price: { ...dishInput.price, currency: "CAD" },
    })),
  "currency changes the dish fingerprint",
);
verify(
  dishFingerprint !==
    (await createDishFingerprint({
      ...dishInput,
      sourceFingerprint: await createSourceFingerprint({
        ...sourceInput,
        branchIdentifier: "airport",
      }),
    })),
  "restaurant branch changes the dish fingerprint through source identity",
);
verify(ANALYSIS_FINGERPRINT_HASH_ALGORITHM === "SHA-256", "fingerprints use SHA-256");

const alternateVersions = createAnalysisConsistencyVersionMetadata({
  modelVersion: "gpt-5.6",
  promptVersion: "menu-image-v2",
  schemaVersion: "1.0.0",
});
verify(
  sourceFingerprint !==
    (await createSourceFingerprint({ ...sourceInput, versions: alternateVersions })),
  "version metadata changes future source identity",
);

verify(repeatabilityFixtureNames.length === 6, "six synthetic repeatability fixture labels exist");
verify(
  repeatabilityFixtureNames.every((name) => typeof name === "string" && name.length > 0),
  "fixture labels are identifiers rather than empty truth data",
);

const modulePaths = [
  "src/lib/analysis-consistency/profile.ts",
  "src/lib/analysis-consistency/normalize.ts",
  "src/lib/analysis-consistency/metadata.ts",
  "src/lib/analysis-consistency/fingerprint.ts",
  "src/lib/analysis-consistency/wording.ts",
  "src/lib/analysis-consistency/validate.ts",
] as const;
const moduleSource = (
  await Promise.all(modulePaths.map((path) => readFile(path, "utf8")))
).join("\n");
verify(!/\bfetch\s*\(/u.test(moduleSource), "consistency foundation contains no network fetch");
verify(!/\bOpenAI\b|responses\.parse/u.test(moduleSource), "consistency foundation contains no provider call");
verify(!/process\.env|OPENAI_API_KEY/u.test(moduleSource), "consistency foundation reads no environment secret");
verify(!/console\.(?:log|error|warn)/u.test(moduleSource), "consistency foundation logs no raw input or fingerprint");

const [technicalDoc, productRules, inputArchitecture, decisionLog, packageJson, allValidation] =
  await Promise.all([
    readFile("docs/analysis-consistency.md", "utf8"),
    readFile("docs/product-rules.md", "utf8"),
    readFile("docs/input-architecture.md", "utf8"),
    readFile("docs/decision-log.md", "utf8"),
    readFile("package.json", "utf8"),
    readFile("scripts/validate-all.mts", "utf8"),
  ]);
verify(technicalDoc.includes("foodseyo-consistency-v1"), "technical doc records the profile version");
verify(technicalDoc.includes("C1.2 is the next checkpoint"), "technical doc keeps live integration in C1.2");
verify(technicalDoc.includes("does not add a server cache, database"), "technical doc excludes cache and database work");
verify(productRules.includes("**C1.1:**") && productRules.includes("**C1.2:**"), "product roadmap includes both C1 checkpoints");
verify(inputArchitecture.includes("C1 is a separate checkpoint before T7"), "input roadmap keeps C1 before T7");
verify(decisionLog.includes("D-061 — Establish the analysis consistency contract before T7"), "decision log preserves the new scope decision");
verify(packageJson.includes('"verify:consistency"'), "targeted consistency command is registered");
verify(
  allValidation.match(/validate-analysis-consistency\.mts/gu)?.length === 1,
  "full validation includes consistency exactly once",
);

const liveSource = (
  await Promise.all(
    [
      "src/domain/foodseyo-analysis.ts",
      "src/services/menu-analysis/menu-image-model-schema.ts",
      "src/services/menu-analysis/menu-image-prompt.ts",
      "src/services/menu-analysis/openai-menu-request.ts",
      "src/services/menu-analysis/menu-image-adapter.ts",
      "src/lib/live-analysis-results.ts",
      "src/lib/storage.ts",
    ].map((path) => readFile(path, "utf8")),
  )
).join("\n");
verify(
  !liveSource.includes("analysis-consistency"),
  "C1.1 foundation is not imported by the live provider, schema, storage, or result path",
);
verify(network.callCount === 0, "consistency evaluation made zero network calls");
network.restore();

report();
