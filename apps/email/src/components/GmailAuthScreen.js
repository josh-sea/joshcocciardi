import React from 'react';

export default function GmailAuthScreen({ userEmail, onAuthorizeGmail, onSignOut, loading }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M22 4L12 13L2 4" />
          </svg>
        </div>
        <h1 className="auth-title">Authorize Gmail</h1>
        <p className="auth-subtitle">
          Signed in as {userEmail}
        </p>
        <p className="auth-subtitle" style={{ marginTop: '8px', marginBottom: '24px' }}>
          You need to authorize Gmail access to view your messages
        </p>
        
        <button
          className="auth-button"
          onClick={onAuthorizeGmail}
          disabled={loading}
        >
          {loading ? 'Authorizing...' : 'Authorize Gmail Access'}
        </button>

        <button
          type="button"
          className="auth-toggle"
          onClick={onSignOut}
          disabled={loading}
          style={{ marginTop: '16px' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}