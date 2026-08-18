// eBay "sold comps" helper.
//
// The going rate for a collectible is best read off *recently sold* listings,
// not active asks. eBay's own sold-listings search does exactly that and needs
// no API key: LH_Sold=1 & LH_Complete=1 filters to completed, sold items, and
// _sop=13 sorts by most-recent sale. We build a good query string from the
// item's fields and open it in a new tab.
//
// (A future upgrade could pull median sold prices automatically via the eBay
// Marketplace Insights API or a service like Card Ladder / 130point — those
// need credentials and a small backend, so for now we hand off to eBay's UI.)

export const buildEbayQuery = (item) => {
  if (!item) return '';
  const parts = [];
  if (item.name) parts.push(item.name);
  // A graded slab's price is driven by the grade, so fold it into the query.
  if (item.graded && item.gradingCompany) {
    const company = item.gradingCompany.split(' ')[0]; // "BGS (Beckett)" → "BGS"
    parts.push(company);
    if (item.grade) parts.push(String(item.grade));
  }
  return parts.join(' ').trim();
};

export const ebaySoldUrl = (item) => {
  const q = buildEbayQuery(item);
  const params = new URLSearchParams({
    _nkw: q,
    LH_Sold: '1',
    LH_Complete: '1',
    _sop: '13', // sort: recently ended
  });
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
};

export const openEbaySold = (item) => {
  window.open(ebaySoldUrl(item), '_blank', 'noopener,noreferrer');
};
