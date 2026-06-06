// Decode a Google ID-token (JWT) payload client-side to read profile claims
// (sub, name, email, picture). No signature verification — the credential is
// delivered directly by Google Identity Services over HTTPS; verify it
// server-side if you ever gate anything sensitive on it.
export function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
