jest.mock('../config/firebase', () => ({ app: {}, db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
}));
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));

/**
 * Fake Google Identity Services. Records every client created and every
 * token request, and lets a test settle a specific request by hand.
 */
function installFakeGIS() {
  const clients = [];

  global.window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => {
          const client = {
            config,
            requests: [],
            requestAccessToken: (opts) => client.requests.push(opts),
          };
          clients.push(client);
          return client;
        },
        revoke: jest.fn(),
      },
    },
  };

  return clients;
}

describe('token requests', () => {
  let clients;
  let auth;

  beforeEach(() => {
    // The module keeps in-flight request state, and several of these tests
    // deliberately leave a request unsettled — so each one gets a fresh copy.
    jest.resetModules();
    clients = installFakeGIS();
    auth = require('./auth');
    auth.initGIS();
  });

  afterEach(() => {
    delete global.window.google;
  });

  const { requestAuth, refreshAccessToken } = {
    requestAuth: (...args) => auth.requestAuth(...args),
    refreshAccessToken: (...args) => auth.refreshAccessToken(...args),
  };
  const isGISReady = () => auth.isGISReady();

  it('reports ready once initialized', () => {
    expect(isGISReady()).toBe(true);
  });

  it('asks for consent with a prompt', () => {
    requestAuth().catch(() => {});
    expect(clients).toHaveLength(1);
    expect(clients[0].requests).toEqual([{ prompt: 'consent' }]);
  });

  it('refreshes silently with no prompt', () => {
    refreshAccessToken().catch(() => {});
    expect(clients[0].requests).toEqual([{ prompt: '' }]);
  });

  it('shares one request between concurrent silent refreshes', () => {
    const a = refreshAccessToken();
    const b = refreshAccessToken();
    a.catch(() => {});
    b.catch(() => {});

    expect(a).toBe(b);
    expect(clients).toHaveLength(1);
  });

  // The regression this file exists for. A consent click that joins an
  // in-flight silent refresh never opens a popup at all, and surfaces that
  // refresh's failure — which read as "failed to open popup" on the
  // authorize screen.
  it('never attaches a consent click to an in-flight silent refresh', () => {
    const silent = refreshAccessToken();
    silent.catch(() => {});

    const consent = requestAuth();
    consent.catch(() => {});

    expect(consent).not.toBe(silent);
    expect(clients).toHaveLength(2);
    expect(clients[1].requests).toEqual([{ prompt: 'consent' }]);
  });

  it('gives each request its own client so a late reply cannot cross over', async () => {
    const first = refreshAccessToken();
    first.catch(() => {});
    const second = requestAuth();

    // The abandoned silent request reports failure after the consent request
    // has started; the consent request must be untouched by it.
    clients[0].config.error_callback({ type: 'popup_closed' });
    await expect(first).rejects.toThrow(/closed/i);

    let settled = false;
    second.then(() => { settled = true; }).catch(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('explains a blocked popup in terms the user can act on', async () => {
    const request = requestAuth();
    clients[0].config.error_callback({ type: 'popup_failed_to_open' });

    await expect(request).rejects.toThrow(/blocked the Google sign-in popup/i);
  });

  it('surfaces a closed popup distinctly', async () => {
    const request = requestAuth();
    clients[0].config.error_callback({ type: 'popup_closed' });

    await expect(request).rejects.toThrow(/closed before finishing/i);
  });

  it('rejects when GIS was never initialized', async () => {
    jest.resetModules();
    const uninitialized = require('./auth');
    await expect(uninitialized.requestAuth()).rejects.toThrow(/not initialized/i);
  });
});

describe('isTokenValid', () => {
  const { isTokenValid } = require('./auth');

  it('accepts a token with plenty of life left', () => {
    expect(isTokenValid({ access_token: 'x', expires_at: Date.now() + 3600000 })).toBe(true);
  });

  it('rejects one inside the five-minute buffer', () => {
    expect(isTokenValid({ access_token: 'x', expires_at: Date.now() + 60000 })).toBe(false);
  });

  it('rejects incomplete tokens', () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid({ access_token: 'x' })).toBe(false);
    expect(isTokenValid({ expires_at: Date.now() + 3600000 })).toBe(false);
  });
});
