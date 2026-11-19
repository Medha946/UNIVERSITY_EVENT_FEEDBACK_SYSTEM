import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { guard } from '@/lib/auth';
import { validateEvent } from '@/lib/validate';

// READ: search (full-text + LIKE), category filter, upcoming/past filter
export async function GET(req) {
  const { s, err } = await guard();
  if (err) return err;
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') || '').trim().slice(0, 80);
  const category = Number(sp.get('category')) || 0;
  const when = sp.get('when') || 'upcoming';
  const boolQuery = q.split(/\s+/).map((t) => t.replace(/[+\-<>()~*"@]/g, '')).filter(Boolean).map((t) => t + '*').join(' ');

  const where = [];
  const params = [s.uid];
  if (q) {
    where.push('(MATCH(e.Title, e.Description) AGAINST(? IN BOOLEAN MODE) OR e.Title LIKE ? OR e.Venue LIKE ?)');
    params.push(boolQuery || q, `%${q}%`, `%${q}%`);
  }
  if (category) { where.push('e.CategoryID = ?'); params.push(category); }
  if (when === 'upcoming') where.push('e.EventDate >= CURDATE()');
  if (when === 'past') where.push('e.EventDate < CURDATE()');

  const sql = `
    SELECT e.EventID, e.Title, e.Description, e.Venue, e.EventDate, e.Capacity, e.CategoryID,
           c.CategoryName, u.Name AS Organizer,
           (SELECT COUNT(*) FROM Registrations r WHERE r.EventID = e.EventID) AS Registered,
           (SELECT COUNT(*) FROM Registrations x WHERE x.EventID = e.EventID AND x.UserID = ?) AS IsRegistered,
           (e.EventDate < CURDATE()) AS IsPast
    FROM Events e
    JOIN Categories c ON c.CategoryID = e.CategoryID
    LEFT JOIN Users u ON u.UserID = e.OrganizerID
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.EventDate ${when === 'past' ? 'DESC' : 'ASC'}
    LIMIT 200`;
  const [rows] = await pool.query(sql, params);
  return NextResponse.json(rows);
}

// CREATE: admins only
export async function POST(req) {
  const { s, err } = await guard('Admin');
  if (err) return err;
  const { errors, value } = validateEvent(await req.json().catch(() => ({})));
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
  try {
    const [r] = await pool.execute(
      'INSERT INTO Events (Title, Description, Venue, EventDate, Capacity, CategoryID, OrganizerID) VALUES (?,?,?,?,?,?,?)',
      [value.title, value.description, value.venue, value.eventDate, value.capacity, value.categoryId, s.uid]
    );
    return NextResponse.json({ ok: true, id: r.insertId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.sqlState === '45000' ? e.sqlMessage : 'Could not create the event.' }, { status: 400 });
  }
}
