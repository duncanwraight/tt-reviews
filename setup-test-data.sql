-- Setup Test Data for Moderation System
-- Run this after creating user accounts via the UI

-- 1. First, check what users exist (replace with your actual user emails)
SELECT id, email FROM auth.users WHERE email IN ('your-email@example.com', 'admin2@example.com');

-- 2. Promote users to admin (replace with actual user IDs from step 1)
-- INSERT INTO user_roles (user_id, role) VALUES 
-- ('user-id-1', 'admin'),
-- ('user-id-2', 'admin');

-- 3. Check existing submissions to test with
SELECT 'Equipment Submissions' as type, id, name, status, created_at FROM equipment_submissions
UNION ALL
SELECT 'Player Submissions' as type, id, name, status, created_at FROM player_submissions  
UNION ALL
SELECT 'Player Edits' as type, pe.id, p.name, pe.status, pe.created_at 
FROM player_edits pe 
JOIN players p ON pe.player_id = p.id
ORDER BY created_at DESC;

-- 4. View current approval status
SELECT 
  submission_type,
  submission_id,
  COUNT(*) as approval_count,
  STRING_AGG(action, ', ') as actions,
  STRING_AGG(source, ', ') as sources
FROM moderator_approvals 
GROUP BY submission_type, submission_id
ORDER BY submission_type, submission_id;

-- 5. Check user roles
SELECT ur.user_id, u.email, ur.role 
FROM user_roles ur 
JOIN auth.users u ON ur.user_id = u.id;

-- 6. Reset a submission for testing (if needed)
-- DELETE FROM moderator_approvals WHERE submission_type = 'equipment' AND submission_id = 'your-submission-id';
-- UPDATE equipment_submissions SET status = 'pending' WHERE id = 'your-submission-id';