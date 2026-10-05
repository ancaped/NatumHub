SELECT id, status, priority, type, page, description, "createdAt", requested_by
FROM feedbacks 
WHERE status NOT IN ('resolved', 'wont_fix')
ORDER BY priority ASC, "createdAt" ASC;
