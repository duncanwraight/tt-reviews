# Testing Moderation System

## Overview
The enhanced moderation system now requires **two approvals** for all submissions before they are published. This applies to:
- Equipment submissions
- Player submissions 
- Player edit submissions

## Testing Setup

### 1. Create Test Accounts

You'll need at least 2 admin accounts to test the two-approval workflow:

```sql
-- Connect to your Supabase database and run these commands

-- First, create the test users by having them sign up via the UI
-- Then promote them to admin via SQL:

-- Replace with actual user IDs from auth.users table
INSERT INTO user_roles (user_id, role) VALUES 
('your-first-admin-user-id', 'admin'),
('your-second-admin-user-id', 'admin');
```

### 2. Create Test Submissions

Create test data via the UI:

1. **Equipment Submission**: Go to `/equipment/submit`
   - Submit a new piece of equipment
   - This will trigger a pending status

2. **Player Submission**: Go to `/players/submit`
   - Submit a new player profile  
   - This will trigger a pending status

3. **Player Edit**: Go to any player page → "Edit Player"
   - Make changes to existing player data
   - This will trigger a pending status

## Testing Workflow

### Admin UI Testing

1. **Login as Admin 1**: Go to `/admin`
   
2. **View Submissions**: Navigate to:
   - `/admin/equipment-submissions`
   - `/admin/player-submissions` 
   - `/admin/player-edits`

3. **First Approval**: 
   - Click "Approve" on a pending submission
   - Status should change to "1/2 approvals" (blue badge)
   - Approval history should show your approval

4. **Login as Admin 2**: Switch accounts

5. **Second Approval**:
   - Same admin pages, find the submission with 1/2 approvals
   - Click "Approve" again
   - Status should change to "approved" (green badge)
   - Item should be published (visible on public pages)

6. **Rejection Testing**:
   - Click "Reject" on any pending submission
   - Fill out the rejection modal with category and reason
   - Submission should be marked as rejected immediately
   - Check user profile to see rejection feedback

### Discord Bot Testing (if configured)

1. **Discord Setup Required**:
   ```bash
   # Environment variables needed:
   DISCORD_WEBHOOK_URL=your_webhook_url
   DISCORD_PUBLIC_KEY=your_bot_public_key
   DISCORD_ALLOWED_ROLES=comma,separated,role,ids
   ```

2. **Test Discord Approvals**:
   - Use slash commands or button interactions in Discord
   - Each Discord approval counts as one approval
   - Mix Discord + Admin UI approvals to reach 2 total

### User Experience Testing

1. **Submission Status**: Go to `/profile`
   - Should see all your submissions with status badges
   - Pending: "0/2 approvals" or "1/2 approvals" 
   - Approved: "approved"
   - Rejected: "rejected" with reason displayed

2. **Public Visibility**:
   - Pending/rejected submissions should NOT appear on public pages
   - Only fully approved submissions appear on `/equipment`, `/players`, etc.

## Key Features to Verify

### ✅ Two-Approval Workflow
- [ ] Submissions require exactly 2 approvals
- [ ] One admin cannot approve the same submission twice
- [ ] Status progresses: pending → awaiting_second_approval → approved
- [ ] Visual progress indicators work correctly

### ✅ Rejection System  
- [ ] Any admin can reject at any stage
- [ ] Rejection modal requires category and detailed reason
- [ ] Rejected submissions are immediately marked as rejected
- [ ] Users can see rejection feedback in their profile

### ✅ Approval History
- [ ] All approvals/rejections are logged with timestamps
- [ ] Source tracking (admin_ui vs discord)
- [ ] Approval history displays correctly in admin interface

### ✅ Cross-Platform Consistency
- [ ] Admin UI and Discord bot use same workflow
- [ ] Status updates sync between platforms
- [ ] Both platforms respect the two-approval requirement

### ✅ Image Cleanup
- [ ] Rejected equipment submissions automatically delete uploaded images
- [ ] No orphaned images remain in R2 storage

## Database Verification

Check the moderator_approvals table:

```sql
-- View all approvals for a submission
SELECT 
  ma.*, 
  u.email as moderator_email,
  CASE 
    WHEN ma.submission_type = 'equipment' THEN es.name
    WHEN ma.submission_type = 'player' THEN ps.name  
    WHEN ma.submission_type = 'player_edit' THEN p.name
  END as submission_name
FROM moderator_approvals ma
LEFT JOIN auth.users u ON ma.moderator_id = u.id
LEFT JOIN equipment_submissions es ON ma.submission_type = 'equipment' AND ma.submission_id = es.id
LEFT JOIN player_submissions ps ON ma.submission_type = 'player' AND ma.submission_id = ps.id
LEFT JOIN player_edits pe ON ma.submission_type = 'player_edit' AND ma.submission_id = pe.id
LEFT JOIN players p ON pe.player_id = p.id
ORDER BY ma.created_at DESC;
```

## Common Issues to Check

1. **Auth Protection**: Non-admin users should not see admin routes
2. **Permission Checks**: Admins can't approve their own submissions (if this rule applies)  
3. **Status Consistency**: Status in submissions table matches approval count
4. **Error Handling**: Graceful handling of network errors, invalid data
5. **Race Conditions**: Multiple simultaneous approvals handled correctly

## Success Criteria

- ✅ Complete two-approval workflow functioning
- ✅ Rejection system with detailed feedback
- ✅ User-friendly status tracking and history
- ✅ Cross-platform compatibility (Admin UI + Discord)
- ✅ Proper security and permissions
- ✅ Clean error handling and user experience