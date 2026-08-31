import { useRef, useState, useMemo, useEffect } from "react";
import { useClimateData } from "./useClimateData";
import { decadeMean, stripeColor } from "./utils";
import MapPanel from "./MapPanel";
import HChart from "./HChart";
import RainSmallMultiples from "./RainSmallMultiples";

// ─── TOKENS ──────────────────────────────────────────────────────────────────
const INK      = "#020817";
const INK2     = "#1f2937";
const INK3     = "#9ca3af";
const BORDER   = "#e2e8f0";
const BG_SUB   = "#f9fafb";
const HEAT_1   = "#f5c14e";
const HEAT_2   = "#e8833a";
const HEAT_3   = "#c1362f";
const ACCRETE  = "#2a78d6";

// Baselines taken verbatim from the SPC indicator metadata (NOAAGlobalTemp
// v6.0.0). Declared once so copy and axis label cannot drift apart.
const BASELINE_TEMP = "1971–2000";

// Observed global mass bleaching events, as listed in the GCRMN Pacific report.
// These replace the "+1 °C bleaching-stress threshold" line an earlier version
// drew: bleaching stress is Degree Heating Weeks accumulated above a site's
// Maximum Monthly Mean — a local, seasonal-peak quantity — while this chart
// shows an annual mean anomaly. An annual mean averages away exactly the summer
// peak that kills coral, so no horizontal line on this axis can represent a
// bleaching threshold. Observed event years are recorded fact instead.
const BLEACHING_EVENTS = [
  { start: 1998, end: 1998, label: "1st global event" },
  { start: 2010, end: 2010, label: "2nd global event" },
  { start: 2014, end: 2017, label: "3rd global event" },
  { start: 2023, end: 2024, label: "4th global event" },
];

// ─── INTERSECTION OBSERVER HOOK ──────────────────────────────────────────────
// Shared by Reveal and WarmingStripes — fires onEnter() once, the first time
// the ref'd element crosses `threshold` into the viewport.
function useIO(ref: React.RefObject<HTMLElement | null>, onEnter: () => void, threshold = 0.12) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) onEnter(); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ─── REVEAL WRAPPER ──────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useIO(ref, () => setVisible(true), 0.12);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(20px)",
        transition: `opacity 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─── SHARED TOOLTIP STYLE ─────────────────────────────────────────────────────
// Mirrors the swatch-+-value row pattern from the Highcharts custom-tooltip
// examples: a small coloured dash, the series name, the value.
const HC_TOOLTIP = {
  useHTML: true,
  backgroundColor: "#ffffff",
  borderColor: BORDER,
  borderRadius: 4,
  shadow: false,
  style: { fontSize: "11px", fontFamily: "'Inter',sans-serif", color: INK2 },
};

// ─── WARMING STRIPES (built from the real annual regional series) ───────────
function WarmingStripes({ series, fromYear }: { series: [number, number][]; fromYear: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useIO(ref, () => setVisible(true), 0.1);

  const stripes = useMemo(() => {
    const pts = series.filter(([y]) => y >= fromYear);
    const vals = pts.map(([, v]) => v);
    const min = Math.min(...vals), max = Math.max(...vals);
    return pts.map(([year, anomaly]) => ({ year, color: stripeColor(anomaly, min, max) }));
  }, [series, fromYear]);

  if (!stripes.length) return null;
  const lastYear = stripes[stripes.length - 1].year;

  return (
    <div ref={ref}>
      <div style={{ display: "flex", gap: "1.5px", height: 52, borderRadius: 3, overflow: "hidden" }}>
        {stripes.map(({ year, color }) => (
          <div key={year} title={`${year}`} style={{
            flex: 1, background: color,
            opacity: visible ? 1 : 0,
            transition: `opacity 0.8s ease ${(year - fromYear) * 0.006}s`,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: INK3 }}>
        <span>{fromYear}</span>
        <span style={{ display: "flex", gap: 16 }}>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}><span style={{ width: 10, height: 10, background: "#1440a0", borderRadius: 2, display: "inline-block" }} />cooler</span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}><span style={{ width: 10, height: 10, background: HEAT_3, borderRadius: 2, display: "inline-block" }} />warmer</span>
        </span>
        <span>{lastYear}</span>
      </div>
    </div>
  );
}

// ─── CHIP SELECTOR ────────────────────────────────────────────────────────────
function ChipRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "14px 0" }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} style={{
          padding: "5px 13px", borderRadius: 999, fontSize: 12, fontWeight: 500,
          cursor: "pointer", border: `1px solid ${value === opt ? INK : BORDER}`,
          background: value === opt ? INK : "transparent",
          color: value === opt ? "#fff" : INK3,
          fontFamily: "'Inter',sans-serif", transition: "all 0.15s",
        }}>{opt}</button>
      ))}
    </div>
  );
}

// ─── LOGO / MAP THUMBNAIL (decorative — the real map is further down the page) ─
function PacificMini() {
  return (
    <svg viewBox="0 0 180 120" fill="none" style={{ width: 180, height: 120 }}>
      <rect width="180" height="120" fill="#f0f4f8" rx="6" />
      {[...Array(40)].map((_, i) => (
        <circle key={i} cx={(i * 47) % 175 + 4} cy={(i * 31) % 115 + 4} r="0.8" fill="#c8d8e8" opacity="0.6" />
      ))}
      <path d="M28 52 L22 64 L28 80 L42 88 L62 94 L80 90 L90 76 L94 58 L88 44 L74 38 L56 38 L40 44 Z" fill="#d4e0cc" stroke="#b8ccaa" strokeWidth="0.8" />
      <line x1="98" y1="88" x2="103" y2="108" stroke="#b8ccaa" strokeWidth="2" strokeLinecap="round" />
      <line x1="107" y1="98" x2="110" y2="116" stroke="#b8ccaa" strokeWidth="2" strokeLinecap="round" />
      <path d="M82 36 L92 32 L100 34 L104 44 L98 52 L88 54 L80 48 Z" fill="#d4e0cc" stroke="#b8ccaa" strokeWidth="0.6" />
      {[
        { cx: 114, cy: 68, r: 3.5, c: "#5b8db8" },
        { cx: 122, cy: 76, r: 3, c: "#8b6d40" },
        { cx: 132, cy: 60, r: 3, c: "#8b6d40" },
        { cx: 106, cy: 74, r: 3, c: "#5b8db8" },
        { cx: 145, cy: 52, r: 2.5, c: HEAT_3 },
        { cx: 138, cy: 62, r: 2.5, c: HEAT_3 },
        { cx: 152, cy: 44, r: 2.5, c: HEAT_3 },
      ].map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.c} opacity="0.8" />)}
      <text x="8" y="16" fill={INK3} fontSize="7.5" fontFamily="Inter,sans-serif">Pacific Ocean</text>
    </svg>
  );
}

// ─── LOADING / ERROR STATES ───────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", border: `2.5px solid ${BORDER}`, borderTopColor: ACCRETE, animation: "spin 0.85s linear infinite" }} />
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: INK3 }}>
        Loading Pacific climate data…
      </p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ maxWidth: 480, color: HEAT_3, fontSize: 14, lineHeight: 1.6 }}>
        <strong>Could not load the climate data.</strong>
        <p style={{ marginTop: 8, color: INK3 }}>{message}</p>
        <p style={{ marginTop: 8, color: INK3 }}>
          Serve this app over HTTP (not <code>file://</code>) — <code>npm run dev</code> or <code>npm run build &amp;&amp; npm run preview</code>.
        </p>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const { data, error } = useClimateData();
  const [tempCountry, setTempCountry] = useState("Fiji");

  if (error) return <ErrorScreen message={error} />;
  if (!data) return <LoadingScreen />;

  const {
    ST_ANOM, ST_ANOM_REGIONAL, SST_ANOM_REGIONAL, SEA_LVL_REGIONAL,
    GHG, GHG_YEAR, RAIN_ANOM, RAIN_YEAR, AFFECTED,
    RAIN_TRENDS, RAIN_DRYING, RAIN_WETTING, RAIN_YEARS,
  } = data;

  // Beat 04b — the finding is that the drying end is where the atolls cluster.
  const driestFour = RAIN_TRENDS.slice(0, 4);
  const wettestFour = [...RAIN_TRENDS].slice(-4).reverse();
  const atollsInDriest = driestFour.filter((t) => t.atoll).length;
  const nauru = RAIN_TRENDS.find((t) => t.country === "Nauru");
  const newCal = RAIN_TRENDS.find((t) => t.country === "New Caledonia");

  const countries = Object.keys(ST_ANOM).sort();
  const activeCountry = ST_ANOM[tempCountry] ? tempCountry : countries[0];

  // temperature chart data
  // Only the regional ST_ANOM mean is plotted — SST_ANOM is not a second finding
  // (r = 0.96–0.99 against ST_ANOM, mean difference below the 0.1 °C resolution).
  // SST_ANOM is still used on its own in the coral beat below.
  const tempData = ST_ANOM_REGIONAL.map(([year, st]) => {
    const country = (ST_ANOM[activeCountry] ?? []).find(([y]) => y === year)?.[1];
    return {
      year,
      "Regional land": +st.toFixed(2),
      [activeCountry]: country !== undefined ? +country.toFixed(2) : undefined,
    };
  });

  const ghgData = Object.entries(GHG)
    .sort((a, b) => b[1] - a[1])
    .map(([country, val]) => ({
      country: country.replace(" Islands", " Is.").replace("New Caledonia", "New Cal.").replace("French Polynesia", "Fr. Polynesia"),
      val: +val.toFixed(1),
    }));
  const ghgTop = ghgData[0];
  const ghgSecond = ghgData[1];
  const ghgLowest = ghgData[ghgData.length - 1];

  const seaData = SEA_LVL_REGIONAL.map(({ year, value }) => ({ year, value: +value.toFixed(2) }));
  const seaFirst = seaData[0];
  const seaLast = seaData[seaData.length - 1];
  const seaRiseMm = seaFirst && seaLast ? Math.round((seaLast.value - seaFirst.value) * 1000) : 0;

  const st1950s = decadeMean(ST_ANOM_REGIONAL, 1950);
  const st2020s = decadeMean(ST_ANOM_REGIONAL, 2020);
  const stLatest = ST_ANOM_REGIONAL[ST_ANOM_REGIONAL.length - 1];
  const sstLatest = SST_ANOM_REGIONAL[SST_ANOM_REGIONAL.length - 1];

  const winston = AFFECTED[0]; // real top event — Fiji 2016

  // bleaching-band data: reuse SST regional series, same honest framing as the vanilla build
  const bleachData = SST_ANOM_REGIONAL.map(([year, value]) => ({ year, value: +value.toFixed(2) }));

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", color: INK2 }}>

      {/* ── HEADER ── */}
      <header style={{ borderBottom: `1px solid ${BORDER}`, padding: "14px 0", position: "sticky", top: 0, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(8px)", zIndex: 100 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: INK3 }}>
            Pacific DataViz Challenge 2026
          </div>
          <div style={{ fontSize: 11, color: INK3 }}>Climate Change</div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{ padding: "80px 0 60px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: INK3, marginBottom: 20 }}>
              A data-driven investigation · Pacific DataViz Challenge 2026
            </p>
            <h1 style={{
              fontFamily: "'Fraunces', serif", fontSize: "clamp(44px, 7vw, 72px)",
              fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.025em",
              color: INK, marginBottom: 28,
            }}>
              The Line<br /><em style={{ color: HEAT_2, fontStyle: "italic" }}>That Moves</em>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.8, color: INK2, marginBottom: 16, maxWidth: 560 }}>
              Pacific Island nations contribute a negligible share of global greenhouse gas emissions.
              Yet they face the most severe consequences of a crisis they did not create.
              This is a causal chain — each effect becoming the next cause — told through the data.
            </p>
            <p style={{ fontSize: 14, color: INK3, lineHeight: 1.75, fontStyle: "italic", maxWidth: 500 }}>
              Heat → ocean → reef → coast → life.
              The line on the shore is already moving.
            </p>
          </Reveal>

          {/* Map thumbnail + real quick stats */}
          <Reveal delay={0.1}>
            <div style={{ display: "flex", gap: 32, alignItems: "flex-start", margin: "40px 0 0" }}>
              <PacificMini />
              <div style={{ flex: 1 }}>
                {[
                  { v: `${stLatest[1] > 0 ? "+" : ""}${stLatest[1].toFixed(2)}°C`, l: `Regional land temperature anomaly, ${stLatest[0]}`, c: HEAT_2 },
                  { v: `${seaRiseMm >= 0 ? "+" : ""}${seaRiseMm}mm`, l: `Sea level change, ${seaFirst?.year}–${seaLast?.year}`, c: ACCRETE },
                  { v: winston.affected.toLocaleString(), l: `People affected, TC Winston, ${winston.country} ${winston.year}`, c: HEAT_3 },
                ].map(({ v, l, c }) => (
                  <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 28, color: c, lineHeight: 1, letterSpacing: "-0.02em", flexShrink: 0 }}>{v}</span>
                    <span style={{ fontSize: 13, color: INK3, lineHeight: 1.5 }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── WARMING STRIPES ── */}
      <section style={{ padding: "0 0 64px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: INK3, marginBottom: 10 }}>
              Pacific regional surface temperature · 1950–{stLatest[0]}
            </p>
            <WarmingStripes series={ST_ANOM_REGIONAL} fromYear={1950} />
            <p style={{ fontSize: 11, color: INK3, marginTop: 10, fontStyle: "italic", lineHeight: 1.6 }}>
              Each stripe = one year of temperature anomaly (ST_ANOM), averaged across all reporting Pacific nations.
              Blue = cooler than average. Red = warmer. Source: SPC Pacific Data Hub · DF_CLIMATE_CHANGE.
            </p>
          </Reveal>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "0 auto", maxWidth: 680 }} />

      {/* ── BEAT ① GHG ── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: INK2, flexShrink: 0 }}>①</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK3 }}>The Input — Greenhouse Gas Emissions</span>
            </div>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: INK, marginBottom: 16 }}>
              The Pacific's internal emissions are wildly asymmetric
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
              {ghgTop?.country}'s economy generates <strong style={{ color: INK }}>{ghgTop?.val} tCO₂e per capita</strong> — an
              outlier driven by shipping and tourism infrastructure. {ghgSecond?.country}'s industrial base adds another spike
              at <strong style={{ color: INK }}>{ghgSecond?.val} tCO₂e</strong>.
              But most others — {ghgLowest?.country} among them — emit{" "}
              <strong style={{ color: INK }}>{ghgLowest?.val} tCO₂e or less</strong> per person.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 20 }}>
              This chart is not an accusation. It is the input to a physics equation.
              The greenhouse gas is the first link in the chain.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <p style={{ fontSize: 11, color: INK3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              tCO₂e per capita, {GHG_YEAR} · SPC Pacific Data Hub
            </p>
            <HChart
              height={340}
              options={{
                chart: { type: "bar" },
                xAxis: { type: "category", categories: ghgData.map((d) => d.country), lineWidth: 0, tickLength: 0, labels: { style: { fontSize: "11px", color: INK2 } } },
                yAxis: { title: { text: undefined }, gridLineColor: BORDER, labels: { style: { fontSize: "10px", color: INK3 } } },
                legend: { enabled: false },
                tooltip: { ...HC_TOOLTIP, pointFormat: '<span style="color:{point.color}">●</span> {point.y} tCO₂e per capita' },
                plotOptions: { bar: { borderRadius: 3, borderWidth: 0, pointPadding: 0.1, groupPadding: 0.1 } },
                series: [{
                  type: "bar",
                  name: "Emissions",
                  data: ghgData.map((d) => ({
                    y: d.val,
                    color: d.val > 10 ? HEAT_3 : d.val > 3 ? HEAT_2 : d.val > 1 ? HEAT_1 : ACCRETE,
                  })),
                }],
              }}
            />
            <p style={{ fontSize: 11, color: INK3, marginTop: 8, fontStyle: "italic" }}>
              {ghgTop?.country} and {ghgSecond?.country} are industrial outliers. Colour: red = highest, blue = lowest.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, color: INK3, fontSize: 13, fontStyle: "italic" }}>
              <span style={{ fontSize: 20 }}>↓</span>
              Trapped heat — 91% enters the ocean
            </div>
          </Reveal>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "0 auto", maxWidth: 680 }} />

      {/* ── BEAT ② OCEAN HEAT ── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: INK2, flexShrink: 0 }}>②</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK3 }}>The Engine Room — Ocean &amp; Land Heat</span>
            </div>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: INK, marginBottom: 16 }}>
              The Pacific surface has warmed steadily since the 1980s
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
              ST_ANOM from the SPC Pacific Data Hub shows a monotonic rise: from around{" "}
              <strong style={{ color: INK }}>{st1950s !== null ? `${st1950s > 0 ? "+" : ""}${st1950s.toFixed(2)}°C` : "—"}</strong> in
              the 1950s to <strong style={{ color: INK }}>{st2020s !== null ? `${st2020s > 0 ? "+" : ""}${st2020s.toFixed(2)}°C` : "—"}</strong> in
              the 2020s. Select a country to overlay its own anomaly on the regional mean.
            </p>
            <div style={{ background: BG_SUB, borderLeft: `3px solid ${BORDER}`, padding: "12px 16px", borderRadius: "0 3px 3px 0", fontSize: 12, color: INK3, lineHeight: 1.7, marginBottom: 20 }}>
              <strong style={{ color: INK2 }}>Why only one regional line:</strong> an earlier version plotted land
              (ST_ANOM) against sea surface (SST_ANOM) as though they were two findings. They correlate at r = 0.96–0.99
              with a mean difference below the data's own 0.1 °C rounding step — for Fiji they are identical in 61% of
              years. Over atoll EEZs the land component shares grid cells with the ocean field and is not an independent
              land measurement. They are the same line, so only one is drawn.
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <ChipRow
              options={countries}
              value={activeCountry}
              onChange={setTempCountry}
            />
            <HChart
              height={260}
              options={{
                chart: { type: "line" },
                xAxis: { categories: tempData.map((d) => String(d.year)), lineWidth: 0, tickLength: 0, labels: { style: { fontSize: "10px", color: INK3 } } },
                yAxis: {
                  title: { text: undefined }, gridLineColor: BORDER,
                  labels: { format: "{value:+.1f}°C", style: { fontSize: "10px", color: INK3 } },
                  plotLines: [{ value: 0, color: BORDER, width: 1.5 }],
                },
                legend: { enabled: true, itemStyle: { fontSize: "11px", color: INK3, fontWeight: "400" } },
                tooltip: { ...HC_TOOLTIP, shared: true, valueDecimals: 2, valueSuffix: "°C" },
                series: [
                  { type: "line", name: "Pacific regional mean", data: tempData.map((d) => d["Regional land"]), color: HEAT_2, lineWidth: 2, marker: { enabled: false } },
                  { type: "line", name: activeCountry, data: tempData.map((d) => (d as any)[activeCountry] ?? null), color: INK, lineWidth: 1.5, marker: { enabled: true, radius: 3 }, connectNulls: true },
                ],
              }}
            />
            <p style={{ fontSize: 11, color: INK3, marginTop: 8, fontStyle: "italic" }}>
              ST_ANOM · SPC Pacific Data Hub · °C anomaly vs the {BASELINE_TEMP} baseline (NOAAGlobalTemp v6.0.0). {ST_ANOM_REGIONAL[0][0]}–{stLatest[0]}.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, color: INK3, fontSize: 13, fontStyle: "italic" }}>
              <span style={{ fontSize: 20 }}>↓</span>
              Warm water expands — and takes up more space
            </div>
          </Reveal>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "0 auto", maxWidth: 680 }} />

      {/* ── BEAT ③a SEA LEVEL ── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: INK2, flexShrink: 0 }}>③a</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK3 }}>Water Expands — Sea Level Rise</span>
            </div>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: INK, marginBottom: 16 }}>
              Thermal expansion accounts for roughly half of the sea level rise measured this century
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
              Warm water occupies more volume. The Pacific is rising — the satellite-era record from {seaFirst?.year} to{" "}
              {seaLast?.year} shows a regional increase of around{" "}
              <strong style={{ color: INK }}>{seaRiseMm}mm</strong>. For atoll nations sitting barely 2–3 metres above
              sea level, every centimetre narrows the margin between home and ocean.
            </p>
            <div style={{ background: BG_SUB, borderLeft: `3px solid ${BORDER}`, padding: "12px 16px", borderRadius: "0 3px 3px 0", fontSize: 12, color: INK3, lineHeight: 1.7, marginBottom: 20 }}>
              <strong style={{ color: INK2 }}>Data honesty:</strong> SEA_LVL from the SPC Pacific Data Hub is quantised to 0.1m steps. This supports a uniform regional signal — not a per-country ranking. Do not read precision beyond what the resolution permits.
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <HChart
              height={220}
              options={{
                chart: { type: "area" },
                xAxis: { categories: seaData.map((d) => String(d.year)), lineWidth: 0, tickLength: 0, labels: { style: { fontSize: "10px", color: INK3 } } },
                yAxis: { title: { text: undefined }, gridLineColor: BORDER, labels: { format: "{value:+.2f}m", style: { fontSize: "10px", color: INK3 } } },
                legend: { enabled: false },
                tooltip: { ...HC_TOOLTIP, valueDecimals: 2, valueSuffix: "m", headerFormat: `Anomaly vs ${seaFirst?.year}<br/>` },
                series: [{
                  type: "area",
                  name: "Sea level anomaly",
                  data: seaData.map((d) => d.value),
                  step: "right",
                  color: ACCRETE,
                  lineWidth: 2,
                  marker: { enabled: true, radius: 3.5 },
                  fillColor: {
                    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                    stops: [[0, "rgba(42,120,214,0.18)"], [1, "rgba(42,120,214,0)"]],
                  },
                }],
              }}
            />
            <p style={{ fontSize: 11, color: INK3, marginTop: 8, fontStyle: "italic" }}>
              SEA_LVL · SPC Pacific Data Hub · Regional mean · quantised 0.1m · {seaFirst?.year}–{seaLast?.year}.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, color: INK3, fontSize: 13, fontStyle: "italic" }}>
              <span style={{ fontSize: 20 }}>↓</span>
              The same heat bleaches coral — the island's only seawall
            </div>
          </Reveal>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "0 auto", maxWidth: 680 }} />

      {/* ── BEAT ③b CORAL / BLEACHING ── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: INK2, flexShrink: 0 }}>③b</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK3 }}>Coral Bleaches — The Seawall Dies</span>
            </div>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: INK, marginBottom: 16 }}>
              The reef kept its cover and lost its architecture
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
              Coral is an animal — a colony of polyps in symbiosis with photosynthetic algae. When heat stress
              accumulates, that symbiosis breaks down: the coral expels its algae, turns white, and starves without
              recovery time. The Pacific has been through four global bleaching events since 1998.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
              What happened next is the part most climate narratives get wrong, including an earlier draft of this one.
              Across 50 datasets and 15,482 surveys, GCRMN found Pacific mean hard coral cover stayed{" "}
              <strong style={{ color: INK }}>broadly stable at about 25.5% from 1990 to 2022</strong> — falling sharply
              during the 1998 and 2014–2017 events, then recovering within about six years.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 20 }}>
              The damage is real, but it is not a cover statistic. <strong style={{ color: INK }}>Composition shifted.</strong>{" "}
              Branching Acroporidae and Pocilloporidae declined while massive Poritidae held steady. The reef kept its
              area and lost its architecture — and architecture, not cover, is what breaks waves.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <p style={{ fontSize: 11, color: INK3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Sea surface temperature anomaly with observed global bleaching events
            </p>
            <HChart
              height={240}
              options={{
                chart: { type: "area" },
                xAxis: {
                  categories: bleachData.map((d) => String(d.year)),
                  lineWidth: 0, tickLength: 0,
                  labels: { style: { fontSize: "10px", color: INK3 } },
                  // Observed events, not an inferred threshold.
                  plotBands: BLEACHING_EVENTS.map((e) => {
                    const from = bleachData.findIndex((d) => d.year === e.start);
                    const to = bleachData.findIndex((d) => d.year === e.end);
                    if (from < 0) return null;
                    return {
                      from: from - 0.5,
                      to: (to < 0 ? from : to) + 0.5,
                      color: "rgba(193,54,47,0.10)",
                      label: { text: e.label, style: { color: HEAT_3, fontSize: "9px" }, rotation: 90, align: "left", x: 3, y: 12 },
                    };
                  }).filter(Boolean) as any,
                },
                yAxis: {
                  title: { text: undefined }, gridLineColor: BORDER,
                  labels: { format: "{value:+.1f}°C", style: { fontSize: "10px", color: INK3 } },
                },
                legend: { enabled: false },
                tooltip: { ...HC_TOOLTIP, valueDecimals: 2, valueSuffix: "°C" },
                series: [{
                  type: "area",
                  name: "SST anomaly",
                  data: bleachData.map((d) => d.value),
                  color: HEAT_1,
                  lineWidth: 2,
                  marker: { enabled: false },
                  fillColor: {
                    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                    stops: [[0, "rgba(245,193,78,0.25)"], [1, "rgba(245,193,78,0)"]],
                  },
                }],
              }}
            />
            <p style={{ fontSize: 11, color: INK3, marginTop: 8, fontStyle: "italic" }}>
              Marked bands are the four observed global mass bleaching events. There is no threshold line here on
              purpose — see below. SST_ANOM · SPC Pacific Data Hub, anomaly vs the {BASELINE_TEMP} baseline ·
              GCRMN Pacific Status Report 1980–2023, DOI 10.59387/WIUJ2936.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div style={{ background: BG_SUB, borderLeft: `3px solid ${BORDER}`, padding: "12px 16px", borderRadius: "0 3px 3px 0", fontSize: 12, color: INK3, lineHeight: 1.7, marginTop: 20 }}>
              <strong style={{ color: INK2 }}>Why there is no "+1 °C bleaching threshold" line:</strong> an earlier
              version of this page drew a dashed line at +1 °C and labelled it a bleaching-stress threshold. That was
              wrong in kind, not just in placement. Bleaching stress is Degree Heating Weeks accumulated above a site's
              Maximum Monthly Mean — a local, seasonal-peak quantity. This chart shows an annual mean anomaly, which
              averages away exactly the summer peak that kills coral, so no horizontal line on this axis can represent
              a bleaching threshold. Observed event years are used instead: recorded fact rather than a threshold
              inferred from the wrong axis.
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, color: INK3, fontSize: 13, fontStyle: "italic" }}>
              <span style={{ fontSize: 20 }}>↓</span>
              Higher water, a flatter reef — waves arrive less broken
            </div>
          </Reveal>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "0 auto", maxWidth: 680 }} />

      {/* ── BEAT ④ HINGE ── */}
      <section style={{ padding: "72px 0", background: BG_SUB }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: INK2, flexShrink: 0 }}>④</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK3 }}>The Causal Hinge</span>
            </div>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: INK, marginBottom: 20 }}>
              Everything above converges here
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
              This is not a list of independent problems. It is a cascade. Water has risen. The reef has kept its
              cover and lost its structure. These are two consequences of the same heat, and they act on the same
              thing: how much wave energy reaches the shore. Reefs dissipate on average{" "}
              <strong style={{ color: INK }}>97% of incoming wave energy</strong> (Ferrario et al. 2014), and that
              dissipation is frictional — it depends on hydraulic roughness, built by exactly the branching and
              plating growth forms that declined.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
              Modelling a reef in Mo'orea, Carlot and colleagues found that if structural complexity is halved, the
              wave run-up height that currently occurs <strong style={{ color: INK }}>once in 100 years becomes 50×
              more frequent</strong>. Higher water plus a flatter reef means the extreme arrives more often, even if
              the average does not change much.
            </p>
            <div style={{ background: BG_SUB, borderLeft: `3px solid ${BORDER}`, padding: "12px 16px", borderRadius: "0 3px 3px 0", fontSize: 12, color: INK3, lineHeight: 1.7, marginBottom: 20 }}>
              <strong style={{ color: INK2 }}>The limit of this link:</strong> Carlot et al. 2023 is a hydrodynamic
              model of one site in French Polynesia, and the 50× figure applies to a specific return period — not to
              waves generally. Nothing on this page demonstrates that structural complexity has halved anywhere in the
              Pacific: the GCRMN data establishes the direction of the compositional shift, not its magnitude in
              complexity units. This is a mechanism, stated as a mechanism.
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 0, alignItems: "center", padding: "20px 0", borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
              {[
                { label: "GHG traps heat", color: INK2 },
                { sep: true },
                { label: "91% into ocean", color: INK2 },
                { sep: true },
                { label: "Sea rises", color: ACCRETE },
                { sep: true },
                { label: "Reef bleaches", color: HEAT_2 },
                { sep: true },
                { label: "Waves reach land", color: HEAT_3 },
              ].map((d: any, i) =>
                d.sep
                  ? <span key={i} style={{ margin: "0 10px", color: INK3, fontSize: 14 }}>→</span>
                  : <span key={i} style={{ fontSize: 12, fontWeight: 600, color: d.color, letterSpacing: "0.02em" }}>{d.label}</span>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, color: INK3, fontSize: 13, fontStyle: "italic" }}>
              <span style={{ fontSize: 20 }}>↓</span>
              Now measured directly, from space
            </div>
          </Reveal>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "0 auto", maxWidth: 680 }} />

      {/* ── BEAT ⑤ MEASURED RETREAT — THE MAP PAYOFF ── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: INK2, flexShrink: 0 }}>⑤</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK3 }}>Measured Across the Pacific — Country by Country</span>
            </div>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: INK, marginBottom: 16 }}>
              Every country, every year, real numbers
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 20 }}>
              Every bubble on this map is a real ST_ANOM reading. Drag the year slider to watch four decades of
              warming move across the Pacific, 1985–2025 — bigger and redder means a hotter anomaly that year.
              Double-click any country to zoom in and read its full measured record: temperature history,
              emissions, rainfall, and any disasters recorded against it.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <MapPanel
              countries={data.MAP_COUNTRIES}
              ghg={GHG}
              ghgYear={GHG_YEAR}
              rainAnom={RAIN_ANOM}
              rainYear={RAIN_YEAR}
              affected={AFFECTED}
              winstonEvent={winston}
            />
          </Reveal>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "0 auto", maxWidth: 680 }} />

      {/* ── BEAT ⑥ THE RAIN MOVES ── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <div style={{ maxWidth: 680 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: INK2, flexShrink: 0 }}>⑥</div>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: INK3 }}>The Rain Moves</span>
              </div>
              <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: "clamp(20px,3vw,28px)", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em", color: INK, marginBottom: 16 }}>
                The islands with no rivers are the ones drying out
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
                Rainfall anomaly is not moving in one direction across the Pacific. Fitting a linear trend to each of
                the {RAIN_TRENDS.length} national series in RAIN_ANOM ({RAIN_YEARS[0]}–{RAIN_YEARS[1]}) splits the
                region: <strong style={{ color: INK }}>{RAIN_DRYING} drying, {RAIN_WETTING} wetting</strong>.
              </p>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
                The split is not random. The fastest-drying territories are{" "}
                {driestFour.map((t, i) => (
                  <span key={t.country}>
                    {i > 0 && (i === driestFour.length - 1 ? " and " : ", ")}
                    {t.country} (<strong style={{ color: INK }}>{t.trend.toFixed(1)} mm per decade</strong>)
                  </span>
                ))}
                . {atollsInDriest} of those {driestFour.length} are low atoll states with no rivers, no lakes and no
                highland catchment. They hold fresh water in a thin lens floating on seawater beneath the sand,
                recharged by rain and by nothing else.
              </p>
              <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 14 }}>
                {wettestFour.map((t, i) => (
                  <span key={t.country}>
                    {i > 0 && (i === wettestFour.length - 1 ? " and " : ", ")}
                    {t.country} (+{t.trend.toFixed(1)})
                  </span>
                ))}
                {" "}are getting wetter. Neither direction is neutral. Infrastructure, cropping calendars and catchment
                sizing were built for the distribution that used to hold.
              </p>
              {nauru && newCal && (
                <p style={{ fontSize: 15, lineHeight: 1.8, color: INK2, marginBottom: 24 }}>
                  Nauru's year-to-year standard deviation is <strong style={{ color: INK }}>{nauru.sd.toFixed(1)} mm</strong> —
                  more than twice New Caledonia's {newCal.sd.toFixed(1)} mm on a far smaller land area. The trend is
                  downward and the variance around it is the largest in the region.
                </p>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <p style={{ fontSize: 11, color: INK3, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Precipitation anomaly by territory, {RAIN_YEARS[0]}–{RAIN_YEARS[1]} · sorted driest to wettest
            </p>
            <RainSmallMultiples trends={RAIN_TRENDS} />
            <p style={{ fontSize: 11, color: INK3, marginTop: 10, fontStyle: "italic", maxWidth: 680 }}>
              Linear trend fitted to annual precipitation anomaly, {RAIN_YEARS[0]}–{RAIN_YEARS[1]}, per territory.
              SPC RAIN_ANOM. ENSO drives most of the interannual range in every panel.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, color: INK3, fontSize: 13, fontStyle: "italic" }}>
              <span style={{ fontSize: 20 }}>↓</span>
              Rain is the recharge term. Where it stopped arriving, the water did not
            </div>
          </Reveal>
        </div>
      </section>


      {/* ── MATERIAL & METHOD ── */}
      <section style={{ padding: "64px 0 80px", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem" }}>
          <Reveal>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 18, color: INK, marginBottom: 16 }}>Material and Method</h3>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: INK3, marginBottom: 10 }}>
              All climate figures on this page are computed at load time from the raw SPC Pacific Data Hub{" "}
              <em>DF_CLIMATE_CHANGE</em> export and the affected-people export — the same CSVs shipped in{" "}
              <code>webapp/public/data/</code>, fetched and parsed in the browser. Nothing here is hand-typed.
              Indicators used: ST_ANOM, SST_ANOM, SEA_LVL, RAIN_ANOM, GHG_EMI_CAPITA, VC_DSR_AFFCT.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: INK3, marginBottom: 10 }}>
              Map: Highcharts Maps, world topology loaded at runtime, one bubble per reporting country sized and
              coloured by that year's real ST_ANOM reading — no coastline geometry beyond what SPC actually reports
              per country per year.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: INK3, marginBottom: 10 }}>
              Temperature anomalies are stated against the <strong>{BASELINE_TEMP}</strong> baseline per SPC indicator
              metadata (NOAAGlobalTemp v6.0.0). Reef physics: Ferrario et al. 2014 (97% average wave-energy
              dissipation); Carlot et al. 2023, <em>Scientific Reports</em> (Mo'orea, 1-in-100-year run-up under
              halved structural complexity). Coral trend: GCRMN, Status and Trends of Coral Reefs of the Pacific
              1980–2023, DOI 10.59387/WIUJ2936. Thermal expansion: NASA / earth.gov (~half of 20th-century sea rise).
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: INK3, marginBottom: 18 }}>
              Honesty constraints: SEA_LVL shown as regional only (0.1m quantisation). Drinking-water indicator
              excluded (survey artefacts). Only VC_DSR_AFFCT used from the affected-people dataset — other
              indicators mix economic loss (USD) with persons and were excluded. No forward emissions-scenario
              projection (e.g. RCP8.5) or per-country land-loss-by-2100 figure is shown: no dataset here supports
              one, and inventing precision the data doesn't have is exactly the trap this brief warns against.
              Warming stripes after Ed Hawkins / University of Reading.
            </p>

            <h4 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 14, color: INK, marginBottom: 10 }}>
              Corrections log
            </h4>
            <ul style={{ fontSize: 13, lineHeight: 1.75, color: INK3, paddingLeft: 18, margin: 0 }}>
              <li>
                <strong style={{ color: INK2 }}>Coral cover.</strong> An earlier version stated an estimated 20–30%
                cover decline since 1980, citing GCRMN. GCRMN Pacific finds the opposite: cover broadly stable at
                ~25.5% (1990–2022). The beat now reports the finding the source does support — a compositional shift
                away from branching families, reducing structural complexity.
              </li>
              <li>
                <strong style={{ color: INK2 }}>Temperature baseline.</strong> Corrected from 1850–1900 to{" "}
                {BASELINE_TEMP} per SPC metadata.
              </li>
              <li>
                <strong style={{ color: INK2 }}>Bleaching threshold.</strong> A "+1 °C bleaching-stress threshold"
                line was removed. Bleaching stress is Degree Heating Weeks above a site's Maximum Monthly Mean and
                cannot be expressed as a line on an annual-mean axis. Replaced with the four observed global events.
              </li>
              <li>
                <strong style={{ color: INK2 }}>Land vs sea.</strong> The land/sea comparison was removed: the series
                correlate at r = 0.96–0.99 with a mean difference below the data's own 0.1 °C rounding step.
              </li>
              <li>
                <strong style={{ color: INK2 }}>Carlot citation.</strong> The 50× figure is now correctly scoped to
                the 1-in-100-year wave run-up height at one modelled site in Mo'orea, not to waves generally.
              </li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: BG_SUB, borderTop: `1px solid ${BORDER}`, padding: "24px 0" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 11, color: INK3 }}>
            Pacific DataViz Challenge 2026 · Climate Change
          </div>
          <div style={{ fontSize: 11, color: INK3 }}>
            Data: SPC Pacific Data Hub · Digital Earth Pacific · GCRMN · NASA · NOAA
          </div>
        </div>
      </footer>

    </div>
  );
}
