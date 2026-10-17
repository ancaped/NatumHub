SELECT n.id, n.feedback_id, n.author, n.body, n.created_at, f.description
FROM feedback_notes n
JOIN feedbacks f ON f.id = n.feedback_id
ORDER BY n.created_at DESC
LIMIT 10;
