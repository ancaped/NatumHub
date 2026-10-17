SELECT id, priority, status, type, page, description, admin_notes, requested_by, "createdAt"
FROM feedbacks
WHERE status NOT IN ('resolved', 'wont_fix')
ORDER BY "createdAt" DESC;
\x on
SELECT id, priority, status, type, page, description, admin_notes, requested_by, "createdAt"
FROM feedbacks
WHERE status NOT IN ('resolved', 'wont_fix')
ORDER BY "createdAt" DESC;
