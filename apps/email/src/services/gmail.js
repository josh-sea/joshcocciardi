const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

/** Gmail category labels, in the order we check them. */
const CATEGORY_LABELS = {
  CATEGORY_PROMOTIONS: 'promotions',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_UPDATES: 'updates',
  CATEGORY_FORUMS: 'forums',
  CATEGORY_PERSONAL: 'primary',
};

/**
 * Make an authenticated request to the Gmail API.
 */
async function gmailFetch(path, accessToken, options = {}) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    throw new Error('TOKEN_EXPIRED');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const reason = err.error?.errors?.[0]?.reason || '';
    if (res.status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(err.error?.message || `Gmail API error: ${res.status}`);
  }

  return res.json();
}

/**
 * List email threads.
 */
export async function listThreads(accessToken, { maxResults = 20, pageToken, q } = {}) {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) params.set('pageToken', pageToken);
  if (q) params.set('q', q);

  return gmailFetch(`/threads?${params}`, accessToken);
}

/**
 * Get a single thread with all its messages.
 */
export async function getThread(accessToken, threadId) {
  return gmailFetch(`/threads/${threadId}?format=full`, accessToken);
}

/**
 * Get the user's profile (email, total messages, etc).
 */
export async function getProfile(accessToken) {
  return gmailFetch('/profile', accessToken);
}

/**
 * Turn search text and the selected category tab into a Gmail query.
 */
export function buildGmailQuery(search, category) {
  const parts = [];
  if (search) parts.push(search.trim());

  if (category === 'starred') parts.push('is:starred');
  else if (category && category !== 'all') parts.push(`category:${category}`);

  return parts.filter(Boolean).join(' ');
}

/**
 * Escape a string for safe inclusion in HTML.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a string to a binary string of its UTF-8 bytes — the form btoa
 * expects. Avoids TextEncoder, which jsdom (and so the test run) lacks.
 */
function utf8ToBinary(str) {
  return encodeURIComponent(String(str ?? '')).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * Length of a string in UTF-8 bytes.
 */
export function utf8ByteLength(str) {
  return utf8ToBinary(str).length;
}

/**
 * Encode a header value as an RFC 2047 encoded-word when it contains
 * non-ASCII characters. Plain ASCII passes through untouched.
 */
export function encodeHeaderValue(value) {
  const str = String(value ?? '');
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(str)) return str;
  return `=?UTF-8?B?${btoa(utf8ToBinary(str))}?=`;
}

/**
 * Parse an address list header ("A <a@x.com>, b@y.com") into
 * { name, email } entries.
 */
export function parseAddressList(headerValue) {
  if (!headerValue) return [];

  const parts = [];
  let current = '';
  let inQuotes = false;
  let inAngle = false;

  for (const char of headerValue) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === '<') inAngle = true;
    if (char === '>') inAngle = false;
    if (char === ',' && !inQuotes && !inAngle) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts
    .map((part) => parseAddress(part))
    .filter((addr) => addr.email);
}

/**
 * Parse a single address ("Ada Lovelace <ada@x.com>") into { name, email }.
 */
export function parseAddress(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { name: '', email: '' };

  const angle = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (angle) {
    return {
      name: angle[1].trim().replace(/^"(.*)"$/, '$1').trim(),
      email: angle[2].trim(),
    };
  }

  return { name: '', email: raw.replace(/^"(.*)"$/, '$1').trim() };
}

/**
 * Send an email. Builds an RFC 2822 message and base64url-encodes it.
 */
export async function sendMessage(
  accessToken,
  { to, cc, subject, body, threadId, inReplyTo, references }
) {
  const toList = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  const ccList = Array.isArray(cc) ? cc.filter(Boolean) : [cc].filter(Boolean);

  if (!toList.length) {
    throw new Error('No recipient for this message');
  }

  const headers = [
    `To: ${toList.join(', ')}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
  ];

  if (ccList.length) headers.splice(1, 0, `Cc: ${ccList.join(', ')}`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  const email = headers.join('\r\n') + '\r\n\r\n' + body;
  const raw = btoa(utf8ToBinary(email))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const payload = { raw };
  if (threadId) payload.threadId = threadId;

  return gmailFetch('/messages/send', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Work out who a reply should go to.
 *
 * Replies follow the last message in the thread: its Reply-To (falling back
 * to From), plus — for reply-all — everyone else it was addressed to. When
 * the last message is one *we* sent, we reply to its recipients instead of
 * to ourselves.
 */
export function buildReplyRecipients(thread, myEmail, { replyAll = false } = {}) {
  const messages = thread?.messages || [];
  const last = messages[messages.length - 1];
  if (!last) return { to: [], cc: [] };

  const mine = (myEmail || '').toLowerCase();
  const sender = (last.senderEmail || parseAddress(last.from).email || '').toLowerCase();
  const isFromMe = Boolean(mine) && sender === mine;

  const notMe = (addr) => addr.email && addr.email.toLowerCase() !== mine;
  const emails = (list) => list.map((addr) => addr.email);
  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((email) => {
      const key = email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const toHeader = parseAddressList(last.to);
  const ccHeader = parseAddressList(last.cc);

  let to;
  if (isFromMe) {
    // Replying to our own message: keep its original audience.
    to = emails(toHeader.filter(notMe));
  } else {
    const replyTo = parseAddressList(last.replyTo);
    const from = replyTo.length ? replyTo : parseAddressList(last.from);
    to = emails(from.filter(notMe));
  }

  let cc = [];
  if (replyAll) {
    const extras = [...toHeader, ...ccHeader].filter(notMe);
    cc = emails(extras).filter((email) => !to.some((t) => t.toLowerCase() === email.toLowerCase()));
  }

  to = dedupe(to);
  cc = dedupe(cc);

  // Never end up with an empty To — fall back to the sender, even if it's us.
  if (!to.length) {
    const fallback = parseAddressList(last.from);
    to = emails(fallback);
  }

  return { to, cc };
}

/**
 * Build the subject line for a reply, based on the message being replied to.
 */
export function buildReplySubject(thread) {
  const messages = thread?.messages || [];
  const last = messages[messages.length - 1];
  const subject = last?.subject || thread?.subject || '';
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

/**
 * Build the References header for a reply: the chain the message we're
 * replying to already carried, plus its own Message-ID.
 */
export function buildReferences(message) {
  const prior = (message?.references || '').trim();
  const id = (message?.messageId || '').trim();
  if (!id) return prior;
  if (!prior) return id;
  return prior.includes(id) ? prior : `${prior} ${id}`;
}

/**
 * Mark a message as read.
 */
export async function markAsRead(accessToken, messageId) {
  return gmailFetch(`/messages/${messageId}/modify`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

/**
 * Extract useful info from a Gmail message object.
 */
export function parseMessage(message) {
  const headers = message.payload?.headers || [];
  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const from = getHeader('From');
  const sender = parseAddress(from);

  const { html, text } = extractBody(message.payload);
  // Plain-text bodies are escaped here so that everything downstream — cache,
  // renderer, quote splitting — deals with one consistent HTML string.
  const body = html || (text ? escapeHtml(text).replace(/\r?\n/g, '<br>') : '');

  return {
    id: message.id,
    threadId: message.threadId,
    messageId: getHeader('Message-ID'),
    references: getHeader('References'),
    from,
    to: getHeader('To'),
    cc: getHeader('Cc'),
    replyTo: getHeader('Reply-To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    senderName: sender.name || sender.email,
    senderEmail: sender.email,
    body,
    isHtmlBody: Boolean(html),
    snippet: message.snippet || '',
    isUnread: (message.labelIds || []).includes('UNREAD'),
    labelIds: message.labelIds || [],
    internalDate: message.internalDate,
    attachments: extractAttachments(message.payload),
  };
}

/**
 * Download an attachment and return as Uint8Array.
 */
export async function downloadAttachment(accessToken, messageId, attachmentId) {
  const data = await gmailFetch(
    `/messages/${messageId}/attachments/${attachmentId}`,
    accessToken
  );

  const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

/** Does this HTML fragment contain any visible text? */
function hasVisibleText(html) {
  return (
    String(html || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim().length > 0
  );
}

/**
 * Markers that reliably start the quoted portion of a reply.
 *
 * Each one is anchored to real structure rather than loose prose — an
 * unanchored "On ... wrote:" match will happily eat the body of a newsletter
 * that merely contains those words.
 */
const QUOTE_MARKERS = [
  // Gmail wraps quoted history in a div.gmail_quote.
  /<div[^>]*class="[^"]*\bgmail_quote\b[^"]*"[^>]*>/i,
  // Outlook / Office 365.
  /<div[^>]*id="?appendonsend"?[^>]*>/i,
  /<hr[^>]*id="?stopSpelling"?[^>]*>/i,
  /-{2,}\s*Original Message\s*-{2,}/i,
  // "On <date> <someone> wrote:" — only at the start of a line, length-capped,
  // and only when a quote block or line break follows it.
  /(?:^|<br\s*\/?>)\s*On\s[^<>]{0,200}?wrote:\s*(?=<br\s*\/?>|<blockquote)/i,
  // A run of plain-text quote markers at the start of a line.
  /(?:^|<br\s*\/?>)\s*&gt;\s/i,
];

/**
 * Split a message body into the new content and the quoted history beneath it.
 *
 * Nothing is ever discarded: `visible + quoted` reconstructs the original. If
 * we can't find a boundary we're confident about — or splitting would leave
 * nothing visible — the whole body is returned as visible.
 */
export function splitQuotedText(html) {
  if (!html) return { visible: '', quoted: '' };

  let idx = -1;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(html);
    if (match && (idx === -1 || match.index < idx)) idx = match.index;
  }

  // A <blockquote> counts as quoted history only when there is content above
  // it. Plenty of marketing mail wraps its entire body in one.
  const blockquote = /<blockquote[\s>]/i.exec(html);
  if (
    blockquote &&
    (idx === -1 || blockquote.index < idx) &&
    hasVisibleText(html.slice(0, blockquote.index))
  ) {
    idx = blockquote.index;
  }

  if (idx <= 0) return { visible: html, quoted: '' };

  const visible = html.slice(0, idx);
  if (!hasVisibleText(visible)) return { visible: html, quoted: '' };

  return { visible, quoted: html.slice(idx) };
}

/**
 * Extract attachments from message payload.
 */
function extractAttachments(payload) {
  const attachments = [];

  function findAttachments(parts) {
    if (!parts) return;

    parts.forEach((part) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size,
          attachmentId: part.body.attachmentId,
        });
      }

      if (part.parts) {
        findAttachments(part.parts);
      }
    });
  }

  findAttachments(payload?.parts);
  return attachments;
}

/**
 * Recursively pull the HTML and plain-text bodies out of a message payload.
 */
export function extractBody(payload) {
  if (!payload) return { html: null, text: null };

  const mime = payload.mimeType || '';

  if (payload.body?.data && !payload.filename) {
    const decoded = decodeBase64Url(payload.body.data);
    if (mime.startsWith('text/html')) return { html: decoded, text: null };
    return { html: null, text: decoded };
  }

  const htmlPart = findPart(payload.parts, 'text/html');
  const textPart = findPart(payload.parts, 'text/plain');

  return {
    html: htmlPart?.body?.data ? decodeBase64Url(htmlPart.body.data) : null,
    text: textPart?.body?.data ? decodeBase64Url(textPart.body.data) : null,
  };
}

/**
 * Find the first part with a specific MIME type, skipping attachments.
 */
function findPart(parts, mimeType) {
  if (!parts) return null;
  for (const part of parts) {
    if (part.mimeType === mimeType && !part.filename && part.body?.data) return part;
    if (part.parts) {
      const found = findPart(part.parts, mimeType);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Decode base64url encoded string.
 */
function decodeBase64Url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return atob(base64);
  }
}

/**
 * Map a thread's label IDs onto the category tab it belongs to.
 */
export function categoryFromLabels(labelIds = []) {
  for (const [label, category] of Object.entries(CATEGORY_LABELS)) {
    if (labelIds.includes(label)) return category;
  }
  // Gmail omits CATEGORY_PERSONAL on plenty of mail; anything without another
  // category label lands in Primary, which is what the Gmail UI does too.
  return 'primary';
}

/**
 * Format a thread for display, extracting key info from its messages.
 */
export function formatThread(thread) {
  const messages = (thread.messages || []).map(parseMessage);
  const lastMessage = messages[messages.length - 1];
  const firstMessage = messages[0];

  const participants = [];
  const participantEmails = [];
  const seen = new Set();
  messages.forEach((m) => {
    const key = (m.senderEmail || m.senderName || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    participants.push(m.senderName || m.senderEmail);
    participantEmails.push(m.senderEmail);
  });

  const labelIds = [...new Set(messages.flatMap((m) => m.labelIds))];

  return {
    id: thread.id,
    subject: firstMessage?.subject || '(no subject)',
    snippet: lastMessage?.snippet || '',
    lastMessage,
    firstMessage,
    messages,
    participants,
    participantEmails,
    participantCount: participants.length,
    lastSenderName: lastMessage?.senderName || '',
    lastSenderEmail: lastMessage?.senderEmail || '',
    hasUnread: messages.some((m) => m.isUnread),
    isStarred: labelIds.includes('STARRED'),
    labelIds,
    category: categoryFromLabels(labelIds),
    date: lastMessage?.internalDate
      ? new Date(parseInt(lastMessage.internalDate, 10))
      : new Date(),
  };
}
