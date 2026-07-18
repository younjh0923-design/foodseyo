-- C2.1-B reviewed PostgreSQL preconditions.
DO $foodseyo$
DECLARE
	runtime_role record;
BEGIN
	IF current_user <> 'foodseyo_migrator' THEN
		RAISE EXCEPTION 'C2.1-B migration must run as foodseyo_migrator';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_roles WHERE rolname = 'foodseyo_runtime'
	) THEN
		RAISE EXCEPTION 'Required role foodseyo_runtime is missing';
	END IF;

	IF to_regclass('public.__drizzle_migrations') IS NULL THEN
		RAISE EXCEPTION 'C2.1-B migration must run through the reviewed Drizzle migration workflow';
	END IF;

	IF NOT has_schema_privilege(current_user, 'public', 'USAGE')
		OR NOT has_schema_privilege(current_user, 'public', 'CREATE') THEN
		RAISE EXCEPTION 'foodseyo_migrator lacks required public schema privileges';
	END IF;

	IF has_schema_privilege('foodseyo_runtime', 'public', 'CREATE') THEN
		RAISE EXCEPTION 'foodseyo_runtime must not have CREATE on public schema';
	END IF;

	SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
	INTO runtime_role
	FROM pg_roles
	WHERE rolname = 'foodseyo_runtime';

	IF runtime_role.rolsuper
		OR runtime_role.rolcreatedb
		OR runtime_role.rolcreaterole
		OR runtime_role.rolreplication
		OR runtime_role.rolbypassrls THEN
		RAISE EXCEPTION 'foodseyo_runtime has prohibited administrative attributes';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_roles AS admin_role
		WHERE admin_role.rolname = 'neon_superuser'
			AND pg_has_role(
				'foodseyo_runtime',
				admin_role.rolname,
				'member'
			)
	) THEN
		RAISE EXCEPTION 'foodseyo_runtime must not be a neon_superuser member';
	END IF;
END
$foodseyo$;
--> statement-breakpoint
-- C2.1-B Drizzle-generated schema start.
CREATE TABLE "analysis_contracts" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"model_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider_schema_version" text NOT NULL,
	"canonical_schema_version" text NOT NULL,
	"consistency_profile_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_contracts_pkey" PRIMARY KEY("id"),
	CONSTRAINT "analysis_contracts_versions_uk" UNIQUE("model_version","prompt_version","provider_schema_version","canonical_schema_version","consistency_profile_version"),
	CONSTRAINT "analysis_contracts_versions_nonblank_ck" CHECK (
        btrim("analysis_contracts"."model_version") <> ''
        AND btrim("analysis_contracts"."prompt_version") <> ''
        AND btrim("analysis_contracts"."provider_schema_version") <> ''
        AND btrim("analysis_contracts"."canonical_schema_version") <> ''
        AND btrim("analysis_contracts"."consistency_profile_version") <> ''
      )
);
--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"menu_evidence_set_id" uuid NOT NULL,
	"analysis_contract_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"safe_error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_runs_pkey" PRIMARY KEY("id"),
	CONSTRAINT "analysis_runs_attempt_uk" UNIQUE("menu_evidence_set_id","analysis_contract_id","attempt_number"),
	CONSTRAINT "analysis_runs_snapshot_identity_uk" UNIQUE("id","menu_evidence_set_id","analysis_contract_id"),
	CONSTRAINT "analysis_runs_status_ck" CHECK ("analysis_runs"."status" IN ('processing', 'ready', 'failed')),
	CONSTRAINT "analysis_runs_attempt_number_ck" CHECK ("analysis_runs"."attempt_number" >= 1),
	CONSTRAINT "analysis_runs_safe_error_code_nonblank_ck" CHECK ("analysis_runs"."safe_error_code" IS NULL OR btrim("analysis_runs"."safe_error_code") <> ''),
	CONSTRAINT "analysis_runs_state_ck" CHECK (
        (
          "analysis_runs"."status" = 'processing'
          AND "analysis_runs"."lease_expires_at" IS NOT NULL
          AND "analysis_runs"."finished_at" IS NULL
          AND "analysis_runs"."safe_error_code" IS NULL
        )
        OR
        (
          "analysis_runs"."status" = 'ready'
          AND "analysis_runs"."lease_expires_at" IS NULL
          AND "analysis_runs"."finished_at" IS NOT NULL
          AND "analysis_runs"."safe_error_code" IS NULL
        )
        OR
        (
          "analysis_runs"."status" = 'failed'
          AND "analysis_runs"."lease_expires_at" IS NULL
          AND "analysis_runs"."finished_at" IS NOT NULL
          AND "analysis_runs"."safe_error_code" IS NOT NULL
          AND btrim("analysis_runs"."safe_error_code") <> ''
        )
      ),
	CONSTRAINT "analysis_runs_finished_time_ck" CHECK ("analysis_runs"."finished_at" IS NULL OR "analysis_runs"."finished_at" >= "analysis_runs"."started_at"),
	CONSTRAINT "analysis_runs_processing_lease_time_ck" CHECK ("analysis_runs"."status" <> 'processing' OR "analysis_runs"."lease_expires_at" > "analysis_runs"."started_at"),
	CONSTRAINT "analysis_runs_updated_time_ck" CHECK ("analysis_runs"."updated_at" >= "analysis_runs"."created_at")
);
--> statement-breakpoint
CREATE TABLE "analysis_snapshots" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"menu_evidence_set_id" uuid NOT NULL,
	"analysis_contract_id" uuid NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"result_fingerprint" text NOT NULL,
	"canonical_result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"safe_invalidation_code" text,
	CONSTRAINT "analysis_snapshots_pkey" PRIMARY KEY("id"),
	CONSTRAINT "analysis_snapshots_result_fingerprint_nonblank_ck" CHECK (btrim("analysis_snapshots"."result_fingerprint") <> ''),
	CONSTRAINT "analysis_snapshots_json_object_ck" CHECK (jsonb_typeof("analysis_snapshots"."canonical_result_json") = 'object'),
	CONSTRAINT "analysis_snapshots_expiry_time_ck" CHECK ("analysis_snapshots"."expires_at" IS NULL OR "analysis_snapshots"."expires_at" > "analysis_snapshots"."created_at"),
	CONSTRAINT "analysis_snapshots_access_time_ck" CHECK ("analysis_snapshots"."last_accessed_at" >= "analysis_snapshots"."created_at"),
	CONSTRAINT "analysis_snapshots_invalidation_time_ck" CHECK ("analysis_snapshots"."invalidated_at" IS NULL OR "analysis_snapshots"."invalidated_at" >= "analysis_snapshots"."created_at"),
	CONSTRAINT "analysis_snapshots_invalidation_pair_ck" CHECK (
        (
          "analysis_snapshots"."invalidated_at" IS NULL
          AND "analysis_snapshots"."safe_invalidation_code" IS NULL
        )
        OR
        (
          "analysis_snapshots"."invalidated_at" IS NOT NULL
          AND "analysis_snapshots"."safe_invalidation_code" IS NOT NULL
        )
      ),
	CONSTRAINT "analysis_snapshots_safe_invalidation_code_nonblank_ck" CHECK (
        "analysis_snapshots"."safe_invalidation_code" IS NULL
        OR btrim("analysis_snapshots"."safe_invalidation_code") <> ''
      )
);
--> statement-breakpoint
CREATE TABLE "menu_evidence_sets" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"input_kind" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"fingerprint_version" text NOT NULL,
	"image_count" integer,
	"normalized_url" text,
	"source_provider" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_evidence_sets_pkey" PRIMARY KEY("id"),
	CONSTRAINT "menu_evidence_sets_identity_uk" UNIQUE("source_fingerprint","fingerprint_version"),
	CONSTRAINT "menu_evidence_sets_input_kind_ck" CHECK (
        "menu_evidence_sets"."input_kind" IN (
          'uploaded_menu_images',
          'official_menu_html',
          'official_menu_pdf',
          'online_ordering_menu',
          'listing_menu',
          'listing_menu_photo'
        )
      ),
	CONSTRAINT "menu_evidence_sets_source_fingerprint_nonblank_ck" CHECK (btrim("menu_evidence_sets"."source_fingerprint") <> ''),
	CONSTRAINT "menu_evidence_sets_fingerprint_version_nonblank_ck" CHECK (btrim("menu_evidence_sets"."fingerprint_version") <> ''),
	CONSTRAINT "menu_evidence_sets_image_count_ck" CHECK ("menu_evidence_sets"."image_count" IS NULL OR "menu_evidence_sets"."image_count" > 0),
	CONSTRAINT "menu_evidence_sets_normalized_url_nonblank_ck" CHECK ("menu_evidence_sets"."normalized_url" IS NULL OR btrim("menu_evidence_sets"."normalized_url") <> ''),
	CONSTRAINT "menu_evidence_sets_source_provider_nonblank_ck" CHECK ("menu_evidence_sets"."source_provider" IS NULL OR btrim("menu_evidence_sets"."source_provider") <> ''),
	CONSTRAINT "menu_evidence_sets_input_payload_ck" CHECK (
        (
          "menu_evidence_sets"."input_kind" = 'uploaded_menu_images'
          AND "menu_evidence_sets"."image_count" IS NOT NULL
          AND "menu_evidence_sets"."normalized_url" IS NULL
        )
        OR
        (
          "menu_evidence_sets"."input_kind" <> 'uploaded_menu_images'
          AND "menu_evidence_sets"."normalized_url" IS NOT NULL
          AND btrim("menu_evidence_sets"."normalized_url") <> ''
        )
      )
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_menu_evidence_set_fk" FOREIGN KEY ("menu_evidence_set_id") REFERENCES "public"."menu_evidence_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_analysis_contract_fk" FOREIGN KEY ("analysis_contract_id") REFERENCES "public"."analysis_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_menu_evidence_set_fk" FOREIGN KEY ("menu_evidence_set_id") REFERENCES "public"."menu_evidence_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_analysis_contract_fk" FOREIGN KEY ("analysis_contract_id") REFERENCES "public"."analysis_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_run_evidence_contract_fk" FOREIGN KEY ("analysis_run_id","menu_evidence_set_id","analysis_contract_id") REFERENCES "public"."analysis_runs"("id","menu_evidence_set_id","analysis_contract_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_one_processing_ux" ON "analysis_runs" USING btree ("menu_evidence_set_id","analysis_contract_id") WHERE "analysis_runs"."status" = 'processing';--> statement-breakpoint
CREATE INDEX "analysis_runs_lookup_ix" ON "analysis_runs" USING btree ("menu_evidence_set_id","analysis_contract_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "analysis_snapshots_result_fingerprint_ix" ON "analysis_snapshots" USING btree ("result_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_snapshots_one_active_ux" ON "analysis_snapshots" USING btree ("menu_evidence_set_id","analysis_contract_id") WHERE "analysis_snapshots"."invalidated_at" IS NULL;
--> statement-breakpoint
-- C2.1-B Drizzle-generated schema end.
-- C2.1-B reviewed least-privilege grants.
REVOKE ALL PRIVILEGES ON TABLE
	"public"."__drizzle_migrations",
	"public"."analysis_contracts",
	"public"."menu_evidence_sets",
	"public"."analysis_runs",
	"public"."analysis_snapshots"
FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE
	"public"."__drizzle_migrations",
	"public"."analysis_contracts",
	"public"."menu_evidence_sets",
	"public"."analysis_runs",
	"public"."analysis_snapshots"
FROM "foodseyo_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT
ON TABLE "public"."analysis_contracts", "public"."menu_evidence_sets"
TO "foodseyo_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT
ON TABLE "public"."analysis_runs", "public"."analysis_snapshots"
TO "foodseyo_runtime";
--> statement-breakpoint
GRANT UPDATE (
	"status",
	"safe_error_code",
	"lease_expires_at",
	"finished_at",
	"updated_at"
)
ON TABLE "public"."analysis_runs"
TO "foodseyo_runtime";
--> statement-breakpoint
GRANT UPDATE (
	"last_accessed_at",
	"invalidated_at",
	"safe_invalidation_code"
)
ON TABLE "public"."analysis_snapshots"
TO "foodseyo_runtime";
