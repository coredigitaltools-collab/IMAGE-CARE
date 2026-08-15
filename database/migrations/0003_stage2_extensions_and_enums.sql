-- ============================================================
-- ImageCare ERP - Stage 2 Migration 0003
-- File: 0003_stage2_extensions_and_enums.sql
-- Version: IMC-STAGE-2-v1.0
-- Purpose: Extensions, shared ENUM types, and shared helper
--          functions required by all Stage 2 domain tables.
--
-- Depends on: 0001_stage1_foundation.sql
--             0002_stage1_branch_authorization.sql
--
-- All objects are in the imagecare schema.
-- Uses gen_random_uuid() throughout (no uuid-ossp required).
-- Safe to run multiple times (CREATE IF NOT EXISTS / OR REPLACE).
-- ============================================================

SET search_path TO imagecare, public;

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy name search
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid fallback

-- ============================================================
-- ENUM TYPES
-- Defined once, referenced across all domain tables.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE imagecare.movement_type AS ENUM (
    'purchase',
    'sale',
    'adjustment_in',
    'adjustment_out',
    'transfer_in',
    'transfer_out',
    'return_in',
    'return_out',
    'opening_stock',
    'damage',
    'expiry'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE imagecare.journal_entry_type AS ENUM (
    'sale',
    'purchase',
    'payroll',
    'expense',
    'credit_payment',
    'bank_deposit',
    'bank_withdrawal',
    'adjustment',
    'opening_balance',
    'transfer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE imagecare.account_type AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE imagecare.transaction_status AS ENUM (
    'draft',
    'confirmed',
    'cancelled',
    'voided'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE imagecare.payment_method AS ENUM (
    'cash',
    'mobile_money',
    'bank_transfer',
    'card',
    'credit',
    'cheque'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE imagecare.sync_status AS ENUM (
    'pending',
    'synced',
    'conflict',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE imagecare.audit_action AS ENUM (
    'insert',
    'update',
    'delete',
    'restore'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE imagecare.gender AS ENUM (
    'male',
    'female',
    'other',
    'prefer_not_to_say'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SHARED HELPER: updated_at trigger
-- Already created in 0001 but reproduced safely here.
-- ============================================================
CREATE OR REPLACE FUNCTION imagecare.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0003',
  'Stage 2: Extensions, ENUMs, shared helpers',
  'system', FALSE, NULL, NULL
);
END $$;
