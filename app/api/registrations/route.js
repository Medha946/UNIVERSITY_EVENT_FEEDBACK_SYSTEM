import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { guard } from '@/lib/auth';

// Student: own registrations. Admin: roster (view EventRoster) for ?eventId=
export async function GET(req) {
  const { s, err } = await guard();
  if (err) return err;
  if (s.role === 'Admin') {
    const eventId = Number(new URL(req.url).searchParams.get('eventId')) || 0;
    const [rows] = await pool.query(
      `SELECT RegID, EventID, EventName, EventDate, StudentName, ContactInfo, RegDate
       FROM EventRoster ${eventId ? 'WHERE EventID = ?' : ''} ORDER BY RegDate DESC LIMIT 300`,
      eventId ? [eventId] : []
    );
    return NextResponse.json(rows);
  }
  const [rows] = await pool.execute(
    `SELECT r.RegID, e.EventID, e.Title, e.Venue, e.EventDate, c.CategoryName, r.RegDate,
            (e.EventDate < CURDATE()) AS IsPast
     FROM Registrations r
     JOIN Events e ON e.EventID = r.EventID
     JOIN Categories c ON c.CategoryID = e.CategoryID
     WHERE r.UserID = ? ORDER BY e.EventDate DESC`,
    [s.uid]
  );
  return NextResponse.json(rows);
}

const STATUS = {
  OK: [201, 'You are registered.'],
  EVENT_FULL: [409, 'Sorry, this event is full.'],
  ALREADY_REGISTERED: [409, 'You are already registered for this event.'],
  EVENT_PAST: [400, 'This event has already taken place.'],
  EVENT_NOT_FOUND: [404, 'Event not found.'],
  ERROR: [500, 'Registration failed. Please try again.'],
};

// Register via the stored procedure (transaction + row lock)
export async function POST(req) {
  const { s, err } = await guard('Student');
  if (err) return err;
  const { eventId } = await req.json().catch(() => ({}));
  if (!Number.isInteger(Number(eventId))) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  const conn = await pool.getConnection();   // OUT variable needs one connection
  try {
    await conn.query('CALL sp_register_for_event(?, ?, @status)', [s.uid, Number(eventId)]);
    const [[row]] = await conn.query('SELECT @status AS status');
    const [code, message] = STATUS[row.status] || STATUS.ERROR;
    return NextResponse.json(code < 300 ? { ok: true, message } : { error: message }, { status: code });
  } finally {
    conn.release();
  }
}

export async function DELETE(req) {
  const { s, err } = await guard('Student');
  if (err) return err;
  const eventId = Number(new URL(req.url).searchParams.get('eventId'));
  const [r] = await pool.execute(
    'DELETE r FROM Registrations r JOIN Events e ON e.EventID = r.EventID WHERE r.UserID = ? AND r.EventID = ? AND e.EventDate >= CURDATE()',
    [s.uid, eventId]
  );
  return r.affectedRows ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Nothing to cancel.' }, { status: 404 });
}
