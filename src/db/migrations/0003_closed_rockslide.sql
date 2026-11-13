CREATE TYPE "public"."sales_import_source" AS ENUM('csv', 'webhook', 'manual');--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"pos_item_name" text,
	"category" text DEFAULT 'Beverages' NOT NULL,
	"price_cents" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_sku_unique" UNIQUE("sku"),
	CONSTRAINT "menu_items_price_non_negative" CHECK ("menu_items"."price_cents" is null or "menu_items"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_ingredients_quantity_positive" CHECK ("recipe_ingredients"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales_import_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_import_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"menu_item_name_snapshot" text NOT NULL,
	"quantity_sold" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_import_lines_qty_positive" CHECK ("sales_import_lines"."quantity_sold" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_batch_id" text NOT NULL,
	"source" "sales_import_source" NOT NULL,
	"sales_date" date NOT NULL,
	"file_name" text,
	"movement_group_id" uuid NOT NULL,
	"total_items_sold" integer NOT NULL,
	"imported_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_imports_external_batch_id_unique" UNIQUE("external_batch_id"),
	CONSTRAINT "sales_imports_total_items_positive" CHECK ("sales_imports"."total_items_sold" > 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_import_lines" ADD CONSTRAINT "sales_import_lines_sales_import_id_sales_imports_id_fk" FOREIGN KEY ("sales_import_id") REFERENCES "public"."sales_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_import_lines" ADD CONSTRAINT "sales_import_lines_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_imported_by_user_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_items_is_active_idx" ON "menu_items" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "menu_items_name_normalized_idx" ON "menu_items" USING btree ("name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredients_menu_product_uidx" ON "recipe_ingredients" USING btree ("menu_item_id","product_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_menu_item_idx" ON "recipe_ingredients" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "sales_import_lines_import_id_idx" ON "sales_import_lines" USING btree ("sales_import_id");--> statement-breakpoint
CREATE INDEX "sales_imports_sales_date_idx" ON "sales_imports" USING btree ("sales_date");