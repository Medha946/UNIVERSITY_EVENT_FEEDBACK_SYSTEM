import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { guard } from '@/lib/auth';
import { feedbackCollection } from '@/lib/mongo';

export async function GET(req) {
  const { err } = await guard();
  if (err) return err;
  const eventId = Number(new URL(req.url).searchParams.get('eventId'));
  if (!Number.isInteger(eventId)) return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
  const col = await feedbackCollection();
  const docs = await col.find({ eventId }, { projection: { _id: 0 } }).sort({ submittedAt: -1 }).limit(50).toArray();
  const avg = docs.length ? docs.reduce((a, d) => a + d.rating, 0) / docs.length : null;
  return NextResponse.json({ avgRating: avg, count: docs.length, items: docs });
}

// Students who registered for a finished event can leave or update feedback.
// The survey object is schema-free: each event type can ask different questions.
export async function POST(req) {
  const { s, err } = await guard('Student');
  if (err) return err;
  const b = await req.json().catch(() => ({}));
  const eventId = Number(b.eventId);
  const rating = Number(b.rating);
  const comment = String(b.comment ?? '').trim().slice(0, 1000);
  if (!Number.isInteger(eventId)) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: 'Rating must be 1 to 5.' }, { status: 400 });

  const [ok] = await pool.execute(
    `SELECT 1 FROM Registrations r JOIN Events e ON e.EventID = r.EventID
     WHERE r.UserID = ? AND r.EventID = ? AND e.EventDate <= CURDATE()`, [s.uid, eventId]);
  if (!ok.length) return NextResponse.json({ error: 'You can review events you registered for once they have taken place.' }, { status: 403 });

  const survey = {};
  if (b.survey && typeof b.survey === 'object' && !Array.isArray(b.survey)) {
    for (const [k, v] of Object.entries(b.survey).slice(0, 10)) {
      const key = String(k).trim().replace(/[^\w ]/g, '').slice(0, 40);
      if (!key) continue;
      survey[key] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 200);
    }
  }
  const tags = Array.isArray(b.tags) ? b.tags.slice(0, 5).map((t) => String(t).slice(0, 30)) : [];

  const col = await feedbackCollection();
  await col.updateOne(
    { eventId, userId: s.uid },
    { $set: { userName: s.name, rating, comment, tags, survey, submittedAt: new Date() } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
}
