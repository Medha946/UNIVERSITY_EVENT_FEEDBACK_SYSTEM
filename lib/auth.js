import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function createSession(user) {
  const token = await new SignJWT({ uid: user.UserID, name: user.Name, role: user.Role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('8h')
    .sign(secret());
  cookies().set('session', token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function getSession() {
  const token = cookies().get('session')?.value;
  if (!token) return null;
  try { return (await jwtVerify(token, secret())).payload; } catch { return null; }
}

// Role-based access: returns { s } on success or { err } (a ready 401/403 response).
export async function guard(role) {
  const s = await getSession();
  if (!s) return { err: NextResponse.json({ error: 'Please sign in first.' }, { status: 401 }) };
  if (role && s.role !== role) return { err: NextResponse.json({ error: 'Your role cannot do this.' }, { status: 403 }) };
  return { s };
}
