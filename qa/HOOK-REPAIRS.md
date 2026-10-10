# Seven hook repairs

The upgraded lint toolchain surfaced six `react-hooks/set-state-in-effect` defects and one `react-hooks/refs` defect. These repairs have been adapted to the latest main components, preserving the newer global search, reports, onboarding and settings interfaces.

- Record dialog now initializes defaults and resets on a guarded closed→open prop transition before children render; typed values survive unrelated prop refreshes and dialog exit animation remains mounted.
- Inbox hydration failures are separate, selected-thread-scoped state. Their display is derived from whether full history is still missing; ordinary send errors no longer get erased by successful hydration.
- Global search resets short-query results/loading in input/close events. The debounced effect only owns external requests, and aborted response JSON cannot repopulate stale results.
- Mobile breakpoint uses the media-query external store with a false server snapshot, preserving hydration consistency and live change subscriptions.
- Onboarding subscribes to the localStorage draft with an undefined server snapshot. A one-time guarded restore happens after hydration and before child render; persistence waits for restoration. Storage denial does not prevent server progress saving.
- Reports compare the previous default-period/custom-range inputs and reset the custom range in a guarded render transition. Resize observation remains an external effect.
- Settings uses React's effect event to read the latest callback/dirty state exactly once per save-completion tick. Callback identity and subsequent edits do not re-fire completion.

Global search uses the dialog primitive's focus handling and ignores aborted responses, including non-OK responses. Removing the React input autoFocus allows the primitive to capture and restore the original focus target correctly. Staff message receipt completion is invalidated when its tab is removed, preventing delayed Mark-all responses from overwriting a newer badge.

No lint rules or configuration were weakened. Full-source lint, TypeScript and regression results for this integration are recorded separately. Browser preview restart was previously policy blocked; compilation/static checks alone do not establish new UI interaction behavior.
