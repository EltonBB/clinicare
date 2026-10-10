/** Matches Expo's supported bracketed token formats without accepting arbitrary text. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(value);
}
