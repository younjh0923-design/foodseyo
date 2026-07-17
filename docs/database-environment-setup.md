# C2.1-A database environment setup

**Status:** Verified complete

**Verified:** 2026-07-17

This document records the non-secret infrastructure boundary completed in C2.1-A. It does not authorize application schema creation, migrations, repository implementation, cache integration, Production migration, or application deployment. `docs/database-cache-contract.md` remains the source of truth for the C2.1 exact-cache contract.

## Infrastructure inventory

- Vercel project: `foodseyo` (`prj_x1wTsOZyAWpK4KIp3ZkleDyUaKTj`)
- Git repository: `younjh0923-design/foodseyo`
- Production branch: `main`
- Production alias: `foodseyo.vercel.app`
- Function runtime and region: Node.js in `iad1`
- Node.js version: `24.x`
- Menu-analysis route: Node.js runtime with a 90-second maximum duration
- Fluid Compute: enabled — directly verified through the authenticated Vercel Project API on 2026-07-17; both `defaultResourceConfig.fluid` and `resourceConfig.fluid` were `true`
- Neon Marketplace resource: `foodseyo` (`store_n6y8hPoEyVjAIAZO`)
- Neon project: `foodseyo` (`lucky-shadow-32441683`)
- Neon cloud and region: AWS `aws-us-east-1`, colocated with Vercel `iad1`
- PostgreSQL major version: 17
- Neon plan: Free (`free_v3`); no billing or paid-plan change was required
- Neon Auth: disabled

## Environment isolation

Each logical environment has its own Neon branch, compute endpoint, and database roles. Vercel holds only the pooled runtime credential for the matching branch and environment scope.

| Logical environment | Neon branch | Branch ID | Compute endpoint ID | Vercel scope |
| --- | --- | --- | --- | --- |
| Development | `development` | `br-dark-cherry-awci0faj` | `ep-muddy-thunder-awmz7q6m` | Development |
| Preview | `preview` | `br-misty-breeze-awy83urg` | `ep-floral-bread-aw4mx0h1` | Preview |
| Production | `main` | `br-blue-night-awieb03l` | `ep-raspy-poetry-aw8wx2hz` | Production |

Development and Preview are persistent copy-on-write child branches of `main`. The permanent shared `preview` Neon branch is isolated from Production and is the verified Preview strategy for C2.1-A. Neither environment receives Production runtime credentials, and Production does not receive Development or Preview runtime credentials.

Branch protection is not enabled because Neon protected branches are a paid-plan feature. A paid-plan change was not approved or required for C2.1-B. Protection and a stronger Production recovery posture must be reconsidered before a Production database rollout.

All three computes use a fixed 0.25 CU profile. Their endpoint-level suspend value delegates to the Free-plan global default, which suspends inactive computes after five minutes and resumes them on the next connection.

## Database roles

The following roles exist independently on all three branches:

- `foodseyo_runtime`
  - login and database `CONNECT`;
  - schema `USAGE`;
  - no superuser, `neon_superuser`, `CREATEDB`, `CREATEROLE`, replication, row-level-security bypass, or schema `CREATE`;
  - used only by the pooled `DATABASE_URL` runtime contract.
- `foodseyo_migrator`
  - login and database `CONNECT`;
  - schema `USAGE` and `CREATE`;
  - no superuser, `neon_superuser`, `CREATEDB`, `CREATEROLE`, replication, or row-level-security bypass;
  - used only by the direct `DATABASE_MIGRATION_URL` migration contract supplied through a dedicated operator or CI migration environment outside the live Vercel application runtime.

The Neon owner role remains an infrastructure-administration role. Application runtime and ordinary migration workflows must not use it.

Application tables do not exist yet, so table, sequence, and default privileges were intentionally not granted in C2.1-A. C2.1-B must add only the reviewed table and sequence privileges required by the implemented schema. It must keep DDL on the migrator path and DML on the runtime path.

## Environment-variable contract

Only names and scopes are documented. For Foodseyo's database application contract, Vercel contains only environment-scoped pooled `DATABASE_URL` runtime credentials.

| Vercel scope | `DATABASE_URL` |
| --- | --- |
| Development | Development branch, `foodseyo_runtime`, pooled, encrypted |
| Preview | Preview branch, `foodseyo_runtime`, pooled, sensitive |
| Production | Production branch, `foodseyo_runtime`, pooled, sensitive |

Vercel has no `DATABASE_MIGRATION_URL` entry in Development, Preview, or Production. Migration credentials are stored and supplied only through a dedicated operator or CI migration environment outside the live Vercel application runtime and build environment. The `foodseyo_migrator` roles remain present on all three Neon branches for controlled C2.1-B and future migrations.

No credential-bearing variable uses a `NEXT_PUBLIC_` prefix.

`DATABASE_URL_UNPOOLED` is provider metadata only and is not an application contract.

The Neon Marketplace resource is connected to the existing Vercel project through connection `spc_OQnJJwAjyvNnDUDW`. Provider-managed variables are limited to Development and use the `NEON_PROVIDER_` prefix. They are not used by application runtime or migration code and must never replace the two least-privilege application contracts above.

Environment changes apply only to new Vercel deployments. C2.1-A did not deploy application code.

## Connectivity, TLS, and limits

- Runtime connectivity was verified with a read-only query through the pooled endpoint for every environment.
- Migrator connectivity was verified with a read-only query through the direct endpoint for every environment.
- Connections were created with TLS required and channel binding required. Connection strings and hostnames were not printed or stored in the repository.
- Neon pooling uses PgBouncer transaction mode. The pooled application contract supports up to 10,000 client connections, subject to the smaller number of concurrently active Postgres transactions.
- The verified direct Postgres `max_connections` value is 112 on each 0.25 CU compute. Neon reserves seven connections, leaving up to 105 for user activity.
- Pooling is mandatory for the future serverless runtime contract. Migration tooling uses the direct endpoint because migrations can require session behavior that transaction pooling does not preserve.

## Backup, restore, and monitoring

- The verified project history retention is 21,600 seconds.
- On Free, instant restore is limited to up to six hours or 1 GB of data changes, whichever limit is reached first.
- Branch restore and point-in-time branch creation are available within the retained history window.
- The snapshot API is available, but the project currently has zero snapshots.
- The Free plan includes one manual snapshot. Automated snapshot schedules are paid-plan functionality; the verified Production backup schedule is empty.
- Development and Preview may be reset from their parent when a reviewed workflow explicitly requires it. Reset and restore operations overwrite branch state and must not be automated against Production without a separate recovery decision.
- Neon Console monitoring provides compute, database, query, and pooler metrics. The project consumption-history API is not included on Free and returned the expected plan restriction.
- Neon manages the Postgres service, storage, high availability, and platform updates. Application owners remain responsible for query behavior, connection usage, schema changes, credentials, restore decisions, and testing recovery procedures.

The Free recovery window and lack of branch protection are acceptable for C2.1-B development, where no Production schema or data exists. They are not yet an adequate final Production recovery policy. Reassess protected branches, scheduled backups, retention, and recovery testing before the C2.1-G/Production rollout boundary.

## Secret-handling requirements

- Never commit or print database URLs, hostnames, passwords, API keys, tokens, or environment values.
- Never run `vercel env pull` or a Neon environment pull merely for inspection.
- Keep `.env.local` ignored and untracked; it is Development-only if later used.
- Never expose database variables through `NEXT_PUBLIC_`.
- Never use provider-prefixed owner metadata as the application connection contract.
- Rotate a credential immediately if it is exposed, without copying the value into an issue, log, document, or chat.
- The supplied DOCX and SQL architecture references remain untracked, unstaged, and unexecuted.

## C2.1-B entry boundary

C2.1-B may install the specifically reviewed database dependencies and implement the reviewed schema, migrations, repositories, and exact-cache behavior. It must:

1. supply `DATABASE_MIGRATION_URL` only through a dedicated operator or CI migration environment outside the live Vercel application runtime, and use it only for reviewed migrations;
2. use `DATABASE_URL` only for runtime database access;
3. create application objects through the migrator role;
4. grant the runtime role only approved table and sequence privileges;
5. preserve the exact-cache contract in `docs/database-cache-contract.md`;
6. avoid executing the supplied v1.2 SQL reference directly;
7. validate Development first and require a separate approval before any Production migration or deployment.

## Authoritative platform references

- [Neon branching](https://neon.com/docs/introduction/branching)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero)
- [Neon branch restore](https://neon.com/docs/introduction/branch-restore)
- [Neon protected branches](https://neon.com/docs/guides/protected-branches)
- [Neon pricing and plan limits](https://neon.com/pricing)
- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github)
