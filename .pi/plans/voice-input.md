# Voice Input for Pi Coding Agent — Implementation Plans

> Created: 2026-04-07
> Branch: voice-control
> Status: Planning — not yet implemented

## Context

Adding voice input to the pi coding agent so prompts can be spoken instead of typed. Research identified multiple approaches ranging from installing existing community extensions to building a full-featured hybrid solution.

Pi's extension system supports: custom tools (`pi.registerTool()`), keyboard shortcuts (`pi.registerShortcut()`), TUI overlays (`ctx.ui.custom()`), status indicators (`ctx.ui.setStatus()`), widgets (`ctx.ui.setWidget()`), and custom editors (`ctx.ui.setEditorComponent()`).

---

## Plan A: Install Existing Community Extension (`pi-listen`)

**Effort:** ~10 min | **Risk:** Low | **Dependencies:** Deepgram API key or local model download

Two community extensions exist:

- [yukukotani/pi-voice](https://github.com/yukukotani/pi-voice) — headless daemon, push-to-talk via global hotkey
- [codexstar69/pi-listen](https://github.com/codexstar69/pi-listen) — full pi extension, in-editor integration

**pi-listen** is the most mature:

```bash
pi install npm:@codexstar/pi-listen
```

### How it works

- **Hold SPACE** (≥1.2s) → recording starts with pre-recording buffer
- **Release** → tail recording (1.5s), then transcribe
- Text appears in pi's editor, ready to send
- Also: `Ctrl+Shift+V` toggle recording, `/voice dictate` for continuous mode

### Backend options

| Backend                       | Latency             | Requires                    | Cost             |
| ----------------------------- | ------------------- | --------------------------- | ---------------- |
| Deepgram (cloud)              | Real-time streaming | API key                     | $200 free credit |
| 19 local models (sherpa-onnx) | 2–10s after release | Model download (43MB–1.8GB) | Free forever     |

### Key features

- Settings panel (`/voice-settings`) with 4 tabs
- 56+ languages
- Pre-recording (never miss first word)
- Tail recording (catches last words)
- Device-aware model recommendations
- Handy model import
- Voice commands

### Pros / Cons

- ✅ Works today, zero coding, actively maintained, rich feature set
- ❌ External dependency, may not match exact preferences

---

## Plan B: Build a Custom Pi Extension with Local Whisper

**Effort:** 2–4 days | **Risk:** Medium | **Dependencies:** `sherpa-onnx` (Node/WASM) or `faster-whisper` (Python)

A pi extension in `~/.pi/agent/extensions/voice/` that does everything in-process.

### Directory structure

```
~/.pi/agent/extensions/voice/
├── package.json        # deps: sherpa-onnx or faster-whisper
├── index.ts            # Main extension entry
├── recorder.ts         # Audio capture (sox/ffmpeg/arecord)
├── transcriber.ts      # STT engine abstraction
└── ui.ts               # TUI overlay + status indicator
```

### Architecture

```typescript
// index.ts — core hooks
export default function (pi: ExtensionAPI) {
  pi.registerShortcut(Key.ctrlAlt("v"), {
    description: "Push-to-talk voice input",
    handler: async (ctx) => toggleRecording(ctx),
  });

  pi.registerCommand("voice", {
    description: "Voice control (on/off/dictate/test)",
    handler: async (args, ctx) => {
      /* ... */
    },
  });
}
```

### Implementation concerns

| Concern       | Approach                                                               |
| ------------- | ---------------------------------------------------------------------- |
| Audio capture | Shell out to `rec` (sox) or `ffmpeg` to WAV buffer                     |
| STT engine    | `sherpa-onnx` (Node/WASM) or spawn `faster-whisper` Python subprocess  |
| Push-to-talk  | `registerShortcut` for hold detection; or `Ctrl+Shift+V` toggle        |
| Live preview  | `ctx.ui.setWidget("voice", [...transcriptLines])` above editor         |
| Submit        | `pi.sendUserMessage(transcript)` or `ctx.ui.setEditorText(transcript)` |
| Status        | `ctx.ui.setStatus("voice", "🎙️ listening...")` in footer               |
| State         | `pi.appendEntry("voice-state", {...})` for session persistence         |

### STT engine options

| Engine                             | Speed                  | Languages | Setup                     |
| ---------------------------------- | ---------------------- | --------- | ------------------------- |
| sherpa-onnx (Node)                 | Fast, in-process       | Up to 57  | `npm install sherpa-onnx` |
| faster-whisper (Python subprocess) | 4x faster than whisper | 99+       | Python + pip              |
| whisper.cpp (binary)               | Very fast, C++         | 99+       | Pre-built binary          |

### Top local models by quality

| Model             | Accuracy | Speed | Size   | Languages        | Notes                                |
| ----------------- | -------- | ----- | ------ | ---------------- | ------------------------------------ |
| Parakeet TDT v3   | ●●●●○    | ●●●●○ | 671 MB | 25 (auto-detect) | Best overall. WER 6.3%.              |
| Parakeet TDT v2   | ●●●●●    | ●●●●○ | 661 MB | English          | Best English. WER 6.0%.              |
| Whisper Turbo     | ●●●●○    | ●●○○○ | 1.0 GB | 57               | Broadest language support.           |
| Moonshine v2 Tiny | ●●○○○    | ●●●●● | 43 MB  | English          | 34ms latency. Raspberry Pi friendly. |
| SenseVoice Small  | ●●●○○    | ●●●●● | 228 MB | zh/en/ja/ko/yue  | Best for CJK languages.              |

### Pros / Cons

- ✅ Full control, offline-first, deep TUI integration, tailored to workflow
- ❌ More work, sherpa-onnx Node bindings may need troubleshooting

---

## Plan C: External Daemon (TalkType/whis) + Clipboard Bridge

**Effort:** ~1 hour | **Risk:** Low | **Dependencies:** TalkType or whis CLI

Run a system-wide voice daemon that works with pi _and every other app_. No pi extension needed.

### Setup

```bash
# Option 1: TalkType (Python, faster-whisper)
pip install talktype
talktype --setup   # F9 push-to-talk, auto-pastes into focused app

# Option 2: whis (Rust, modern CLI)
cargo install whis-cli
whis setup         # Configurable hotkey, outputs to clipboard
whis start         # Background daemon
whis toggle        # Record → clipboard → paste
```

### How it works

```
[F9 held] → mic recording
[F9 released] → faster-whisper transcribes → text pasted into pi's editor
```

TalkType has smart paste detection (`Ctrl+Shift+V` in terminals, `Ctrl+V` elsewhere).

### SebbaFlow integration — systemd user service

```ini
# ~/.config/systemd/user/talktype.service
[Unit]
Description=TalkType Voice Dictation
After=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/local/bin/talktype
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now talktype
```

### Optional: minimal pi extension for status only

```typescript
// Shows mic status in pi's footer — watches talktype status file
pi.on("session_start", async (_event, ctx) => {
  // Watch ~/.config/talktype/status for "recording" / "idle"
  // Update ctx.ui.setStatus("voice", ...) accordingly
});
```

### Pros / Cons

- ✅ Simplest, works everywhere (not just pi), battle-tested tools, system service
- ❌ No deep pi integration, relies on clipboard/paste, no live preview in pi

---

## Plan D: Full-Featured Hybrid (Cloud Streaming + Local Fallback + Voice Commands)

**Effort:** 1–2 weeks | **Risk:** Higher | **Dependencies:** Deepgram API + local model

The most ambitious plan — a first-class voice experience with live streaming, voice commands, and cloud/local hybrid.

### Directory structure

```
~/.pi/agent/extensions/voice/
├── index.ts              # Extension entry, event wiring
├── recorder.ts           # Cross-platform audio capture
├── cloud-stt.ts          # Deepgram WebSocket streaming
├── local-stt.ts          # sherpa-onnx offline fallback
├── commands.ts           # Voice command parser ("hey pi, compact")
├── settings-panel.ts     # /voice-settings overlay (4 tabs)
├── waveform.ts           # Live audio visualization widget
└── package.json
```

### Feature matrix

| Feature                   | Implementation                                                                    |
| ------------------------- | --------------------------------------------------------------------------------- |
| Live streaming transcript | Deepgram WebSocket → `ctx.ui.setWidget()` with partial results                    |
| Offline fallback          | If no internet, auto-switch to sherpa-onnx batch mode                             |
| Voice commands            | "hey pi, compact" → `/compact`, "switch model" → `/model`, "commit" → commit flow |
| Waveform visualization    | Custom TUI component showing mic level in footer                                  |
| Settings panel            | `SelectList` overlay with backend/language/model/hotkey tabs                      |
| Hold SPACE recording      | Intercept space via custom editor component (like `modal-editor.ts`)              |
| Continuous dictation      | `/voice dictate` for long-form, VAD-based sentence boundary                       |
| Typing cooldown           | Ignore voice activation within 400ms of keyboard input                            |

### Push-to-talk via SPACE hold

```typescript
class VoiceAwareEditor extends CustomEditor {
  private spacePressedAt = 0;

  handleInput(data: string): void {
    if (matchesKey(data, Key.space)) {
      this.spacePressedAt = Date.now();
      return; // Don't type space yet
    }
    // If space held > 1.2s → start recording
    // On release → finalize and inject transcript
    super.handleInput(data);
  }
}
```

### Voice command grammar

```
"hey pi" / "okay pi" → activate voice command mode
  "compact"           → /compact
  "model [name]"      → /model <name>
  "commit"            → trigger commit skill
  "reload"            → /reload
  "new session"       → /new
  "stop"              → abort current turn
```

### Pros / Cons

- ✅ Best UX, competitive with Claude Code/Codex native voice, fully integrated
- ❌ Most work, Deepgram dependency for streaming, complex state machine

---

## Recommendation

| Plan                   | Time      | Offline       | Live Streaming | pi Integration | Best For                    |
| ---------------------- | --------- | ------------- | -------------- | -------------- | --------------------------- |
| **A: pi-listen**       | 10 min    | ✅            | ✅ (Deepgram)  | ✅ Native ext  | Trying voice immediately    |
| **B: Custom ext**      | 2–4 days  | ✅            | ❌ (batch)     | ✅ Deep        | Learning + customization    |
| **C: TalkType daemon** | 1 hour    | ✅            | ❌             | ❌ (clipboard) | System-wide dictation       |
| **D: Full hybrid**     | 1–2 weeks | ✅ (fallback) | ✅ (cloud)     | ✅ Deepest     | Production voice experience |

**Suggested path:** Start with **Plan A** (pi-listen) to validate the workflow, then evolve toward **Plan B** or **Plan D** for deeper integration. Add **Plan C** alongside if system-wide voice is desired.

---

## Research Sources

- [yukukotani/pi-voice](https://github.com/yukukotani/pi-voice) — Headless voice daemon for pi
- [codexstar69/pi-listen](https://github.com/codexstar69/pi-listen) — Full pi voice extension
- [collabora/WhisperLive](https://github.com/collabora/WhisperLive) — Real-time Whisper server
- [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) — 4x faster Whisper
- [frankdierolf/whis](https://github.com/frankdierolf/whis) — Rust CLI voice-to-text
- [lmacan1/talktype](https://github.com/lmacan1/talktype) — Push-to-talk terminal dictation
- Pi extension docs: `/var/home/sebas/.local/share/mise/installs/pi/0.65.2/docs/extensions.md`
- Pi TUI docs: `/var/home/sebas/.local/share/mise/installs/pi/0.65.2/docs/tui.md`
