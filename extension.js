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
        const dirs = fs.readdirSync(extensionsDir)
            .filter(d => d.startsWith(prefix))
            .sort()
            .reverse();
        return dirs.length > 0 ? path.join(extensionsDir, dirs[0]) : null;
    } catch {
        return null;
    }
}

function findInjectionTargets() {
    const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions');
    const targets = [];

    // Claude Code
    const claudeDir = findLatestExtension(extensionsDir, 'anthropic.claude-code-');
    if (claudeDir) {
        const p = path.join(claudeDir, 'webview', 'index.js');
        if (fs.existsSync(p)) targets.push({ name: 'Claude Code', path: p });
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
    try {
        const versionDirs = fs.readdirSync(baseDir).filter(d => {
            const wb = path.join(baseDir, d, 'resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html');
            return fs.existsSync(wb);
        });
        if (versionDirs.length > 0) {
            return path.join(baseDir, versionDirs[0], 'resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html');
        }
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
