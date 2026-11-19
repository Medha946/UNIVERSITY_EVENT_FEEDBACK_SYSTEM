'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'signup'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Something went wrong.');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="authwrap">
      <section className="authside">
        <h1>Find your next campus event.</h1>
        <p>Register in one click, see how full each event is, and tell organisers what worked after you attend.</p>
      </section>
      <section className="authform">
        <form onSubmit={submit}>
          <h2>{mode === 'login' ? 'Sign in' : 'Create a student account'}</h2>
          {mode === 'signup' && (
            <>
              <label>Full name<input required value={form.name} onChange={set('name')} autoComplete="name" /></label>
              <label>Department<input value={form.department} onChange={set('department')} /></label>
            </>
          )}
          <label>Email<input type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></label>
          <label>Password<input type="password" required minLength={mode === 'signup' ? 8 : 1} value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <div>
            {mode === 'login' ? 'New student? ' : 'Already have an account? '}
            <button type="button" className="linkbtn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
