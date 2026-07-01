#!/usr/bin/env node
/**
 * fix-rtl.js — Standalone RTL injection script
 *
 * Injects RTL support into VS Code AI agent extensions.
 * Run this whenever an agent extension updates and breaks RTL:
 *
 *   node "C:/Users/ariel/.vscode/extensions/rtl-ai-chats-1.0.0/fix-rtl.js"
 *
 * Options:
 *   --dry-run   Show what would be done without modifying any files
 *   --restore   Restore all files from backups (undoes injection)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DRY_RUN = process.argv.includes('--dry-run');
const RESTORE = process.argv.includes('--restore');

const MARKER = '// RTL AI Chats (injected)';
const WORKBENCH_MARKER = '/* RTL AI Chats (injected) */';

const SCRIPT_PATH = path.join(__dirname, 'rtl-script.js');
const CSS_PATH = path.join(__dirname, 'rtl-workbench.css');

// ── Helper functions ──────────────────────────────────────────────────────────

function findLatestExtension(extensionsDir, prefix) {
    try {
        const candidates = fs.readdirSync(extensionsDir)
            .filter(d => d.startsWith(prefix))
            .map(name => {
                const dir = path.join(extensionsDir, name);
                const packagePath = path.join(dir, 'package.json');
                let version = name.slice(prefix.length).replace(/-(win32|darwin|linux).*/, '');
                try {
                    version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || version;
                } catch { }
                return {
                    dir,
                    name,
                    version,
                    mtime: fs.statSync(dir).mtimeMs,
                };
            });
        candidates.sort((a, b) =>
            compareVersions(b.version, a.version) ||
            b.mtime - a.mtime ||
            b.name.localeCompare(a.name)
        );
        return candidates.length > 0 ? candidates[0].dir : null;
    } catch {
        return null;
    }
}

function compareVersions(a, b) {
    const pa = String(a).split(/[.-]/).map(n => Number.parseInt(n, 10));
    const pb = String(b).split(/[.-]/).map(n => Number.parseInt(n, 10));
    const length = Math.max(pa.length, pb.length);
    for (let i = 0; i < length; i++) {
        const av = Number.isFinite(pa[i]) ? pa[i] : 0;
        const bv = Number.isFinite(pb[i]) ? pb[i] : 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}

function findWorkbench() {
    const baseDir = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code');
    const workbenchRelative = path.join('resources', 'app', 'out', 'vs', 'code',
        'electron-browser', 'workbench', 'workbench.html');
    try {
        const candidates = fs.readdirSync(baseDir)
            .map(d => {
                const dir = path.join(baseDir, d);
                const wb = path.join(dir, workbenchRelative);
                const productPath = path.join(dir, 'resources', 'app', 'product.json');
                if (!fs.existsSync(wb) || !fs.existsSync(productPath)) return null;
                let product = {};
                try {
                    product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
                } catch { }
                return {
                    dir,
                    workbench: wb,
                    commit: product.commit || d,
                    version: product.version || '',
                    mtime: fs.statSync(productPath).mtimeMs,
                };
            })
            .filter(Boolean);

        if (candidates.length === 0) return null;

        const activeCommitPath = path.join(baseDir, 'updating_version');
        if (fs.existsSync(activeCommitPath)) {
            const activeCommit = fs.readFileSync(activeCommitPath, 'utf8').trim();
            const active = candidates.find(c => c.commit === activeCommit || c.dir.endsWith(activeCommit.slice(0, 10)));
            if (active) return active.workbench;
        }

        candidates.sort((a, b) => b.mtime - a.mtime);
        return candidates[0].workbench;
    } catch { }
    return null;
}

function isInjected(filePath) {
    return fs.readFileSync(filePath, 'utf8').includes(MARKER);
}

function isWorkbenchInjected(filePath) {
    return fs.readFileSync(filePath, 'utf8').includes(WORKBENCH_MARKER);
}

// ── Webview injection ─────────────────────────────────────────────────────────

function injectWebview(target, scriptContent) {
    const { name, path: filePath } = target;

    if (!fs.existsSync(filePath)) {
        console.log(`[SKIP] ${name}: file not found\n       ${filePath}`);
        return;
    }

    if (RESTORE) {
        const backupPath = filePath + '.rtl-backup';
        if (fs.existsSync(backupPath)) {
            if (!DRY_RUN) fs.copyFileSync(backupPath, filePath);
            console.log(`[RESTORE] ${name}: restored from backup`);
        } else {
            console.log(`[SKIP] ${name}: no backup found`);
        }
        return;
    }

    if (isInjected(filePath)) {
        console.log(`[OK]   ${name}: already injected`);
        return;
    }

    // Create backup if none exists
    const backupPath = filePath + '.rtl-backup';
    if (!fs.existsSync(backupPath)) {
        if (!DRY_RUN) fs.copyFileSync(filePath, backupPath);
        console.log(`[BAK]  ${name}: backup saved → ${path.basename(backupPath)}`);
    }

    if (!DRY_RUN) {
        const original = fs.readFileSync(filePath, 'utf8');
        fs.writeFileSync(filePath, original + `\n\n${MARKER}\n${scriptContent}\n`, 'utf8');
    }
    console.log(`[INJ]  ${name}: RTL script injected`);
}

// ── Workbench injection ───────────────────────────────────────────────────────

function injectWorkbench(workbenchPath, cssContent) {
    if (!workbenchPath) {
        console.log(`[SKIP] Copilot Chat (workbench.html): VS Code install not found`);
        return;
    }
    if (!fs.existsSync(workbenchPath)) {
        console.log(`[SKIP] Copilot Chat (workbench.html): file not found\n       ${workbenchPath}`);
        return;
    }

    if (RESTORE) {
        const backupPath = workbenchPath + '.rtl-backup';
        if (fs.existsSync(backupPath)) {
            if (!DRY_RUN) fs.copyFileSync(backupPath, workbenchPath);
            console.log(`[RESTORE] Copilot Chat (workbench.html): restored from backup`);
        } else {
            console.log(`[SKIP] Copilot Chat: no backup found`);
        }
        return;
    }

    if (isWorkbenchInjected(workbenchPath)) {
        console.log(`[OK]   Copilot Chat (workbench.html): already injected`);
        return;
    }

    // Create backup if none exists
    const backupPath = workbenchPath + '.rtl-backup';
    if (!fs.existsSync(backupPath)) {
        if (!DRY_RUN) fs.copyFileSync(workbenchPath, backupPath);
        console.log(`[BAK]  Copilot Chat (workbench.html): backup saved`);
    }

    let content = fs.readFileSync(workbenchPath, 'utf8');

    // Remove old vscode-custom-css RTL injection (from previous extension) if present
    const sessionIdMarker = '<!-- !! VSCODE-CUSTOM-CSS-SESSION-ID';
    const cssEnd = '<!-- !! VSCODE-CUSTOM-CSS-END !! -->';
    const oldStart = content.indexOf(sessionIdMarker);
    if (oldStart !== -1) {
        const oldEnd = content.indexOf(cssEnd, oldStart);
        if (oldEnd !== -1) {
            content = content.substring(0, oldStart) + content.substring(oldEnd + cssEnd.length);
            console.log(`[CLN]  Copilot Chat: removed old vscode-custom-css injection`);
        }
    }

    // Insert our <style> block before </html>
    const injection = `\n<!-- ${WORKBENCH_MARKER} -->\n<style id="rtl-ai-chats">\n${cssContent}\n</style>\n`;
    if (!content.includes('</html>')) {
        // Fallback: append to end
        content += injection;
    } else {
        content = content.replace('</html>', injection + '</html>');
    }

    if (!DRY_RUN) {
        fs.writeFileSync(workbenchPath, content, 'utf8');
    }
    console.log(`[INJ]  Copilot Chat (workbench.html): RTL CSS injected`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
    if (DRY_RUN) console.log('[DRY RUN] No files will be modified\n');
    if (RESTORE) console.log('[RESTORE] Restoring all files from backups\n');

    // Read RTL script and CSS
    let scriptContent, cssContent;
    try {
        scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');
    } catch {
        console.error(`ERROR: Cannot read rtl-script.js at ${SCRIPT_PATH}`);
        process.exit(1);
    }
    try {
        cssContent = fs.readFileSync(CSS_PATH, 'utf8');
    } catch {
        console.error(`ERROR: Cannot read rtl-workbench.css at ${CSS_PATH}`);
        process.exit(1);
    }

    const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions');

    // ── Claude Code (latest installed version) ────────────────────────────────
    const claudeDir = findLatestExtension(extensionsDir, 'anthropic.claude-code-');
    if (claudeDir) {
        const primaryPath = path.join(claudeDir, 'webview', 'index.js');
        const altPath = path.join(claudeDir, 'dist', 'webview', 'index.js');

        if (fs.existsSync(primaryPath)) {
            injectWebview(
                { name: 'Claude Code', path: primaryPath },
                scriptContent
            );
        } else if (fs.existsSync(altPath)) {
            injectWebview(
                { name: 'Claude Code', path: altPath },
                scriptContent
            );
        } else {
            console.log(`[SKIP] Claude Code: webview/index.js not found. Paths checked:\n       ${primaryPath}\n       ${altPath}`);
        }
    } else {
        console.log(`[SKIP] Claude Code: extension not found in ${extensionsDir}`);
    }

    // ── ChatGPT / Codex (hashed filename) ────────────────────────────────────
    const codexDir = findLatestExtension(extensionsDir, 'openai.chatgpt-');
    if (codexDir) {
        const htmlPath = path.join(codexDir, 'webview', 'index.html');
        let injected = false;

        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            const match = html.match(/src="\.\/assets\/(index-[^"]+\.js)"/);
            if (match) {
                injectWebview(
                    { name: 'ChatGPT/Codex', path: path.join(codexDir, 'webview', 'assets', match[1]) },
                    scriptContent
                );
                injected = true;
            }
        }

        // Fallback: find any index-*.js file in assets directory
        if (!injected) {
            const assetsDir = path.join(codexDir, 'webview', 'assets');
            if (fs.existsSync(assetsDir)) {
                const files = fs.readdirSync(assetsDir).filter(f => f.match(/^index-.*\.js$/));
                if (files.length > 0) {
                    injectWebview(
                        { name: 'ChatGPT/Codex', path: path.join(assetsDir, files[0]) },
                        scriptContent
                    );
                    injected = true;
                }
            }
        }

        if (!injected) {
            console.log(`[SKIP] ChatGPT/Codex: could not locate index-*.js file`);
        }
    } else {
        console.log(`[SKIP] ChatGPT/Codex: extension not found`);
    }

    // ── Gemini Code Assist ────────────────────────────────────────────────────
    const geminiDir = findLatestExtension(extensionsDir, 'google.geminicodeassist-');
    if (geminiDir) {
        injectWebview(
            { name: 'Gemini Code Assist', path: path.join(geminiDir, 'webview', 'app_bundle.js') },
            scriptContent
        );
    } else {
        console.log(`[SKIP] Gemini Code Assist: extension not found`);
    }

    // ── GitHub Copilot Chat (workbench.html) ──────────────────────────────────
    const workbench = findWorkbench();
    injectWorkbench(workbench, cssContent);

    console.log('\nDone!');
    if (!RESTORE) {
        console.log('Reload VS Code window to activate RTL: Ctrl+Shift+P → "Developer: Reload Window"');
    }
}

main();
