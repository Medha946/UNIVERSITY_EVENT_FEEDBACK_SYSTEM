import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import Dashboard from '@/components/Dashboard';

export default async function DashboardPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  return <Dashboard session={{ uid: s.uid, name: s.name, role: s.role }} />;
}
