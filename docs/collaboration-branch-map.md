# Foodseyo Collaboration Branch Map

**Updated:** 2026-07-17
**Status:** Cumulative C2.3 branch published for review; `main` and Production
remain unchanged

This document lets another developer inspect Foodseyo's completed checkpoint
history without treating a GitHub publication as a rollout. Product, safety,
database, and release contracts remain owned by the sources listed in
`AGENTS.md` and `docs/CODEX_HANDOFF.md`.

## Published review surface

| Item | Value | Meaning |
| --- | --- | --- |
| Repository | `younjh0923-design/foodseyo` | Foodseyo source repository |
| Stable remote baseline | `origin/main` at `d3c255d29b4029589e6f6b562a482134c0e28b99` | Current GitHub Production-oriented baseline |
| Cumulative review branch | `c2.3-structured-menu-projection` | Contains the complete C2.1 through C2.3 linear history |
| C2.3 implementation checkpoint | `bbb09f4e506f4572724a5fd5835cd3fa1bceae4e` | Completed code, migration, documentation, and Development evidence before publication documentation |
| Review mechanism | Draft pull request to `main` | Comparison and discussion only |
| Merge/deployment state | Not approved | No `main` merge, Production deployment, or Preview/Production migration |

Only the cumulative branch is published for the new team review. Publishing
every intermediate pointer would not expose additional code because every
checkpoint commit is already reachable from the cumulative branch, while it
could trigger unnecessary automatic Preview builds.

## Linear checkpoint pointers

These pointers identify the completed boundaries. They are audit landmarks,
not independent release candidates.

| Local branch | Exact checkpoint SHA | Checkpoint |
| --- | --- | --- |
| `main` | `cfbb93750c0b8f41f470963eddaf203d3b82457f` | Local C2.1-A.1 corrective baseline; not pushed to GitHub `main` |
| `c2.1-b-analysis-cache-schema` | `bafd916b904a4a8a77fdc7fa56134cabb6a50d32` | Exact-cache schema plus corrected project context |
| `c2.1-c-database-repositories` | `2564cc0b7407c035b3b5ac1042c8e9d2f4090f94` | Runtime database client and repositories |
| `c2.1-d-exact-cache-integration` | `6062826f92c8a872ca474019ee73cd9b63bb9809` | Exact lookup and persistence integration |
| `c2.1-e-analysis-ownership` | `d3912cf37bb10a68a8033363046a0af6f44595d6` | Lease ownership and duplicate coordination |
| `c2.1-f-postgres-concurrency-validation` | `a010ffa5d8e0f0c0b47d17bdea36b0b70ec566cf` | Independent PostgreSQL concurrency validation |
| `c2.1-g-rollout-review` | `e08249182241d30a21aeebd17a0cd75e110591af` | Rollout review and Production deferral |
| `c2.2-a-erd-logical-audit` | `6c11da84325373eedce5d6e5cf551912e9c8205a` | ERD v3 logical audit |
| `c2.2-a1-culinary-contract-audit` | `0b95e5423d706beec6d889cda8448e125a4a0f7c` | Culinary and sensory contract gap audit |
| `c2.2-b-physical-integrity-contract` | `b0bcae6ae7a2210ea58c7fbdd4e774ba42c9af1a` | PostgreSQL physical integrity contract |
| `c2.2-c-structured-menu-decisions` | `8e4cce4ae23826146bca3e1b7bba058c64dff41c` | Retention, invalidation, and price decisions |
| `c2.2-d-unexecuted-schema-draft` | `9bafb1f78a6bf0988bdd759644f5aafeec7d88be` | Statically verified unexecuted schema draft |
| `c2.2-e-database-program-charter` | `0db6d2207d80936b00ca84b1e9640696578137fe` | Core consistency database program charter |
| `c2.3-structured-menu-projection` | `bbb09f4e506f4572724a5fd5835cd3fa1bceae4e` | Development-only structured-menu projection |

The local `main` pointer is two documentation/infrastructure commits ahead of
GitHub `origin/main`, and those commits are already ancestors of the cumulative
C2.3 branch. Pushing or merging local `main` is unnecessary for code review and
could trigger a Production deployment.

## Team comparison boundary

The independent comparison repository is:

- `https://github.com/juhyungbaek0621/travel-food-copilot`
- reviewed implementation branch: `agent/english-interface`
- reviewed branch tip: `ea67f5daeaf4c0c3c50d7c052091baf0c1cfec87`

No file, commit, dependency, configuration, or secret from that repository is
included in Foodseyo by this publication. Its strongest review inputs are the
user-confirmed restaurant candidate flow, compact menu-first presentation,
category accordions, lazy detail direction, and multilingual product
exploration. Its uploaded-photo provenance, ordinary-knowledge labeling,
OpenAI endpoint protection, structured-output handling, cache identity, and
database integrity must not replace Foodseyo's existing contracts.

## Safe integration procedure

1. Compare the draft pull request and teammate implementation by user outcome,
   source authority, data contract, privacy, failure behavior, and cost.
2. Select product ideas, not entire files or branches.
3. Write or update the Foodseyo contract before implementation when an idea
   changes evidence, privacy, API, database, or rollout behavior.
4. Reimplement the selected behavior in a new bounded Foodseyo checkpoint.
5. Run network-free validation and controlled Development PostgreSQL checks as
   applicable.
6. Use a separately authorized Preview migration and live QA gate.
7. Merge `main` and deploy Production only after an explicit go/no-go decision
   with rollback evidence.

The draft pull request must remain unmerged while Preview and Production lack
the required application schema and target-aware validation. Automatic Git
Preview builds, if any, are build provenance only and must not be promoted or
treated as database rollout evidence.
