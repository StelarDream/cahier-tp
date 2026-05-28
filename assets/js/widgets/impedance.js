/* impedance.js
 * Interactive impedance explorer.
 * Shows Z_R, Z_C, Z_L as vectors in the complex plane.
 * Sliders control R, C, L, and ω.
 *
 * Usage:
 *   ImpedanceWidget.init('canvas-id')
 */

const ImpedanceWidget = (function () {

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Default values
    let R = 1000;    // Ω
    let C = 1e-6;    // F
    let L = 0.1;     // H
    let omega = 1000; // rad/s

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
      if (out) out.textContent = formatter(parseFloat(slider.value));
    }

    wireSlider('R', v => { R = v; }, v => v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(0));
    wireSlider('C', v => { C = v * 1e-6; }, v => v.toFixed(1)+'µF');
    wireSlider('L', v => { L = v * 1e-3; }, v => v.toFixed(0)+'mH');
    wireSlider('omega', v => { omega = v; }, v => {
      const f = v / (2 * Math.PI);
      return f >= 1000 ? (f/1000).toFixed(1)+'kHz' : f.toFixed(0)+'Hz';
    });

    function draw() {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const accent  = getCSSVar('--accent')     || '#c8a96e';
      const layer0  = getCSSVar('--layer-0')    || '#6e9ec8';
      const layer2  = getCSSVar('--layer-2')    || '#c87a9e';
      const layer4  = getCSSVar('--layer-4')    || '#9e7ac8';
      const muted   = getCSSVar('--text-muted') || '#7a7570';
      const dim     = getCSSVar('--text-dim')   || '#4a4540';
      const border  = getCSSVar('--border')     || '#2a2a2a';
      const bgCard  = getCSSVar('--bg-card')    || '#161616';
      const textCol = getCSSVar('--text')       || '#e8e4dc';
      const mono    = getCSSVar('--font-mono')  || 'monospace';

      // Compute impedances
      const ZR_re = R;       const ZR_im = 0;
      const ZC_re = 0;       const ZC_im = (omega > 0) ? -1 / (C * omega) : -1e9;
      const ZL_re = 0;       const ZL_im = L * omega;

      // Find scale: max magnitude
      const mags = [
        Math.sqrt(ZR_re**2 + ZR_im**2),
        Math.sqrt(ZC_re**2 + ZC_im**2),
        Math.sqrt(ZL_re**2 + ZL_im**2),
      ];
      const maxMag = Math.max(...mags, 1);

      // Layout — split: left = complex plane, right = readout
      const SPLIT = Math.floor(W * 0.62);
      const cx = Math.floor(SPLIT / 2);
      const cy = Math.floor(H / 2);
      const scale = Math.min(cx, cy) * 0.78 / maxMag;

      // Background
      ctx.fillStyle = bgCard;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      roundRect(ctx, 4, 4, SPLIT - 8, H - 8, 6); ctx.fill(); ctx.stroke();
      roundRect(ctx, SPLIT + 4, 4, W - SPLIT - 8, H - 8, 6); ctx.fill(); ctx.stroke();

      // Grid circles (decade markers)
      const decades = [maxMag * 0.25, maxMag * 0.5, maxMag * 0.75, maxMag];
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 3]);
      decades.forEach(r => {
        const pr = r * scale;
        ctx.strokeStyle = dim + '88';
        ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillStyle = dim;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'left';
        const label = r >= 1000 ? (r/1000).toFixed(1)+'kΩ' : r.toFixed(0)+'Ω';
        ctx.fillText(label, cx + pr * Math.cos(-0.5) + 2, cy + pr * Math.sin(-0.5));
      });
      ctx.setLineDash([]);

      // Axes
      ctx.strokeStyle = dim;
      ctx.lineWidth = 0.8;
      line(ctx, cx - SPLIT/2 + 10, cy, cx + SPLIT/2 - 10, cy);
      line(ctx, cx, cy + H/2 - 10, cx, cy - H/2 + 10);

      ctx.fillStyle = muted;
      ctx.font = '11px ' + mono;
      ctx.textAlign = 'center';
      ctx.fillText('Re(Z) / Ω', cx + SPLIT/2 - 18, cy - 6);
      ctx.textAlign = 'left';
      ctx.fillText('Im(Z) / Ω', cx + 5, cy - H/2 + 18);

      // Draw each impedance vector
      const vectors = [
        { re: ZR_re, im: ZR_im, color: layer0,  label: 'Z_R = R',               sub: formatOhm(R) },
        { re: ZC_re, im: ZC_im, color: layer2,  label: 'Z_C = 1/jCω',           sub: formatOhm(Math.abs(ZC_im)) + ' (−j)' },
        { re: ZL_re, im: ZL_im, color: layer4,  label: 'Z_L = jLω',             sub: formatOhm(ZL_im) + ' (+j)' },
      ];

      vectors.forEach(v => {
        const tx = cx + v.re * scale;
        const ty = cy - v.im * scale;   // Im axis upward
        // Dashed reference lines to axes
        ctx.strokeStyle = v.color + '33';
        ctx.lineWidth = 0.7;
        ctx.setLineDash([2, 3]);
        line(ctx, tx, ty, tx, cy);
        line(ctx, cx, ty, tx, ty);
        ctx.setLineDash([]);
        // Vector arrow
        arrowVec(ctx, cx, cy, tx, ty, v.color, 2.0, 9);
        // Tip dot
        ctx.fillStyle = v.color;
        ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 2 * Math.PI); ctx.fill();
      });

      // ── Right panel: readout ──────────────────────────────────────────
      const rx = SPLIT + 16;
      let ry = 28;
      const lineH = (H - 40) / 4;

      ctx.fillStyle = muted;
      ctx.font = '10px ' + mono;
      ctx.textAlign = 'left';
      ctx.fillText('f = ' + formatFreq(omega), rx, ry); ry += 16;
      ctx.fillText('ω = ' + formatOmega(omega), rx, ry); ry += lineH * 0.6;

      vectors.forEach((v, i) => {
        const mag = Math.sqrt(v.re**2 + v.im**2);
        const arg = Math.atan2(v.im, v.re) * 180 / Math.PI;

        ctx.fillStyle = v.color;
        ctx.font = '500 11px ' + mono;
        ctx.fillText(v.label, rx, ry);
        ry += 16;

        ctx.fillStyle = muted;
        ctx.font = '10px ' + mono;
        ctx.fillText('|Z| = ' + formatOhm(mag), rx, ry); ry += 14;
        ctx.fillText('∠Z = ' + arg.toFixed(1) + '°', rx, ry); ry += lineH * 0.55;
      });

      // Legend dots
      const legendY = H - 14;
      vectors.forEach((v, i) => {
        const lx = rx + i * (W - SPLIT - rx) / 3;
        ctx.fillStyle = v.color;
        ctx.beginPath(); ctx.arc(lx, legendY - 4, 4, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = dim;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'left';
        const short = ['R','C','L'][i];
        ctx.fillText('Z_'+short, lx + 8, legendY);
      });
    }

    draw();
    return { draw };
  }

  // ── Format helpers ────────────────────────────────────────────────────────

  function formatOhm(v) {
    if (v >= 1e6)  return (v/1e6).toFixed(2) + ' MΩ';
    if (v >= 1000) return (v/1000).toFixed(2) + ' kΩ';
    return v.toFixed(1) + ' Ω';
  }
  function formatFreq(omega) {
    const f = omega / (2 * Math.PI);
    if (f >= 1000) return (f/1000).toFixed(1) + ' kHz';
    return f.toFixed(0) + ' Hz';
  }
  function formatOmega(omega) {
    if (omega >= 1000) return (omega/1000).toFixed(1) + 'k rad/s';
    return omega.toFixed(0) + ' rad/s';
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function arrowVec(ctx, x1, y1, x2, y2, color, lineW, headLen) {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.sqrt(dx*dx + dy*dy) < 2) return;
    const angle = Math.atan2(dy, dx);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lineW;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI/7),
               y2 - headLen * Math.sin(angle - Math.PI/7));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI/7),
               y2 - headLen * Math.sin(angle + Math.PI/7));
    ctx.closePath(); ctx.fill();
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

  return { init };
})();