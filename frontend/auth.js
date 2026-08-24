// Shared "Sign in with Slack" (OpenID Connect) helpers, used by app.js and admin.js.

function currentRedirectUri() {
  // Must exactly match a Redirect URL registered in the Slack app settings.
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function startSlackLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem('slack_oauth_state', state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: window.CONFIG.SLACK_CLIENT_ID,
    scope: 'openid profile',
    redirect_uri: currentRedirectUri(),
    state,
  });
  window.location.href = `https://slack.com/openid/connect/authorize?${params.toString()}`;
}

async function handleSlackRedirectIfPresent() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return;

  const expectedState = sessionStorage.getItem('slack_oauth_state');
  if (state !== expectedState) {
    console.error('OAuth state mismatch — possible CSRF, aborting login.');
    return;
  }

  const res = await fetch(`${window.CONFIG.API_BASE}/api/auth/slack/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri: currentRedirectUri() }),
  });
  const data = await res.json();
  // Clean the ?code=...&state=... out of the URL either way.
  window.history.replaceState({}, '', window.location.pathname);

  if (!res.ok) {
    alert(data.error || '登录失败');
    return;
  }
  localStorage.setItem('session_token', data.token);
  localStorage.setItem('me', JSON.stringify(data.employee));
}

function getSession() {
  const token = localStorage.getItem('session_token');
  const meRaw = localStorage.getItem('me');
  if (!token || !meRaw) return null;
  return { token, me: JSON.parse(meRaw) };
}

function logout() {
  localStorage.removeItem('session_token');
  localStorage.removeItem('me');
  window.location.reload();
}

async function apiFetch(path, options = {}) {
  const session = getSession();
  const res = await fetch(`${window.CONFIG.API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    logout();
    throw new Error('unauthorized');
  }
  return res.json();
}
