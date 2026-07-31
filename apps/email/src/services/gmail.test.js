import {
  splitQuotedText,
  buildReplyRecipients,
  buildReplySubject,
  buildReferences,
  parseAddress,
  parseAddressList,
  categoryFromLabels,
  encodeHeaderValue,
  escapeHtml,
  extractBody,
  parseMessage,
  formatThread,
} from './gmail';

const b64url = (str) =>
  Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

describe('splitQuotedText', () => {
  // Each of these used to lose the body entirely.
  it('keeps a newsletter that merely contains the words "on ... wrote:"', () => {
    const html =
      '<p>Hi Josh, a note on the talk Ada wrote: here is the rest of the newsletter.</p>';
    expect(splitQuotedText(html)).toEqual({ visible: html, quoted: '' });
  });

  it('keeps a body wrapped entirely in a gmail_quote container', () => {
    const html = '<div class="gmail_quote"><div>real content</div> more</div>';
    expect(splitQuotedText(html).visible).toBe(html);
  });

  it('keeps a promo whose whole body is one blockquote', () => {
    const html = '<blockquote style="margin:0"><h1>50% OFF</h1><p>Shop now</p></blockquote>';
    expect(splitQuotedText(html)).toEqual({ visible: html, quoted: '' });
  });

  it('splits a real reply at the quoted history', () => {
    const html =
      '<div>Sounds good, see you then.</div>' +
      '<div class="gmail_quote"><blockquote>earlier message</blockquote></div>';
    const { visible, quoted } = splitQuotedText(html);
    expect(visible).toBe('<div>Sounds good, see you then.</div>');
    expect(quoted).toContain('earlier message');
  });

  it('splits a blockquote that has content above it', () => {
    const html = '<p>Agreed.</p><blockquote>the original</blockquote>';
    const { visible, quoted } = splitQuotedText(html);
    expect(visible).toBe('<p>Agreed.</p>');
    expect(quoted).toBe('<blockquote>the original</blockquote>');
  });

  it('splits plain-text quote markers but keeps the reply', () => {
    const { visible, quoted } = splitQuotedText('Sure thing<br>&gt; your earlier line');
    expect(visible).toBe('Sure thing');
    expect(quoted).toContain('your earlier line');
  });

  it('never discards content: visible + quoted rebuilds the original', () => {
    const html = '<p>Yes.</p><blockquote>old</blockquote><p>trailing</p>';
    const { visible, quoted } = splitQuotedText(html);
    expect(visible + quoted).toBe(html);
  });

  it('handles empty input', () => {
    expect(splitQuotedText('')).toEqual({ visible: '', quoted: '' });
  });
});

describe('address parsing', () => {
  it('parses a named address', () => {
    expect(parseAddress('"Ada Lovelace" <ada@x.com>')).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@x.com',
    });
  });

  it('parses a bare address', () => {
    expect(parseAddress('ada@x.com')).toEqual({ name: '', email: 'ada@x.com' });
  });

  it('splits a list without breaking on commas inside quoted names', () => {
    const list = parseAddressList('"Lovelace, Ada" <ada@x.com>, bob@y.com');
    expect(list).toEqual([
      { name: 'Lovelace, Ada', email: 'ada@x.com' },
      { name: '', email: 'bob@y.com' },
    ]);
  });
});

describe('buildReplyRecipients', () => {
  const thread = (last) => ({ messages: [last] });

  it('replies to the sender', () => {
    const result = buildReplyRecipients(
      thread({ from: 'Ada <ada@x.com>', to: 'me@me.com' }),
      'me@me.com'
    );
    expect(result).toEqual({ to: ['ada@x.com'], cc: [] });
  });

  it('prefers Reply-To over From', () => {
    const result = buildReplyRecipients(
      thread({ from: 'noreply@x.com', replyTo: 'support@x.com', to: 'me@me.com' }),
      'me@me.com'
    );
    expect(result.to).toEqual(['support@x.com']);
  });

  it('replies to the original audience when I sent the last message', () => {
    const result = buildReplyRecipients(
      thread({ from: 'me@me.com', to: 'ada@x.com, bob@y.com' }),
      'me@me.com'
    );
    expect(result.to).toEqual(['ada@x.com', 'bob@y.com']);
  });

  it('reply-all adds the other recipients and drops me', () => {
    const result = buildReplyRecipients(
      thread({ from: 'Ada <ada@x.com>', to: 'me@me.com, bob@y.com', cc: 'carol@z.com' }),
      'me@me.com',
      { replyAll: true }
    );
    expect(result.to).toEqual(['ada@x.com']);
    expect(result.cc).toEqual(['bob@y.com', 'carol@z.com']);
  });

  it('never returns an empty recipient list', () => {
    const result = buildReplyRecipients(thread({ from: 'me@me.com', to: '' }), 'me@me.com');
    expect(result.to).toEqual(['me@me.com']);
  });
});

describe('reply headers', () => {
  it('uses the last message subject and prefixes Re: once', () => {
    expect(buildReplySubject({ messages: [{ subject: 'Lunch' }] })).toBe('Re: Lunch');
    expect(buildReplySubject({ messages: [{ subject: 'Re: Lunch' }] })).toBe('Re: Lunch');
  });

  it('accumulates the References chain', () => {
    expect(buildReferences({ references: '<a@x>', messageId: '<b@x>' })).toBe('<a@x> <b@x>');
    expect(buildReferences({ references: '', messageId: '<b@x>' })).toBe('<b@x>');
    expect(buildReferences({ references: '<a@x> <b@x>', messageId: '<b@x>' })).toBe('<a@x> <b@x>');
  });
});

describe('categoryFromLabels', () => {
  it('maps Gmail category labels', () => {
    expect(categoryFromLabels(['INBOX', 'CATEGORY_PROMOTIONS'])).toBe('promotions');
    expect(categoryFromLabels(['CATEGORY_SOCIAL'])).toBe('social');
  });

  it('defaults to primary', () => {
    expect(categoryFromLabels(['INBOX', 'UNREAD'])).toBe('primary');
    expect(categoryFromLabels([])).toBe('primary');
  });
});

describe('header + html encoding', () => {
  it('leaves ASCII subjects alone', () => {
    expect(encodeHeaderValue('Lunch tomorrow')).toBe('Lunch tomorrow');
  });

  it('encodes non-ASCII subjects as RFC 2047', () => {
    expect(encodeHeaderValue('Café ☕')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
  });

  it('escapes html so typed text cannot inject markup', () => {
    expect(escapeHtml('<b>hi</b> & "bye"')).toBe(
      '&lt;b&gt;hi&lt;/b&gt; &amp; &quot;bye&quot;'
    );
  });
});

describe('extractBody', () => {
  it('prefers the html part', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('plain') } },
        { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
      ],
    };
    expect(extractBody(payload)).toEqual({ html: '<p>html</p>', text: 'plain' });
  });

  it('finds parts nested inside multipart/mixed', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/html', body: { data: b64url('<p>deep</p>') } }],
        },
      ],
    };
    expect(extractBody(payload).html).toBe('<p>deep</p>');
  });

  it('skips attachment parts when looking for a body', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'text/html',
          filename: 'invoice.html',
          body: { attachmentId: 'a1', data: b64url('<p>attachment</p>') },
        },
        { mimeType: 'text/plain', body: { data: b64url('real body') } },
      ],
    };
    expect(extractBody(payload)).toEqual({ html: null, text: 'real body' });
  });
});

describe('parseMessage', () => {
  const message = {
    id: 'm1',
    threadId: 't1',
    internalDate: '1700000000000',
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
    snippet: 'snippet',
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: 'Ada Lovelace <ada@x.com>' },
        { name: 'To', value: 'me@me.com' },
        { name: 'Cc', value: 'bob@y.com' },
        { name: 'Reply-To', value: 'ada-replies@x.com' },
        { name: 'Subject', value: 'Hello' },
        { name: 'Message-ID', value: '<m1@x>' },
        { name: 'References', value: '<m0@x>' },
      ],
      body: { data: b64url('line one\nline <two>') },
    },
  };

  it('pulls out the headers a reply needs', () => {
    const parsed = parseMessage(message);
    expect(parsed.senderEmail).toBe('ada@x.com');
    expect(parsed.senderName).toBe('Ada Lovelace');
    expect(parsed.replyTo).toBe('ada-replies@x.com');
    expect(parsed.cc).toBe('bob@y.com');
    expect(parsed.references).toBe('<m0@x>');
    expect(parsed.isUnread).toBe(true);
  });

  it('escapes plain-text bodies instead of injecting them as markup', () => {
    expect(parseMessage(message).body).toBe('line one<br>line &lt;two&gt;');
    expect(parseMessage(message).isHtmlBody).toBe(false);
  });

  it('derives the thread category and starred state', () => {
    const thread = formatThread({ id: 't1', messages: [message] });
    expect(thread.category).toBe('promotions');
    expect(thread.isStarred).toBe(false);
    expect(thread.hasUnread).toBe(true);
    expect(thread.lastSenderEmail).toBe('ada@x.com');
    expect(thread.participants).toEqual(['Ada Lovelace']);
  });
});
