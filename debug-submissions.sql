-- Debug queries to check submissions data

-- Check if there are any equipment submissions
SELECT 'Equipment Submissions' as table_name, COUNT(*) as count FROM equipment_submissions;

-- Show all equipment submissions
SELECT id, name, manufacturer, status, created_at, user_id 
FROM equipment_submissions 
ORDER BY created_at DESC;

-- Check if there are any player submissions  
SELECT 'Player Submissions' as table_name, COUNT(*) as count FROM player_submissions;

-- Show all player submissions
SELECT id, name, status, created_at, user_id 
FROM player_submissions 
ORDER BY created_at DESC;

-- Check moderator approvals
SELECT 'Moderator Approvals' as table_name, COUNT(*) as count FROM moderator_approvals;

-- Show all moderator approvals
SELECT submission_type, submission_id, action, created_at 
FROM moderator_approvals 
ORDER BY created_at DESC;