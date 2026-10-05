SELECT id, priority, status, type, page, description, admin_notes, requested_by, "createdAt"
FROM feedbacks
WHERE status IN ('queued', 'in_progress')
ORDER BY priority ASC, "createdAt" ASC;
