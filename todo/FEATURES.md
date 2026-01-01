# Features

## Single Approval for Admin UI - DONE

**Current**: All submissions require 2 approvals regardless of source
**Requested**: Submissions approved via Admin UI should only need 1 approval; Discord approvals still require 2
**Rationale**: Admin UI users are trusted moderators with full context; Discord approvals are quicker/lighter-weight so benefit from second review
**Implemented**: Updated `update_submission_status()` trigger to check approval source - admin_ui approvals immediately approve

## Pre-fill and Lock Player on Equipment Setup Submission - DONE

**Location**: "Add Equipment Setup" link from player detail page → `/submissions/player_equipment_setup/submit`
**Current**: Player dropdown is empty, user must select player manually
**Requested**: When navigating from a player page, pre-fill the player and make it read-only (or hidden)
**Rationale**: Prevents accidental submission for wrong player; better UX flow
**Implemented**: Fixed URL param to pass player UUID; form shows locked player banner with hidden input when navigating from player page

## Equipment Setup: Use Equipment Search Instead of Free Text - DONE

**Location**: `/submissions/player_equipment_setup/submit` - rubber/blade fields
**Current**: Free text input for equipment names
**Requested**: Searchable dropdown that queries existing equipment in database
**Additional**: Add helper text: "If you can't find this player's equipment, make sure you've submitted it [here]" linking to `/submissions/equipment/submit`
**Rationale**: Ensures data consistency, links setups to actual equipment records, prevents typos/duplicates
**Implemented**:
- Created EquipmentCombobox component with search filtering and keyboard navigation
- Added blade_id, forehand_rubber_id, backhand_rubber_id columns to submissions table
- Updated form to use comboboxes for blade/rubber selection
- Admin approval now creates verified record in player_equipment_setups table
- Admin UI updated to match other submission pages (redirect after action, status sections, rejection modal)

## Equipment Comparison Page (Disabled)

**Location**: `/equipment/compare/:slug1-vs-:slug2`
**Status**: Route disabled - half-finished implementation
**TODO**: Complete the comparison feature with side-by-side specs, ratings, pro usage, etc.

## Image Upload for Equipment and Players - DONE

**Location**: Equipment and player submission forms
**Implemented**:
- Database migration adds `image_key` columns to `equipment_submissions`, `player_submissions`, `equipment`, and `players` tables
- Added image field type to submission registry for equipment (product photo) and player (upper-body photo) forms
- ImageUpload component with drag-and-drop, preview, validation (JPEG/PNG/WebP, max 10MB)
- Form submission handler validates and uploads to R2, stores key in submission record
- Admin moderation views display image thumbnails for submissions
- Approval action copies `image_key` from submission to main record
- Public equipment/player pages display images via LazyImage component using R2 API

## Admin Equipment Import from Revspin - DONE

**Location**: `/admin/import`
**Purpose**: Allow admins to bulk import equipment data from revspin.net
**Implemented**:
- Revspin parser service (`app/lib/revspin.server.ts`) with rate-limited fetching and HTML parsing
- Admin import route with category tabs (Blades, Rubbers, Short Pips, Long Pips)
- Fetch button with animated progress bar to load products from revspin.net
- Product list with checkboxes for batch selection
- "Already imported" indicator for existing equipment (duplicate detection by slug)
- Subcategory selector for rubber imports (Inverted, Short Pips, Long Pips, Anti-Spin)
- Direct insert to equipment table (bypasses submission workflow for admin imports)
- HTML entity decoding for product names (e.g., `&amp;` → `&`, `&sup2;` → `²`)
- Manufacturer detection from product names (60+ known brands)
- Products with unknown manufacturer are filtered out

