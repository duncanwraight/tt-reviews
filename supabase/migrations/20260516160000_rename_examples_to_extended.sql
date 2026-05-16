-- TT-212: rename the `examples` column to `extended`.
--
-- Naming follow-up — the column holds the "extended description" that
-- the review form surfaces via the (i) icon popover. Product language
-- consistently called it "extended"; the earlier migration shipped it
-- as `examples` (the wrong name). Renaming keeps DB column, TS types,
-- and product vocabulary aligned.
--
-- This migration ships alongside seed.sql + code edits that switch
-- the column name on every read/write path.

ALTER TABLE categories
  RENAME COLUMN examples TO extended;
