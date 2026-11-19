import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { createSession } from '@/lib/auth';

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  const [rows] = await pool.execute('SELECT UserID, Name, Role, PasswordHash FROM Users WHERE Email = ?', [email]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(String(b.password ?? ''), user.PasswordHash));
  if (!ok) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
  await createSession(user);
  return NextResponse.json({ ok: true, role: user.Role });
}
