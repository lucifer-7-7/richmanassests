-- ============================================================
-- Migration 007: builder_projects table
-- Run this ONCE in the Supabase SQL Editor:
-- https://app.supabase.com/project/odgvwtwjpircuxcfxleb/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS builder_projects (
  id                 TEXT PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  tagline            TEXT,
  positioning        TEXT,
  marketing_desc     TEXT,

  promoter           TEXT,
  promoter_office    TEXT,
  registered_office  TEXT,
  architect          TEXT,
  legal_advisor      TEXT,
  partnered_by       TEXT,
  website            TEXT,
  contact_numbers    TEXT,
  contact_email      TEXT,

  rera_status        TEXT,
  rera_number        TEXT,
  rera_date          TEXT,
  rera_validity      TEXT,
  survey_number      TEXT,
  rera_cert_img      TEXT,

  address            TEXT,
  area               TEXT NOT NULL DEFAULT '',
  loc                TEXT NOT NULL DEFAULT '',
  proximity          JSONB,

  project_type       TEXT,
  unit_types         JSONB,
  unit_mix_summary   TEXT,
  floor_breakdown    JSONB,
  commercial_shops   JSONB,

  structure_specs    JSONB,
  flooring_specs     JSONB,
  electrical_specs   JSONB,
  doors_windows_specs JSONB,
  kitchen_specs      JSONB,
  bathroom_specs     JSONB,

  amenities          JSONB,
  terrace_amenities  JSONB,
  bank_partners      JSONB,
  highlights         JSONB,

  img_hero           TEXT,
  img_card           TEXT,
  gallery            JSONB,

  seo_title          TEXT,
  seo_description    TEXT,
  seo_keywords       TEXT,

  status             TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft')),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builder_projects_status ON builder_projects(status);
CREATE INDEX IF NOT EXISTS idx_builder_projects_slug   ON builder_projects(slug);
