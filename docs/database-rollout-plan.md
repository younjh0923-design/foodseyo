# C2.1 Exact-Cache Rollout Plan

**Status:** C2.1-G rollout-readiness review complete; Production rollout not approved
**Reviewed:** 2026-07-17

This document is the durable release plan for moving the completed C2.1-D/E/F exact-cache implementation beyond Development. It records non-secret state and release controls only. It is not authorization to push, deploy, migrate Preview or Production, invoke the analysis route, or call OpenAI.

## Release recommendation

**Current decision: NO-GO for Production. Preserve the existing uncached Production analysis flow through the OpenAI Build Week submission deadline.**

D→E→F passed deterministic and adversarial real-PostgreSQL validation, but Production approval requires more than implementation correctness. Preserving the C2.1-G feature branch created an automatic Git-sourced Preview build for exact commit `e08249182241d30a21aeebd17a0cd75e110591af`; it did not migrate or validate the Preview database and is not a rollout approval. Preview and Production still have no application schema, the checked-in database verifier has no target-aware full verification mode for those environments, the active Production deployment cannot be tied to a Git commit through its deployment metadata, and the Free/Hobby recovery paths are narrow.

The competition submission deadline is July 21, 2026 at 5:00 PM PDT / 8:00 PM EDT. The database/cache layer is an enabling trust feature rather than the primary product demonstration. With four calendar days remaining at review time, protecting the proven menu-photo flow, completing mobile Production QA, recording the demo, and preparing the public repository and submission are safer than introducing a new Production dependency.

A separately authorized Preview-only rehearsal remains useful, but it must not consume the final submission buffer or imply Production approval. No Production rollout should occur inside the final 48 hours before the deadline.

## Verified state at review

### Repository and GitHub

- Local review branch: `c2.1-g-rollout-review`
- C2.1-G starting commit and completed C2.1-F HEAD: `a010ffa5d8e0f0c0b47d17bdea36b0b70ec566cf`
- GitHub default branch: `main`
- Local `origin/main` and live GitHub `main`: `d3c255d29b4029589e6f6b562a482134c0e28b99`
- Local checkpoint history is nine commits ahead of GitHub `main` before the C2.1-G review commit and has no remote divergence.
- GitHub feature branch `c2.1-g-rollout-review` points to exact commit `e08249182241d30a21aeebd17a0cd75e110591af`; no pull request was opened and `main` was not changed.
- GitHub has no checked-in GitHub Actions workflows.

The Vercel project is linked to GitHub `main`, and automatic Production domain assignment is enabled. A push or merge to `main` must therefore be treated as a Production release action, not as repository housekeeping.

### Vercel

- Existing project: `foodseyo`
- Plan: Hobby
- Framework/runtime: Next.js on Node.js 24.x
- Region: `iad1`
- Fluid Compute: enabled, directly verified through the authenticated Project API
- GitHub link: `younjh0923-design/foodseyo`, Production branch `main`
- Git fork protection: enabled
- Automatic C2.1-G Preview deployment after branch preservation: `dpl_3xMW3EWK5PWYpAEDPPhsnSk4akSZ`, Ready, Git-sourced from exact commit `e08249182241d30a21aeebd17a0cd75e110591af`
- Active Production deployment: `dpl_CgX2V4jcqRKWMpePhZuqn2qRe81d`, Ready
- Active deployment source: Vercel CLI; deployment metadata exposes no Git ref or commit SHA
- Previous explicit rollback target: none recorded by the Project API

The active deployment is operationally the existing uncached baseline, but its exact source commit cannot be independently reconstructed from Vercel Git metadata. Future Preview and Production candidates must be Git-sourced and tied to an immutable commit SHA.

Application environment-variable names and scopes:

| Variable | Development | Preview | Production | Requirement |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | yes | yes | yes | pooled, corresponding `foodseyo_runtime` role only |
| `DATABASE_MIGRATION_URL` | no | no | no | must remain outside Vercel runtime and builds |
| `OPENAI_API_KEY` | no | yes | yes | unchanged; never used by automated rollout validation |
| `OPENAI_MODEL` | no | yes | yes | unchanged |

Provider-managed `NEON_PROVIDER_*` variables are Development-only and are not application contracts. No value was read, printed, or persisted during this review.

### Neon

- Project: `foodseyo` (`lucky-shadow-32441683`)
- Region/PostgreSQL: AWS US East / PostgreSQL 17
- Permanent branches:
  - Development: `br-dark-cherry-awci0faj`
  - Preview: `br-misty-breeze-awy83urg`
  - Production/default `main`: `br-blue-night-awieb03l`
- All three branches are ready, mutually isolated for application credentials, unprotected, and non-expiring.
- Development contains exactly the four reviewed C2.1 tables, one migration-ledger row, and zero application rows.
- Preview contains zero C2.1 application tables.
- Production contains zero C2.1 application tables.
- No disposable C2.1-F branch remains.
- Current point-in-time history retention: 21,600 seconds.
- Snapshots: zero.
- Automatic snapshot schedules: none.
- Public network access is enabled; no IP allowlist is configured.

Read-only database verification confirmed TLS, the expected `foodseyo_migrator` identity, Development catalog and grants, zero application rows, and zero Preview/Production application tables. Development runtime capability probes also confirmed the frozen least-privilege boundary.

The Free Neon plan does not provide protected branches or automated snapshot schedules. Its restore window is limited to up to six hours or 1 GB of changes, whichever is reached first. These constraints are acceptable for empty Development validation but are material Production risks.

## Remaining release blockers

Production remains blocked until all of the following are resolved:

1. Treat the existing automatic Git-sourced Preview as build provenance only; a database-aware Preview candidate must use the exact approved rollout commit after target tooling is complete.
2. A target-aware migration wrapper resolves and verifies the exact Neon branch ID before supplying a direct migrator credential in process memory.
3. A target-aware full post-migration verifier exists for Preview and Production. The current full verifier is Development-labelled; its Preview/Production mode checks only that the schema is absent.
4. Preview passes the complete matrix below without an OpenAI request unless a separately authorized live smoke is deliberately scheduled.
5. A manual Production snapshot or equivalent verified recovery point is created immediately before the Production migration, and restore ownership and timing are rehearsed.
6. The current good Production deployment is recorded as the immediate rollback target and remains the immediately previous Production deployment. Vercel Hobby instant rollback covers only that immediate predecessor.
7. The public Git history, reviewed release commit, migration, Vercel deployment, and Neon target can be tied together without ambiguity.
8. Production runtime and migrator roles pass the complete least-privilege verification after migration.
9. The release window leaves at least 48 hours before the competition deadline and does not displace submission-critical QA.

## Exact Preview sequence

This sequence requires a new explicit rollout instruction. It must be performed against Preview only.

### 1. Freeze and preflight the candidate

1. Select one reviewed immutable commit containing C2.1-D/E/F and any approved rollout-tooling correction.
2. Run `pnpm verify:full`, `git diff --check`, and `pnpm validate:security`.
3. Confirm the feature branch has no unrelated commits, secrets, environment files, or staged reference artifacts.
4. Confirm GitHub `main` remains unchanged and that pushing the feature branch cannot update the Production branch.
5. Confirm the Vercel Preview scope contains the pooled Preview `DATABASE_URL`, plus the existing Preview OpenAI names, and contains no migration credential.
6. Resolve the exact Preview Neon branch by ID `br-misty-breeze-awy83urg`; confirm it is ready, has zero C2.1 tables, and is not Production.

### 2. Close the target-verification gap

Before any Preview DDL, add and review a narrow operator script that:

- accepts an allowlisted environment and exact Neon branch ID, never a free-form hostname;
- resolves the direct connection through the authenticated official Neon CLI/API;
- verifies `current_user = foodseyo_migrator`, TLS, and the intended target before DDL;
- keeps `DATABASE_MIGRATION_URL` in process memory only;
- refuses Production unless a separate Production flag and exact Production branch ID are supplied;
- runs the existing reviewed migration runner;
- runs a second time and requires zero newly applied migrations;
- runs the full catalog, ledger, owner, grant, capability, and zero-row verifier under the correct target label;
- prints no URL, host, password, token, or environment value.

The current `scripts/migrate-analysis-cache.mts` and migration remain the schema source of truth. The gap is target selection and target-labelled verification, not a need for a new schema.

### 3. Establish the Preview recovery point

1. Record the Preview parent, current state, and review timestamp without credentials.
2. Because Preview is empty and isolated, define reset-from-Production-parent as the destructive Preview recovery path.
3. Do not reset Preview during normal validation. A reset requires an explicit exact-target check and must never target Production.

### 4. Migrate Preview

1. Use the guarded operator process to inject the direct Preview migrator credential.
2. Run the single reviewed `0000_c2_1_b_analysis_cache_schema` migration.
3. Rerun the same migration and require `applied = 0`.
4. Run the target-aware full verifier and require:
   - exactly four reviewed tables;
   - exactly one ledger entry;
   - expected owners, constraints, indexes, and foreign keys;
   - expected runtime grants only;
   - no runtime DDL, `DELETE`, immutable-column update, owner, or ledger access;
   - zero application rows.

### 5. Create the Preview deployment

1. Push only the reviewed feature branch after separate authorization; do not push or merge `main`.
2. Require Vercel to create a Git-sourced Preview deployment for the exact candidate SHA.
3. Verify Ready state, commit SHA, Preview environment, Node.js 24.x, `iad1`, and Fluid Compute enabled.
4. Confirm the deployment uses only the Preview-scoped pooled runtime credential and that no migration credential exists in runtime or build scope.

### 6. Validate and observe

Run the matrix below. Automated tests remain synthetic and network-free. A live OpenAI smoke is outside this review and requires an explicit separate instruction.

If all Preview checks pass, preserve the evidence and return for a new Production go/no-go decision. Preview success does not authorize Production.

## Preview validation matrix

| Area | Required evidence | Pass condition |
| --- | --- | --- |
| Provenance | GitHub branch, Vercel deployment metadata, immutable SHA | all identify the same candidate |
| Build/runtime | Vercel Ready, Node.js 24.x, `iad1`, Fluid Compute | exact expected configuration |
| Environment | names and scopes only | Preview pooled `DATABASE_URL`; no migration variable |
| Schema | full target-aware catalog verification | four tables, one ledger row, expected constraints/indexes/owners |
| Privileges | migrator and runtime capability probes | frozen least-privilege matrix only |
| Idempotency | second migration run | zero migrations applied |
| Baseline data | application-row counts | zero before synthetic validation |
| Exact hit/miss | deterministic route/service tests | valid hit reused; validated miss follows ownership path |
| Concurrency | real PostgreSQL child-branch test | exactly one owner and one synthetic provider call |
| Duplicate reuse | repeated identical callers | completed canonical snapshot reused |
| Busy/indeterminate | bounded polling and fault injection | frozen 409/503 payloads and headers |
| Ownership recovery | lease expiry and ambiguous outcomes | append-only recovery; never fail open after possible ownership |
| Persistence | strict owner and transaction tests | only confirmed owner persists; rollback remains atomic |
| Integrity | corrupt, invalid, expired, and mismatched rows | never returned; quarantine rules preserved |
| Quarantine failure | failed and unconfirmed updates | no corrupt return and no replacement persistence |
| Privacy | Vercel logs and local output | safe metadata only; no menu, image, result, or secret content |
| Connectivity | Neon/Vercel metrics | no pool exhaustion, connection storm, or recurring database error |
| Cleanup | child branches and row counts | no temporary branches; permanent Preview returns to zero synthetic rows |
| UI regression | mobile Preview navigation without paid analysis | existing Home/Menu Scan/Results shell behavior unchanged |

## Preview rollback and recovery

Rollback is ordered from least destructive to most destructive:

1. Stop testing and remove the Preview alias or deployment candidate.
2. Revert the feature branch candidate and create a new Preview deployment from the last known-good commit.
3. Leave the additive, unused four-table schema in Preview if code is rolled back; the old uncached application does not depend on or mutate it.
4. If Preview database state must be cleared, reset only exact branch `br-misty-breeze-awy83urg` from its verified Production parent after explicit authorization and target confirmation.

Do not create an improvised down migration or drop tables during incident response.

## Production go/no-go

### GO requires every item

- Preview completed the full matrix on the exact release SHA.
- No unresolved severity-1 or severity-2 defect, privilege drift, privacy issue, or recurring database error exists.
- The final full repository suite is green at the exact release commit.
- The Production branch, runtime role, and direct migrator role have been re-verified.
- Vercel Production retains only its pooled runtime `DATABASE_URL`; no migration credential exists there.
- A manual Neon Production snapshot or other independently verified recovery point exists immediately before migration, with a recorded restore timestamp inside the six-hour history window.
- The active uncached deployment ID is recorded and remains the immediately previous Production deployment eligible for Hobby instant rollback.
- The release can be traced from Git commit to migration review, Vercel deployment, and Neon branch.
- A named operator owns migration, monitoring, rollback, and restore decisions for the release window.
- The rollout has explicit user authorization and occurs outside the final 48-hour competition freeze.

### Any item below is an automatic NO-GO

- Preview was skipped, partially validated, or used a different commit.
- Preview or Production target identity is ambiguous.
- The target-aware migration or full verification tooling is absent.
- A credential or environment value must be copied into chat, documentation, a repository file, or Vercel runtime.
- Production has unexpected tables, rows, ledger entries, owners, or grants.
- No current snapshot/recovery point or restore path is available.
- The current good deployment would not be the immediate Hobby rollback target.
- The candidate cannot be tied to a Git SHA.
- Synthetic concurrency, ownership, quarantine, or rollback validation regresses.
- Monitoring shows connection pressure, elevated 409/503 rates, database errors, privacy-unsafe logs, or provider-call duplication.
- The release window is inside 48 hours of the submission deadline or threatens mobile QA, demo recording, README readiness, or submission completion.

## Future Production sequence

Only a new explicit Production instruction may authorize this sequence:

1. Freeze the exact Preview-proven commit and rerun all repository checks.
2. Confirm Production target `br-blue-night-awieb03l`, zero application tables, expected roles, and no migration variable in Vercel.
3. Create and verify the Production recovery point; record the current uncached deployment `dpl_CgX2V4jcqRKWMpePhZuqn2qRe81d`.
4. Apply the one reviewed migration through the guarded operator process and rerun it idempotently.
5. Run the full target-aware Production verifier and require zero rows.
6. Merge and push the exact reviewed commit to `main` only in the approved release window. This action triggers Production deployment.
7. Verify the new Vercel deployment is Ready and tied to the exact Git SHA.
8. Perform only pre-authorized validation. A real menu analysis or OpenAI request requires separate explicit approval.
9. Monitor Vercel and Neon for at least 30–60 minutes before declaring the release stable.

## Production rollback and recovery

1. **Code first:** use Vercel instant rollback to the recorded uncached deployment. The old code ignores the additive cache tables.
2. **Schema stays by default:** do not run a destructive down migration during rollback.
3. **Database restore only for database corruption:** use the pre-migration snapshot or point-in-time restore within the verified retention window after confirming the exact Production target.
4. **Investigate offline:** preserve safe structural evidence, rotate any exposed credential, and return to Preview before another Production attempt.

## Competition freeze

- Freeze unrelated feature and schema work immediately.
- Keep the uncached Production flow as the submission baseline.
- Do not begin a Production cache rollout after July 19, 2026 at 5:00 PM PDT / 8:00 PM EDT.
- Prioritize mobile Production QA, demo recording, public repository/readme readiness, session-ID capture, and Devpost submission.
- If Preview rehearsal cannot be completed without displacing that work, defer it until after submission.

## Authoritative external references

- OpenAI Build Week deadline and submission requirements: <https://openai.devpost.com/>
- Vercel deployment promotion: <https://vercel.com/docs/deployments/promoting-a-deployment>
- Vercel Production rollback: <https://vercel.com/docs/deployments/rollback-production-deployment>
- Neon protected branches: <https://neon.com/docs/guides/protected-branches>
- Neon restore and plan limits: <https://neon.com/pricing>
