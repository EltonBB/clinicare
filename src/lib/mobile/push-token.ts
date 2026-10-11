/** Accepts Expo's bracketed and UUID-style tokens without arbitrary text or whitespace. */
export function isExpoPushToken(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  // Expo's UUID-style form permits case-insensitive ASCII alphanumerics.
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(value)
    || /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(value);
}
