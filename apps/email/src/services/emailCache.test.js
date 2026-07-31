// These tests cover the pure filtering/sizing helpers. Stubbing the Firebase
// app keeps the SDK's Node build — which expects browser globals jsdom
// doesn't provide — out of the import graph.
jest.mock('../config/firebase', () => ({ app: {}, db: {}, auth: {} }));

import { matchesCategory, capBodyForStorage } from './emailCache';
import { buildGmailQuery, utf8ByteLength } from './gmail';

describe('matchesCategory', () => {
  const thread = (extra) => ({ category: 'primary', isStarred: false, ...extra });

  it('matches the thread category', () => {
    expect(matchesCategory(thread({ category: 'promotions' }), 'promotions')).toBe(true);
    expect(matchesCategory(thread({ category: 'promotions' }), 'primary')).toBe(false);
  });

  it('treats a missing category as primary', () => {
    expect(matchesCategory({ isStarred: false }, 'primary')).toBe(true);
    expect(matchesCategory({ isStarred: false }, 'social')).toBe(false);
  });

  it('handles the starred tab separately from categories', () => {
    expect(matchesCategory(thread({ isStarred: true, category: 'promotions' }), 'starred')).toBe(
      true
    );
    expect(matchesCategory(thread({ isStarred: false }), 'starred')).toBe(false);
  });

  it('lets everything through with no filter', () => {
    expect(matchesCategory(thread({ category: 'social' }), 'all')).toBe(true);
    expect(matchesCategory(thread({ category: 'social' }), undefined)).toBe(true);
  });
});

describe('buildGmailQuery', () => {
  it('builds a category query', () => {
    expect(buildGmailQuery('', 'promotions')).toBe('category:promotions');
  });

  it('combines search with a category', () => {
    expect(buildGmailQuery('from:ada', 'primary')).toBe('from:ada category:primary');
  });

  it('uses is:starred for the starred tab', () => {
    expect(buildGmailQuery('lunch', 'starred')).toBe('lunch is:starred');
  });

  it('returns an empty query for the all tab', () => {
    expect(buildGmailQuery('', 'all')).toBe('');
  });
});

describe('capBodyForStorage', () => {
  it('leaves normal bodies alone', () => {
    const body = '<p>hello</p>';
    expect(capBodyForStorage(body)).toEqual({ body, truncated: false });
  });

  it('handles an empty body', () => {
    expect(capBodyForStorage(undefined)).toEqual({ body: '', truncated: false });
  });

  it('trims a body that would blow the Firestore document limit', () => {
    const huge = 'x'.repeat(900 * 1024);
    const result = capBodyForStorage(huge);
    expect(result.truncated).toBe(true);
    expect(utf8ByteLength(result.body)).toBeLessThanOrEqual(500 * 1024);
  });

  it('measures multi-byte characters in bytes, not characters', () => {
    // 400k characters, but 1.2 MB of UTF-8.
    const multibyte = '☕'.repeat(400 * 1024);
    const result = capBodyForStorage(multibyte);
    expect(result.truncated).toBe(true);
    expect(utf8ByteLength(result.body)).toBeLessThanOrEqual(500 * 1024);
  });
});
