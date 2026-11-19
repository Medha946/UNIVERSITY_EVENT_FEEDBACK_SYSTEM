import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { guard } from '@/lib/auth';
import { validateEvent } from '@/lib/validate';

// UPDATE: admins only. The DB trigger rejects a capacity below current registrations.
export async function PUT(req, { params }) {
  const { err } = await guard('Admin');
  if (err) return err;
  const { errors, value } = validateEvent(await req.json().catch(() => ({})));
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
  try {
    const [r] = await pool.execute(
      'UPDATE Events SET Title=?, Description=?, Venue=?, EventDate=?, Capacity=?, CategoryID=? WHERE EventID=?',
      [value.title, value.description, value.venue, value.eventDate, value.capacity, value.categoryId, Number(params.id)]
    );
    if (!r.affectedRows) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.sqlState === '45000' ? e.sqlMessage : 'Could not update the event.' }, { status: 400 });
  }
}

// DELETE: admins only (registrations cascade)
export async function DELETE(_req, { params }) {
  const { err } = await guard('Admin');
  if (err) return err;
  const [r] = await pool.execute('DELETE FROM Events WHERE EventID = ?', [Number(params.id)]);
  return r.affectedRows ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Event not found.' }, { status: 404 });
}
