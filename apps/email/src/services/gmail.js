const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

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
 * Send an email. Expects raw RFC 2822 formatted email as base64url string.
 */
export async function sendMessage(accessToken, { to, subject, body, threadId, inReplyTo, references }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
  ];

  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  const email = headers.join('\r\n') + '\r\n\r\n' + body;
  const raw = btoa(unescape(encodeURIComponent(email)))
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
  const to = getHeader('To');
  const subject = getHeader('Subject');
  const date = getHeader('Date');
  const messageId = getHeader('Message-ID');

  // Extract sender name and email
  const fromMatch = from.match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
  const senderName = fromMatch ? fromMatch[1].trim() : from;
  const senderEmail = fromMatch ? fromMatch[2].trim() : from;

  // Get body content and attachments
  const body = extractBody(message.payload);
  const snippet = message.snippet || '';
  const isUnread = (message.labelIds || []).includes('UNREAD');
  const attachments = extractAttachments(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    messageId,
    from,
    to,
    subject,
    date,
    senderName,
    senderEmail,
    body,
    snippet,
    isUnread,
    labelIds: message.labelIds || [],
    internalDate: message.internalDate,
    attachments,
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
  
  // Decode base64url data
  const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Strip quoted text from email body to show only the new content.
 * Handles both HTML blockquotes and plain text quote markers.
 */
function stripQuotedText(html) {
  if (!html) return '';

  // Remove Gmail quoted text (usually in a div with class gmail_quote)
  html = html.replace(/<div class="gmail_quote">[\s\S]*?<\/div>/gi, '');
  
  // Remove blockquotes (quoted previous messages)
  html = html.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '');
  
  // Remove "On ... wrote:" patterns and everything after
  html = html.replace(/(<br\s*\/?>|\n)*On\s+.+wrote:[\s\S]*/gi, '');
  
  // Remove lines starting with > (plain text quotes converted to HTML)
  html = html.replace(/^&gt;.*$/gm, '');
  html = html.replace(/^>.*$/gm, '');
  
  // Clean up excessive whitespace
  html = html.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  html = html.trim();
  
  return html;
}

/**
 * Extract attachments from message payload.
 */
function extractAttachments(payload) {
  const attachments = [];
  
  function findAttachments(parts) {
    if (!parts) return;
    
    parts.forEach(part => {
      // Check if this part is an attachment
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size,
          attachmentId: part.body.attachmentId,
        });
      }
      
      // Recurse into nested parts
      if (part.parts) {
        findAttachments(part.parts);
      }
    });
  }
  
  findAttachments(payload.parts);
  return attachments;
}

/**
 * Recursively extract the body content from message payload.
 * Prefers text/html, falls back to text/plain.
 */
function extractBody(payload) {
  if (!payload) return '';

  // Direct body data
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    return stripQuotedText(decoded);
  }

  // Multipart - look through parts
  if (payload.parts) {
    // Try HTML first
    const htmlPart = findPart(payload.parts, 'text/html');
    if (htmlPart?.body?.data) {
      const decoded = decodeBase64Url(htmlPart.body.data);
      return stripQuotedText(decoded);
    }

    // Fall back to plain text
    const textPart = findPart(payload.parts, 'text/plain');
    if (textPart?.body?.data) {
      const text = decodeBase64Url(textPart.body.data);
      const htmlText = text.replace(/\n/g, '<br>');
      return stripQuotedText(htmlText);
    }

    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

/**
 * Find a part with a specific MIME type.
 */
function findPart(parts, mimeType) {
  for (const part of parts) {
    if (part.mimeType === mimeType) return part;
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
 * Format a thread for display, extracting key info from its messages.
 */
export function formatThread(thread) {
  const messages = (thread.messages || []).map(parseMessage);
  const lastMessage = messages[messages.length - 1];
  const firstMessage = messages[0];

  // Collect unique participants
  const participants = new Set();
  messages.forEach((m) => {
    if (m.senderName) participants.add(m.senderName);
  });

  const hasUnread = messages.some((m) => m.isUnread);

  return {
    id: thread.id,
    subject: firstMessage?.subject || '(no subject)',
    snippet: lastMessage?.snippet || '',
    lastMessage,
    firstMessage,
    messages,
    participants: [...participants],
    participantCount: participants.size,
    hasUnread,
    date: lastMessage ? new Date(parseInt(lastMessage.internalDate, 10)) : new Date(),
  };
}
