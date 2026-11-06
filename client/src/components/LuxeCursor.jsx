import React from 'react';

/**
 * Custom gold cursor: a precise dot + a softly trailing ring.
 *  - grows over links/buttons, shrinks while pressed, ripples on click
 *  - leaves a faint sparkle trail while moving (skipped when the user prefers reduced motion)
 *  - only active for a real mouse: touch devices and text fields keep the normal pointer
 */
const LINKS = 'a,button,[role="button"],summary,select,label[for],.nav-link,[data-tilt],.available-room,.pay-option,.cat-chip,.star-btn,.status-tab,.guest-booking-card';
const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]),textarea,[contenteditable="true"]';

export default function LuxeCursor() {
  const dot = React.useRef(null);
  const ring = React.useRef(null);

  React.useEffect(() => {
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return undefined;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0, lastSpark = { x: 0, y: 0 }, active = false;

    const setClass = (name, on) => root.classList.toggle(name, on);
    const loop = () => {
      const k = reduce ? 1 : 0.2;
      rx += (x - rx) * k; ry += (y - ry) * k;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      raf = requestAnimationFrame(loop);
    };

    const spark = (px, py) => {
      if (reduce) return;
      const host = document.body;
      if (host.querySelectorAll('.lx-spark').length > 24) return;
      const s = document.createElement('i');
      s.className = 'lx-spark';
      s.style.left = `${px}px`; s.style.top = `${py}px`;
      s.style.setProperty('--dx', `${(Math.random() - 0.5) * 34}px`);
      s.style.setProperty('--dy', `${Math.random() * 30 + 6}px`);
      s.addEventListener('animationend', () => s.remove(), { once: true });
      host.appendChild(s);
    };

    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      if (!active) { active = true; rx = x; ry = y; setClass('lx-active', true); raf = requestAnimationFrame(loop); }
      setClass('lx-hidden', false);
      const t = e.target instanceof Element ? e.target : null;
      setClass('lx-text', !!t?.closest(TEXT));
      setClass('lx-link', !!t?.closest(LINKS));
      if (Math.hypot(x - lastSpark.x, y - lastSpark.y) > 46) { lastSpark = { x, y }; spark(x, y); }
    };
    const onDown = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      setClass('lx-down', true);
      if (reduce) return;
      const r = document.createElement('i');
      r.className = 'lx-ripple'; r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`;
      r.addEventListener('animationend', () => r.remove(), { once: true });
      document.body.appendChild(r);
    };
    const onUp = () => setClass('lx-down', false);
    const onOut = (e) => { if (!e.relatedTarget) setClass('lx-hidden', true); };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('mouseout', onOut);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mouseout', onOut);
      ['lx-active', 'lx-hidden', 'lx-text', 'lx-link', 'lx-down'].forEach((c) => root.classList.remove(c));
    };
  }, []);

  return (
    <div className="lx-cursor" aria-hidden="true">
      <div className="lx-ring" ref={ring} />
      <div className="lx-dot" ref={dot} />
    </div>
  );
}
