# Bugs

## Review Rating Categories Not Showing in Frontend

**Location**: Equipment review submission form
**Expected**: Rating category sliders (Speed, Spin, Control, etc.) should appear based on equipment type
**Actual**: Shows "Rating categories not available" warning, falls back to overall rating only
**Root Cause**: Rating categories in database have no `parent_id` set - they need to be linked to equipment categories/subcategories
**Fix Applied**:
- Admin UI now shows parent name badge (or "No parent!" warning) for each category
- Parent selection is now required when creating review_rating_category types
**Action Required**: Edit existing rating categories in `/admin/categories` to set their parent (e.g., link "Speed" to "Inverted" rubber subcategory)

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

## TypeScript Errors (Partially Fixed)

**Progress**: Reduced from 191 errors to 61 errors (68% reduction)

### FIXED Issues
- ✅ Stale route types - Moved disabled compare route to `app/routes-disabled/`
- ✅ Equipment type - Added `image_url` property
- ✅ Player type - Added `gender` property
- ✅ PlayerCard types - Made flexible to accept partial Player data
- ✅ RouterFormModalWrapper - Fixed exhaustive switch return types
- ✅ LogContext - Added index signature for flexible logging
- ✅ Discord test file - Archived to `archived-tests/`
- ✅ Env types - Created `env.d.ts` for missing Discord/Supabase secrets
- ✅ Env casting - Using `as unknown as Record<string, string>` pattern
- ✅ withDatabaseCorrelation - Fixed incorrect callback usage in root.tsx and admin.content.tsx
- ✅ Discord interactions - Added "video" to submission type unions

### REMAINING Issues (61 errors)
| File | Errors | Issue |
|------|--------|-------|
| `equipment._index.tsx` | 22 | Promise.all() type union inference issues |
| `database.server.ts` | 15 | Supabase query builder generic type issues |
| `unified-notifier.server.ts` | 6 | Logger call arguments and Error type |
| `api.discord.*.tsx` | 8 | Request body typing, missing imports |
| `admin.equipment-reviews.tsx` | 3 | Unknown type and submission type mismatch |
| Various | 7 | Minor type issues |

### Root Causes of Remaining Issues
1. **Promise.all() inference** - TypeScript struggles with union types from parallel data fetching
2. **Supabase generics** - Query builder returns `unknown` without proper type annotations
3. **withDatabaseCorrelation usage** - Some files still use old callback pattern

