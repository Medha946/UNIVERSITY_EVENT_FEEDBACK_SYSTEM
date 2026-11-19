import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Blocks /dashboard for anyone without a valid signed session cookie.
export async function middleware(req) {
  const token = req.cookies.get('session')?.value;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}
export const config = { matcher: ['/dashboard/:path*'] };
