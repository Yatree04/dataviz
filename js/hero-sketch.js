// js/hero-sketch.js
// p5.js instance-mode: gentle animated wave lines in the hero background.
// Inspired by the reference video's clean editorial aesthetic.
// Draws ~6 slow sine waves in muted blue/gray that softly animate behind the headline.

export function initHeroSketch(canvasId) {
    const container = document.getElementById(canvasId);
    if (!container || typeof p5 === 'undefined') return;

    // eslint-disable-next-line no-new
    new p5((sk) => {
        const WAVE_COUNT = 7;
        let offsets = [];
        let speeds = [];
        let amps = [];
        let freqs = [];
        let colors = [];

        sk.setup = () => {
            const c = sk.createCanvas(container.offsetWidth, container.offsetHeight);
            c.parent(container);
            sk.noFill();

            for (let i = 0; i < WAVE_COUNT; i++) {
                offsets.push(sk.random(0, sk.TWO_PI));
                speeds.push(sk.random(0.004, 0.012));
                amps.push(sk.random(18, 60));
                freqs.push(sk.random(0.003, 0.009));
                // Muted blue-gray strokes: rgba(42, 120, 214, α)
                colors.push(sk.color(42, 120, 214, sk.random(12, 28)));
            }
        };

        sk.draw = () => {
            sk.clear();
            const w = sk.width, h = sk.height;

            for (let i = 0; i < WAVE_COUNT; i++) {
                offsets[i] += speeds[i];
                const baseY = sk.map(i, 0, WAVE_COUNT - 1, h * 0.2, h * 0.85);

                sk.stroke(colors[i]);
                sk.strokeWeight(1.2);
                sk.beginShape();
                for (let xv = 0; xv <= w; xv += 4) {
                    const yv = baseY + amps[i] * sk.sin(freqs[i] * xv + offsets[i]);
                    sk.vertex(xv, yv);
                }
                sk.endShape();
            }
        };

        sk.windowResized = () => {
            sk.resizeCanvas(container.offsetWidth, container.offsetHeight);
        };
    });
}
