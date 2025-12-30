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

## TypeScript Errors (Pre-existing)

The following TypeScript errors exist in the codebase and should be fixed:

### Stale Route Types
- `.react-router/types/app/routes/+types/equipment.compare.$slugs.tsx.ts` - References deleted route file
- **Fix**: Delete stale types file or regenerate with `npx react-router typegen`

### Type Mismatches in Components
| File | Issue |
|------|-------|
| `ErrorBoundary.tsx:106` | `string \| null \| undefined` not assignable to `string \| undefined` |
| `EquipmentReviewForm.tsx:74,76` | `image_url` property doesn't exist on `Equipment` type |
| `PlayerEditForm.tsx:107,111,289` | `gender` property doesn't exist on `Player` type |
| `PlayerHeader.tsx:63` | `string \| undefined` not assignable to `string` parameter |
| `PopularPlayersSection.tsx:35` | `PlayerDisplay` missing properties from `Player` type |
| `RouterFormModalWrapper.tsx:108` | Props type mismatch with `FeedbackModalProps` |

### Logger/Context Type Issues
- `content.server.ts` - Multiple errors: `LogContext` type doesn't include `key`, `count`, `error`, `category`, `query`, `contentData` properties
- **Fix**: Expand `LogContext` interface or use proper typing

### Discord Test File
- `discord.test.ts` - Multiple `unknown` type errors and `DiscordInteraction` type mismatches
- **Fix**: Add proper type assertions or fix test mocks

### Environment/Config Types
| File | Issue |
|------|-------|
| `auth.server.ts:44` | `Env` to `Record<string, string>` conversion error |
| `database.server.ts:124` | `SUPABASE_SERVICE_ROLE_KEY` not in `Env` type |
| `database.server.ts:213` | `unknown` not assignable to `Equipment \| null` |

### Other Issues
- `sanitize.tsx` - Various type issues
- `security.server.ts` - Type issues
- `video-utils.ts` - Type issues
- `submissions.$type.submit.tsx:317` - `formatForDiscord` undefined not assignable
- `test-discord.tsx` - Multiple `unknown` type errors and missing function references

