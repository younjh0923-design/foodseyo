-- C2.3 reviewed PostgreSQL and least-privilege preconditions.
DO $foodseyo$
DECLARE
	runtime_role record;
BEGIN
	IF current_user <> 'foodseyo_migrator' THEN
		RAISE EXCEPTION 'C2.3 migration must run as foodseyo_migrator';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_roles WHERE rolname = 'foodseyo_runtime'
	) THEN
		RAISE EXCEPTION 'Required role foodseyo_runtime is missing';
	END IF;

	IF to_regclass('public.__drizzle_migrations') IS NULL THEN
		RAISE EXCEPTION 'C2.3 migration must run through the reviewed Drizzle migration workflow';
	END IF;

	IF to_regclass('public.analysis_contracts') IS NULL
		OR to_regclass('public.menu_evidence_sets') IS NULL
		OR to_regclass('public.analysis_runs') IS NULL
		OR to_regclass('public.analysis_snapshots') IS NULL THEN
		RAISE EXCEPTION 'The unchanged C2.1 schema prerequisite is missing';
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
-- C2.3 Drizzle-generated schema start. Compared with the accepted C2.2-D review draft.
CREATE TABLE "menu_item_prices" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"analysis_price_id" text,
	"position" integer NOT NULL,
	"price_kind" text NOT NULL,
	"context_label" text,
	"amount" numeric NOT NULL,
	"currency" text,
	"display_text" text NOT NULL,
	CONSTRAINT "menu_item_prices_pkey" PRIMARY KEY("id"),
	CONSTRAINT "menu_item_prices_position_uk" UNIQUE("menu_item_id","position"),
	CONSTRAINT "menu_item_prices_analysis_price_uk" UNIQUE("menu_item_id","analysis_price_id"),
	CONSTRAINT "menu_item_prices_position_nonnegative_ck" CHECK ("menu_item_prices"."position" >= 0),
	CONSTRAINT "menu_item_prices_kind_ck" CHECK ("menu_item_prices"."price_kind" IN ('base', 'option')),
	CONSTRAINT "menu_item_prices_amount_ck" CHECK (
        "menu_item_prices"."amount" >= 0
        AND "menu_item_prices"."amount" NOT IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
      ),
	CONSTRAINT "menu_item_prices_display_text_nonblank_ck" CHECK (btrim("menu_item_prices"."display_text") <> ''),
	CONSTRAINT "menu_item_prices_currency_nonblank_ck" CHECK ("menu_item_prices"."currency" IS NULL OR btrim("menu_item_prices"."currency") <> ''),
	CONSTRAINT "menu_item_prices_kind_payload_ck" CHECK (
        (
          "menu_item_prices"."price_kind" = 'base'
          AND "menu_item_prices"."analysis_price_id" IS NULL
          AND "menu_item_prices"."context_label" IS NULL
        )
        OR
        (
          "menu_item_prices"."price_kind" = 'option'
          AND "menu_item_prices"."analysis_price_id" IS NOT NULL
          AND btrim("menu_item_prices"."analysis_price_id") <> ''
          AND "menu_item_prices"."context_label" IS NOT NULL
          AND btrim("menu_item_prices"."context_label") <> ''
        )
      )
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"menu_snapshot_id" uuid NOT NULL,
	"menu_section_id" uuid,
	"analysis_dish_id" text NOT NULL,
	"position" integer NOT NULL,
	"display_name" text NOT NULL,
	"original_name" text,
	"menu_description" text,
	CONSTRAINT "menu_items_pkey" PRIMARY KEY("id"),
	CONSTRAINT "menu_items_dish_uk" UNIQUE("menu_snapshot_id","analysis_dish_id"),
	CONSTRAINT "menu_items_position_uk" UNIQUE("menu_snapshot_id","position"),
	CONSTRAINT "menu_items_analysis_dish_id_nonblank_ck" CHECK (btrim("menu_items"."analysis_dish_id") <> ''),
	CONSTRAINT "menu_items_position_nonnegative_ck" CHECK ("menu_items"."position" >= 0),
	CONSTRAINT "menu_items_display_name_nonblank_ck" CHECK (btrim("menu_items"."display_name") <> ''),
	CONSTRAINT "menu_items_original_name_nonblank_ck" CHECK ("menu_items"."original_name" IS NULL OR btrim("menu_items"."original_name") <> ''),
	CONSTRAINT "menu_items_menu_description_nonblank_ck" CHECK ("menu_items"."menu_description" IS NULL OR btrim("menu_items"."menu_description") <> '')
);
--> statement-breakpoint
CREATE TABLE "menu_sections" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"menu_snapshot_id" uuid NOT NULL,
	"analysis_category_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "menu_sections_pkey" PRIMARY KEY("id"),
	CONSTRAINT "menu_sections_category_uk" UNIQUE("menu_snapshot_id","analysis_category_id"),
	CONSTRAINT "menu_sections_position_uk" UNIQUE("menu_snapshot_id","position"),
	CONSTRAINT "menu_sections_snapshot_identity_uk" UNIQUE("id","menu_snapshot_id"),
	CONSTRAINT "menu_sections_analysis_category_id_nonblank_ck" CHECK (btrim("menu_sections"."analysis_category_id") <> ''),
	CONSTRAINT "menu_sections_position_nonnegative_ck" CHECK ("menu_sections"."position" >= 0),
	CONSTRAINT "menu_sections_label_nonblank_ck" CHECK (btrim("menu_sections"."label") <> '')
);
--> statement-breakpoint
CREATE TABLE "menu_snapshots" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"analysis_snapshot_id" uuid NOT NULL,
	"projector_version" text NOT NULL,
	"title" text,
	"currency" text,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_snapshots_pkey" PRIMARY KEY("id"),
	CONSTRAINT "menu_snapshots_source_projector_uk" UNIQUE("analysis_snapshot_id","projector_version"),
	CONSTRAINT "menu_snapshots_projector_version_ck" CHECK ("menu_snapshots"."projector_version" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
	CONSTRAINT "menu_snapshots_title_nonblank_ck" CHECK ("menu_snapshots"."title" IS NULL OR btrim("menu_snapshots"."title") <> ''),
	CONSTRAINT "menu_snapshots_currency_nonblank_ck" CHECK ("menu_snapshots"."currency" IS NULL OR btrim("menu_snapshots"."currency") <> '')
);
--> statement-breakpoint
ALTER TABLE "menu_item_prices" ADD CONSTRAINT "menu_item_prices_menu_item_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_snapshot_fk" FOREIGN KEY ("menu_snapshot_id") REFERENCES "public"."menu_snapshots"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_section_snapshot_fk" FOREIGN KEY ("menu_section_id","menu_snapshot_id") REFERENCES "public"."menu_sections"("id","menu_snapshot_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_menu_snapshot_fk" FOREIGN KEY ("menu_snapshot_id") REFERENCES "public"."menu_snapshots"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "menu_snapshots" ADD CONSTRAINT "menu_snapshots_analysis_snapshot_fk" FOREIGN KEY ("analysis_snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_prices_one_base_ux" ON "menu_item_prices" USING btree ("menu_item_id") WHERE "menu_item_prices"."price_kind" = 'base';--> statement-breakpoint
CREATE INDEX "menu_items_section_lookup_ix" ON "menu_items" USING btree ("menu_section_id","menu_snapshot_id","position") WHERE "menu_items"."menu_section_id" IS NOT NULL;
--> statement-breakpoint
-- C2.3 Drizzle-generated schema end.
-- C2.3 reviewed immutable runtime privileges.
REVOKE ALL PRIVILEGES ON TABLE
	"public"."menu_snapshots",
	"public"."menu_sections",
	"public"."menu_items",
	"public"."menu_item_prices"
FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE
	"public"."menu_snapshots",
	"public"."menu_sections",
	"public"."menu_items",
	"public"."menu_item_prices"
FROM "foodseyo_runtime";
--> statement-breakpoint
GRANT SELECT, INSERT
ON TABLE
	"public"."menu_snapshots",
	"public"."menu_sections",
	"public"."menu_items",
	"public"."menu_item_prices"
TO "foodseyo_runtime";
