SELECT id, status, priority, type, page, LEFT(description, 120) as desc, "createdAt" 
FROM feedbacks 
ORDER BY "createdAt" DESC 
LIMIT 20;
