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

## Equipment Setup: Use Equipment Search Instead of Free Text

**Location**: `/submissions/player_equipment_setup/submit` - rubber/blade fields
**Current**: Free text input for equipment names
**Requested**: Searchable dropdown that queries existing equipment in database
**Additional**: Add helper text: "If you can't find this player's equipment, make sure you've submitted it [here]" linking to `/submissions/equipment/submit`
**Rationale**: Ensures data consistency, links setups to actual equipment records, prevents typos/duplicates

## Equipment Comparison Page (Disabled)

**Location**: `/equipment/compare/:slug1-vs-:slug2`
**Status**: Route disabled - half-finished implementation
**TODO**: Complete the comparison feature with side-by-side specs, ratings, pro usage, etc.

## Image Upload for Equipment and Players

**Location**: Equipment and player submission forms
**Current**: No image upload fields in forms
**Infrastructure**: R2 upload/delete utilities exist in `app/lib/r2-native.server.ts`
**TODO**:
- Add image upload field to equipment submission form
- Add image upload field to player submission form
- Handle upload in submission action, store key in submission record
- Display uploaded images in admin moderation views
- Display images on public equipment/player pages

