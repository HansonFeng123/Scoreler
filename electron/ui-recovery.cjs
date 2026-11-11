const fs = require('node:fs');
const { atomicWrite } = require('./windows-icon.cjs');

const phases = new Set(['loading', 'ready', 'recovering', 'failed']);
const reasons = new Set(['startup', 'navigation', 'rendered', 'load-failed', 'renderer-exit', 'preload-error', 'render-timeout', 'manual-retry']);

// Store event codes only. Never include page text, URLs, console messages,
// account details or Electron's exception objects in startup diagnostics.
function recordUiDiagnostic(file, event) {
  const sanitize = value => {
    if (!value || !phases.has(value.phase) || !reasons.has(value.reason)) return null;
    return {
      phase: value.phase,
      reason: value.reason,
      attempt: value.attempt === 1 ? 1 : 0,
      ...(Number.isInteger(value.code) ? { code: value.code } : {}),
      time: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.time) ? value.time : new Date().toISOString(),
    };
  };
  try {
    let history = [];
    try {
      if (fs.statSync(file).size < 32768) history = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    const records = (Array.isArray(history) ? history : []).map(sanitize).filter(Boolean).slice(-31);
    const clean = sanitize(event);
    if (clean) records.push(clean);
    atomicWrite(file, Buffer.from(JSON.stringify(records)));
  } catch { /* A diagnostic write must never prevent startup. */ }
}

const freshLoadOptions = { extraHeaders: 'Cache-Control: no-cache\nPragma: no-cache' };
const renderedProbe = `(() => {
  const root = document.getElementById('root');
  if (!root?.childElementCount) return false;
  const box = root.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
})()`;

function installUiRecovery({ webContents, appUrl, onEvent, onFailure, timeoutMs = 15000, probeIntervalMs = 250 }) {
  let phase = 'loading';
  let attempt = 0;
  let generation = 0;
  let deadline;
  let probe;
  let retry;
  let disposed = false;

  function emit(next, reason, code) {
    phase = next;
    onEvent?.({ phase, reason, attempt, ...(Number.isInteger(code) ? { code } : {}) });
  }

  function resetTimers() {
    generation++;
    clearTimeout(deadline);
    clearTimeout(probe);
    clearTimeout(retry);
  }

  function arm() {
    resetTimers();
    deadline = setTimeout(() => fail('render-timeout'), timeoutMs);
  }

  function fail(reason, code) {
    if (disposed || webContents.isDestroyed() || phase === 'failed' || phase === 'recovering') return;
    resetTimers();
    if (attempt === 1) {
      emit('failed', reason, code);
      onFailure();
      return;
    }
    attempt = 1;
    emit('recovering', reason, code);
    retry = setTimeout(() => {
      if (disposed || webContents.isDestroyed()) return;
      emit('loading', 'navigation');
      arm();
      void webContents.loadURL(appUrl, freshLoadOptions).catch(() => {});
    }, 250);
  }

  async function inspect() {
    if (disposed || phase !== 'loading') return;
    const current = generation;
    const rendered = await webContents.executeJavaScript(renderedProbe).catch(() => false);
    if (disposed || current !== generation) return;
    if (rendered) {
      resetTimers();
      emit('ready', 'rendered');
    } else {
      probe = setTimeout(inspect, probeIntervalMs);
    }
  }

  const origin = new URL(appUrl).origin;
  const handlers = {
    'did-start-navigation': ({ url, isSameDocument, isMainFrame }) => {
      if (!isMainFrame || isSameDocument || !url.startsWith(origin + '/')) return;
      if (phase === 'failed' || phase === 'ready') {
        attempt = 0;
        emit('loading', phase === 'failed' ? 'manual-retry' : 'navigation');
      }
      if (phase === 'loading') arm();
    },
    'did-finish-load': () => {
      if (webContents.getURL().startsWith(origin + '/')) void inspect();
    },
    'did-fail-load': (_event, code, _description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && url.startsWith(origin + '/')) fail('load-failed', code);
    },
    'render-process-gone': (_event, details) => fail('renderer-exit', details.exitCode),
    'preload-error': () => fail('preload-error'),
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    resetTimers();
    webContents.removeListener('destroyed', dispose);
    for (const [name, handler] of Object.entries(handlers)) webContents.removeListener(name, handler);
  }

  for (const [name, handler] of Object.entries(handlers)) webContents.on(name, handler);
  webContents.once('destroyed', dispose);
  emit('loading', 'startup');
  arm();
  return { dispose };
}

function uiFailurePage(appUrl) {
  const url=new URL(appUrl);
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || url.pathname!=='/' || url.username || url.password || url.search || url.hash) throw Error('Invalid local UI address');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Scoreler</title><style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui;margin:15vh auto;padding:24px;max-width:560px}h1{font-size:26px}a{display:inline-block;padding:10px 18px;border:1px solid currentColor;border-radius:12px;color:inherit;text-decoration:none}</style></head><body><h1>Scoreler couldn't load its interface<br>Scoreler 界面未能加载</h1><p>Your saved records and settings have not been reset.<br>你的学习记录和设置未被重置。</p><a href="${url.href}">Retry / 重试</a></body></html>`;
  return 'data:text/html;charset=utf-8,'+encodeURIComponent(html);
}
module.exports={installUiRecovery,recordUiDiagnostic,uiFailurePage,freshLoadOptions};
