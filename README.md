# RTL Fix for VS Code AI Chat Agents

**Fix Hebrew, Arabic, and RTL text rendering in all VS Code AI chat panels.**

Supports: **Claude Code · GitHub Copilot Chat · ChatGPT / Codex · Gemini Code Assist**

---

## The Problem

VS Code AI agents (Claude Code, Copilot, Codex, Gemini) render Hebrew and Arabic text incorrectly:

- Letters appear **in reverse order within words** (e.g., "לבטל" shows as "לטבל")
- Text is **left-aligned** instead of right-aligned
- Mixed Hebrew/English paragraphs are **displayed backwards**

The root cause: **Claude Code v2.1.63+** added a global CSS rule `*{direction:ltr;unicode-bidi:bidi-override}` that forces all text into LTR mode and overrides the browser's built-in bidirectional text algorithm.

---

## The Solution

A lightweight local VS Code extension (`rtl-ai-chats`) that:

1. **Injects an RTL script** into the webview JS files of Claude Code, ChatGPT/Codex, and Gemini Code Assist
2. **Injects RTL CSS** into VS Code's `workbench.html` for GitHub Copilot Chat
3. **Auto-detects** which paragraphs contain Hebrew/Arabic and applies `direction: rtl` to them
4. **Keeps code blocks LTR** (pre/code elements are never affected)
5. **Monitors streaming responses** via MutationObserver so RTL is applied as text arrives
6. **Alerts you on startup** if an extension update removed the injection, with a one-click "Fix Now" button

---

## Installation

### Step 1 — Copy the extension

Copy the `rtl-ai-chats-1.0.0` folder into your VS Code extensions directory:

**Windows:**
```
%USERPROFILE%\.vscode\extensions\rtl-ai-chats-1.0.0\
```

**macOS / Linux:**
```
~/.vscode/extensions/rtl-ai-chats-1.0.0/
```

The folder should contain these 5 files:
```
rtl-ai-chats-1.0.0/
├── package.json
├── extension.js
├── rtl-script.js
├── rtl-workbench.css
└── fix-rtl.js
```

### Step 2 — Run the injection script

Open a terminal and run:

**Windows:**
```cmd
node "%USERPROFILE%\.vscode\extensions\rtl-ai-chats-1.0.0\fix-rtl.js"
```

**macOS / Linux:**
```bash
node ~/.vscode/extensions/rtl-ai-chats-1.0.0/fix-rtl.js
```

You should see output like:
```
[INJ]  Claude Code: RTL script injected
[INJ]  ChatGPT/Codex: RTL script injected
[INJ]  Gemini Code Assist: RTL script injected
[INJ]  Copilot Chat (workbench.html): RTL CSS injected

Done!
Reload VS Code window to activate RTL: Ctrl+Shift+P → "Developer: Reload Window"
```

### Step 3 — Reload VS Code

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run:
```
Developer: Reload Window
```

That's it. RTL now works in all 4 AI agents.

---

## How it works

### For Claude Code, ChatGPT/Codex, Gemini Code Assist

These agents render inside **isolated webview iframes**. The only way to affect their rendering is to append JavaScript directly to their webview bundle file.

`fix-rtl.js` appends `rtl-script.js` to the end of each agent's main JS file. The script:

1. **Neutralizes the bidi-override CSS** with:
   ```css
   * { direction: inherit !important; unicode-bidi: embed !important; }
   ```
   This restores normal bidirectional text rendering.

2. **Detects RTL content** by checking each chat message element's full `textContent` for Hebrew/Arabic Unicode characters.

3. **Applies RTL styling** to message containers that contain RTL text:
   ```js
   el.style.direction = 'rtl';
   el.style.textAlign = 'right';
   ```

4. **Watches for new messages** using `MutationObserver`, so streaming responses are processed as they appear.

### For GitHub Copilot Chat

Copilot Chat uses VS Code's native Chat API and renders in the **main VS Code window DOM** (not a webview). The fix is injected as a `<style>` tag in VS Code's `workbench.html`:

```css
.chat-markdown-part p, .rendered-markdown p, ... {
    unicode-bidi: plaintext;  /* browser auto-detects RTL/LTR per paragraph */
    text-align: start;        /* right-aligns RTL paragraphs */
}
```

`unicode-bidi: plaintext` tells the browser to determine each paragraph's direction from its first strong directional character — so Hebrew paragraphs are automatically right-to-left.

---

## After extension updates

When VS Code or an AI agent extension updates, it may overwrite the injected files. The VS Code extension (`extension.js`) checks on every startup and shows a warning:

> **RTL support missing for: Claude Code. Fix Now | Ignore**

Click **Fix Now** to re-inject. Or run the script manually:

```bash
node ~/.vscode/extensions/rtl-ai-chats-1.0.0/fix-rtl.js
```

You can also run these VS Code commands (`Ctrl+Shift+P`):
- `RTL: Re-inject into All AI Agents` — re-injects everything
- `RTL: Show Injection Status` — shows which agents have RTL active

---

## Restore original files

To undo all injections and restore original files:

```bash
node ~/.vscode/extensions/rtl-ai-chats-1.0.0/fix-rtl.js --restore
```

Backups are saved automatically the first time injection runs (e.g., `index.js.rtl-backup`).

---

## Preview (dry run)

To see what the script would do without modifying any files:

```bash
node ~/.vscode/extensions/rtl-ai-chats-1.0.0/fix-rtl.js --dry-run
```

---

## Supported agents

| Agent | Method | Supported selectors |
|-------|--------|---------------------|
| Claude Code | Webview JS injection | `[class*="timelineMessage_"]`, `[class*="userMessageContainer_"]`, `[class*="markdownContent_"]` |
| ChatGPT / Codex | Webview JS injection | `.text-size-chat`, `[class*="prose"]`, `[class*="chatMessage"]` |
| Gemini Code Assist | Webview JS injection | `app-message`, `ncfc-message`, `app-ai-chat` |
| GitHub Copilot Chat | workbench.html CSS | `.chat-markdown-part`, `.rendered-markdown` |

---

## Requirements

- VS Code 1.85+
- Node.js (any recent version — used only to run `fix-rtl.js`)
- One of the supported AI agent extensions installed

---

## FAQ

**Q: Do I need to disable any other extension?**
No. This extension is standalone and does not conflict with any other extension.

**Q: Will this affect non-Hebrew/Arabic text?**
No. LTR text (English, numbers, code) is unaffected. The script only applies `direction: rtl` to elements that actually contain Hebrew or Arabic characters.

**Q: Does this work with VS Code on macOS/Linux?**
The webview injection works on all platforms. The workbench.html path for Copilot may differ on macOS/Linux — check `fix-rtl.js` and update the `findWorkbench()` function if needed.

**Q: What if `fix-rtl.js` says `[SKIP] ... file not found`?**
The extension is not installed, or is installed in a different directory. Check that the AI agent extension is installed and look for its folder in `~/.vscode/extensions/`.

