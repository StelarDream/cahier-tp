/* bode.js
 * Live Bode diagram widget.
 * Plots g_dB(f) and Δφ(f) on semi-log axes.
 * Supports RC low-pass, RC high-pass, RL low-pass, RL high-pass,
 * RLC band-pass, RLC low-pass.
 *
 * Usage:
 *   BodeWidget.init('canvas-id')
 */

const BodeWidget = (function () {

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // State
    let filterType = 'rc-low';
    let R = 1000;
    let C = 1e-6;
    let L = 0.1;

    // Wire filter type selector
    const typeSelect = document.getElementById(canvasId + '-type');
    if (typeSelect) typeSelect.addEventListener('change', function () {
      filterType = this.value;
      updateVisibility();
      draw();
    });

    // Wire sliders
    function wireSlider(suffix, setter, formatter) {
      const slider = document.getElementById(canvasId + '-' + suffix);
      const out    = document.getElementById(canvasId + '-' + suffix + '-out');
      if (!slider) return;
      slider.addEventListener('input', function () {
        setter(parseFloat(this.value));
        if (out) out.textContent = formatter(parseFloat(this.value));
        draw();
      });
      if (out && slider) out.textContent = formatter(parseFloat(slider.value));
    }

    wireSlider('R', v => { R = v; },       v => v >= 1000 ? (v/1000).toFixed(1)+'kΩ' : v+'Ω');
    wireSlider('C', v => { C = v * 1e-6; }, v => v.toFixed(1)+'µF');
    wireSlider('L', v => { L = v * 1e-3; }, v => v.toFixed(0)+'mH');

    function updateVisibility() {
      const cRow = document.getElementById(canvasId + '-C-row');
      const lRow = document.getElementById(canvasId + '-L-row');
      const needsC = filterType.startsWith('rc') || filterType.startsWith('rlc');
      const needsL = filterType.startsWith('rl') || filterType.startsWith('rlc');
      if (cRow) cRow.style.display = needsC ? '' : 'none';
      if (lRow) lRow.style.display = needsL ? '' : 'none';
    }

    // Transfer function H(jω) → {re, im}
    function H(omega) {
      switch (filterType) {
        case 'rc-low': {
          // H = 1 / (1 + jRCω)
          const x = R * C * omega;
          return { re: 1/(1+x*x), im: -x/(1+x*x) };
        }
        case 'rc-high': {
          // H = jRCω / (1 + jRCω)
          const x = R * C * omega;
          return { re: x*x/(1+x*x), im: x/(1+x*x) };
        }
        case 'rl-low': {
          // H = R / (R + jLω) = 1 / (1 + j(L/R)ω)
          const x = (L / R) * omega;
          return { re: 1/(1+x*x), im: -x/(1+x*x) };
        }
        case 'rl-high': {
          // H = jLω / (R + jLω)
          const x = (L / R) * omega;
          return { re: x*x/(1+x*x), im: x/(1+x*x) };
        }
        case 'rlc-band': {
          // Band-pass: output across R
          // H = jQx / (1 - x² + jQx)  where x = ω/ω₀, Q = ω₀L/R, ω₀ = 1/√(LC)
          const omega0 = 1 / Math.sqrt(L * C);
          const Q = omega0 * L / R;
          const x = omega / omega0;
          const dre = 1 - x*x;
          const dim = x / Q;
          const denom = dre*dre + dim*dim;
          // H = (jx/Q) / (1-x²+jx/Q)
          return { re: (x/Q)*dim/denom, im: (x/Q)*dre/denom };
        }
        case 'rlc-low': {
          // Low-pass: output across C
          // H = 1 / (1 - x² + jx/Q)
          const omega0 = 1 / Math.sqrt(L * C);
          const Q = omega0 * L / R;
          const x = omega / omega0;
          const dre = 1 - x*x;
          const dim = x / Q;
          const denom = dre*dre + dim*dim;
          return { re: dre/denom, im: -dim/denom };
        }
        default:
          return { re: 1, im: 0 };
      }
    }

    function getKeyFreqs() {
      switch (filterType) {
        case 'rc-low':
        case 'rc-high':
          return { fc: 1 / (2 * Math.PI * R * C), label: 'f_c = 1/(2πRC)' };
        case 'rl-low':
        case 'rl-high':
          return { fc: R / (2 * Math.PI * L), label: 'f_c = R/(2πL)' };
        case 'rlc-band':
        case 'rlc-low': {
          const omega0 = 1 / Math.sqrt(L * C);
          const Q = omega0 * L / R;
          const f0 = omega0 / (2 * Math.PI);
          return { fc: f0, f0, Q, label: 'f₀ = 1/(2π√LC)' };
        }
        default:
          return { fc: 1000 };
      }
    }

    function draw() {
      const W = canvas.width;
      const H_canvas = canvas.height;
      ctx.clearRect(0, 0, W, H_canvas);

      const accent   = getCSSVar('--accent')     || '#c8a96e';
      const layer0   = getCSSVar('--layer-0')    || '#6e9ec8';
      const layer4   = getCSSVar('--layer-4')    || '#9e7ac8';
      const muted    = getCSSVar('--text-muted') || '#7a7570';
      const dim      = getCSSVar('--text-dim')   || '#4a4540';
      const border   = getCSSVar('--border')     || '#2a2a2a';
      const bgCard   = getCSSVar('--bg-card')    || '#161616';
      const textCol  = getCSSVar('--text')       || '#e8e4dc';
      const mono     = getCSSVar('--font-mono')  || 'monospace';

      // Layout: two panels stacked
      const PAD_L = 52, PAD_R = 16, PAD_TOP = 18, PAD_MID = 12;
      const panelH = (H_canvas - PAD_TOP * 2 - PAD_MID) / 2;
      const plotW = W - PAD_L - PAD_R;

      // Frequency range: 10 Hz to 10 MHz
      const F_MIN = 10, F_MAX = 1e7;
      const logFMin = Math.log10(F_MIN), logFMax = Math.log10(F_MAX);

      function fToX(f) {
        return PAD_L + (Math.log10(f) - logFMin) / (logFMax - logFMin) * plotW;
      }

      // ── Panel 1: gain in dB ───────────────────────────────────────────────
      const g_top = PAD_TOP;
      const g_bot = PAD_TOP + panelH;
      const G_MAX = 6, G_MIN = -60;

      function gToY(gdB) {
        return g_bot - (gdB - G_MIN) / (G_MAX - G_MIN) * panelH;
      }

      drawPanel(ctx, PAD_L, g_top, plotW, panelH, bgCard, border);

      // dB grid lines
      [-60, -40, -20, -3, 0].forEach(g => {
        const y = gToY(g);
        ctx.strokeStyle = g === -3 ? accent + '44' : dim + '55';
        ctx.lineWidth = g === 0 || g === -3 ? 0.8 : 0.5;
        ctx.setLineDash(g === -3 ? [4, 3] : []);
        hline(ctx, PAD_L, y, PAD_L + plotW);
        ctx.setLineDash([]);
        ctx.fillStyle = g === -3 ? accent : dim;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'right';
        ctx.fillText(g + 'dB', PAD_L - 4, y + 3);
      });

      // Frequency grid
      drawFreqGrid(ctx, PAD_L, g_top, plotW, panelH, fToX, dim, mono, F_MIN, F_MAX, true);

      // Axis label
      ctx.fillStyle = muted;
      ctx.font = '10px ' + mono;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(12, g_top + panelH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('g_dB', 0, 0);
      ctx.restore();

      // ── Asymptote lines ────────────────────────────────────────────────────
      const kf = getKeyFreqs();
      if (kf.fc) {
        const isSecondOrder = filterType.startsWith('rlc');
        const slope = isSecondOrder ? -40 : -20; // dB/decade
        const slopePos = isSecondOrder ? 40 : 20;
        const fc = kf.fc;
        const xc = fToX(fc);

        ctx.strokeStyle = dim + '66';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);

        if (filterType === 'rc-low' || filterType === 'rl-low' || filterType === 'rlc-low') {
          // Flat at 0dB, then slope downward
          hline(ctx, PAD_L, gToY(0), xc);
          slopeLine(ctx, xc, gToY(0), fToX(F_MAX), gToY(0 + slope * Math.log10(F_MAX / fc)),
                    PAD_L, PAD_L + plotW, g_top, g_bot);
        } else if (filterType === 'rc-high' || filterType === 'rl-high') {
          // Rising slope then flat at 0dB
          slopeLine(ctx, fToX(F_MIN), gToY(0 - slopePos * Math.log10(fc / F_MIN)),
                    xc, gToY(0), PAD_L, PAD_L + plotW, g_top, g_bot);
          hline(ctx, xc, gToY(0), PAD_L + plotW);
        }
        ctx.setLineDash([]);

        // Vertical marker at fc
        ctx.strokeStyle = accent + '66';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 3]);
        vline(ctx, xc, g_top, g_bot);
        ctx.setLineDash([]);

        // fc label
        ctx.fillStyle = accent;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'center';
        ctx.fillText(kf.label, xc, g_top + 10);

        // −3dB dot
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(xc, gToY(-3), 4, 0, 2 * Math.PI);
        ctx.fill();
      }

      // ── Gain curve ─────────────────────────────────────────────────────────
      ctx.strokeStyle = layer0;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= 600; i++) {
        const logF = logFMin + (i / 600) * (logFMax - logFMin);
        const f = Math.pow(10, logF);
        const omega = 2 * Math.PI * f;
        const h = H(omega);
        const mag = Math.sqrt(h.re * h.re + h.im * h.im);
        const gdB = 20 * Math.log10(Math.max(mag, 1e-9));
        const x = PAD_L + (logF - logFMin) / (logFMax - logFMin) * plotW;
        const y = gToY(Math.max(G_MIN, Math.min(G_MAX, gdB)));
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ── Panel 2: phase ────────────────────────────────────────────────────
      const p_top = g_bot + PAD_MID;
      const p_bot = p_top + panelH;
      const PHI_MAX = 100, PHI_MIN = -100;

      function phiToY(phi_deg) {
        return p_bot - (phi_deg - PHI_MIN) / (PHI_MAX - PHI_MIN) * panelH;
      }

      drawPanel(ctx, PAD_L, p_top, plotW, panelH, bgCard, border);

      // Phase grid lines
      [-90, -45, 0, 45, 90].forEach(p => {
        const y = phiToY(p);
        ctx.strokeStyle = p === 0 ? dim + '88' : dim + '44';
        ctx.lineWidth = p === 0 ? 0.8 : 0.5;
        ctx.setLineDash(p === -45 || p === 45 ? [4, 3] : []);
        hline(ctx, PAD_L, y, PAD_L + plotW);
        ctx.setLineDash([]);
        ctx.fillStyle = dim;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'right';
        ctx.fillText(p + '°', PAD_L - 4, y + 3);
      });

      drawFreqGrid(ctx, PAD_L, p_top, plotW, panelH, fToX, dim, mono, F_MIN, F_MAX, false);

      // Axis label
      ctx.fillStyle = muted;
      ctx.font = '10px ' + mono;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(12, p_top + panelH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Δφ', 0, 0);
      ctx.restore();

      // fc marker on phase panel
      if (kf.fc) {
        ctx.strokeStyle = accent + '44';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 3]);
        vline(ctx, fToX(kf.fc), p_top, p_bot);
        ctx.setLineDash([]);
      }

      // Phase curve
      ctx.strokeStyle = layer4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      first = true;
      for (let i = 0; i <= 600; i++) {
        const logF = logFMin + (i / 600) * (logFMax - logFMin);
        const f = Math.pow(10, logF);
        const omega = 2 * Math.PI * f;
        const h = H(omega);
        const phi = Math.atan2(h.im, h.re) * 180 / Math.PI;
        const x = PAD_L + (logF - logFMin) / (logFMax - logFMin) * plotW;
        const y = phiToY(Math.max(PHI_MIN, Math.min(PHI_MAX, phi)));
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Bottom axis: frequency labels
      ctx.fillStyle = muted;
      ctx.font = '9px ' + mono;
      ctx.textAlign = 'center';
      [10, 100, 1e3, 1e4, 1e5, 1e6, 1e7].forEach(f => {
        const x = fToX(f);
        const label = f >= 1e6 ? (f/1e6)+'MHz' : f >= 1e3 ? (f/1e3)+'kHz' : f+'Hz';
        ctx.fillText(label, x, p_bot + 12);
      });
      ctx.fillText('f', PAD_L + plotW + 8, p_bot + 12);

      // Legend
      ctx.fillStyle = layer0;
      ctx.font = '10px ' + mono;
      ctx.textAlign = 'left';
      ctx.fillText('— g_dB', PAD_L + 8, g_top + panelH - 8);
      ctx.fillStyle = layer4;
      ctx.fillText('— Δφ', PAD_L + 8, p_top + panelH - 8);

      // Quality factor readout for RLC
      if (filterType.startsWith('rlc') && kf.Q) {
        ctx.fillStyle = muted;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'right';
        ctx.fillText('Q = ' + kf.Q.toFixed(2) + '  f₀ = ' + formatFreq(kf.f0),
                     PAD_L + plotW - 4, g_top + 12);
      }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    function drawPanel(ctx, x, y, w, h, bg, border) {
      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, h, 4);
      ctx.fill(); ctx.stroke();
    }

    function drawFreqGrid(ctx, padL, top, plotW, panelH, fToX, dim, mono, fMin, fMax, labels) {
      for (let decade = 1; decade <= 7; decade++) {
        const f0 = Math.pow(10, decade);
        if (f0 < fMin || f0 > fMax) continue;
        const x = fToX(f0);
        ctx.strokeStyle = dim + '44';
        ctx.lineWidth = 0.5;
        vline(ctx, x, top, top + panelH);
        for (let m = 2; m <= 9; m++) {
          const fm = f0 * m;
          if (fm > fMax) break;
          const xm = fToX(fm);
          ctx.strokeStyle = dim + '22';
          ctx.lineWidth = 0.3;
          vline(ctx, xm, top, top + panelH);
        }
      }
    }

    function hline(ctx, x1, y, x2) {
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    }
    function vline(ctx, x, y1, y2) {
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
    }
    function slopeLine(ctx, x1, y1, x2, y2, xMin, xMax, yMin, yMax) {
      // Clip to panel bounds
      const cx1 = Math.max(xMin, Math.min(xMax, x1));
      const cx2 = Math.max(xMin, Math.min(xMax, x2));
      const t1 = (cx1 - x1) / (x2 - x1 + 1e-12);
      const t2 = (cx2 - x1) / (x2 - x1 + 1e-12);
      const cy1 = y1 + t1 * (y2 - y1);
      const cy2 = y1 + t2 * (y2 - y1);
      ctx.beginPath(); ctx.moveTo(cx1, cy1); ctx.lineTo(cx2, cy2); ctx.stroke();
    }
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
      ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);
      ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);
      ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);
      ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    }
    function formatFreq(f) {
      if (f >= 1e6) return (f/1e6).toFixed(2)+'MHz';
      if (f >= 1e3) return (f/1e3).toFixed(2)+'kHz';
      return f.toFixed(1)+'Hz';
    }

    updateVisibility();
    draw();
    return { draw };
  }

  return { init };
})();
