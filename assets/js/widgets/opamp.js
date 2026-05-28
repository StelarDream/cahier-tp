/* opamp.js
 * Interactive op-amp circuit calculator.
 * Select circuit type, adjust R1/R2, see transfer function and gain live.
 * Also draws a small input/output waveform preview.
 *
 * Usage:
 *   OpampWidget.init('canvas-id')
 */

const OpampWidget = (function () {

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width, cssH = canvas.height;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    ctx.scale(dpr, dpr);

    let circuitType = 'non-inv';
    let R1 = 1000;
    let R2 = 10000;
    let Ucc = 15;

    // Wire type selector
    const typeSelect = document.getElementById(canvasId + '-type');
    if (typeSelect) typeSelect.addEventListener('change', function () {
      circuitType = this.value;
      updateVisibility();
      draw();
    });

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

    wireSlider('R1', v => { R1 = v; }, v => v >= 1000 ? (v/1000).toFixed(1)+'kΩ' : v+'Ω');
    wireSlider('R2', v => { R2 = v; }, v => v >= 1000 ? (v/1000).toFixed(1)+'kΩ' : v+'Ω');
    wireSlider('Ucc', v => { Ucc = v; }, v => '±'+v+'V');

    function updateVisibility() {
      const r1row = document.getElementById(canvasId + '-R1-row');
      const r2row = document.getElementById(canvasId + '-R2-row');
      const needsR = circuitType !== 'follower' && circuitType !== 'comparator';
      if (r1row) r1row.style.display = needsR ? 'contents' : 'none';
      if (r2row) r2row.style.display = needsR ? 'contents' : 'none';
    }

    function getCircuitInfo() {
      switch (circuitType) {
        case 'non-inv':
          return {
            name: 'Non-inverting amplifier',
            gain: 1 + R2 / R1,
            formula: 'U_s = (1 + R₂/R₁) · U_e',
            formula2: `G_v = 1 + R₂/R₁ = ${(1 + R2/R1).toFixed(2)}`,
            invert: false,
            derivation: [
              'ε = 0  →  V(E⁺) = V(E⁻) = U_e',
              'V(E⁻) via voltage divider: V(E⁻) = R₁/(R₁+R₂) · U_s',
              'Setting equal: U_e = R₁/(R₁+R₂) · U_s',
              '→  U_s = (1 + R₂/R₁) · U_e'
            ]
          };
        case 'inv':
          return {
            name: 'Inverting amplifier',
            gain: -R2 / R1,
            formula: 'U_s = −(R₂/R₁) · U_e',
            formula2: `G_v = −R₂/R₁ = ${(-R2/R1).toFixed(2)}`,
            invert: true,
            derivation: [
              'E⁺ at ground  →  V(E⁻) = 0 (virtual ground)',
              'KCL at E⁻: i₁ + i₂ = 0  (no current into input)',
              'i₁ = U_e/R₁,  i₂ = U_s/R₂',
              '→  U_e/R₁ + U_s/R₂ = 0  →  U_s = −(R₂/R₁)·U_e'
            ]
          };
        case 'follower':
          return {
            name: 'Voltage follower',
            gain: 1,
            formula: 'U_s = U_e',
            formula2: 'G_v = 1  (R₂ = 0, R₁ = ∞)',
            invert: false,
            derivation: [
              'ε = 0  →  V(E⁺) = V(E⁻)',
              'V(E⁺) = U_e',
              'V(E⁻) = U_s  (output fed directly to E⁻)',
              '→  U_s = U_e'
            ]
          };
        case 'comparator':
          return {
            name: 'Comparator (open loop)',
            gain: Infinity,
            formula: 'U_s = +Ucc if U_e > 0',
            formula2: 'U_s = −Ucc if U_e < 0',
            invert: false,
            derivation: [
              'No negative feedback — rule 1 does NOT apply',
              'A_d → ∞, so any ε ≠ 0 saturates the output',
              'U_e > 0  →  ε > 0  →  U_s = +Ucc',
              'U_e < 0  →  ε < 0  →  U_s = −Ucc'
            ]
          };
        default:
          return { name: '', gain: 1, formula: '', formula2: '', invert: false, derivation: [] };
      }
    }

    function draw() {
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const accent   = getCSSVar('--accent')     || '#c8a96e';
      const layer0   = getCSSVar('--layer-0')    || '#6e9ec8';
      const layer5   = getCSSVar('--layer-5')    || '#c8706e';
      const muted    = getCSSVar('--text-muted') || '#7a7570';
      const dim      = getCSSVar('--text-dim')   || '#4a4540';
      const border   = getCSSVar('--border')     || '#2a2a2a';
      const bgCard   = getCSSVar('--bg-card')    || '#161616';
      const textCol  = getCSSVar('--text')       || '#e8e4dc';
      const mono     = getCSSVar('--font-mono')  || 'monospace';

      const info = getCircuitInfo();

      // Layout: left = info panel, right = waveform preview
      const SPLIT = Math.floor(W * 0.55);
      const wavX = SPLIT + 12;
      const wavW = W - SPLIT - 20;

      // ── Info panel ────────────────────────────────────────────────────────
      ctx.fillStyle = bgCard;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      roundRect(ctx, 4, 4, SPLIT - 8, H - 8, 6);
      ctx.fill(); ctx.stroke();

      // Circuit name
      ctx.fillStyle = accent;
      ctx.font = '500 13px ' + mono;
      ctx.textAlign = 'left';
      ctx.fillText(info.name, 16, 28);

      // Formula
      ctx.fillStyle = textCol;
      ctx.font = '12px ' + mono;
      ctx.fillText(info.formula, 16, 52);

      ctx.fillStyle = muted;
      ctx.font = '11px ' + mono;
      ctx.fillText(info.formula2, 16, 70);

      // Derivation steps
      ctx.fillStyle = dim;
      ctx.font = '10px ' + mono;
      let stepY = 98;
      info.derivation.forEach((step, i) => {
        ctx.fillStyle = i === info.derivation.length - 1 ? accent + 'cc' : dim;
        ctx.fillText((i + 1) + '. ' + step, 16, stepY);
        stepY += 18;
      });

      // Saturation info
      if (circuitType !== 'comparator' && isFinite(info.gain)) {
        const Uemax = Ucc / Math.abs(info.gain);
        ctx.fillStyle = dim;
        ctx.font = '10px ' + mono;
        ctx.fillText('Saturation: |U_e| > ' + Uemax.toFixed(2) + 'V → U_s = ±' + Ucc + 'V', 16, H - 18);
      }

      // ── Waveform preview ──────────────────────────────────────────────────
      ctx.fillStyle = bgCard;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      roundRect(ctx, wavX - 4, 4, wavW + 4, H - 8, 6);
      ctx.fill(); ctx.stroke();

      const wavCY = H / 2;
      const wavAmpIn = (H / 2 - 30) * 0.35;   // input amplitude in px
      const gain = info.gain;
      const clampedGain = isFinite(gain) ? gain : (circuitType === 'comparator' ? 1 : 1);
      const rawAmpOut = wavAmpIn * Math.abs(clampedGain);
      const wavAmpOut = Math.min(rawAmpOut, H / 2 - 22);   // clamp to panel

      const saturated = !isFinite(gain) || rawAmpOut > H / 2 - 22;

      // Axes
      ctx.strokeStyle = dim + '66';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(wavX, wavCY); ctx.lineTo(wavX + wavW, wavCY); ctx.stroke();

      // Input waveform (one sinusoid)
      ctx.strokeStyle = layer0;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const x = wavX + t * wavW;
        const y = wavCY - wavAmpIn * Math.sin(t * 2 * Math.PI);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Output waveform
      ctx.strokeStyle = layer5;
      ctx.lineWidth = 1.5;

      if (circuitType === 'comparator') {
        // Square wave output
        ctx.beginPath();
        let prev = 1;
        for (let i = 0; i <= 200; i++) {
          const t = i / 200;
          const x = wavX + t * wavW;
          const inVal = Math.sin(t * 2 * Math.PI);
          const outSign = inVal >= 0 ? -1 : 1;   // non-inverting comparator, E+ = u_e
          const y = wavCY + outSign * wavAmpOut;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else if (outSign !== prev) {
            ctx.lineTo(x, wavCY - prev * wavAmpOut);
            ctx.lineTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          prev = outSign;
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        for (let i = 0; i <= 200; i++) {
          const t = i / 200;
          const x = wavX + t * wavW;
          const inVal = Math.sin(t * 2 * Math.PI);
          const outVal = info.invert ? -inVal : inVal;
          const y = wavCY - wavAmpOut * outVal;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Saturation clamp lines
      if (saturated && circuitType !== 'comparator') {
        const clampY_pos = wavCY - (H / 2 - 22);
        const clampY_neg = wavCY + (H / 2 - 22);
        ctx.strokeStyle = accent + '66';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(wavX, clampY_pos); ctx.lineTo(wavX + wavW, clampY_pos); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(wavX, clampY_neg); ctx.lineTo(wavX + wavW, clampY_neg); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = accent + 'aa';
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'right';
        ctx.fillText('+Ucc = +' + Ucc + 'V', wavX + wavW - 2, clampY_pos - 3);
        ctx.fillText('-Ucc = -' + Ucc + 'V', wavX + wavW - 2, clampY_neg + 10);
      }

      // Legend
      ctx.font = '10px ' + mono;
      ctx.textAlign = 'left';
      ctx.fillStyle = layer0;
      ctx.fillText('— u_e (input)', wavX + 4, H - 18);
      ctx.fillStyle = layer5;
      ctx.fillText('— u_s (output)', wavX + 4, H - 6);

      // Labels top of waveform panel
      ctx.fillStyle = muted;
      ctx.font = '9px ' + mono;
      ctx.textAlign = 'center';
      ctx.fillText('waveform preview', wavX + wavW / 2, 16);
      if (!saturated && isFinite(gain)) {
        ctx.fillText('G_v = ' + gain.toFixed(2) + '×', wavX + wavW / 2, 30);
      } else if (saturated) {
        ctx.fillStyle = accent;
        ctx.fillText('saturated', wavX + wavW / 2, 30);
      }
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

    updateVisibility();
    draw();
    return { draw };
  }

  return { init };
})();
