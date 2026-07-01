'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const MARKER = '// RTL AI Chats (injected)';
const WORKBENCH_MARKER = '/* RTL AI Chats (injected) */';

// ── Target discovery ──────────────────────────────────────────────────────────

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

function findInjectionTargets() {
    const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions');
    const targets = [];

    // Claude Code
    const claudeDir = findLatestExtension(extensionsDir, 'anthropic.claude-code-');
    if (claudeDir) {
        const p = path.join(claudeDir, 'webview', 'index.js');
        if (fs.existsSync(p)) targets.push({ name: 'Claude Code', path: p });
        // Also check for potential future structure changes
        const altPath = path.join(claudeDir, 'dist', 'webview', 'index.js');
        if (!fs.existsSync(p) && fs.existsSync(altPath)) {
            targets.push({ name: 'Claude Code', path: altPath });
        }
    }

    // ChatGPT / Codex (hashed filename — discover from index.html)
    const codexDir = findLatestExtension(extensionsDir, 'openai.chatgpt-');
    if (codexDir) {
        const htmlPath = path.join(codexDir, 'webview', 'index.html');
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            const match = html.match(/src="\.\/assets\/(index-[^"]+\.js)"/);
            if (match) {
                const p = path.join(codexDir, 'webview', 'assets', match[1]);
                if (fs.existsSync(p)) targets.push({ name: 'ChatGPT/Codex', path: p });
            }
        }
        // Fallback: try to find any index-*.js in assets
        const assetsDir = path.join(codexDir, 'webview', 'assets');
        if (!targets.find(t => t.name === 'ChatGPT/Codex') && fs.existsSync(assetsDir)) {
            const files = fs.readdirSync(assetsDir).filter(f => f.match(/^index-.*\.js$/));
            if (files.length > 0) {
                const p = path.join(assetsDir, files[0]);
                targets.push({ name: 'ChatGPT/Codex', path: p });
            }
        }
    }

    // Gemini Code Assist
    const geminiDir = findLatestExtension(extensionsDir, 'google.geminicodeassist-');
    if (geminiDir) {
        const p = path.join(geminiDir, 'webview', 'app_bundle.js');
        if (fs.existsSync(p)) targets.push({ name: 'Gemini Code Assist', path: p });
    }

    return targets;
}

function findWorkbench() {
    const baseDir = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code');
    const workbenchRelative = path.join(
        'resources',
        'app',
        'out',
        'vs',
        'code',
        'electron-browser',
        'workbench',
        'workbench.html'
    );
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

// ── Injection checks ──────────────────────────────────────────────────────────

function isInjected(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8').includes(MARKER);
    } catch {
        return false;
    }
}

function isWorkbenchInjected(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8').includes(WORKBENCH_MARKER);
    } catch {
        return false;
    }
}

// ── Fix script runner ─────────────────────────────────────────────────────────

function runFixScript(extensionPath) {
    const fixScript = path.join(extensionPath, 'fix-rtl.js');
    execFile('node', [fixScript], (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`RTL fix failed: ${error.message}`);
            return;
        }
        vscode.window.showInformationMessage(
            'RTL support re-applied successfully! Reload window to activate.',
            'Reload Window'
        ).then(choice => {
            if (choice === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    });
}

// ── Status check ──────────────────────────────────────────────────────────────

function showStatus(extensionPath) {
    const targets = findInjectionTargets();
    const workbench = findWorkbench();

    const lines = ['RTL AI Chats — Injection Status\n'];
    targets.forEach(t => {
        const ok = isInjected(t.path);
        lines.push(`${ok ? '✓' : '✗'} ${t.name}`);
    });
    if (workbench) {
        const ok = isWorkbenchInjected(workbench);
        lines.push(`${ok ? '✓' : '✗'} Copilot Chat (workbench.html)`);
    } else {
        lines.push(`? Copilot Chat (workbench.html not found)`);
    }

    const broken = lines.filter(l => l.startsWith('✗')).length;
    if (broken > 0) {
        vscode.window.showWarningMessage(lines.join('\n'), 'Fix Now').then(choice => {
            if (choice === 'Fix Now') runFixScript(extensionPath);
        });
    } else {
        vscode.window.showInformationMessage(lines.join('\n'));
    }
}

// ── Startup check ─────────────────────────────────────────────────────────────

function checkAndNotify(extensionPath) {
    const targets = findInjectionTargets();
    const workbench = findWorkbench();

    const broken = targets
        .filter(t => !isInjected(t.path))
        .map(t => t.name);

    if (workbench && !isWorkbenchInjected(workbench)) {
        broken.push('Copilot Chat');
    }

    if (broken.length > 0) {
        const names = broken.join(', ');
        const autoInject = vscode.workspace
            .getConfiguration('rtlAiChats')
            .get('autoInject', true);

        if (autoInject) {
            vscode.window.setStatusBarMessage(`RTL support missing for: ${names}. Re-applying...`, 5000);
            runFixScript(extensionPath);
            return;
        }

        vscode.window.showWarningMessage(
            `RTL support missing for: ${names}. This usually happens after an extension update.`,
            'Fix Now',
            'Ignore'
        ).then(choice => {
            if (choice === 'Fix Now') runFixScript(extensionPath);
        });
    }
}

// ── VS Code extension API ─────────────────────────────────────────────────────

function activate(context) {
    const extPath = context.extensionPath;

    // Delay startup check to avoid slowing down VS Code boot
    setTimeout(() => checkAndNotify(extPath), 4000);

    context.subscriptions.push(
        vscode.commands.registerCommand('rtl-ai-chats.reinjectAll', () => runFixScript(extPath)),
        vscode.commands.registerCommand('rtl-ai-chats.checkStatus', () => showStatus(extPath))
    );
}

function deactivate() { }

module.exports = { activate, deactivate };
