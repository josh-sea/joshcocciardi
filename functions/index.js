// Cloud Functions for CanITwo.
//
// The client is no longer trusted to write rating aggregates (the security
// rules restrict place updates to base fields) — this function is the single
// writer for the denormalized counters on canitwo_places docs.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// Recompute a place's aggregates from all of its reviews whenever any
// review is created or updated. Full recount (not incremental): reviews per
// place are small, and a recount self-heals any historical drift.
exports.canitwoAggregates = onDocumentWritten(
  'canitwo_places/{placeId}/reviews/{reviewerUid}',
  async (event) => {
    const { placeId } = event.params;
    const placeRef = db.collection('canitwo_places').doc(placeId);
    const reviews = await placeRef.collection('reviews').get();

    let yes = 0, no = 0, sum = 0, count = 0;
    const tagCounts = {};
    // Per-facility rating splits (women's vs men's rooms can differ).
    const fac = { womens: { sum: 0, count: 0 }, mens: { sum: 0, count: 0 } };
    reviews.forEach((d) => {
      const r = d.data();
      if (r.hasBathroom) yes++; else no++;
      if (typeof r.rating === 'number') {
        sum += r.rating; count++;
        if (fac[r.facility]) { fac[r.facility].sum += r.rating; fac[r.facility].count++; }
      }
      for (const t of r.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
    const avg = (s, c) => (c ? Math.round((s / c) * 10) / 10 : null);

    await placeRef.set({
      yesCount: yes,
      noCount: no,
      reviewCount: reviews.size,
      ratingCount: count,
      ratingSum: sum,
      avgRating: avg(sum, count),
      avgRatingWomens: avg(fac.womens.sum, fac.womens.count),
      ratingCountWomens: fac.womens.count,
      avgRatingMens: avg(fac.mens.sum, fac.mens.count),
      ratingCountMens: fac.mens.count,
      tagCounts,
      aggregatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
);

// Tally community flags onto the flagged review (clients create flag docs,
// this function is the only writer of flagCount).
exports.canitwoFlags = onDocumentWritten(
  'canitwo_flags/{flagId}',
  async (event) => {
    const snap = event.data.after.exists ? event.data.after : event.data.before;
    const flag = snap.data();
    if (!flag || !flag.placeId || !flag.reviewUid) return;

    const flags = await db.collection('canitwo_flags')
      .where('placeId', '==', flag.placeId)
      .where('reviewUid', '==', flag.reviewUid)
      .get();

    await db.collection('canitwo_places').doc(flag.placeId)
      .collection('reviews').doc(flag.reviewUid)
      .set({ flagCount: flags.size }, { merge: true });
  }
);
