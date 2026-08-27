// js/timeline.js
// Draggable year-timeline scrubber widget for Beat 0.
// Works with mouse, touch, and keyboard arrow keys.
// Calls onChange(year) whenever the year changes.
//
// Usage:
//   import { initTimeline } from './timeline.js';
//   const tl = initTimeline('#timeline-container', 1999, 2023, 2000, onChange);
//   tl.setYear(2010);  // jump programmatically

export function initTimeline(containerId, minYear, maxYear, startYear, onChange) {
    const container = typeof containerId === 'string'
        ? document.querySelector(containerId)
        : containerId;
    if (!container) return { setYear() { } };

    let currentYear = startYear || minYear;
    const totalYears = maxYear - minYear;

    // ── Build the DOM ─────────────────────────────────────────
    container.innerHTML = `
    <div class="tl-wrap">
      <div class="tl-label tl-label--left">${minYear}</div>
      <div class="tl-track" role="slider"
           aria-valuemin="${minYear}" aria-valuemax="${maxYear}"
           aria-valuenow="${currentYear}" aria-label="Year selector"
           tabindex="0">
        <div class="tl-fill"></div>
        <div class="tl-thumb">
          <span class="tl-thumb-year">${currentYear}</span>
        </div>
      </div>
      <div class="tl-label tl-label--right">${maxYear}</div>
    </div>
  `;

    const track = container.querySelector('.tl-track');
    const fill = container.querySelector('.tl-fill');
    const thumb = container.querySelector('.tl-thumb');
    const label = container.querySelector('.tl-thumb-year');

    function pctFromYear(yr) {
        return ((yr - minYear) / totalYears) * 100;
    }

    function yearFromPct(pct) {
        return Math.round(minYear + (pct / 100) * totalYears);
    }

    function setDisplay(yr) {
        const pct = pctFromYear(yr);
        fill.style.width = `${pct}%`;
        thumb.style.left = `${pct}%`;
        label.textContent = yr;
        track.setAttribute('aria-valuenow', yr);
        // Colour the thumb to match the coastline colour ramp (cool→warm)
        const t = (yr - minYear) / totalYears;
        const r = Math.round(202 + t * (232 - 202));
        const g = Math.round(233 + t * (131 - 233));
        const b = Math.round(255 + t * (58 - 255));
        fill.style.background = `rgb(${r},${g},${b})`;
        thumb.style.borderColor = `rgb(${r},${g},${b})`;
    }

    function applyYear(yr) {
        yr = Math.max(minYear, Math.min(maxYear, yr));
        if (yr === currentYear) return;
        currentYear = yr;
        setDisplay(yr);
        onChange(yr);
    }

    // Position from pointer/touch event
    function pctFromEvent(e) {
        const rect = track.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const rel = clientX - rect.left;
        return Math.max(0, Math.min(100, (rel / rect.width) * 100));
    }

    // ── Drag logic (mouse + touch) ───────────────────────────
    let dragging = false;

    function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const pct = pctFromEvent(e);
        const yr = yearFromPct(pct);
        if (yr !== currentYear) {
            currentYear = yr;
            setDisplay(yr);
            onChange(yr);
        }
    }

    function onEnd() {
        if (!dragging) return;
        dragging = false;
        thumb.classList.remove('is-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchend', onEnd);
    }

    function startDrag(e) {
        dragging = true;
        thumb.classList.add('is-dragging');
        // Also snap immediately to click position
        const pct = pctFromEvent(e);
        const yr = yearFromPct(pct);
        if (yr !== currentYear) {
            currentYear = yr;
            setDisplay(yr);
            onChange(yr);
        }
        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }

    track.addEventListener('mousedown', startDrag);
    track.addEventListener('touchstart', startDrag, { passive: false });

    // Click anywhere on track to jump
    track.addEventListener('click', (e) => {
        const pct = pctFromEvent(e);
        applyYear(yearFromPct(pct));
    });

    // Keyboard: ← / → arrows, + Home/End
    track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); applyYear(currentYear + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); applyYear(currentYear - 1); }
        if (e.key === 'Home') { e.preventDefault(); applyYear(minYear); }
        if (e.key === 'End') { e.preventDefault(); applyYear(maxYear); }
    });

    // ── Year tick marks (every 5 years) ──────────────────────
    const tickContainer = document.createElement('div');
    tickContainer.className = 'tl-ticks';
    for (let y = minYear; y <= maxYear; y += 5) {
        const tick = document.createElement('div');
        tick.className = 'tl-tick';
        tick.style.left = `${pctFromYear(y)}%`;
        tick.dataset.year = y;
        tick.addEventListener('click', () => applyYear(y));

        const tickLabel = document.createElement('span');
        tickLabel.className = 'tl-tick-label';
        tickLabel.textContent = y;
        tick.appendChild(tickLabel);
        tickContainer.appendChild(tick);
    }
    container.querySelector('.tl-wrap').appendChild(tickContainer);

    // Initial render
    setDisplay(currentYear);

    return {
        setYear(yr) { applyYear(yr); },
        getYear() { return currentYear; },
    };
}
