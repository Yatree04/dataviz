// src/YearScrubber.tsx
// A tick-marked year bar for the coastline map — one tick per year of real
// data (1999–2023, shorelines_annual). Drag or click the track, use arrow
// keys, or hit Play to animate through the whole range automatically.

import { useEffect, useRef, useState } from "react";

const INK = "#020817";
const INK2 = "#1f2937";
const INK3 = "#9ca3af";
const BORDER = "#e2e8f0";
const ACCRETE = "#2a78d6";

function yearColor(year: number, min: number, max: number) {
  const t = (year - min) / (max - min);
  const r = Math.round(202 + t * (232 - 202));
  const g = Math.round(233 + t * (131 - 233));
  const b = Math.round(255 + t * (58 - 255));
  return `rgb(${r},${g},${b})`;
}

export default function YearScrubber({
  min, max, value, onChange, tickEvery = 4,
}: {
  min: number; max: number; value: number; onChange: (year: number) => void; tickEvery?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);

  const pct = ((value - min) / (max - min)) * 100;
  const thumbColor = yearColor(value, min, max);

  const yearFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(min + t * (max - min));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => onChange(yearFromClientX(e.clientX));
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Play: step forward one year at a time, looping back to the start.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      onChange(value >= max ? min : value + 1);
    }, 450);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, value]);

  const ticks: number[] = [];
  for (let y = min; y < max; y += tickEvery) ticks.push(y);
  ticks.push(max);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause year animation" : "Play year animation"}
          style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            border: `1px solid ${BORDER}`, background: playing ? INK : "#fff",
            color: playing ? "#fff" : INK2, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <div style={{ flex: 1, position: "relative", padding: "16px 0 0" }}>
          {/* current-year bubble */}
          <div
            style={{
              position: "absolute", top: -4, left: `${pct}%`, transform: "translate(-50%, -100%)",
              fontSize: 11, fontWeight: 700, fontFamily: "'Inter',sans-serif", color: INK,
              background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 4,
              padding: "2px 7px", whiteSpace: "nowrap", pointerEvents: "none",
            }}
          >
            {value}
          </div>

          {/* track */}
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Coastline year"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            onPointerDown={(e) => { setPlaying(false); setDragging(true); onChange(yearFromClientX(e.clientX)); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); onChange(Math.min(max, value + 1)); }
              if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); onChange(Math.max(min, value - 1)); }
              if (e.key === "Home") { e.preventDefault(); setPlaying(false); onChange(min); }
              if (e.key === "End") { e.preventDefault(); setPlaying(false); onChange(max); }
            }}
            style={{
              position: "relative", height: 6, borderRadius: 999, background: BORDER,
              cursor: "pointer", touchAction: "none", outline: "none",
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pct}%`, borderRadius: 999, background: ACCRETE, opacity: 0.5, pointerEvents: "none" }} />
            <div
              style={{
                position: "absolute", top: "50%", left: `${pct}%`, transform: "translate(-50%, -50%)",
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                border: `3px solid ${thumbColor}`, boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* ticks */}
          <div style={{ position: "relative", height: 16, marginTop: 4 }}>
            {ticks.map((y) => (
              <button
                key={y}
                onClick={() => { setPlaying(false); onChange(y); }}
                style={{
                  position: "absolute", left: `${((y - min) / (max - min)) * 100}%`, transform: "translateX(-50%)",
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontSize: 10, color: y === value ? INK : INK3, fontWeight: y === value ? 700 : 400,
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
