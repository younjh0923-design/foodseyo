import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { analysisSnapshots } from "./analysis-cache.ts";

export const menuSnapshots = pgTable(
  "menu_snapshots",
  {
    id: uuid("id").notNull().defaultRandom(),
    analysisSnapshotId: uuid("analysis_snapshot_id").notNull(),
    projectorVersion: text("projector_version").notNull(),
    title: text("title"),
    currency: text("currency"),
    projectedAt: timestamp("projected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "menu_snapshots_pkey",
      columns: [table.id],
    }),
    foreignKey({
      name: "menu_snapshots_analysis_snapshot_fk",
      columns: [table.analysisSnapshotId],
      foreignColumns: [analysisSnapshots.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("menu_snapshots_source_projector_uk").on(
      table.analysisSnapshotId,
      table.projectorVersion,
    ),
    check(
      "menu_snapshots_projector_version_ck",
      sql`${table.projectorVersion} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'`,
    ),
    check(
      "menu_snapshots_title_nonblank_ck",
      sql`${table.title} IS NULL OR btrim(${table.title}) <> ''`,
    ),
    check(
      "menu_snapshots_currency_nonblank_ck",
      sql`${table.currency} IS NULL OR btrim(${table.currency}) <> ''`,
    ),
  ],
);

export const menuSections = pgTable(
  "menu_sections",
  {
    id: uuid("id").notNull().defaultRandom(),
    menuSnapshotId: uuid("menu_snapshot_id").notNull(),
    analysisCategoryId: text("analysis_category_id").notNull(),
    position: integer("position").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    primaryKey({
      name: "menu_sections_pkey",
      columns: [table.id],
    }),
    foreignKey({
      name: "menu_sections_menu_snapshot_fk",
      columns: [table.menuSnapshotId],
      foreignColumns: [menuSnapshots.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("menu_sections_category_uk").on(
      table.menuSnapshotId,
      table.analysisCategoryId,
    ),
    unique("menu_sections_position_uk").on(
      table.menuSnapshotId,
      table.position,
    ),
    unique("menu_sections_snapshot_identity_uk").on(
      table.id,
      table.menuSnapshotId,
    ),
    check(
      "menu_sections_analysis_category_id_nonblank_ck",
      sql`btrim(${table.analysisCategoryId}) <> ''`,
    ),
    check(
      "menu_sections_position_nonnegative_ck",
      sql`${table.position} >= 0`,
    ),
    check(
      "menu_sections_label_nonblank_ck",
      sql`btrim(${table.label}) <> ''`,
    ),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").notNull().defaultRandom(),
    menuSnapshotId: uuid("menu_snapshot_id").notNull(),
    menuSectionId: uuid("menu_section_id"),
    analysisDishId: text("analysis_dish_id").notNull(),
    position: integer("position").notNull(),
    displayName: text("display_name").notNull(),
    originalName: text("original_name"),
    menuDescription: text("menu_description"),
  },
  (table) => [
    primaryKey({
      name: "menu_items_pkey",
      columns: [table.id],
    }),
    foreignKey({
      name: "menu_items_menu_snapshot_fk",
      columns: [table.menuSnapshotId],
      foreignColumns: [menuSnapshots.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    foreignKey({
      name: "menu_items_section_snapshot_fk",
      columns: [table.menuSectionId, table.menuSnapshotId],
      foreignColumns: [menuSections.id, menuSections.menuSnapshotId],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("menu_items_dish_uk").on(
      table.menuSnapshotId,
      table.analysisDishId,
    ),
    unique("menu_items_position_uk").on(
      table.menuSnapshotId,
      table.position,
    ),
    check(
      "menu_items_analysis_dish_id_nonblank_ck",
      sql`btrim(${table.analysisDishId}) <> ''`,
    ),
    check(
      "menu_items_position_nonnegative_ck",
      sql`${table.position} >= 0`,
    ),
    check(
      "menu_items_display_name_nonblank_ck",
      sql`btrim(${table.displayName}) <> ''`,
    ),
    check(
      "menu_items_original_name_nonblank_ck",
      sql`${table.originalName} IS NULL OR btrim(${table.originalName}) <> ''`,
    ),
    check(
      "menu_items_menu_description_nonblank_ck",
      sql`${table.menuDescription} IS NULL OR btrim(${table.menuDescription}) <> ''`,
    ),
    index("menu_items_section_lookup_ix")
      .on(table.menuSectionId, table.menuSnapshotId, table.position)
      .where(sql`${table.menuSectionId} IS NOT NULL`),
  ],
);

export const menuItemPrices = pgTable(
  "menu_item_prices",
  {
    id: uuid("id").notNull().defaultRandom(),
    menuItemId: uuid("menu_item_id").notNull(),
    analysisPriceId: text("analysis_price_id"),
    position: integer("position").notNull(),
    priceKind: text("price_kind").notNull(),
    contextLabel: text("context_label"),
    amount: numeric("amount").notNull(),
    currency: text("currency"),
    displayText: text("display_text").notNull(),
  },
  (table) => [
    primaryKey({
      name: "menu_item_prices_pkey",
      columns: [table.id],
    }),
    foreignKey({
      name: "menu_item_prices_menu_item_fk",
      columns: [table.menuItemId],
      foreignColumns: [menuItems.id],
    })
      .onDelete("restrict")
      .onUpdate("restrict"),
    unique("menu_item_prices_position_uk").on(
      table.menuItemId,
      table.position,
    ),
    unique("menu_item_prices_analysis_price_uk").on(
      table.menuItemId,
      table.analysisPriceId,
    ),
    uniqueIndex("menu_item_prices_one_base_ux")
      .on(table.menuItemId)
      .where(sql`${table.priceKind} = 'base'`),
    check(
      "menu_item_prices_position_nonnegative_ck",
      sql`${table.position} >= 0`,
    ),
    check(
      "menu_item_prices_kind_ck",
      sql`${table.priceKind} IN ('base', 'option')`,
    ),
    check(
      "menu_item_prices_amount_ck",
      sql`
        ${table.amount} >= 0
        AND ${table.amount} NOT IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
      `,
    ),
    check(
      "menu_item_prices_display_text_nonblank_ck",
      sql`btrim(${table.displayText}) <> ''`,
    ),
    check(
      "menu_item_prices_currency_nonblank_ck",
      sql`${table.currency} IS NULL OR btrim(${table.currency}) <> ''`,
    ),
    check(
      "menu_item_prices_kind_payload_ck",
      sql`
        (
          ${table.priceKind} = 'base'
          AND ${table.analysisPriceId} IS NULL
          AND ${table.contextLabel} IS NULL
        )
        OR
        (
          ${table.priceKind} = 'option'
          AND ${table.analysisPriceId} IS NOT NULL
          AND btrim(${table.analysisPriceId}) <> ''
          AND ${table.contextLabel} IS NOT NULL
          AND btrim(${table.contextLabel}) <> ''
        )
      `,
    ),
  ],
);

export const structuredMenuTables = [
  menuSnapshots,
  menuSections,
  menuItems,
  menuItemPrices,
] as const;
