/* phasor.js
 * Animated phasor widget.
 * Shows X̲ = X₀ e^{jφ} rotating in the complex plane,
 * with Re{X̲ e^{jωt}} projected onto a time axis.
 *
 * Usage:
 *   PhasorWidget.init('canvas-id', { omega, phi, amplitude })
 */

const PhasorWidget = (function () {

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function init(canvasId, opts) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width, cssH = canvas.height;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    ctx.scale(dpr, dpr);

    // Options with defaults
    let omega = (opts && opts.omega) || 1.0;   // rad/s (normalised, visual only)
    let phi   = (opts && opts.phi)   || 0.0;   // initial phase rad
    let amp   = (opts && opts.amplitude) || 1.0;

    // Slider wiring
    const omegaSlider = document.getElementById(canvasId + '-omega');
    const phiSlider   = document.getElementById(canvasId + '-phi');
    const ampSlider   = document.getElementById(canvasId + '-amp');
    const omegaOut    = document.getElementById(canvasId + '-omega-out');
    const phiOut      = document.getElementById(canvasId + '-phi-out');
    const ampOut      = document.getElementById(canvasId + '-amp-out');
    const playBtn     = document.getElementById(canvasId + '-play');

    if (omegaSlider) omegaSlider.addEventListener('input', function () {
      omega = parseFloat(this.value);
      if (omegaOut) omegaOut.textContent = omega.toFixed(1);
    });
    if (phiSlider) phiSlider.addEventListener('input', function () {
      phi = parseFloat(this.value) * Math.PI / 180;
      if (phiOut) phiOut.textContent = Math.round(parseFloat(this.value)) + '°';
    });
    if (ampSlider) ampSlider.addEventListener('input', function () {
      amp = parseFloat(this.value);
      if (ampOut) ampOut.textContent = amp.toFixed(1);
    });

    // Animation state
    let playing = true;
    let t = 0;
    let lastTs = null;
    let rafId = null;
    const SPEED = 0.6; // seconds per 2π at omega=1

    // Trail buffer for the time projection
    const TRAIL_LEN = 300;
    const trail = new Float32Array(TRAIL_LEN);
    let trailHead = 0;

    function step(ts) {
      if (lastTs === null) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (playing) t += dt * SPEED * omega;

      // Push to trail
      trail[trailHead % TRAIL_LEN] = amp * Math.cos(t + phi);
      trailHead++;

      draw();
      rafId = requestAnimationFrame(step);
    }

    function draw() {
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const accent  = getCSSVar('--accent')      || '#c8a96e';
      const layer0  = getCSSVar('--layer-0')     || '#6e9ec8';
      const muted   = getCSSVar('--text-muted')  || '#7a7570';
      const dim     = getCSSVar('--text-dim')    || '#4a4540';
      const border  = getCSSVar('--border')      || '#2a2a2a';
      const bgCard  = getCSSVar('--bg-card')     || '#161616';
      const textCol = getCSSVar('--text')        || '#e8e4dc';

      // Layout: left half = complex plane, right half = time projection
      const SPLIT = Math.floor(W * 0.45);
      const planeR = Math.min(SPLIT, H) * 0.38;  // radius of complex plane circle
      const planeCX = Math.floor(SPLIT / 2);
      const planeCY = Math.floor(H / 2);

      // ── Background panels ──────────────────────────────────────────────
      ctx.fillStyle = bgCard;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      roundRect(ctx, 6, 6, SPLIT - 12, H - 12, 6);
      ctx.fill(); ctx.stroke();

      roundRect(ctx, SPLIT + 6, 6, W - SPLIT - 12, H - 12, 6);
      ctx.fill(); ctx.stroke();

      // ── Complex plane axes ─────────────────────────────────────────────
      ctx.strokeStyle = dim;
      ctx.lineWidth = 0.8;
      // x-axis (Re)
      line(ctx, planeCX - planeR - 10, planeCY, planeCX + planeR + 16, planeCY);
      // y-axis (Im)
      line(ctx, planeCX, planeCY + planeR + 10, planeCX, planeCY - planeR - 16);

      // axis labels
      ctx.fillStyle = muted;
      ctx.font = '11px ' + (getCSSVar('--font-mono') || 'monospace');
      ctx.textAlign = 'center';
      ctx.fillText('Re', planeCX + planeR + 14, planeCY - 6);
      ctx.textAlign = 'left';
      ctx.fillText('Im', planeCX + 5, planeCY - planeR - 8);

      // unit circle
      ctx.strokeStyle = dim;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(planeCX, planeCY, planeR, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Phasor ────────────────────────────────────────────────────────
      const angle = t + phi;
      const px = planeCX + amp * planeR * Math.cos(angle);
      const py = planeCY - amp * planeR * Math.sin(angle);  // canvas y is flipped

      // Phase arc
      ctx.strokeStyle = accent + '55';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(planeCX, planeCY, planeR * 0.28, 0, -angle, angle > 0);
      ctx.stroke();

      // φ label
      if (Math.abs(phi) > 0.05) {
        const labelA = -angle / 2;
        ctx.fillStyle = accent + 'aa';
        ctx.font = '11px ' + (getCSSVar('--font-mono') || 'monospace');
        ctx.textAlign = 'center';
        ctx.fillText('φ', planeCX + planeR * 0.38 * Math.cos(labelA),
                         planeCY + planeR * 0.38 * Math.sin(labelA));
      }

      // Projection lines (dashed)
      ctx.strokeStyle = layer0 + '55';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      line(ctx, px, py, px, planeCY);          // vertical drop to Re axis
      line(ctx, planeCX, py, px, py);           // horizontal to Im axis
      ctx.setLineDash([]);

      // Re component on axis
      ctx.fillStyle = layer0 + 'cc';
      ctx.beginPath();
      ctx.arc(px, planeCY, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Phasor arrow
      arrow(ctx, planeCX, planeCY, px, py, accent, 2.2, 8);

      // Phasor tip dot
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, 2 * Math.PI);
      ctx.fill();

      // X₀ label near tip
      ctx.fillStyle = textCol;
      ctx.font = '12px ' + (getCSSVar('--font-mono') || 'monospace');
      ctx.textAlign = px > planeCX ? 'left' : 'right';
      ctx.fillText('X̲', px + (px > planeCX ? 7 : -7), py - 6);

      // ── Time projection ───────────────────────────────────────────────
      const timeX0 = SPLIT + 18;
      const timeW  = W - SPLIT - 30;
      const timeCY = Math.floor(H / 2);
      const timeAmp = (H / 2 - 30) * amp;

      // Axes
      ctx.strokeStyle = dim;
      ctx.lineWidth = 0.8;
      line(ctx, timeX0, timeCY, timeX0 + timeW, timeCY);  // time axis
      line(ctx, timeX0, timeCY - timeAmp - 14, timeX0, timeCY + timeAmp + 14); // amplitude axis

      ctx.fillStyle = muted;
      ctx.font = '11px ' + (getCSSVar('--font-mono') || 'monospace');
      ctx.textAlign = 'left';
      ctx.fillText('t', timeX0 + timeW - 4, timeCY - 6);
      ctx.textAlign = 'center';
      ctx.fillText('Re{X̲ e^jωt}', timeX0 + timeW / 2, timeCY + timeAmp + 22);

      // Trail waveform
      ctx.strokeStyle = layer0;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      const trailCount = Math.min(trailHead, TRAIL_LEN);
      for (let i = 0; i < trailCount; i++) {
        const idx = (trailHead - 1 - i + TRAIL_LEN) % TRAIL_LEN;
        const x = timeX0 + timeW - (i / TRAIL_LEN) * timeW;
        const y = timeCY - trail[idx] * (timeAmp / amp);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Current point on time axis
      const curY = timeCY - amp * Math.cos(angle) * (timeAmp / amp);
      ctx.fillStyle = layer0;
      ctx.beginPath();
      ctx.arc(timeX0 + timeW, curY, 5, 0, 2 * Math.PI);
      ctx.fill();

      // Connecting dashed line from Re projection to time trace
      ctx.strokeStyle = layer0 + '44';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      line(ctx, px, planeCY, timeX0 + timeW, curY);
      ctx.setLineDash([]);

      // ── Labels ────────────────────────────────────────────────────────
      ctx.fillStyle = muted;
      ctx.font = '10px ' + (getCSSVar('--font-mono') || 'monospace');
      ctx.textAlign = 'center';
      ctx.fillText('plan complexe', planeCX, H - 10);
      ctx.fillText('domaine temporel', timeX0 + timeW / 2, H - 10);
    }

    // Play/pause
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        playing = !playing;
        this.textContent = playing ? '⏸ Pause' : '▶ Animer';
        if (playing) this.classList.add('playing');
        else this.classList.remove('playing');
        if (playing) lastTs = null;
      });
    }

    rafId = requestAnimationFrame(step);
    return { stop: () => { cancelAnimationFrame(rafId); } };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function arrow(ctx, x1, y1, x2, y2, color, lineW, headLen) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7),
               y2 - headLen * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7),
               y2 - headLen * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return { init };
})();