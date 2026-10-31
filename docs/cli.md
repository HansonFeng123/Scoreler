# Scoreler CLI — 1.4

The optional terminal component is included with Scoreler 1.4.

In Scoreler Settings, choose **Install CLI**. The optional command is installed from the CLI component included with Scoreler; no separate account or provider configuration is needed. Open a new terminal or PowerShell from Start and run:

```powershell
scoreler
```

The terminal starts Scoreler if necessary. Chat occupies the left side, with today's local calendar on the right. Small terminals show a compact header; `/today` displays the day's full agenda. PgUp/PgDn scroll the conversation. Scroll the mouse wheel over the calendar, or use Alt+Up/Down, to browse its agenda without moving the chat. The terminal and app use the same agent, configured models, authorized study materials, study tools and saved conversation records. Changes to the selected model or reasoning level also apply in the app.

The CLI component follows the ready Scoreler update on each launch. Restart the terminal after an app update. Removing the terminal command from Settings removes only its launcher and user PATH entry.

## Commands

| Command | Action |
| --- | --- |
| `/new` | Create a saved conversation. |
| `/model` | Open the model picker. Use ↑/↓ and Enter; Esc cancels. |
| `/model 2` | Select a listed model. `provider/model-id` also works. |
| `/reasoning` | Open the supported reasoning-level picker. Use ↑/↓ and Enter. |
| `/reasoning high` | Select a supported level; `default` restores the model default. |
| `/image "C:\path\题目.png"` | Attach an image to the next message. PNG, JPEG, WebP and GIF are accepted, up to 10 MB each. |
| `/file "C:\path\材料.pdf"` | Import and attach a study document. Supports PDF, DOCX, XLSX, PPTX, Markdown, text, CSV and JSON, up to 15 MB per file. |
| `/detach` | Clear pending attachments. |
| `/instructions text` | Set instructions for subsequent messages in this conversation; omit text to clear. |
| `/sessions` | List saved conversations. |
| `/resume id` | Reopen a listed conversation. |
| `/today` | Refresh and show today's agenda. |
| `/answer text` | Answer an agent question. |
| `/allow`, `/deny` | Respond to the currently displayed tool permission request; allow applies once. |
| `/stop` | Stop the active response. Ctrl+C also stops a response. |
| `/help`, `/exit` | Show commands or exit. Ctrl+C exits when idle. |

Chinese input uses Pi's Unicode-aware terminal editor. Alt+V saves a clipboard screenshot locally and inserts its quoted path into the input (a copied image file path also works). On Send, only pasted image paths still present in the input are attached; local paths are removed from the prompt sent to the model. Temporary screenshot files are removed when the CLI exits. Ctrl+V pastes a screenshot when the native clipboard supports image transfer, otherwise text. `/image` works in terminals without image clipboard integration. Windows terminals may show the attachment label instead of rendering an inline picture; the image is still sent to a model that advertises image input. Vision and tool execution require model support. The combined image payload is limited to 15 MB, with at most five images and eight study files per message.

## Account and privacy

The terminal connects to Scoreler through a local per-launch authenticated pipe. The pipe connection secret stays in the local profile and is distinct from provider credentials. The terminal receives model metadata, selected conversation content and the daily calendar; it receives no provider API keys or ChatGPT access/refresh tokens. Those remain protected by the existing desktop integration.

Sending a CLI message authorizes that user chat turn and its tool follow-ups in the same manner as the app. ChatGPT's connected account, supported models, consent preferences, subscription limits, proxy preference and disconnect controls remain managed by Scoreler. Sign-in is completed in the official browser flow through app Settings. The CLI has no general HTTP forwarding command and no separate background-inference permission. Cloud providers receive the instructions, conversation context, images, imported material excerpts and tool results needed for the request.

The CLI currently uses the desktop host, so it is not a standalone server or a replacement for account setup. Some generated content (drawing notes, videos and rich previews) is best reviewed in the app. Multiple agent questions can be answered with `/answer`; the reply is sent as a user chat answer to the question block.

## Open-source credits

Scoreler uses the existing `@earendil-works/pi-coding-agent`, `pi-ai` and `pi-tui` 1.1 packages from [Pi](https://github.com/earendil-works/pi), under MIT terms. The terminal reuses Pi's editor, Markdown rendering, clipboard support, Unicode width handling and fullscreen terminal infrastructure. Scoreler supplies the local transport, launcher, calendar layout, commands and Settings integration. See [third-party notices](../THIRD_PARTY_NOTICES.md).

The desktop refreshes recent conversations and an idle open conversation every five seconds and on window focus. CLI `/resume` reads the same saved history. An authentication error from a configured provider must be resolved in Settings or by choosing another valid provider; it does not indicate that the CLI uses a separate chat service.
