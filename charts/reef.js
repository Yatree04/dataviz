// charts/reef.js
// BEAT ③b (second panel) — what the GCRMN Pacific report actually found.
//
// WHY THIS FILE EXISTS
//
// The previous build asserted "the Pacific has lost an estimated 50% of living coral
// cover since the 1980s" and footnoted the GCRMN Pacific report for it. That report
// finds the opposite: across 50 datasets and 15,482 surveys from 1987–2023, mean hard
// coral cover remained broadly stable at ~25.5% from 1990–2022, with marked declines
// during the 1998 and 2014–2017 bleaching events followed by recovery within six years.
// Citing a DOI for a claim it refutes is the single most damaging error a data piece
// can make, so the claim is gone.
//
// What the report DOES support is more useful to this narrative anyway: cover held,
// composition did not. Branching Acroporidae and Pocilloporidae declined while massive
// Poritidae stayed stable — a shift away from the three-dimensional branching forms
// that create hydraulic roughness. That is exactly the quantity Carlot et al. (2023)
// model as controlling wave dissipation, so it makes the causal hinge tighter, not looser.
//
// HONESTY NOTE ON WHAT THIS CHART IS
// These are published regional headline values transcribed from the report, not a
// series computed from a downloaded dataset. GCRMN cannot redistribute the raw benthic
// data (contributor data-sharing agreements), so this is a faithful figure of reported
// findings and is labelled as such. Do not present it as your own analysis.
//
// Source: Wicquart J., Towle E. K., Dallison T., Staub F. and Planes S. (eds.), 2025.
// Status and Trends of Coral Reefs of the Pacific: 1980–2023. GCRMN / ICRI.
// doi.org/10.59387/WIUJ2936

const C_STABLE = '#8d8778';
const C_UP = '#50b77e';
const C_DOWN = '#e07b3f';
const C_AXIS = '#999999';
const C_INK = '#333333';

// Benthic cover change, 1990–2022, regional mean (percentage points).
const BENTHIC = [
  {
    label: 'Hard coral cover',
    delta: 0,
    note: 'broadly stable at ~25.5%',
    kind: 'stable',
  },
  {
    label: 'Coralline algae',
    delta: 1.9,
    note: 'substrate that new corals settle on',
    kind: 'up',
  },
  {
    label: 'Macroalgae',
    delta: 2.7,
    note: 'competes with coral — possible early ecological shift',
    kind: 'warn',
  },
];

// Assemblage composition. The report gives direction, not regional percentages,
// so no numbers are invented here.
const FAMILIES = [
  { name: 'Acroporidae', form: 'branching', dir: 'down' },
  { name: 'Pocilloporidae', form: 'branching', dir: 'down' },
  { name: 'Poritidae', form: 'massive', dir: 'stable' },
];

export function renderReef(container, opts = {}) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return { update() { }, destroy() { } };

  const state = { width: opts.width || el.clientWidth || 720 };

  el.innerHTML = '';
  d3.select(el).style('position', 'relative');
  const tip = d3.select(el).append('div').attr('class', 'bklit-tooltip');
  const svg = d3.select(el).append('svg').attr('role', 'img')
    .attr('aria-label',
      'Reported change in Pacific reef benthic cover 1990 to 2022: hard coral cover stable, ' +
      'coralline algae up 1.9 points, macroalgae up 2.7 points. Coral assemblage composition ' +
      'shifted away from branching families toward massive forms.');

  function draw() {
    const w = el.clientWidth || state.width;
    const rowH = 34;
    const headH = 26;
    const famH = 112;
    const h = headH + BENTHIC.length * rowH + famH + 74;
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const M = { top: 26, left: 158, right: 30 };
    const innerW = w - M.left - M.right;

    svg.selectAll('g.root').remove();
    const g = svg.append('g').attr('class', 'root').attr('transform', `translate(${M.left},${M.top})`);

    const maxAbs = 3.2;
    const x = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([0, innerW]);
    const zero = x(0);

    // ── Panel 1 heading ────────────────────────────────────────────────
    g.append('text').attr('x', -M.left + 2).attr('y', -10)
      .attr('font-size', 11).attr('font-weight', 600).attr('fill', C_INK)
      .text('What the surveys measured  ·  benthic cover change, 1990–2022');

    g.append('line')
      .attr('x1', zero).attr('x2', zero).attr('y1', 0)
      .attr('y2', BENTHIC.length * rowH)
      .attr('stroke', '#bbb').attr('stroke-width', 1.5);

    const rows = g.selectAll('g.brow').data(BENTHIC).join('g')
      .attr('class', 'brow')
      .attr('transform', (d, i) => `translate(0,${i * rowH})`);

    rows.append('text')
      .attr('x', -10).attr('y', rowH / 2 + 4).attr('text-anchor', 'end')
      .attr('font-size', 12).attr('fill', C_INK)
      .text(d => d.label);

    rows.each(function (d) {
      const row = d3.select(this);
      const col = d.kind === 'stable' ? C_STABLE : (d.kind === 'warn' ? C_DOWN : C_UP);

      if (d.delta === 0) {
        // Stable: a marker at zero, not a zero-width bar that reads as "no data".
        row.append('rect')
          .attr('x', zero - 22).attr('y', rowH / 2 - 7)
          .attr('width', 44).attr('height', 14).attr('rx', 7)
          .attr('fill', 'none').attr('stroke', C_STABLE)
          .attr('stroke-width', 1.2).attr('stroke-dasharray', '3,3');
        row.append('text')
          .attr('x', zero + 30).attr('y', rowH / 2 + 4)
          .attr('font-size', 11).attr('fill', C_STABLE)
          .text('no significant change');
      } else {
        row.append('rect')
          .attr('x', zero).attr('y', rowH / 2 - 8)
          .attr('width', 0).attr('height', 16).attr('rx', 3)
          .attr('fill', col)
          .transition().duration(650).ease(d3.easeCubicOut)
          .attr('width', x(d.delta) - zero);
        row.append('text')
          .attr('x', x(d.delta) + 8).attr('y', rowH / 2 + 4)
          .attr('font-size', 11).attr('fill', C_AXIS).attr('opacity', 0)
          .text(`+${d.delta.toFixed(1)} pts`)
          .transition().delay(600).duration(200).attr('opacity', 0.85);
      }

      row.append('rect')
        .attr('x', -M.left).attr('y', 0).attr('width', innerW + M.left).attr('height', rowH)
        .attr('fill', 'transparent')
        .on('mouseover', function (event) {
          const [ex, ey] = d3.pointer(event, el);
          tip.style('opacity', 1)
            .style('left', `${Math.min(ex + 14, el.clientWidth - 250)}px`)
            .style('top', `${ey - 40}px`)
            .html(`<strong style="color:#fff">${d.label}</strong><br>` +
              `<span class="tt-label">${d.note}</span>`);
        })
        .on('mouseleave', () => tip.style('opacity', 0));
    });

    // ── Panel 2: composition ───────────────────────────────────────────
    const fy = BENTHIC.length * rowH + 30;

    g.append('text').attr('x', -M.left + 2).attr('y', fy)
      .attr('font-size', 11).attr('font-weight', 600).attr('fill', C_INK)
      .text('What the surveys did not measure directly  ·  assemblage composition');

    const fullW = innerW + M.left - 2;
    const colW = fullW / 3;
    const fam = g.selectAll('g.fam').data(FAMILIES).join('g')
      .attr('class', 'fam')
      .attr('transform', (d, i) => `translate(${-M.left + 2 + i * colW}, ${fy + 22})`);

    fam.append('rect')
      .attr('x', 0).attr('y', 0).attr('width', colW - 12).attr('height', 52).attr('rx', 5)
      .attr('fill', d => d.dir === 'down' ? 'rgba(224,123,63,0.10)' : 'rgba(141,135,120,0.10)')
      .attr('stroke', d => d.dir === 'down' ? 'rgba(224,123,63,0.45)' : 'rgba(141,135,120,0.4)')
      .attr('stroke-width', 1);

    fam.append('text').attr('x', 12).attr('y', 20)
      .attr('font-size', 12).attr('font-weight', 600)
      .attr('fill', d => d.dir === 'down' ? C_DOWN : C_INK)
      .text(d => `${d.dir === 'down' ? '↓' : '→'}  ${d.name}`);

    fam.append('text').attr('x', 12).attr('y', 37)
      .attr('font-size', 10.5).attr('fill', C_AXIS)
      .text(d => `${d.form} · ${d.dir === 'down' ? 'declining' : 'stable'}`);

    // ── Footnote ───────────────────────────────────────────────────────
    const notes = [
      { t: 'Cover held. Structure did not. Branching families build the hydraulic roughness', i: false },
      { t: 'that dissipates wave energy; massive forms do not replace it.', i: false },
      { t: 'Values transcribed from GCRMN, Status and Trends of Coral Reefs of the Pacific 1980–2023', i: true },
      { t: '(50 datasets, 15,482 surveys). Not computed here — GCRMN cannot redistribute the raw data.', i: true },
    ];
    notes.forEach((n, i) => {
      g.append('text').attr('x', -M.left + 2).attr('y', fy + 88 + i * 13)
        .attr('font-size', 10).attr('fill', C_INK)
        .attr('opacity', n.i ? 0.5 : 0.62)
        .attr('font-style', n.i ? 'italic' : 'normal')
        .text(n.t);
    });
  }

  draw();
  return {
    update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
    destroy() { el.innerHTML = ''; },
  };
}
