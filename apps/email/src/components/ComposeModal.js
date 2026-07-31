import React, { useState } from 'react';

export default function ComposeModal({ onClose, onSend }) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const splitAddresses = (value) =>
    value
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean);

  const handleSend = async () => {
    const recipients = splitAddresses(to);
    if (!recipients.length) {
      setError('Add at least one recipient.');
      return;
    }
    if (!body.trim()) {
      setError('Write a message first.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await onSend({
        to: recipients,
        cc: splitAddresses(cc),
        subject: subject.trim() || '(no subject)',
        body: body.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not send that message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="message-modal" onClick={onClose}>
      <div className="compose-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="message-modal-header">
          <div className="message-modal-subject">New message</div>
          <button className="message-modal-close" onClick={onClose} disabled={sending}>
            ✕
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="compose-field">
          <label htmlFor="compose-to">To</label>
          <input
            id="compose-to"
            className="compose-input"
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com, another@example.com"
            disabled={sending}
          />
        </div>

        {showCc ? (
          <div className="compose-field">
            <label htmlFor="compose-cc">Cc</label>
            <input
              id="compose-cc"
              className="compose-input"
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              disabled={sending}
            />
          </div>
        ) : (
          <button className="compose-add-cc" onClick={() => setShowCc(true)}>
            Add Cc
          </button>
        )}

        <div className="compose-field">
          <label htmlFor="compose-subject">Subject</label>
          <input
            id="compose-subject"
            className="compose-input"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending}
          />
        </div>

        <textarea
          className="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          rows={10}
          disabled={sending}
        />

        <div className="compose-actions">
          <button className="auth-toggle" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button className="auth-button" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
