import { ITEM_STATUS } from './constants';

// Everything the dashboard reports, computed from the raw item list. Metrics
// are careful about missing data: an item with no price paid isn't counted as
// $0 (that would fake a profit), it's just excluded from the averages and
// profit math that need it — and we surface how many are missing so the
// numbers can be trusted.
export const computeMetrics = (items) => {
  const inStock = items.filter((i) => i.status === ITEM_STATUS.INVENTORY);
  const sold = items.filter((i) => i.status === ITEM_STATUS.SOLD);

  const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

  // Cost basis of what's still on hand (only items with a known price).
  const stockPaid = inStock.map((i) => num(i.pricePaid)).filter((v) => v !== null);
  const stockCostBasis = stockPaid.reduce((s, v) => s + v, 0);

  // All the money ever put in (across every item with a known price).
  const allPaid = items.map((i) => num(i.pricePaid)).filter((v) => v !== null);
  const totalInvested = allPaid.reduce((s, v) => s + v, 0);

  // Sold side.
  const soldPrices = sold.map((i) => num(i.sold?.price)).filter((v) => v !== null);
  const soldRevenue = soldPrices.reduce((s, v) => s + v, 0);
  const totalFees = sold.reduce((s, i) => s + (num(i.sold?.fees) || 0), 0);

  // Realized profit — only items we sold AND know the cost of. Fees subtracted.
  const flips = sold
    .filter((i) => num(i.pricePaid) !== null && num(i.sold?.price) !== null)
    .map((i) => {
      const paid = num(i.pricePaid);
      const price = num(i.sold.price);
      const fees = num(i.sold?.fees) || 0;
      return { item: i, paid, price, fees, profit: price - paid - fees };
    });
  const realizedProfit = flips.reduce((s, f) => s + f.profit, 0);
  const flipCostBasis = flips.reduce((s, f) => s + f.paid, 0);
  const flipRevenue = flips.reduce((s, f) => s + f.price, 0);

  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

  const bestFlip = flips.length
    ? flips.reduce((best, f) => (f.profit > best.profit ? f : best), flips[0])
    : null;

  // Value by category (uses cost basis of in-stock items with a known price).
  const byCategory = {};
  for (const i of inStock) {
    const key = i.category || 'Uncategorized';
    const paid = num(i.pricePaid) || 0;
    if (!byCategory[key]) byCategory[key] = { count: 0, value: 0 };
    byCategory[key].count += 1;
    byCategory[key].value += paid;
  }
  const categoryBreakdown = Object.entries(byCategory)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.value - a.value || b.count - a.count);

  return {
    totalItems: items.length,
    inStockCount: inStock.length,
    soldCount: sold.length,

    stockCostBasis,
    totalInvested,
    soldRevenue,
    totalFees,
    realizedProfit,

    // Margin on the flips we can measure: profit ÷ what we sold them for.
    profitMargin: flipRevenue > 0 ? (realizedProfit / flipRevenue) * 100 : null,
    roi: flipCostBasis > 0 ? (realizedProfit / flipCostBasis) * 100 : null,

    avgPaid: avg(allPaid),
    avgSold: avg(soldPrices),
    avgProfit: flips.length ? realizedProfit / flips.length : null,

    bestFlip,
    categoryBreakdown,

    // Data-quality caveats, so the numbers are honest.
    missingPaidCount: items.length - allPaid.length,
    soldMissingCostCount: sold.length - flips.length,
  };
};
