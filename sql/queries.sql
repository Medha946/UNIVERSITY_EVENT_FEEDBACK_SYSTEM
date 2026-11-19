-- Important queries used by the application (USE EventSystem first)

-- Q1 JOIN + GROUP BY + ORDER BY: registrations per category
SELECT c.CategoryName, COUNT(DISTINCT e.EventID) AS Events, COUNT(r.RegID) AS Registrations
FROM Categories c
LEFT JOIN Events e ON e.CategoryID = c.CategoryID
LEFT JOIN Registrations r ON r.EventID = e.EventID
GROUP BY c.CategoryID, c.CategoryName
ORDER BY Registrations DESC;

-- Q2 HAVING: most-filled events
SELECT e.Title, e.Capacity, COUNT(r.RegID) AS Registered,
       ROUND(100 * COUNT(r.RegID) / e.Capacity, 1) AS FillPct
FROM Events e LEFT JOIN Registrations r ON r.EventID = e.EventID
GROUP BY e.EventID, e.Title, e.Capacity
HAVING COUNT(r.RegID) > 0
ORDER BY FillPct DESC LIMIT 8;

-- Q3 Nested subquery: students registered for more events than the average student
SELECT u.Name, COUNT(*) AS EventsJoined
FROM Users u JOIN Registrations r ON r.UserID = u.UserID
GROUP BY u.UserID, u.Name
HAVING COUNT(*) > (SELECT AVG(c) FROM (SELECT COUNT(*) AS c FROM Registrations GROUP BY UserID) t)
ORDER BY EventsJoined DESC LIMIT 5;

-- Q4 Full-text search
SELECT EventID, Title, MATCH(Title, Description) AGAINST('robotics workshop*' IN BOOLEAN MODE) AS score
FROM Events
WHERE MATCH(Title, Description) AGAINST('robotics workshop*' IN BOOLEAN MODE)
ORDER BY score DESC;

-- Q5 NOT EXISTS: events nobody registered for
SELECT e.EventID, e.Title FROM Events e
WHERE NOT EXISTS (SELECT 1 FROM Registrations r WHERE r.EventID = e.EventID);

-- Q6 Monthly registration trend
SELECT DATE_FORMAT(RegDate, '%Y-%m') AS Month, COUNT(*) AS Registrations
FROM Registrations GROUP BY Month ORDER BY Month;

-- Q7 Stored function + view
SELECT EventID, Title, fn_seats_left(EventID) AS SeatsLeft FROM Events;
SELECT * FROM EventOccupancy ORDER BY FillPct DESC;

-- Q8 Call the transaction procedure
CALL sp_register_for_event(3, 10, @status);
SELECT @status;
