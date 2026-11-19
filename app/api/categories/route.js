import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { guard } from '@/lib/auth';

export async function GET() {
  const { err } = await guard();
  if (err) return err;
  const [rows] = await pool.query('SELECT CategoryID, CategoryName FROM Categories ORDER BY CategoryName');
  return NextResponse.json(rows);
}
