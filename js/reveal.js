// js/reveal.js
// Small, dependency-free scroll polish utilities:
//   - animateCountUps(): tweens any `.count-up` span to its data-target once visible
//   - initScrollProgress(): fills the top progress bar with page scroll %
//   - initProgressRail(): builds the dot-nav wayfinding rail from the beats on the page
// Kept separate from main.js so the entry point stays focused on data + charts.

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Count-up numerals ──────────────────────────────────────────────────────
// Any element with class="count-up" data-target="91" [data-suffix="%"] [data-decimals="0"]
// counts up from 0 to data-target the first time it scrolls into view.
export function animateCountUps(root = document) {
  const els = root.querySelectorAll('.count-up');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      io.unobserve(el);
      const target = Number(el.dataset.target);
      const suffix = el.dataset.suffix || '';
      const decimals = Number(el.dataset.decimals || 0);
      if (!Number.isFinite(target)) continue;

      const format = (v) => v.toLocaleString('en-US', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }) + suffix;

      if (REDUCE_MOTION) { el.textContent = format(target); continue; }

      const duration = 1400;
      const start = performance.now();
      const ease = t => 1 - Math.pow(1 - t, 3); // cubic-out

      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = format(target * ease(t));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });

  els.forEach(el => io.observe(el));
}

// ── Scroll progress bar ─────────────────────────────────────────────────────
export function initScrollProgress(fillSelector = '#scroll-progress-fill') {
  const fill = document.querySelector(fillSelector);
  if (!fill) return;

  let ticking = false;
  function update() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const pct = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
    fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// ── Wayfinding dot rail ──────────────────────────────────────────────────────
// beats: [{ id: 'beat-0', label: 'Cold open' }, ...]
export function initProgressRail(railSelector, beats) {
  const rail = document.querySelector(railSelector);
  if (!rail) return { setActive() {} };

  rail.innerHTML = beats.map(b => (
    `<a href="#${b.id}" class="rail-dot" data-beat-id="${b.id}" aria-label="${b.label}">
       <span class="rail-tip">${b.label}</span>
     </a>`
  )).join('');

  const dots = new Map(
    Array.from(rail.querySelectorAll('.rail-dot')).map(d => [d.dataset.beatId, d])
  );

  return {
    setActive(beatId) {
      for (const [id, dot] of dots) dot.classList.toggle('is-active', id === beatId);
    },
  };
}
