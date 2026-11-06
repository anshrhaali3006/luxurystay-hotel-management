import React from 'react';

/** Event name fired by the sign-in screen: window.dispatchEvent(new CustomEvent(WELCOME_EVENT,{detail:{name,role}})) */
export const WELCOME_EVENT = 'luxe:welcome';
export const announceWelcome = (user) => window.dispatchEvent(new CustomEvent(WELCOME_EVENT, { detail: { name: user?.name || '', role: user?.role || 'guest' } }));

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

/** A short, elegant full-screen welcome shown right after signing in. Click or press Esc to skip. */
export default function WelcomeSplash() {
  const [who, setWho] = React.useState(null);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    const onWelcome = (e) => { setLeaving(false); setWho(e.detail); };
    window.addEventListener(WELCOME_EVENT, onWelcome);
    return () => window.removeEventListener(WELCOME_EVENT, onWelcome);
  }, []);

  const close = React.useCallback(() => { setLeaving(true); setTimeout(() => setWho(null), 600); }, []);

  React.useEffect(() => {
    if (!who) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(close, reduce ? 900 : 2600);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); };
  }, [who, close]);

  if (!who) return null;
  const first = String(who.name || '').trim().split(' ')[0];
  const isGuest = who.role === 'guest';
  return (
    <div className={`lx-splash ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite" onClick={close}>
      <div className="lx-splash-stage" aria-hidden="true">
        <i className="lx-ring-3d r1" /><i className="lx-ring-3d r2" /><i className="lx-ring-3d r3" />
        <div className="lx-splash-mark">L<span>S</span></div>
      </div>
      <div className="lx-splash-copy">
        <small>{greeting().toUpperCase()}</small>
        <h2>Welcome back{first ? `, ${first}` : ''}.</h2>
        <p>{isGuest ? 'Your stays are ready and waiting.' : 'Your workspace is ready.'}</p>
        <div className="lx-splash-bar"><i /></div>
      </div>
    </div>
  );
}
