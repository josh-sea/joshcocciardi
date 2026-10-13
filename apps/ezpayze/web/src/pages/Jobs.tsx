import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { lateLabel } from '@shared/dates';
import { formatMoney } from '@shared/money';
import { useProfile } from '../lib/auth';
import { useJobs, usePayments } from '../lib/data';
import { ownerToday } from '../lib/format';
import { Loading } from '../components/Layout';
import { Field } from '../components/Field';

type Filter = 'open' | 'paid' | 'all';

export function Jobs() {
  const { uid, profile } = useProfile();
  const today = ownerToday(profile);
  const { items: jobs, loading } = useJobs(uid);
  const { items: payments } = usePayments(uid);
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');

  const owed = useMemo(() => {
    const m = new Map<string, { amount: number; oldestDue: string | null }>();
    for (const p of payments) {
      if (p.status === 'paid' || p.status === 'canceled') continue;
      const cur = m.get(p.jobId) ?? { amount: 0, oldestDue: null };
      cur.amount += p.amount;
      if (!cur.oldestDue || p.dueDate < cur.oldestDue) cur.oldestDue = p.dueDate;
      m.set(p.jobId, cur);
    }
    return m;
  }, [payments]);

  const q = search.trim().toLowerCase();
  const shown = jobs
    .filter((j) => (filter === 'all' ? j.status !== 'canceled' : j.status === filter))
    .filter((j) => !q || j.customerName.toLowerCase().includes(q) || j.title.toLowerCase().includes(q) || (j.referenceNumber ?? '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (filter !== 'open') return b.createdAt - a.createdAt;
      return (owed.get(a.id)?.oldestDue ?? a.dueDate).localeCompare(owed.get(b.id)?.oldestDue ?? b.dueDate);
    });

  if (loading) return <Loading />;
  const totalOwed = [...owed.values()].reduce((s, o) => s + o.amount, 0);

  return (
    <>
      <div className="split">
        <h1>Jobs</h1>
        <Link className="btn" to="/add">+ Add job</Link>
      </div>
      <p className="lead">You're owed <strong>{formatMoney(totalOwed)}</strong> in total.</p>
      <div className="segmented" role="group" aria-label="Show">
        {(['open', 'paid', 'all'] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'open' ? 'Still owed' : f === 'paid' ? 'Paid' : 'All'}
          </button>
        ))}
      </div>
      <Field label="Find a customer or job" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      {shown.length === 0 ? (
        <div className="empty">
          <span className="big">{filter === 'open' ? 'Nobody owes you right now.' : 'Nothing here yet.'}</span>
          <p><Link to="/add">Add a job</Link></p>
        </div>
      ) : (
        <ul className="list">
          {shown.map((j) => {
            const o = owed.get(j.id);
            return (
              <li key={j.id}>
                <Link className="item-row" to={`/jobs/${j.id}`}>
                  <span className="split">
                    <span className="name">{j.customerName}</span>
                    <span className="amount">{formatMoney(j.status === 'open' ? o?.amount ?? j.totalAmount : j.totalAmount)}</span>
                  </span>
                  <span className="meta">{j.title}{j.referenceNumber ? ` · #${j.referenceNumber}` : ''}</span>
                  <span className="meta">
                    {j.status === 'paid' && <span className="pill paid">Paid</span>}
                    {j.status === 'canceled' && <span className="pill muted">Canceled</span>}
                    {j.status === 'open' && o?.oldestDue && (
                      <span className={`pill ${o.oldestDue < today ? 'late' : 'soon'}`}>{lateLabel(o.oldestDue, today)}</span>
                    )}
                    {j.hasPlan && ' · Payment plan'}
                    {j.limitBlocked && j.status === 'open' && ' · Reminders off (free limit)'}
                    {!j.customerEmail && j.status === 'open' && ' · No email address'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
