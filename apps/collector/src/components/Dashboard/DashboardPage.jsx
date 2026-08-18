import { useMemo } from 'react';
import { useShop } from '../../contexts/ShopContext';
import { computeMetrics } from '../../utils/metrics';
import { money, moneyCompact, percent } from '../../utils/format';
import LoadingSpinner from '../Layout/LoadingSpinner';

const Tile = ({ label, value, sub, accent }) => (
  <div className="card p-4">
    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
    <div className={`mt-1 text-2xl font-bold ${accent || 'text-slate-900'}`}>{value}</div>
    {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
  </div>
);

const DashboardPage = () => {
  const { items, itemsLoading } = useShop();
  const m = useMemo(() => computeMetrics(items), [items]);

  if (itemsLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-4">
        <LoadingSpinner label="Crunching the numbers…" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-slate-400">
        Add some items and your inventory &amp; profit numbers will show up here.
      </div>
    );
  }

  const maxCat = Math.max(1, ...m.categoryBreakdown.map((c) => c.value));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-4">
      {/* Headline row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="In stock" value={m.inStockCount} sub={`${m.totalItems} total items`} />
        <Tile label="Cost basis on hand" value={moneyCompact(m.stockCostBasis)} sub="what the shelf cost" />
        <Tile label="Sold to date" value={moneyCompact(m.soldRevenue)} sub={`${m.soldCount} items sold`} />
        <Tile
          label="Realized profit"
          value={moneyCompact(m.realizedProfit)}
          sub="sold − cost − fees"
          accent={m.realizedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
      </div>

      {/* Averages */}
      <div>
        <h3 className="mb-2 px-1 text-sm font-semibold text-slate-700">Averages</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Avg paid / item" value={m.avgPaid != null ? money(m.avgPaid) : '—'} />
          <Tile label="Avg sold / item" value={m.avgSold != null ? money(m.avgSold) : '—'} />
          <Tile label="Avg profit / flip" value={m.avgProfit != null ? money(m.avgProfit) : '—'}
            accent={m.avgProfit != null && m.avgProfit < 0 ? 'text-red-600' : 'text-slate-900'} />
          <Tile label="Profit margin" value={m.profitMargin != null ? percent(m.profitMargin) : '—'}
            sub={m.roi != null ? `${percent(m.roi)} ROI` : null} />
        </div>
      </div>

      {/* Money summary */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Money in &amp; out</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Total invested (all items with a cost)" value={money(m.totalInvested)} />
          <Row label="Revenue from sold items" value={money(m.soldRevenue)} />
          <Row label="Selling fees paid" value={m.totalFees ? `– ${money(m.totalFees)}` : money(0)} />
          <div className="my-1 border-t border-slate-100" />
          <Row
            label="Realized profit (sold items)"
            value={`${m.realizedProfit >= 0 ? '+' : ''}${money(m.realizedProfit)}`}
            strong
            accent={m.realizedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
          />
        </dl>
        {m.bestFlip && (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            🏆 Best flip: <strong>{m.bestFlip.item.name}</strong> — bought {money(m.bestFlip.paid)},
            sold {money(m.bestFlip.price)} for <strong>+{money(m.bestFlip.profit)}</strong>.
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {m.categoryBreakdown.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">In-stock cost basis by category</h3>
          <div className="space-y-2.5">
            {m.categoryBreakdown.map((c) => (
              <div key={c.name}>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{c.name} <span className="text-slate-300">· {c.count}</span></span>
                  <span className="font-medium text-slate-700">{money(c.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${Math.max(3, (c.value / maxCat) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Honesty about incomplete data */}
      {(m.missingPaidCount > 0 || m.soldMissingCostCount > 0) && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {m.missingPaidCount > 0 && (
            <div>{m.missingPaidCount} item{m.missingPaidCount > 1 ? 's' : ''} have no price paid, so they&apos;re
              left out of cost, averages, and profit.</div>
          )}
          {m.soldMissingCostCount > 0 && (
            <div>{m.soldMissingCostCount} sold item{m.soldMissingCostCount > 1 ? 's are' : ' is'} missing a cost,
              so their profit isn&apos;t counted. Add the price paid to include them.</div>
          )}
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value, strong, accent }) => (
  <div className="flex items-center justify-between">
    <dt className="text-slate-500">{label}</dt>
    <dd className={`${strong ? 'font-semibold' : 'font-medium'} ${accent || 'text-slate-900'}`}>{value}</dd>
  </div>
);

export default DashboardPage;
