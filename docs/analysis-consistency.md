# Foodseyo Analysis Consistency Contract

**Status:** C1.1 foundation; not connected to live analysis

**Profile:** `foodseyo-consistency-v1`

**Date:** 2026-07-16

## Boundary

C1 is a product-quality checkpoint before T7. C1.1 adds reusable deterministic contracts in `src/lib/analysis-consistency/`; C1.2 is the next checkpoint and will evaluate live menu-image integration. C1.1 does not change the OpenAI model, developer prompt, provider response schema, canonical `FoodseyoAnalysis`, session storage, Overview, or Dish Detail.

The profile is the single source of truth for vocabulary, ordering, aliases, limits, unknown handling, contradictions, texture definitions, and wording policy. Normalizer, validator, renderer, fingerprints, and tests import that profile instead of copying vocabulary.

## Semantic axes

- Basic tastes: `sweet`, `salty`, `sour`, `bitter`, `savory`; intensity is 1 mild, 2 noticeable, or 3 prominent. Missing evidence is an empty array.
- Flavor notes: `smoky`, `herbal`, `nutty`, `earthy`, `garlicky`, `buttery`, `cheesy`, `fruity`, `citrusy`, `fermented`.
- Heat: exactly one of `none`, `mild`, `medium`, `hot`, `very_hot`, `unknown`.
- Richness: exactly one of `light`, `moderate`, `rich`, `unknown`. This describes likely weight or concentration, not calories or nutrition.
- Textures: `crispy`, `crunchy`, `creamy`, `tender`, `chewy`, `juicy`, `flaky`, `soft`, `firm`, `dense`, `airy`, `silky`, `sticky`, `springy`, `crumbly`, `moist`.
- Ingredients: normalized free-form names with a `stated`, `typical`, or `uncertain` basis. They are not reduced to a global ingredient whitelist.

Basic taste, flavor, heat, richness, and texture never generate one another. In particular, spicy is not a basic taste, rich is not savory, light is not airy, creamy is not automatically rich, and buttery is not automatically rich.

## Conservative normalization

Normalization uses Unicode NFKC, trim, English lowercase comparison, repeated-space cleanup, explicit aliases, duplicate removal, and profile ordering. `umami` becomes `savory`; `garlic-forward` becomes `garlicky`; `crisp` becomes `crispy`; `velvety` becomes `silky`; and `fluffy` or `pillowy` becomes `airy`.

Ambiguous terms are rejected rather than guessed. `bright`, `fresh`, `warm`, `aromatic`, `roasted`, `smooth`, `delicate`, `bouncy`, `meaty`, and `hearty` do not create standardized tags. Plain `zesty` needs explicit citrus context and is not automatically mapped. `spiced` and `warmly spiced` do not establish heat.

Duplicate basic tastes keep the strongest valid intensity. If a tag limit is exceeded, basic tastes select by intensity and then profile order; flavor notes and textures select by profile order. Canonical output returns the selected values in profile order. Limits are three basic tastes, three flavor notes, and two textures.

Ingredient duplicates merge after limited, explicit name normalization. Evidence basis resolves as `stated > typical > uncertain`, then ingredients sort by basis and normalized name. This priority resolves contradictory inputs; it never infers that a typical or uncertain ingredient was stated by the source.

## Deterministic wording

The English renderer uses profile order, fixed intensity terms, and Oxford-comma lists. It renders each axis separately and never mixes stated with typical ingredient evidence. Examples include `Mild sweetness and prominent savory taste.`, `Smoky and garlicky.`, `Mild heat.`, `Tender and juicy.`, `Listed ingredients: Lamb, onion, and parsley.`, and `Typically may include: Cumin and coriander.` Unknown heat and richness are omitted; uncertain ingredients use a fixed summary rather than a speculative list.

The renderer is not connected to current user-facing results in C1.1.

## Canonical serialization and fingerprints

Canonical serialization recursively sorts object keys, preserves already-normalized array order, normalizes negative zero, rejects non-finite or unsupported values, and emits compact JSON. Equivalent normalized inputs therefore produce byte-equivalent strings.

For `menu_images`, source fingerprint input is the image count plus one SHA-256 content hash per image in selection order. The count must equal the hash-array length, and canonical serialization preserves the array order. Raw image bytes are used only transiently to calculate each digest; the source identity accepts only digest strings and neither stores nor logs bytes, Base64, images, or filenames. Reversing images, changing content, or adding a repeated image changes the `source_` fingerprint.

Non-image sources use a caller-supplied stable source identifier instead of image hashes. Both forms may include nullable source-stated restaurant, branch, and revision context. Source fingerprints do not include model, prompt, schema, consistency, or wording versions because source identity exists before analysis.

Dish fingerprint input is limited to source-stated evidence available without an OpenAI analysis result:

- the source fingerprint and a source dish identifier;
- `sourceStatedName`, nullable `sourceStatedDescription`, and nullable `sourceStatedCategoryLabel`;
- source-stated amount, currency, and display text when present.

The `dish_` fingerprint does not accept normalized consistency, deterministic wording, inferred ingredients, tastes, textures, or analysis versions. It is therefore calculable before a provider call whenever source-stated dish evidence is already available. For an image-only source with no pre-provider dish evidence, only the source fingerprint exists before analysis; Foodseyo must not manufacture a pre-call dish identity from later model output.

Result-derived identity is separate. The `result_` analysis-result fingerprint combines a dish fingerprint, normalized consistency data, deterministic wording derived from that data, and explicit `modelVersion`, `promptVersion`, `providerSchemaVersion`, `canonicalSchemaVersion`, and `consistencyProfileVersion` metadata.

All three fingerprint families use SHA-256. Different restaurant, branch, source revision, source-stated description, price/currency, ordered image content, or result-version metadata changes only the relevant identity layer. Object-key order and normalized semantic input order do not. The same dish name alone is never enough to reuse a result.

Fingerprints are collision-resistant identity aids, not proof that two menus are current or that two recipes are identical. C1.1 does not log fingerprints or their raw inputs and does not add a server cache, database, shared registry, invalidation policy, persistent history, or automatic API bypass.

## Validation and evaluation

The semantic validator emits safe issue codes and field paths for unsupported values, invalid intensity, duplicates, tag limits, ordering, missing or multiple levels, `spiced` misuse, defined texture contradictions, ingredient name/basis/merge errors, missing version metadata, malformed fingerprint inputs, and noncanonical serialization. Messages never echo menu, dish, ingredient, restaurant, or source text.

`pnpm verify:consistency` runs synthetic repeatability fixtures only. It verifies equivalent aliases and reordered arrays, conservative ambiguous-term handling, deterministic selection and wording, ingredient evidence precedence, canonical serialization, five-part version binding, ordered image-content identity, source-stated-only dish identity, separated analysis-result identity, semantic issue coverage, privacy-safe source isolation, zero OpenAI calls, and zero network calls.
