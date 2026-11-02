export type ReplyIntent = "confirm" | "cancel" | null;

// The reminders ask for 1 or 2 in either language. Beside the numbers, the same
// plain words in English and Albanian ("po" = yes, "konfirmo" = confirm,
// "anulo" = cancel). "no"/"jo" stay out on purpose: a bare no can answer
// something else, and a misread reply cancels a real visit.
const CONFIRM_TOKENS = new Set(["1", "yes", "confirm", "po", "konfirmo"]);
const CANCEL_TOKENS = new Set(["2", "cancel", "anulo"]);

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
