import { buildSrcDoc } from './MessageBody';

const doc = (overrides = {}) =>
  buildSrcDoc({
    html: '<p>hello</p>',
    showImages: false,
    nonce: 'testnonce',
    frameId: 'frame-1',
    variant: 'received',
    ...overrides,
  });

describe('buildSrcDoc', () => {
  it('denies everything by default', () => {
    expect(doc()).toContain("default-src 'none'");
  });

  it('allows only our nonce-tagged script', () => {
    const html = doc();
    expect(html).toContain("script-src 'nonce-testnonce'");
    // No blanket unsafe-inline for scripts — that would re-open the door.
    expect(html).not.toContain("script-src 'unsafe-inline'");
  });

  it('blocks images until the user asks for them', () => {
    expect(doc({ showImages: false })).toContain("img-src 'none'");
    expect(doc({ showImages: true })).toContain('img-src https:');
  });

  it('blocks nested frames, objects and form posts', () => {
    const html = doc();
    expect(html).toContain("frame-src 'none'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("form-action 'none'");
  });

  it('sends no referrer and opens links in a new tab', () => {
    const html = doc();
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<base target="_blank">');
  });

  it('embeds the message HTML verbatim rather than filtering it', () => {
    // The security boundary is the sandbox, not a sanitizer — hostile markup
    // is allowed through into a document where it cannot do anything.
    const hostile = '<img src=x onerror=alert(1)>';
    expect(doc({ html: hostile })).toContain(hostile);
  });

  it('tags height messages with the frame id so siblings do not cross talk', () => {
    expect(doc({ frameId: 'frame-42' })).toContain('"frame-42"');
  });
});
