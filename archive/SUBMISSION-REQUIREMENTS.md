# Submission System Requirements

## Core Requirements

### Approval Workflow

- **Two approvals required** from any source (Discord + Admin UI, or two Discord, or two Admin UI)
- **Status progression**: `pending` → `under_review` → `awaiting_second_approval` → `approved`/`rejected`
- **Image cleanup**: Delete images immediately upon rejection
- **Audit trail**: Track who approved/rejected and when

### User Experience

- **Profile submissions section**: Tab/section in existing profile showing most recent 20 submissions
- **Status visibility**: Users can see current status and any rejection reasons
- **Rejection reasons**: Support both predefined categories and free-form text
- **No resubmission**: Users cannot respond to rejections or resubmit (post-live feature)

### Moderation Features

- **Admin justification**: Admins must provide detailed rejection reasons
- **Discord integration**: Discord approvals sync with database
- **Moderation audit**: Track all moderator actions with timestamps

## Database Schema

### Status Values

- `pending`: Initial submission state
- `under_review`: First approval received, waiting for second
- `awaiting_second_approval`: Alias for clarity in UI
- `approved`: Two approvals received, record created
- `rejected`: Rejected by any moderator

### Approval Sources

- `admin_ui`: Approval via admin dashboard
- `discord`: Approval via Discord bot interactions

## Implementation Notes

### Current Code Updates Required

- Update all existing submission routes to use new workflow
- Modify admin interfaces to support two-approval system
- Update Discord bot to sync approvals with database
- Add image deletion for rejected submissions
- Create user profile submissions view

### Future Enhancements (Post-Live)

- User response to rejection feedback
- Resubmission workflow
- Appeal process
- Enhanced duplicate detection
