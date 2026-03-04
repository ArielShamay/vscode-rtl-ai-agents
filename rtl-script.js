// RTL AI Chats (injected)
(function () {
    'use strict';

    // Guard against double-loading
    if (window.__rtlAiChatsLoaded) return;
    window.__rtlAiChatsLoaded = true;

    // ── [1] CSS FIX ──────────────────────────────────────────────────────────
    // Claude Code 2.1.63+ added: *{direction:ltr;unicode-bidi:bidi-override}
    // This reverses Hebrew letters inside words by forcing all text to LTR order.
    //
    // Fix: direction:inherit → children inherit direction set by our JS below
    //      unicode-bidi:embed → BiDi algorithm runs normally (no forced override)
    //
    // We use !important to win over the *{} rule (same specificity, last wins in
    // CSS cascade, but !important always wins).
    const styleEl = document.createElement('style');
    styleEl.id = 'rtl-ai-chats-fix';
    styleEl.textContent = `
        * {
            direction: inherit !important;
            unicode-bidi: embed !important;
        }
        /* Code blocks must always be LTR */
        pre, code, .monaco-editor, .view-lines, .view-line {
            direction: ltr !important;
            unicode-bidi: embed !important;
            text-align: left !important;
        }
        /* RTL containers (set by JS below) */
        [data-rtl-ai="1"] {
            direction: rtl !important;
            text-align: right !important;
        }
        [data-rtl-ai="1"] pre,
        [data-rtl-ai="1"] code,
        [data-rtl-ai="1"] .monaco-editor,
        [data-rtl-ai="1"] .view-line {
            direction: ltr !important;
            text-align: left !important;
            unicode-bidi: embed !important;
        }
    `;

    function injectStyle() {
        if (document.head) {
            document.head.appendChild(styleEl);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.head.appendChild(styleEl);
            });
        }
    }
    injectStyle();

    // ── [2] RTL DETECTION ─────────────────────────────────────────────────────
    // Covers Hebrew, Arabic, and other RTL Unicode ranges
    const RTL_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

    function containsRTL(text) {
        return RTL_REGEX.test(text);
    }

    // ── [3] CHAT SELECTORS ────────────────────────────────────────────────────
    // Each agent uses different class names / component names.
    // CRITICAL: Use el.textContent (full text), not just the first text node.
    // This handles <p>1. <strong>Hebrew</strong></p> where "1. " is the first
    // text node but the Hebrew is inside <strong>.
    const CHAT_SELECTORS = [
        // Claude Code — hashed CSS module class names, so we use substring match
        '[class*="timelineMessage_"]',
        '[class*="userMessageContainer_"]',
        '[class*="messageContainer_"]',
        '[class*="assistantMessage_"]',
        '[class*="humanMessage_"]',
        '[class*="markdownContent_"]',
        // ChatGPT / Codex
        '.text-size-chat',
        '[class*="text-size-chat"]',
        '[class*="prose"]',
        '[class*="chatMessage"]',
        // Gemini Code Assist (Angular components)
        'app-message',
        'ncfc-message',
        'app-ai-chat',
        'gcf-message',
        'app-chat-message',
    ].join(', ');

    // ── [4] RTL APPLICATION ───────────────────────────────────────────────────

    function applyRTL(el) {
        if (el.getAttribute('data-rtl-ai') === '1') return; // already set
        el.setAttribute('data-rtl-ai', '1');
        el.style.direction = 'rtl';
        el.style.textAlign = 'right';
        // Code blocks inside RTL containers stay LTR
        el.querySelectorAll('pre, code, .monaco-editor, .view-line').forEach(codeEl => {
            codeEl.style.direction = 'ltr';
            codeEl.style.textAlign = 'left';
            codeEl.style.unicodeBidi = 'embed';
        });
    }

    function removeForcedRTL(el) {
        if (!el.getAttribute('data-rtl-ai')) return;
        el.removeAttribute('data-rtl-ai');
        el.style.direction = '';
        el.style.textAlign = '';
    }

    function processElement(el) {
        if (!el || typeof el.getAttribute !== 'function') return;
        // Skip code blocks themselves
        if (el.closest && el.closest('pre, code')) return;
        if (/^(PRE|CODE|SCRIPT|STYLE)$/.test(el.tagName || '')) return;

        const text = el.textContent || '';
        if (!text.trim()) return;

        if (containsRTL(text)) {
            applyRTL(el);
        } else {
            removeForcedRTL(el);
        }
    }

    function processElements() {
        try {
            document.querySelectorAll(CHAT_SELECTORS).forEach(processElement);
        } catch (e) {
            // Silently ignore (e.g., invalid selector in some webview environments)
        }
    }

    // ── [5] INPUT AUTO-DIRECTION ──────────────────────────────────────────────

    function processInputs() {
        try {
            document.querySelectorAll('textarea, [contenteditable="true"]').forEach(input => {
                // Skip elements that are part of the code editor (Monaco)
                if (input.closest && input.closest('.monaco-editor')) return;
                const text = input.value !== undefined ? input.value : (input.textContent || '');
                if (!text.trim()) return;
                if (containsRTL(text)) {
                    input.style.direction = 'rtl';
                    input.style.textAlign = 'right';
                } else {
                    input.style.direction = 'ltr';
                    input.style.textAlign = 'left';
                }
            });
        } catch (e) {}
    }

    // ── [6] MUTATION OBSERVER ─────────────────────────────────────────────────

    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let hasChanges = false;
            for (const m of mutations) {
                if ((m.type === 'childList' && m.addedNodes.length > 0) ||
                    m.type === 'characterData') {
                    hasChanges = true;
                    break;
                }
            }
            if (hasChanges) {
                clearTimeout(window._rtlAiChatsTimeout);
                window._rtlAiChatsTimeout = setTimeout(processElements, 50);
            }
        });

        const target = document.body || document.documentElement;
        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    // ── [7] INIT ──────────────────────────────────────────────────────────────

    function init() {
        processElements();
        processInputs();
        startObserver();
        // Periodic re-check for inputs (they don't always fire mutation events)
        setInterval(processInputs, 300);
        // Periodic re-process for late-rendered React/Angular content
        setInterval(processElements, 2000);
        console.log('RTL AI Chats: initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM ready but framework may not have rendered yet — small delay
        setTimeout(init, 100);
    }

    // Expose manual refresh for debugging
    window.rtlAiChatsRefresh = processElements;
})();
