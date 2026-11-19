import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const department = String(b.department ?? '').trim().slice(0, 60) || null;
  if (name.length < 2) return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  try {
    const hash = await bcrypt.hash(password, 10);
    // Role is always Student here; admins are created directly in the database.
    const [r] = await pool.execute(
      "INSERT INTO Users (Name, Email, PasswordHash, Role, Department) VALUES (?, ?, ?, 'Student', ?)",
      [name, email, hash, department]
    );
    await createSession({ UserID: r.insertId, Name: name, Role: 'Student' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return NextResponse.json({ error: 'That email is already registered.' }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 });
  }
}
