CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."expiry_source" AS ENUM('printed', 'estimated', 'manual');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('succeeded', 'failed_model', 'failed_validation');--> statement-breakpoint
CREATE TYPE "public"."match_method" AS ENUM('exact', 'suggested', 'manual', 'new_item');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('receipt', 'usage', 'waste', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."receipt_source" AS ENUM('manual', 'ai_extraction');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('each', 'g', 'ml');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."waste_reason" AS ENUM('expired', 'spoiled', 'damaged', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_anonymous" boolean DEFAULT false,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"timezone" text NOT NULL,
	"expiry_warning_days" integer DEFAULT 3 NOT NULL,
	"extraction_cap_per_user_daily" integer DEFAULT 5 NOT NULL,
	"extraction_cap_per_ip_daily" integer DEFAULT 10 NOT NULL,
	"extraction_cap_global_daily" integer DEFAULT 50 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_id_check" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_expiry_warning_days_check" CHECK ("settings"."expiry_warning_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"category_id" uuid,
	"base_unit" "unit" NOT NULL,
	"tracks_expiry" boolean DEFAULT false NOT NULL,
	"shelf_life_days" integer,
	"reorder_point" numeric(14, 3) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_shelf_life_positive" CHECK ("products"."shelf_life_days" is null or "products"."shelf_life_days" > 0),
	CONSTRAINT "products_shelf_life_requires_tracks_expiry" CHECK ("products"."shelf_life_days" is null or "products"."tracks_expiry"),
	CONSTRAINT "products_reorder_point_non_negative" CHECK ("products"."reorder_point" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"lead_time_days" integer DEFAULT 2 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name"),
	CONSTRAINT "suppliers_lead_time_non_negative" CHECK ("suppliers"."lead_time_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_sku" text,
	"description" text NOT NULL,
	"description_normalized" text NOT NULL,
	"pack_label" text NOT NULL,
	"pack_quantity" numeric(14, 3) NOT NULL,
	"last_pack_cost_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_items_pack_quantity_positive" CHECK ("supplier_items"."pack_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" text NOT NULL,
	"model_id" text NOT NULL,
	"reasoning" text,
	"status" "extraction_status" NOT NULL,
	"raw_output" jsonb,
	"parsed_output" jsonb,
	"error_message" text,
	"client_ip_hash" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"delivery_date" date NOT NULL,
	"reference" text,
	"source" "receipt_source" NOT NULL,
	"extraction_id" uuid,
	"idempotency_key" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid,
	"lot_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expiry_date" date,
	"expiry_source" "expiry_source",
	"unit_cost" numeric(14, 6),
	"initial_quantity" numeric(14, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_id_product_id_uq" UNIQUE("id","product_id"),
	CONSTRAINT "batches_expiry_nullability_match" CHECK (("batches"."expiry_date" is null) = ("batches"."expiry_source" is null)),
	CONSTRAINT "batches_unit_cost_non_negative" CHECK ("batches"."unit_cost" is null or "batches"."unit_cost" >= 0),
	CONSTRAINT "batches_initial_quantity_positive" CHECK ("batches"."initial_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"supplier_item_id" uuid,
	"description_printed" text,
	"pack_count" numeric(14, 3) NOT NULL,
	"pack_quantity" numeric(14, 3) NOT NULL,
	"line_cost_cents" integer,
	"match_method" "match_method" NOT NULL,
	CONSTRAINT "receipt_lines_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "receipt_lines_pack_count_positive" CHECK ("receipt_lines"."pack_count" > 0),
	CONSTRAINT "receipt_lines_pack_quantity_positive" CHECK ("receipt_lines"."pack_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"movement_group_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"waste_reason" "waste_reason",
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_non_zero" CHECK ("stock_movements"."quantity" <> 0),
	CONSTRAINT "stock_movements_receipt_positive" CHECK ("stock_movements"."type" <> 'receipt' or "stock_movements"."quantity" > 0),
	CONSTRAINT "stock_movements_usage_waste_negative" CHECK ("stock_movements"."type" not in ('usage', 'waste') or "stock_movements"."quantity" < 0),
	CONSTRAINT "stock_movements_waste_reason_match" CHECK (("stock_movements"."type" = 'waste') = ("stock_movements"."waste_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_extraction_id_document_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."document_extractions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_supplier_item_id_supplier_items_id_fk" FOREIGN KEY ("supplier_item_id") REFERENCES "public"."supplier_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_product_id_batches_id_product_id_fk" FOREIGN KEY ("batch_id","product_id") REFERENCES "public"."batches"("id","product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_is_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "products_name_normalized_trgm_idx" ON "products" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_items_supplier_description_uq" ON "supplier_items" USING btree ("supplier_id","description_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_items_supplier_sku_uq" ON "supplier_items" USING btree ("supplier_id","supplier_sku") WHERE "supplier_items"."supplier_sku" is not null;--> statement-breakpoint
CREATE INDEX "supplier_items_description_normalized_trgm_idx" ON "supplier_items" USING gin ("description_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "supplier_items_product_id_idx" ON "supplier_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "document_extractions_created_by_created_at_idx" ON "document_extractions" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "document_extractions_client_ip_hash_created_at_idx" ON "document_extractions" USING btree ("client_ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "document_extractions_created_at_idx" ON "document_extractions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "batches_fefo_idx" ON "batches" USING btree ("product_id","expiry_date","received_at","id");--> statement-breakpoint
CREATE INDEX "stock_movements_batch_id_idx" ON "stock_movements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_occurred_at_idx" ON "stock_movements" USING btree ("product_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_group_id_idx" ON "stock_movements" USING btree ("movement_group_id");