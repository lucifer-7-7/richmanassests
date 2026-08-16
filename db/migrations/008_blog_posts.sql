-- ============================================================
-- Migration 008: blog_posts table
-- Run this ONCE in the Supabase SQL Editor:
-- https://app.supabase.com/project/anqhvevtiqpzpjkxwptp/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id               TEXT PRIMARY KEY,
  slug             TEXT UNIQUE NOT NULL,
  title            TEXT NOT NULL,
  excerpt          TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'Buying Guide',
  tags             JSONB DEFAULT '[]',

  cover_image      TEXT,
  author_name      TEXT NOT NULL DEFAULT 'RichManAssets Editorial',
  author_role      TEXT NOT NULL DEFAULT 'Property Consultants, Udupi',
  reading_time_min INTEGER NOT NULL DEFAULT 6,

  content_html     TEXT NOT NULL,
  faq              JSONB DEFAULT '[]',

  seo_title        TEXT,
  seo_description  TEXT,
  seo_keywords     TEXT,

  status           TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','draft')),
  published_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status       ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug         ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);
