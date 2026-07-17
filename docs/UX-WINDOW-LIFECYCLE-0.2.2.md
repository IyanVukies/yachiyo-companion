# UX and window lifecycle architecture - 0.2.2

## Root cause and UX analysis

The original frameless main window was created as non-minimizable and absent from the taskbar. The custom minus button only hid it, while tray single-click toggled visibility and `show()` did not restore a natively minimized window. This made the app feel as if it moved behind other windows and left no consistently reachable foreground control.

Chat was rendered as an absolute sheet over the companion stage. Although one `messages` array already existed in `App`, the chat component owned its own draft, so closing the sheet discarded input and the large sheet covered the avatar. Avatar scale was persisted, but no normalized position or drag-edit state existed.

Hermes SSE deltas were forwarded before final structured parsing. A `<yachiyo_control>` opening/closing tag split between chunks therefore reached renderer state before the final response could replace it. The same raw partial path fed retry history, copy, and voice input.

## Shared presentation state

`ConversationState` is the only owner of the active thread ID, message array, draft, active request, streaming text, retry/error state, unread response, and selected presentation mode. Companion Mode and Full Chat are two renderers over that state; switching mode is a reducer action only and never starts, cancels, or recreates Hermes.

Hermes and voice subscriptions remain mounted above the presentation branch. The existing avatar reducer and voice queue remain the only owners of expression, TTS playback, and lip-sync. Full Chat does not construct a second Live2D, Hermes client, TTS queue, or sidecar.

## Avatar transform

Avatar transform is stored as normalized `scale`, `positionX`, and `positionY` values with a `bottom-center` anchor. Pointer deltas are converted relative to the current stage dimensions and clamped before rendering or persistence. The CSS translation range is intentionally bounded so part of the avatar remains reachable even at the normalized extremes. Window resize reuses the normalized transform and reapplies the safety clamp.

Edit mode captures drag gestures at the transform wrapper and suppresses avatar activation, avoiding conflict with click-to-chat. Lock, Done, Escape, center, reset position, and reset-all actions share the same transform helpers.

## Window ownership and lifecycle

The Electron main process owns both BrowserWindows, tray, global shortcuts, display validation, settings persistence, and shutdown. The renderer requests actions through validated IPC only.

- `DesktopWindowController` applies the configured minimize and close policy, restores a minimized window before focusing it, and preserves the selected presentation mode.
- `FloatingLauncherController` owns a small transparent static renderer. Its preload exposes only restore, open-chat, bounded pointer movement, context menu, and status subscription.
- Launcher placement stores display ID, final X/Y, and snapped edge. Startup and display changes validate the display, clamp to its work area, and use a right-center primary-display fallback if the saved monitor disappeared.
- Launcher always-on-top is independent from the optional main-window always-on-top flag and uses a normal floating level without aggressive fullscreen visibility.
- Tray, launcher, shortcut, and second-instance restore all call the same main-window restore path.

## Control-envelope boundary

The main-process Hermes transport applies a stateful fail-closed filter before emitting visible deltas. It retains any suffix that could be the prefix of an opening or closing control tag until a later chunk disambiguates it. Envelope payloads are never emitted as text; completed JSON payloads are parsed through the existing avatar metadata allowlist. Incomplete control content is dropped at stream completion.

Only canonical visible text enters renderer messages, outgoing history, clipboard, TTS/RVC, or any optional future conversation persistence.

## Security and resource constraints

The launcher renderer has no API for Hermes requests, settings secrets, conversation messages, assets, TTS, or Live2D. Main renderer IPC continues to validate the trusted sender and payload schema. There remains one Hermes runtime, one conversation store, one voice sidecar, and at most one Live2D model instance.
