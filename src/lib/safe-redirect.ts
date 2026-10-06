const SAME_ORIGIN = "http://same-origin.invalid";

/**
 * The same-origin path to send someone to after signing in, or `fallback`.
 *
 * Judged by the URL a browser would actually build, not by the raw string:
 * browsers delete ASCII tabs and newlines from a URL and read "\" as "/", so
 * "/\t/evil.com" or "/\\evil.com" pass a naive "starts with one slash" check
 * yet open https://evil.com (an open redirect for phishing links like
 * /login?next=%2F%09%2Fevil.com). Any control character or backslash is
 * refused outright, and what's left must resolve to this origin.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) {
    return fallback;
  }

  let url: URL;
  try {
    url = new URL(next, SAME_ORIGIN);
  } catch {
    return fallback;
  }

  return url.origin === SAME_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : fallback;
}
