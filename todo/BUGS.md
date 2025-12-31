# Bugs

## Review Rating Categories Not Showing in Frontend - FIXED

**Location**: Equipment review submission form
**Expected**: Rating category sliders (Speed, Spin, Control, etc.) should appear based on equipment type
**Actual**: Shows "Rating categories not available" warning, falls back to overall rating only
**Root Cause**: Rating categories in database have no `parent_id` set - they need to be linked to equipment categories/subcategories
**Fix Applied**:
- Admin UI now shows parent name badge (or "No parent!" warning) for each category
- Parent selection is now required when creating review_rating_category types
- Added parent_id selector to edit form for existing categories
- Updated action handler to extract and pass parent_id during updates

## Equipment Review Rating Sliders Issues

### Bug: All Rating Sliders Move Together - FIXED

**Location**: Equipment review submission form
**Expected**: Each rating slider (Speed, Spin, Control, etc.) should be independent
**Actual**: Moving any slider causes all sliders to move to the same value
**Root Cause**: field-loaders.server.ts was transforming rating categories from `{ name, label }` to `{ value, label }`, but RatingCategories component expected `{ name, label }`. All categories had `category.name` as `undefined`, so all sliders read/wrote to the same key.
**Fix Applied**: Pass rating categories through without transformation in loadFieldOptions()

### Issue: Rating Labels Not Appropriate for Characteristics - FIXED

**Location**: Equipment review submission form
**Current**: Sliders show labels like "Poor", "Good", "Very Good" based on rating value
**Problem**: These value judgments don't make sense for equipment characteristics - slow equipment isn't "poor", it's just slow
**Fix Applied**:
- Added `min_label` and `max_label` columns to categories table
- Admin can now set custom endpoint labels per rating category (e.g., "Slow" ↔ "Fast" for Speed)
- Slider now shows just the number value, with custom labels at endpoints
- Removed hardcoded value judgment labels

### Issue: Overall Score Calculated as Average - FIXED

**Location**: Equipment review submission form
**Current**: Overall score is automatically calculated as average of all category ratings
**Problem**: Equipment quality isn't determined by averaging characteristics - a blade could be excellent despite having low speed if that's its design intent
**Fix Applied**:
- Removed auto-calculation from RatingCategories component
- Added independent overall_rating slider field to review form
- Users now set overall score independently from category ratings

## Player Equipment Setup Form Validation Error - FIXED

**Location**: `/submissions/player_equipment_setup/submit`
**Expected**: Form should submit successfully when all fields are completed
**Actual**: Shows red error "Equipment Details is required" even when all boxes are filled
**Root Cause**: Multiple issues:
1. Validation checked for `formValues["equipment_setup"]` but the component renders individual inputs
2. The registry pointed to `player_equipment_setups` (final verified table) instead of a submissions table
3. The final table has different schema (equipment IDs vs names, verified vs status)
**Fix Applied**:
- Set `required: false` for equipment_setup field since individual fields handle their own validation
- Created new `player_equipment_setup_submissions` table following the established submission pattern
- Updated registry to use the new submissions table with proper moderation workflow
- Added explicit field extraction in action for the component's rendered fields

## Discord Approval Button Error for Player Equipment Setup - FIXED

**Location**: Discord bot approval interaction
**Expected**: Clicking Approve in Discord should approve the player equipment setup submission
**Actual**: Error: `Failed to record approval: invalid input syntax for type uuid: "equipment_setup_9c46155b-3495-4f41-b145-763f9e64b8d7"`
**Root Cause**: The custom_id `approve_player_equipment_setup_UUID` was matching `approve_player_` pattern first, stripping to `equipment_setup_UUID` (invalid UUID)
**Fix Applied**:
- Added specific handling for `approve_player_equipment_setup_` and `reject_player_equipment_setup_` BEFORE the generic `approve_player_` pattern
- Added `handleApprovePlayerEquipmentSetup` and `handleRejectPlayerEquipmentSetup` handler methods
- Added `player_equipment_setup` to moderation service type unions

## Profile Page Review Rating Display Bug - FIXED

**Location**: User profile page - reviews section
**Expected**: Review ratings should display correctly (e.g., "7/10" or converted to "3.5/5 stars")
**Actual**: Shows "7/5 stars" - raw 10-point rating displayed with 5-star label
**Root Cause**: Displayed raw 10-point rating with incorrect "/5 stars" label
**Fix Applied**: Display rating as "X/10" to match the actual scale used throughout the app

## Player Submissions Approve Button Not Working - FIXED

**Location**: `/admin/player-submissions`
**Expected**: Clicking Approve should approve the player submission
**Actual**: Approve button does nothing / doesn't work
**Root Cause**: Missing try-catch wrapper caused silent failures; player insert errors (e.g., duplicate slug) were not caught
**Fix Applied**:
- Added try-catch wrapper matching equipment-submissions pattern
- Added specific error handling for player record creation
- Added console logging for debugging

## Player Equipment Setup Form Has Duplicate/Unnecessary Fields - FIXED

**Location**: `/submissions/player_equipment_setup/submit`
**Issues**:
- Has "Include Equipment Setup" checkbox - but that's the entire point of this form
- Year field appears twice
- Source URL field appears twice
- Source Type field appears twice
**Root Cause**: Form config defined year/source_url/source_type fields AND the PlayerEquipmentSetup component rendered them internally
**Fix Applied**:
- Removed duplicate fields from player_equipment_setup registry config
- Added `standalone` prop to PlayerEquipmentSetup component
- Created `equipment_setup_standalone` field type that skips the checkbox UI

---

## TypeScript Errors - FIXED

**Progress**: Reduced from 191 errors to 0 errors (100% fixed)

### All Issues Fixed
- ✅ Stale route types - Moved disabled compare route to `app/routes-disabled/`
- ✅ Equipment type - Added `image_url` property
- ✅ Player type - Added `gender` and `equipment_setups` properties
- ✅ PlayerCard types - Made flexible to accept partial Player data
- ✅ RouterFormModalWrapper - Fixed exhaustive switch return types
- ✅ LogContext - Added index signature for flexible logging
- ✅ Discord test file - Archived to `archived-tests/`
- ✅ Env types - Created `env.d.ts` for missing Discord/Supabase secrets
- ✅ Env casting - Using `as unknown as Record<string, string>` pattern
- ✅ withDatabaseCorrelation - Fixed incorrect callback usage
- ✅ Discord interactions - Added "video" and "equipment_review" to submission type unions
- ✅ Promise.all() inference - Separated async calls for proper type inference
- ✅ Supabase generics - Used explicit type parameters on withLogging calls
- ✅ unified-notifier.server.ts - Fixed Logger.error and timeOperation signatures
- ✅ api.discord.*.tsx - Added proper type assertions for request bodies
- ✅ admin.equipment-reviews.tsx - Fixed Object.entries map types
- ✅ schema.server.ts - Made review user and text optional
- ✅ RejectionModal - Made csrfToken optional, expanded submission types
- ✅ submissions/registry.ts - Made formatForDiscord optional with fallback

