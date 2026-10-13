// Big numbers first, details on tap. Not an accounting report.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isPro } from '@shared/billing';
import { addMonths, lateLabel } from '@shared/dates';
import { formatMoney } from '@shared/money';
import { computeStats, type Bucket } from '@shared/stats';
import { useProfile } from '../lib/auth';
import { usePayments } from '../lib/data';
import { ownerToday } from '../lib/format';
import { Loading } from '../components/Layout';

type Range = 'month' | 'quarter' | 'year';
type Breakdown = 'customer' | 'category' | 'method';

export function Dashboard() {
  const { uid, profile } = useProfile();
  const today = ownerToday(profile);
  const { items: payments, loading } = usePayments(uid);
  const [range, setRange] = useState<Range>('month');
  const [breakdown, setBreakdown] = useState<Breakdown>('customer');

  const from = range === 'month' ? `${today.slice(0, 7)}-01` : range === 'quarter' ? addMonths(`${today.slice(0, 7)}-01`, -2) : `${today.slice(0, 4)}-01-01`;
  const stats = useMemo(() => computeStats(payments, { today, from, to: today }), [payments, today, from]);
  const monthStats = useMemo(() => computeStats(payments, { today, from: `${today.slice(0, 7)}-01`, to: today }), [payments, today]);

  // Who owes you, oldest first, one line per customer.
  const owers = useMemo(() => {
    const m = new Map<string, { name: string; amount: number; oldest: string; jobId: string }>();
    for (const p of payments) {
      if (p.status === 'paid' || p.status === 'canceled') continue;
      const cur = m.get(p.customerId);
      if (!cur) m.set(p.customerId, { name: p.customerName, amount: p.amount, oldest: p.dueDate, jobId: p.jobId });
      else {
        cur.amount += p.amount;
        if (p.dueDate < cur.oldest) { cur.oldest = p.dueDate; cur.jobId = p.jobId; }
      }
    }
    return [...m.values()].sort((a, b) => a.oldest.localeCompare(b.oldest));
  }, [payments]);

  if (loading) return <Loading />;

  if (!isPro(profile.subscription)) {
    return (
      <>
        <h1>Your numbers</h1>
        <div className="stats">
          <div className="stat"><span className="label">Money still owed</span><span className="value">{formatMoney(stats.openAmount)}</span></div>
          <div className="stat"><span className="label">Overdue</span><span className="value">{formatMoney(stats.overdueAmount)}</span></div>
        </div>
        <div className="card warn"><p><strong>The full numbers page is part of Pro:</strong> who pays fastest, which payment methods work best, and more.</p><Link className="btn" to="/settings#plan">See plans</Link></div>
      </>
    );
  }

  const rows: Bucket[] = Object.values(breakdown === 'customer' ? stats.byCustomer : breakdown === 'category' ? stats.byCategory : stats.byMethod)
    .filter((b) => b.openAmount || b.paidAmount)
    .sort((a, b) => b.openAmount + b.paidAmount - (a.openAmount + a.paidAmount));

  return (
    <>
      <h1>Your numbers</h1>
      <div className="stats">
        <div className="stat"><span className="label">Money still owed</span><span className="value">{formatMoney(stats.openAmount)}</span></div>
        <div className="stat"><span className="label">Overdue</span><span className="value">{formatMoney(stats.overdueAmount)}</span></div>
        <div className="stat"><span className="label">Paid this month</span><span className="value">{formatMoney(monthStats.paidAmount)}</span></div>
        <div className="stat"><span className="label">Average days to get paid</span><span className="value">{stats.avgDaysToPay ?? '—'}<span className="sr-only">{stats.avgDaysToPay === null ? 'not enough data yet' : ' days'}</span></span></div>
      </div>

      {stats.insight && <div className="card good"><p className="lead" style={{ margin: 0 }}>{stats.insight}</p></div>}

      <h2>Who owes you</h2>
      {owers.length === 0 ? (
        <p>Nobody right now.</p>
      ) : (
        <ul className="list">
          {owers.map((o) => (
            <li key={o.name + o.oldest}>
              <Link className="item-row" to={`/jobs/${o.jobId}`}>
                <span className="split"><span className="name">{o.name}</span><span className="amount">{formatMoney(o.amount)}</span></span>
                <span className="meta"><span className={`pill ${o.oldest < today ? 'late' : 'soon'}`}>{lateLabel(o.oldest, today)}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Breakdown</h2>
      <div className="segmented" role="group" aria-label="Time period">
        {([['month', 'This month'], ['quarter', 'Last 3 months'], ['year', 'This year']] as [Range, string][]).map(([v, label]) => (
          <button key={v} type="button" aria-pressed={range === v} onClick={() => setRange(v)}>{label}</button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Group by">
        {([['customer', 'By customer'], ['category', 'By type of work'], ['method', 'By how they paid']] as [Breakdown, string][]).map(([v, label]) => (
          <button key={v} type="button" aria-pressed={breakdown === v} onClick={() => setBreakdown(v)}>{label}</button>
        ))}
      </div>
      <p>Paid in this period: <strong>{formatMoney(stats.paidAmount)}</strong> from {stats.paidCount} payment{stats.paidCount === 1 ? '' : 's'}.</p>
      {rows.length === 0 ? (
        <p>No payments in this period yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Breakdown table">
          <table className="data">
            <caption className="sr-only">Breakdown {breakdown}</caption>
            <thead>
              <tr>
                <th scope="col">{breakdown === 'customer' ? 'Customer' : breakdown === 'category' ? 'Type of work' : 'Paid by'}</th>
                {breakdown !== 'method' && <th scope="col" className="num">Still owed</th>}
                <th scope="col" className="num">Paid</th>
                <th scope="col" className="num">Avg. days to pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.label}>
                  <th scope="row">{b.label}</th>
                  {breakdown !== 'method' && <td className="num">{formatMoney(b.openAmount)}</td>}
                  <td className="num">{formatMoney(b.paidAmount)}</td>
                  <td className="num">{b.avgDaysToPay ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
