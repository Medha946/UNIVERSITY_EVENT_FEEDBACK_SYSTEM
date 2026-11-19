import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { guard } from '@/lib/auth';
import { feedbackCollection } from '@/lib/mongo';

export async function GET() {
  const { err } = await guard('Admin');
  if (err) return err;

  const [[kpis]] = await pool.query(`
    SELECT (SELECT COUNT(*) FROM Users WHERE Role = 'Student') AS students,
           (SELECT COUNT(*) FROM Events) AS events,
           (SELECT COUNT(*) FROM Events WHERE EventDate >= CURDATE()) AS upcoming,
           (SELECT COUNT(*) FROM Registrations) AS registrations`);

  // JOIN + GROUP BY + ORDER BY
  const [byCategory] = await pool.query(`
    SELECT c.CategoryName AS name, COUNT(DISTINCT e.EventID) AS events, COUNT(r.RegID) AS registrations
    FROM Categories c
    LEFT JOIN Events e ON e.CategoryID = c.CategoryID
    LEFT JOIN Registrations r ON r.EventID = e.EventID
    GROUP BY c.CategoryID, c.CategoryName ORDER BY registrations DESC`);

  // GROUP BY + HAVING
  const [fill] = await pool.query(`
    SELECT e.Title AS title, e.Capacity AS capacity, COUNT(r.RegID) AS registered,
           ROUND(100 * COUNT(r.RegID) / e.Capacity, 1) AS fillPct
    FROM Events e LEFT JOIN Registrations r ON r.EventID = e.EventID
    GROUP BY e.EventID, e.Title, e.Capacity
    HAVING COUNT(r.RegID) > 0
    ORDER BY fillPct DESC LIMIT 8`);

  const [trend] = await pool.query(`
    SELECT DATE_FORMAT(RegDate, '%Y-%m') AS month, COUNT(*) AS registrations
    FROM Registrations GROUP BY month ORDER BY month`);

  // Nested subquery: above-average participation
  const [topStudents] = await pool.query(`
    SELECT u.Name AS name, COUNT(*) AS eventsJoined
    FROM Users u JOIN Registrations r ON r.UserID = u.UserID
    GROUP BY u.UserID, u.Name
    HAVING COUNT(*) > (SELECT AVG(c) FROM (SELECT COUNT(*) AS c FROM Registrations GROUP BY UserID) t)
    ORDER BY eventsJoined DESC, name LIMIT 5`);

  // MongoDB aggregation pipelines
  let feedback = { distribution: [], byEvent: [], topTags: [], total: 0 };
  try {
    const col = await feedbackCollection();
    const [distribution, byEventRaw, topTags] = await Promise.all([
      col.aggregate([{ $group: { _id: '$rating', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
      col.aggregate([
        { $group: { _id: '$eventId', avgRating: { $avg: '$rating' }, responses: { $sum: 1 } } },
        { $match: { responses: { $gte: 2 } } },
        { $sort: { avgRating: -1 } }, { $limit: 8 },
      ]).toArray(),
      col.aggregate([{ $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]).toArray(),
    ]);
    const ids = byEventRaw.map((d) => d._id);
    const [titles] = ids.length ? await pool.query('SELECT EventID, Title FROM Events WHERE EventID IN (?)', [ids]) : [[]];
    const titleOf = Object.fromEntries(titles.map((t) => [t.EventID, t.Title]));
    feedback = {
      total: distribution.reduce((a, d) => a + d.count, 0),
      distribution: [1, 2, 3, 4, 5].map((r) => ({ rating: `${r} star`, count: distribution.find((d) => d._id === r)?.count || 0 })),
      byEvent: byEventRaw.map((d) => ({ title: titleOf[d._id] || `Event ${d._id}`, avgRating: Math.round(d.avgRating * 100) / 100, responses: d.responses })),
      topTags: topTags.map((t) => ({ tag: t._id, count: t.count })),
    };
  } catch (e) {
    console.error('MongoDB unavailable:', e.message);
  }
  return NextResponse.json({ kpis, byCategory, fill, trend, topStudents, feedback });
}
