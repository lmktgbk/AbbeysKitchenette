-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('admin', 'cashier', 'kitchen');

-- CreateEnum
CREATE TYPE "public"."adjustment_type_enum" AS ENUM ('deduction', 'restock', 'loss', 'manual');

-- CreateEnum
CREATE TYPE "public"."alert_type_enum" AS ENUM ('low_stock', 'out_of_stock', 'expiring_soon', 'expired');

-- CreateEnum
CREATE TYPE "public"."loss_override_reason_enum" AS ENUM ('transferred', 'not_used', 'other');

-- CreateEnum
CREATE TYPE "public"."loss_type_enum" AS ENUM ('spoilage', 'spillage', 'expiry', 'cancellation', 'other');

-- CreateEnum
CREATE TYPE "public"."order_source_enum" AS ENUM ('walk_in', 'online');

-- CreateEnum
CREATE TYPE "public"."order_status_enum" AS ENUM ('pending', 'accepted', 'preparing', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'cashier',
    "passwordHash" TEXT NOT NULL,
    "image_url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."anomaly_results" (
    "id" UUID NOT NULL,
    "rule_id" VARCHAR(50) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "actual_value" DECIMAL(12,2) NOT NULL,
    "expected_value" DECIMAL(12,2) NOT NULL,
    "expected_min" DECIMAL(12,2) NOT NULL,
    "expected_max" DECIMAL(12,2) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "gemini_insight" TEXT,
    "is_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "category_id" SERIAL NOT NULL,
    "category_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "public"."combo_created_pairs" (
    "id" SERIAL NOT NULL,
    "product_name_a" VARCHAR(150) NOT NULL,
    "product_name_b" VARCHAR(150) NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combo_created_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."forecast_jobs" (
    "id" SERIAL NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "total_variants" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "failed_skips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "period" INTEGER NOT NULL DEFAULT 14,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "error_message" VARCHAR(500),
    "product_scores" JSONB,

    CONSTRAINT "forecast_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."forecast_results" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "product_name" VARCHAR(150) NOT NULL,
    "size_name" VARCHAR(50) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "daily_data" JSONB NOT NULL,
    "total_units" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" VARCHAR(20) NOT NULL DEFAULT 'stable',
    "days_of_data" INTEGER NOT NULL DEFAULT 0,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "skip_reason" VARCHAR(200),
    "rmse" DOUBLE PRECISION,
    "mae" DOUBLE PRECISION,
    "mse" DOUBLE PRECISION,
    "r_squared" DOUBLE PRECISION,
    "method" VARCHAR(20),
    "product_id" INTEGER,
    "share" DOUBLE PRECISION,
    "tier" VARCHAR(20),

    CONSTRAINT "forecast_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ingredients" (
    "ingredient_id" UUID NOT NULL,
    "ingredient_name" VARCHAR(150) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "minimum_threshold" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("ingredient_id")
);

-- CreateTable
CREATE TABLE "public"."loss_records" (
    "loss_id" SERIAL NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "declared_by" UUID NOT NULL,
    "loss_type" "public"."loss_type_enum" NOT NULL,
    "quantity_lost" DECIMAL(10,3) NOT NULL,
    "cost_per_unit" DECIMAL(10,4) NOT NULL,
    "total_cost_lost" DECIMAL(10,2) NOT NULL,
    "related_restock_id" INTEGER,
    "related_order_id" UUID,
    "related_order_item_id" INTEGER,
    "notes" VARCHAR(500),
    "override_reason" "public"."loss_override_reason_enum",
    "override_note" VARCHAR(500),
    "overridden_by" UUID,
    "overridden_at" TIMESTAMPTZ(6),
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_records_pkey" PRIMARY KEY ("loss_id")
);

-- CreateTable
CREATE TABLE "public"."mba_jobs" (
    "id" SERIAL NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "products_analyzed" INTEGER NOT NULL DEFAULT 0,
    "combos_found" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "error_message" VARCHAR(500),

    CONSTRAINT "mba_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mba_rules" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "product_name_a" VARCHAR(150) NOT NULL,
    "product_name_b" VARCHAR(150) NOT NULL,
    "product_id_a" UUID,
    "product_id_b" UUID,
    "variant_id_a" INTEGER,
    "variant_id_b" INTEGER,
    "size_name_a" VARCHAR(50),
    "size_name_b" VARCHAR(50),
    "support" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "lift" DOUBLE PRECISION NOT NULL,
    "is_combo" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,
    "suggested_name" VARCHAR(200),
    "merged_ingredients" JSONB,
    "pricing" JSONB,
    "conviction" DOUBLE PRECISION,
    "stable" BOOLEAN DEFAULT false,
    "recent_support" DOUBLE PRECISION,
    "recent_confidence" DOUBLE PRECISION,
    "recent_lift" DOUBLE PRECISION,

    CONSTRAINT "mba_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_cancellations" (
    "cancellation_id" SERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "cancelled_by" UUID NOT NULL,
    "reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_cancellations_pkey" PRIMARY KEY ("cancellation_id")
);

-- CreateTable
CREATE TABLE "public"."order_counters" (
    "date" DATE NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_counters_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "public"."order_ingredient_deductions" (
    "id" SERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "restock_batch_id" INTEGER NOT NULL,
    "quantity_deducted" DECIMAL(10,3) NOT NULL,
    "cost_per_unit" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "reversed_at" TIMESTAMPTZ(6),
    "reversed_by" UUID,

    CONSTRAINT "order_ingredient_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_items" (
    "order_item_id" SERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2),
    "is_prepared" BOOLEAN NOT NULL DEFAULT false,
    "prepared_by" UUID,
    "prepared_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "removed_by" UUID,
    "removed_reason" TEXT,
    "removed_loss_option" TEXT,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_label" VARCHAR(200),
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_type" VARCHAR(20) NOT NULL DEFAULT 'none',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_item_id")
);

-- CreateTable
CREATE TABLE "public"."orders" (
    "order_id" UUID NOT NULL,
    "order_number" INTEGER NOT NULL,
    "order_date" DATE NOT NULL,
    "customer_name" VARCHAR(100) NOT NULL,
    "table_number" VARCHAR(20) NOT NULL,
    "order_source" "public"."order_source_enum" NOT NULL,
    "status" "public"."order_status_enum" NOT NULL DEFAULT 'pending',
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by" UUID,
    "preparing_at" TIMESTAMPTZ(6),
    "preparing_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" UUID,
    "fulfillment_minutes" INTEGER,
    "subtotal_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_type" VARCHAR(20) NOT NULL DEFAULT 'none',
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_label" VARCHAR(200),
    "discount_id_no" VARCHAR(50),
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_by" UUID,
    "shift_id" UUID,
    "payment_method" VARCHAR(20) NOT NULL DEFAULT 'cash',
    "reference_no" VARCHAR(100),
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(10,2),
    "change" DECIMAL(10,2),
    "guest_token" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "pwd_id_no" VARCHAR(50),
    "senior_id_no" VARCHAR(50),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "public"."otp_codes" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_refunds" (
    "refund_id" SERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" VARCHAR(500),
    "refunded_by" UUID NOT NULL,
    "refunded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("refund_id")
);

-- CreateTable
CREATE TABLE "public"."price_optimizations" (
    "id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "product_name" VARCHAR(150) NOT NULL,
    "size_name" VARCHAR(50) NOT NULL,
    "current_price" DECIMAL(10,2) NOT NULL,
    "recommended_price" DECIMAL(10,2) NOT NULL,
    "price_change" DECIMAL(10,2) NOT NULL,
    "change_percent" DOUBLE PRECISION NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "margin_before" DOUBLE PRECISION NOT NULL,
    "margin_after" DOUBLE PRECISION NOT NULL,
    "competitor_avg" DOUBLE PRECISION,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."product_variants" (
    "variant_id" SERIAL NOT NULL,
    "product_id" UUID NOT NULL,
    "size_name" VARCHAR(50) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_manually_deactivated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "product_id" UUID NOT NULL,
    "subcategory_id" INTEGER NOT NULL,
    "product_name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "public"."receipts" (
    "receipt_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "issued_by" UUID,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "public"."recipes" (
    "recipe_id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity_needed" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("recipe_id")
);

-- CreateTable
CREATE TABLE "public"."reorder_suggestions" (
    "id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "current_stock" DECIMAL(10,3) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "suggested_quantity" DECIMAL(10,3) NOT NULL,
    "urgency" VARCHAR(20) NOT NULL,
    "reasoning" TEXT NOT NULL,
    "estimated_stockout" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reorder_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."restock_batches" (
    "restock_id" SERIAL NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "restocked_by" UUID NOT NULL,
    "quantity_added" DECIMAL(10,3) NOT NULL,
    "quantity_left" DECIMAL(10,3) NOT NULL,
    "cost_per_unit" DECIMAL(10,4) NOT NULL,
    "total_cost" DECIMAL(10,2) NOT NULL,
    "is_priority" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "supplier_name" VARCHAR(150),
    "notes" VARCHAR(500),
    "restocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" DATE,

    CONSTRAINT "restock_batches_pkey" PRIMARY KEY ("restock_id")
);

-- CreateTable
CREATE TABLE "public"."sheet_sync_log" (
    "id" SERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'paid',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sheet_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."shifts" (
    "shift_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash" DECIMAL(10,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "expected_cash" DECIMAL(10,2),
    "actual_cash" DECIMAL(10,2),
    "variance" DECIMAL(10,2),
    "close_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("shift_id")
);

-- CreateTable
CREATE TABLE "public"."stock_adjustments" (
    "adjustment_id" SERIAL NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "adjusted_by" UUID NOT NULL,
    "adjustment_type" "public"."adjustment_type_enum" NOT NULL,
    "quantity_before" DECIMAL(10,3) NOT NULL,
    "quantity_changed" DECIMAL(10,3) NOT NULL,
    "quantity_after" DECIMAL(10,3) NOT NULL,
    "related_order_id" UUID,
    "related_restock_id" INTEGER,
    "related_loss_id" INTEGER,
    "notes" VARCHAR(500),
    "adjusted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("adjustment_id")
);

-- CreateTable
CREATE TABLE "public"."stock_alerts" (
    "alert_id" SERIAL NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "alert_type" "public"."alert_type_enum" NOT NULL,
    "stock_at_trigger" DECIMAL(10,3) NOT NULL,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateTable
CREATE TABLE "public"."subcategories" (
    "subcategory_id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "subcategory_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("subcategory_id")
);

-- CreateTable
CREATE TABLE "public"."system_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "storeName" TEXT NOT NULL DEFAULT 'Abbey''s Kitchenette',
    "storeAddress" TEXT,
    "storePhone" TEXT,
    "storeEmail" TEXT,
    "storeIpWhitelist" TEXT,
    "store_hours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accepted_payments" TEXT[] DEFAULT ARRAY['cash', 'gcash', 'maya']::TEXT[],
    "automation" JSONB NOT NULL DEFAULT '{}',
    "dining_tables" JSONB,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."waste_reductions" (
    "id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "current_stock" DECIMAL(10,3) NOT NULL,
    "forecasted_usage" DECIMAL(10,3) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "overstock_amount" DECIMAL(10,3) NOT NULL,
    "wasteRisk" VARCHAR(20) NOT NULL,
    "reasoning" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "potential_savings" DECIMAL(10,2),
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waste_reductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."forecast_results" ADD CONSTRAINT "forecast_results_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."forecast_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loss_records" ADD CONSTRAINT "loss_records_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loss_records" ADD CONSTRAINT "loss_records_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loss_records" ADD CONSTRAINT "loss_records_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loss_records" ADD CONSTRAINT "loss_records_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mba_rules" ADD CONSTRAINT "mba_rules_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."mba_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_cancellations" ADD CONSTRAINT "order_cancellations_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_cancellations" ADD CONSTRAINT "order_cancellations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_ingredient_deductions" ADD CONSTRAINT "order_ingredient_deductions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_ingredient_deductions" ADD CONSTRAINT "order_ingredient_deductions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_ingredient_deductions" ADD CONSTRAINT "order_ingredient_deductions_restock_batch_id_fkey" FOREIGN KEY ("restock_batch_id") REFERENCES "public"."restock_batches"("restock_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_preparing_by_fkey" FOREIGN KEY ("preparing_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_refunds" ADD CONSTRAINT "payment_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_refunds" ADD CONSTRAINT "payment_refunds_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_optimizations" ADD CONSTRAINT "price_optimizations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("subcategory_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recipes" ADD CONSTRAINT "recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recipes" ADD CONSTRAINT "recipes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reorder_suggestions" ADD CONSTRAINT "reorder_suggestions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."restock_batches" ADD CONSTRAINT "restock_batches_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."restock_batches" ADD CONSTRAINT "restock_batches_restocked_by_fkey" FOREIGN KEY ("restocked_by") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shifts" ADD CONSTRAINT "shifts_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."shifts" ADD CONSTRAINT "shifts_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_adjustments" ADD CONSTRAINT "stock_adjustments_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_adjustments" ADD CONSTRAINT "stock_adjustments_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_alerts" ADD CONSTRAINT "stock_alerts_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subcategories" ADD CONSTRAINT "subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."waste_reductions" ADD CONSTRAINT "waste_reductions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("ingredient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve database-native indexes and checks.
CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);
CREATE INDEX anomaly_results_detected_at_idx ON public.anomaly_results USING btree (detected_at);
CREATE INDEX anomaly_results_rule_id_idx ON public.anomaly_results USING btree (rule_id);
CREATE INDEX anomaly_results_severity_idx ON public.anomaly_results USING btree (severity);
CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);
CREATE INDEX "audit_logs_createdAt_idx" ON public.audit_logs USING btree ("createdAt");
CREATE INDEX "audit_logs_targetType_targetId_idx" ON public.audit_logs USING btree ("targetType", "targetId");
CREATE INDEX "audit_logs_userId_idx" ON public.audit_logs USING btree ("userId");
CREATE UNIQUE INDEX categories_category_name_key ON public.categories USING btree (category_name);
CREATE UNIQUE INDEX combo_created_pairs_product_name_a_product_name_b_key ON public.combo_created_pairs USING btree (product_name_a, product_name_b);
CREATE INDEX deductions_order_id_reversed_at_idx ON public.order_ingredient_deductions USING btree (order_id, reversed_at);
CREATE UNIQUE INDEX forecast_results_job_id_variant_id_key ON public.forecast_results USING btree (job_id, variant_id);
CREATE UNIQUE INDEX ingredients_ingredient_name_key ON public.ingredients USING btree (ingredient_name);
CREATE UNIQUE INDEX ingredients_name_lower_uniq ON public.ingredients USING btree (lower((ingredient_name)::text));
CREATE INDEX loss_records_ingredient_id_idx ON public.loss_records USING btree (ingredient_id);
CREATE INDEX loss_records_related_order_id_idx ON public.loss_records USING btree (related_order_id);
CREATE INDEX mba_rules_job_id_idx ON public.mba_rules USING btree (job_id);
CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);
CREATE INDEX notifications_is_read_idx ON public.notifications USING btree (is_read);
CREATE INDEX notifications_reference_idx ON public.notifications USING btree (reference_type, reference_id);
CREATE INDEX notifications_type_idx ON public.notifications USING btree (type);
CREATE UNIQUE INDEX order_cancellations_order_id_key ON public.order_cancellations USING btree (order_id);
CREATE INDEX order_ingredient_deductions_ingredient_id_idx ON public.order_ingredient_deductions USING btree (ingredient_id);
CREATE INDEX order_ingredient_deductions_order_id_idx ON public.order_ingredient_deductions USING btree (order_id);
CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);
CREATE INDEX order_items_order_id_removed_at_idx ON public.order_items USING btree (order_id, removed_at);
CREATE INDEX order_items_variant_id_idx ON public.order_items USING btree (variant_id);
CREATE INDEX orders_created_by_idx ON public.orders USING btree (created_by);
CREATE UNIQUE INDEX orders_guest_token_key ON public.orders USING btree (guest_token);
CREATE INDEX orders_order_date_idx ON public.orders USING btree (order_date);
CREATE UNIQUE INDEX orders_order_date_order_number_key ON public.orders USING btree (order_date, order_number);
CREATE INDEX orders_shift_id_idx ON public.orders USING btree (shift_id);
CREATE INDEX orders_status_idx ON public.orders USING btree (status);
CREATE INDEX otp_codes_user_id_idx ON public.otp_codes USING btree (user_id);
CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);
CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);
CREATE UNIQUE INDEX payment_refunds_order_id_key ON public.payment_refunds USING btree (order_id);
CREATE INDEX price_optimizations_status_idx ON public.price_optimizations USING btree (status);
CREATE INDEX price_optimizations_variant_id_idx ON public.price_optimizations USING btree (variant_id);
CREATE INDEX product_variants_is_available_idx ON public.product_variants USING btree (is_available);
CREATE INDEX product_variants_product_id_idx ON public.product_variants USING btree (product_id);
CREATE UNIQUE INDEX product_variants_product_id_size_name_key ON public.product_variants USING btree (product_id, size_name);
CREATE INDEX products_is_archived_idx ON public.products USING btree (is_archived);
CREATE INDEX products_is_available_idx ON public.products USING btree (is_available);
CREATE UNIQUE INDEX products_name_ci_uniq ON public.products USING btree (lower((product_name)::text));
CREATE INDEX products_subcategory_id_idx ON public.products USING btree (subcategory_id);
CREATE UNIQUE INDEX receipts_order_id_key ON public.receipts USING btree (order_id);
CREATE INDEX recipes_ingredient_id_idx ON public.recipes USING btree (ingredient_id);
CREATE UNIQUE INDEX recipes_variant_id_ingredient_id_key ON public.recipes USING btree (variant_id, ingredient_id);
CREATE INDEX reorder_suggestions_ingredient_id_idx ON public.reorder_suggestions USING btree (ingredient_id);
CREATE INDEX reorder_suggestions_status_idx ON public.reorder_suggestions USING btree (status);
CREATE INDEX restock_batches_ingredient_id_idx ON public.restock_batches USING btree (ingredient_id);
CREATE INDEX restock_batches_ingredient_id_quantity_left_idx ON public.restock_batches USING btree (ingredient_id, quantity_left);
CREATE UNIQUE INDEX sheet_sync_log_order_kind_unique ON public.sheet_sync_log USING btree (order_id, kind);
CREATE INDEX sheet_sync_log_status_idx ON public.sheet_sync_log USING btree (status);
CREATE UNIQUE INDEX shifts_one_open_per_user ON public.shifts USING btree (opened_by) WHERE ((status)::text = 'open'::text);
CREATE INDEX shifts_opened_by_idx ON public.shifts USING btree (opened_by);
CREATE INDEX shifts_status_idx ON public.shifts USING btree (status);
CREATE INDEX stock_adjustments_ingredient_id_adjusted_at_idx ON public.stock_adjustments USING btree (ingredient_id, adjusted_at);
CREATE INDEX stock_alerts_ingredient_id_idx ON public.stock_alerts USING btree (ingredient_id);
CREATE INDEX stock_alerts_is_resolved_idx ON public.stock_alerts USING btree (is_resolved);
CREATE UNIQUE INDEX subcategories_category_id_subcategory_name_key ON public.subcategories USING btree (category_id, subcategory_name);
CREATE INDEX waste_reductions_ingredient_id_idx ON public.waste_reductions USING btree (ingredient_id);
CREATE INDEX waste_reductions_status_idx ON public.waste_reductions USING btree (status);
ALTER TABLE public."orders" ADD CONSTRAINT "orders_total_amount_nonneg" CHECK ((total_amount >= (0)::numeric));
ALTER TABLE public."restock_batches" ADD CONSTRAINT "restock_batches_quantity_left_nonneg" CHECK ((quantity_left >= (0)::numeric));
