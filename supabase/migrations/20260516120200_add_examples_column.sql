-- TT-212: optional examples copy for review_rating_category rows.
--
-- Renders next to the slider via an (i) icon when non-null. Used for
-- categories where the description alone isn't enough — e.g. Throw
-- angle, Topsheet hardness, Balance — and reviewers benefit from
-- concrete reference points like "Hurricane 3 has a very hard topsheet;
-- Victas 401 is very soft."
--
-- Plain text; the form renders multi-line with whitespace preserved.
-- Per-row content lives in supabase/seed.sql.

ALTER TABLE categories
  ADD COLUMN examples TEXT;
