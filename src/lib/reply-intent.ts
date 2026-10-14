export type ReplyIntent = "confirm" | "cancel" | null;

// English only for now — Albanian/common equivalents are deferred (this
// plan's Deviation 1): guessing translations without the owner's review
// risks silently misreading a real patient reply. Extend this list, don't
// replace the matching strategy, when real translations are supplied.
const CONFIRM_TOKENS = new Set(["1", "yes", "confirm"]);
const CANCEL_TOKENS = new Set(["2", "cancel"]);

/**
 * Reads an inbound message body for an exact confirm/cancel reply. Matches
 * only the whole normalized (trimmed, lowercased) body — never a substring —
 * so "1 please also cancel my other appointment" is correctly read as no
 * intent, not confirm. This is a safety property: a false match cancels or
 * confirms a real appointment with no human in the loop.
 */
export function classifyReplyIntent(rawBody: string): ReplyIntent {
  const normalized = rawBody.trim().toLowerCase();

  if (CONFIRM_TOKENS.has(normalized)) return "confirm";
  if (CANCEL_TOKENS.has(normalized)) return "cancel";
  return null;
}
