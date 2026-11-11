import { useEffect, useState } from 'react';
import { Power } from 'lucide-react';

export function StartupSettings({ en }: { en: boolean }) {
  const openAtLogin = window.scorelerDesktop?.openAtLogin;
  const [enabled, setEnabled] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!openAtLogin) return;
    let active = true;
    const read = () => {
      void openAtLogin().then(state => {
        if (active && state.supported) setEnabled(state.enabled);
      }).catch(() => { if (active) setError(true); });
    };
    read();
    window.addEventListener('focus', read);
    return () => {
      active = false;
      window.removeEventListener('focus', read);
    };
  }, [openAtLogin]);

  async function save(next: boolean) {
    if (!openAtLogin || busy) return;
    setBusy(true);
    setError(false);
    try {
      const state = await openAtLogin(next);
      if (state.supported) setEnabled(state.enabled);
      setError(!state.supported || state.enabled !== next);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (enabled === undefined && !error) return null;
  return <section className="panel settings-section">
    <h2><Power size={18}/>{en ? 'Windows startup' : 'Windows 启动'}</h2>
    {enabled !== undefined && <label className="checkbox-label">
      <input type="checkbox" checked={enabled} disabled={busy} onChange={event => void save(event.target.checked)}/>
      {en ? 'Open Scoreler when I sign in to Windows' : '登录 Windows 后自动打开 Scoreler'}
    </label>}
    {error && <p role="alert">{en ? 'Could not read or change the Windows startup setting.' : '无法读取或更改 Windows 启动设置。'}</p>}
  </section>;
}
