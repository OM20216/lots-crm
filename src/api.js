// Thin fetch wrapper; every write carries the signed-in agent's name for the case timeline.
export function currentAgent() {
  try {
    return localStorage.getItem('lots-agent') || '';
  } catch {
    return '';
  }
}

async function request(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-agent': currentAgent() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // sign-in required and the session has ended: the app shows the sign-in page
  if (res.status === 401 && data.signIn && typeof window !== 'undefined') window.dispatchEvent(new Event('lots-signin'));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url, body) => request('DELETE', url, body),
};
