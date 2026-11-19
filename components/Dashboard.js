'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from 'recharts';

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function Dashboard({ session }) {
  const router = useRouter();
  const isAdmin = session.role === 'Admin';
  const tabs = isAdmin ? ['Insights', 'Events'] : ['Events', 'My registrations'];
  const [tab, setTab] = useState(tabs[0]);
  const [toast, setToast] = useState(null);
  const [categories, setCategories] = useState([]);
  const [detail, setDetail] = useState(null); // { event, canReview }

  const notify = useCallback((message, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => { api('/api/categories').then((r) => r.ok && setCategories(r.data)); }, []);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login'); router.refresh();
  }

  return (
    <>
      <header className="topbar">
        <h1>Campus Events and Feedback</h1>
        <div className="who"><span>{session.name}</span><span className="badge">{session.role}</span>
          <button className="btn ghost small" style={{ color: '#fff', borderColor: '#fff' }} onClick={logout}>Sign out</button></div>
      </header>
      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => { setTab(t); setDetail(null); }}>{t}</button>
        ))}
      </nav>
      <main>
        {tab === 'Insights' && <Insights />}
        {tab === 'Events' && <EventsTab isAdmin={isAdmin} categories={categories} notify={notify} onDetail={setDetail} />}
        {tab === 'My registrations' && <MyRegistrations notify={notify} onDetail={setDetail} />}
        {detail && <EventDetail key={detail.event.EventID} detail={detail} isAdmin={isAdmin} notify={notify} onClose={() => setDetail(null)} />}
      </main>
      {toast && <div className={`toast ${toast.error ? 'err' : ''}`} role="status">{toast.message}</div>}
    </>
  );
}

/* ---------------- Admin insights ---------------- */
function Insights() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/api/analytics').then((r) => r.ok && setD(r.data)); }, []);
  if (!d) return <div className="panel empty">Loading insights</div>;
  const k = d.kpis;
  return (
    <>
      <div className="kpis">
        <div className="kpi"><b>{k.events}</b><span>Events ({k.upcoming} upcoming)</span></div>
        <div className="kpi"><b>{k.registrations}</b><span>Registrations</span></div>
        <div className="kpi"><b>{k.students}</b><span>Students</span></div>
        <div className="kpi"><b>{d.feedback.total}</b><span>Feedback responses</span></div>
      </div>
      <div className="grid2">
        <Chart title="Registrations by category (MySQL: JOIN + GROUP BY)">
          <BarChart data={d.byCategory}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={12} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="registrations" fill="#0b6e6e" /></BarChart>
        </Chart>
        <Chart title="Registrations per month (MySQL: GROUP BY date)">
          <LineChart data={d.trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={12} /><YAxis allowDecimals={false} /><Tooltip /><Line dataKey="registrations" stroke="#12263a" strokeWidth={2} /></LineChart>
        </Chart>
        <Chart title="Fullest events, % of seats (MySQL: HAVING)">
          <BarChart data={d.fill} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} /><YAxis type="category" dataKey="title" width={150} fontSize={11} /><Tooltip /><Bar dataKey="fillPct" fill="#d99a1f" /></BarChart>
        </Chart>
        <Chart title="Rating distribution (MongoDB: $group)">
          <BarChart data={d.feedback.distribution}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="rating" fontSize={12} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#b42339" /></BarChart>
        </Chart>
      </div>
      <div className="grid2">
        <div className="panel"><h2>Best rated events (MongoDB aggregation)</h2>
          <table><thead><tr><th>Event</th><th>Avg</th><th>Responses</th></tr></thead>
            <tbody>{d.feedback.byEvent.map((e) => <tr key={e.title}><td>{e.title}</td><td>{e.avgRating}</td><td>{e.responses}</td></tr>)}</tbody></table>
          {!d.feedback.byEvent.length && <div className="empty">No feedback yet.</div>}
        </div>
        <div className="panel"><h2>Most active students (MySQL: nested subquery)</h2>
          <table><thead><tr><th>Student</th><th>Events joined</th></tr></thead>
            <tbody>{d.topStudents.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.eventsJoined}</td></tr>)}</tbody></table>
          <h2 style={{ marginTop: 18 }}>Common feedback tags</h2>
          <div className="row">{d.feedback.topTags.map((t) => <span key={t.tag} className="pill">{t.tag} ({t.count})</span>)}</div>
        </div>
      </div>
    </>
  );
}
function Chart({ title, children }) {
  return <div className="panel"><h2>{title}</h2><div style={{ height: 260 }}><ResponsiveContainer>{children}</ResponsiveContainer></div></div>;
}

/* ---------------- Events table + admin form ---------------- */
const emptyForm = { title: '', description: '', venue: '', eventDate: '', capacity: 50, categoryId: '' };

function EventsTab({ isAdmin, categories, notify, onDetail }) {
  const [filters, setFilters] = useState({ q: '', category: '', when: 'upcoming' });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = hidden, else {id?, ...fields}

  const load = useCallback(async () => {
    const p = new URLSearchParams(filters);
    const r = await api('/api/events?' + p.toString());
    if (r.ok) setEvents(r.data);
    setLoading(false);
  }, [filters]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function register(e) {
    const r = await api('/api/registrations', { method: 'POST', body: { eventId: e.EventID } });
    r.ok ? notify(r.data.message) : notify(r.data.error, true); load();
  }
  async function cancel(e) {
    const r = await api(`/api/registrations?eventId=${e.EventID}`, { method: 'DELETE' });
    r.ok ? notify('Registration cancelled.') : notify(r.data.error, true); load();
  }
  async function remove(e) {
    if (!confirm(`Delete "${e.Title}" and all its registrations?`)) return;
    const r = await api(`/api/events/${e.EventID}`, { method: 'DELETE' });
    r.ok ? notify('Event deleted.') : notify(r.data.error, true); load();
  }
  async function save(ev) {
    ev.preventDefault();
    const { id, ...body } = form;
    const r = await api(id ? `/api/events/${id}` : '/api/events', { method: id ? 'PUT' : 'POST', body });
    if (!r.ok) return notify(r.data.error, true);
    notify(id ? 'Event updated.' : 'Event created.'); setForm(null); load();
  }
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      {isAdmin && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{form ? (form.id ? 'Edit event' : 'New event') : 'Manage events'}</h2>
            {!form && <button className="btn" onClick={() => setForm({ ...emptyForm, categoryId: categories[0]?.CategoryID || '' })}>Add event</button>}
          </div>
          {form && (
            <form className="form" onSubmit={save}>
              <label className="wide">Title<input required value={form.title} onChange={setF('title')} /></label>
              <label>Venue<input required value={form.venue} onChange={setF('venue')} /></label>
              <label>Date<input type="date" required value={form.eventDate} onChange={setF('eventDate')} /></label>
              <label>Capacity<input type="number" min="1" max="5000" required value={form.capacity} onChange={setF('capacity')} /></label>
              <label>Category<select required value={form.categoryId} onChange={setF('categoryId')}>
                {categories.map((c) => <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}</select></label>
              <label className="wide">Description<textarea rows={3} value={form.description} onChange={setF('description')} /></label>
              <div className="row wide"><button className="btn">{form.id ? 'Save changes' : 'Create event'}</button>
                <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button></div>
            </form>
          )}
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <input type="search" placeholder="Search title, description or venue" aria-label="Search events" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select aria-label="Category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">All categories</option>{categories.map((c) => <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}</select>
          <select aria-label="When" value={filters.when} onChange={(e) => setFilters({ ...filters, when: e.target.value })}>
            <option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option></select>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Event</th><th>Category</th><th>Date</th><th>Venue</th><th>Seats</th><th></th></tr></thead>
            <tbody>
              {events.map((e) => {
                const full = e.Registered >= e.Capacity;
                const past = !!Number(e.IsPast);
                const mine = Number(e.IsRegistered) > 0;
                return (
                  <tr key={e.EventID}>
                    <td><b>{e.Title}</b><small>{e.Description}</small></td>
                    <td><span className="pill">{e.CategoryName}</span></td>
                    <td>{e.EventDate}</td><td>{e.Venue}</td>
                    <td>{e.Registered}/{e.Capacity}<div className={`meter ${full ? 'full' : ''}`}><i style={{ width: `${Math.min(100, (e.Registered / e.Capacity) * 100)}%` }} /></div></td>
                    <td><div className="row">
                      {isAdmin ? (
                        <>
                          <button className="btn small ghost" onClick={() => setForm({ id: e.EventID, title: e.Title, description: e.Description || '', venue: e.Venue, eventDate: e.EventDate, capacity: e.Capacity, categoryId: e.CategoryID })}>Edit</button>
                          <button className="btn small ghost" onClick={() => onDetail({ event: e, canReview: false })}>Roster and feedback</button>
                          <button className="btn small danger" onClick={() => remove(e)}>Delete</button>
                        </>
                      ) : past ? (
                        mine ? <button className="btn small" onClick={() => onDetail({ event: e, canReview: true })}>Give feedback</button>
                             : <button className="btn small ghost" onClick={() => onDetail({ event: e, canReview: false })}>See feedback</button>
                      ) : mine ? (
                        <button className="btn small danger" onClick={() => cancel(e)}>Cancel registration</button>
                      ) : full ? <span className="pill" style={{ background: '#f6dde1', color: '#b42339' }}>Full</span>
                        : <button className="btn small" onClick={() => register(e)}>Register</button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !events.length && <div className="empty">No events match these filters. Try clearing the search or switching to All.</div>}
        </div>
      </div>
    </>
  );
}

/* ---------------- Student: my registrations ---------------- */
function MyRegistrations({ notify, onDetail }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => { api('/api/registrations').then((r) => r.ok && setRows(r.data)); }, []);
  useEffect(load, [load]);
  async function cancel(id) {
    const r = await api(`/api/registrations?eventId=${id}`, { method: 'DELETE' });
    r.ok ? notify('Registration cancelled.') : notify(r.data.error, true); load();
  }
  return (
    <div className="panel"><h2>My registrations</h2>
      <div className="tablewrap"><table>
        <thead><tr><th>Event</th><th>Category</th><th>Date</th><th>Venue</th><th>Registered on</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.RegID}><td><b>{r.Title}</b></td><td><span className="pill">{r.CategoryName}</span></td><td>{r.EventDate}</td><td>{r.Venue}</td><td>{r.RegDate}</td>
            <td>{Number(r.IsPast)
              ? <button className="btn small" onClick={() => onDetail({ event: { EventID: r.EventID, Title: r.Title }, canReview: true })}>Give feedback</button>
              : <button className="btn small danger" onClick={() => cancel(r.EventID)}>Cancel</button>}</td></tr>))}
        </tbody></table>
        {!rows.length && <div className="empty">You have not registered for any events yet. Open the Events tab to find one.</div>}
      </div>
    </div>
  );
}

/* ---------------- Roster (MySQL view) + feedback (MongoDB) ---------------- */
function EventDetail({ detail, isAdmin, notify, onClose }) {
  const { event, canReview } = detail;
  const [roster, setRoster] = useState([]);
  const [fb, setFb] = useState({ items: [], avgRating: null, count: 0 });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [fields, setFields] = useState([{ k: '', v: '' }]);

  const loadFb = useCallback(() => { api(`/api/feedback?eventId=${event.EventID}`).then((r) => r.ok && setFb(r.data)); }, [event.EventID]);
  useEffect(() => {
    loadFb();
    if (isAdmin) api(`/api/registrations?eventId=${event.EventID}`).then((r) => r.ok && setRoster(r.data));
  }, [event.EventID, isAdmin, loadFb]);

  async function submit(e) {
    e.preventDefault();
    const survey = {};
    fields.forEach(({ k, v }) => { if (k.trim()) survey[k.trim()] = v !== '' && !isNaN(v) ? Number(v) : v; });
    const r = await api('/api/feedback', { method: 'POST', body: { eventId: event.EventID, rating: Number(rating), comment, survey } });
    if (!r.ok) return notify(r.data.error, true);
    notify('Thanks, your feedback is saved.'); setComment(''); loadFb();
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>{event.Title}</h2><button className="btn small ghost" onClick={onClose}>Close</button>
      </div>
      {isAdmin && (
        <>
          <h3 style={{ margin: '8px 0' }}>Roster ({roster.length})</h3>
          <div className="tablewrap"><table><thead><tr><th>Student</th><th>Email</th><th>Registered</th></tr></thead>
            <tbody>{roster.map((r) => <tr key={r.RegID}><td>{r.StudentName}</td><td>{r.ContactInfo}</td><td>{r.RegDate}</td></tr>)}</tbody></table>
            {!roster.length && <div className="empty">No registrations yet.</div>}</div>
        </>
      )}
      {canReview && (
        <form className="form" onSubmit={submit} style={{ margin: '16px 0' }}>
          <label>Rating<select value={rating} onChange={(e) => setRating(e.target.value)}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}</select></label>
          <label className="wide">Comment<textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          <div className="wide"><div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Extra survey answers (any question you like, for example venueRating = 4)</div>
            {fields.map((f, i) => (
              <div className="row" key={i} style={{ marginBottom: 6 }}>
                <input placeholder="Question" value={f.k} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
                <input placeholder="Answer" value={f.v} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
              </div>))}
            <button type="button" className="btn small ghost" onClick={() => setFields([...fields, { k: '', v: '' }])}>Add another question</button></div>
          <div className="row wide"><button className="btn">Save feedback</button></div>
        </form>
      )}
      <h3 style={{ margin: '14px 0 4px' }}>Feedback {fb.count ? `(${fb.count}, average ${fb.avgRating.toFixed(1)} out of 5)` : ''}</h3>
      {fb.items.map((f, i) => (
        <div className="fbitem" key={i}>
          <span className="stars">{f.rating} / 5</span> <b>{f.userName}</b>
          <div>{f.comment}</div>
          <div className="survey">{Object.entries(f.survey || {}).map(([k, v]) => `${k}: ${String(v)}`).join('  |  ')}</div>
        </div>))}
      {!fb.count && <div className="empty">No feedback has been left for this event yet.</div>}
    </div>
  );
}
