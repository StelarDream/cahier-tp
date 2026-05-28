/* bode-table.js
 * Editable Bode measurement table with live computed columns and canvas plot.
 *
 * Usage:
 *   const bt = BodeTable.create({
 *     tableId:      'tbl-bode',       // id of <table> element
 *     canvasId:     'canvas-bode',    // id of <canvas> element
 *     showUncert:   true,             // show uncertainty columns toggle
 *   });
 *   bt.setRows(rows);                 // load rows from SlotManager
 *   bt.getRows();                     // get current rows for saving
 *   bt.onchange(fn);                  // called whenever table changes
 */

const BodeTable = (function () {

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ── Maths helpers ──────────────────────────────────────────────────────────

  function gdB(us, ue) {
    if (!us || !ue || ue === 0) return null;
    return 20 * Math.log10(Math.abs(us / ue));
  }

  function gdB_uncertainty(us, u_us, ue, u_ue) {
    if (!us || !ue) return null;
    const rel_us = u_us != null ? u_us / Math.abs(us) : 0;
    const rel_ue = u_ue != null ? u_ue / Math.abs(ue) : 0;
    return (20 / Math.LN10) * Math.sqrt(rel_us ** 2 + rel_ue ** 2);
  }

  function gv(us, ue) {
    if (!us || !ue || ue === 0) return null;
    return Math.abs(us / ue);
  }

  // ── Row rendering ──────────────────────────────────────────────────────────

  function emptyRow() {
    return { f: null, u_f: null, ue: null, u_ue: null, us: null, u_us: null, phi: null, u_phi: null };
  }

  function parseNum(s) {
    if (s === '' || s === null || s === undefined) return null;
    const v = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
    return isNaN(v) ? null : v;
  }

  function fmt(v, digits) {
    if (v === null || v === undefined) return '—';
    return v.toFixed(digits !== undefined ? digits : 3);
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  function create(opts) {
    const tableId  = opts.tableId;
    const canvasId = opts.canvasId;
    let showUncert = opts.showUncert !== false;
    let rows = [emptyRow(), emptyRow(), emptyRow()];
    let onChangeCb = null;

    const tableEl  = document.getElementById(tableId);
    const canvasEl = document.getElementById(canvasId);

    // ── Table rendering ──────────────────────────────────────────────────────

    function renderTable() {
      if (!tableEl) return;

      const uCols = showUncert;

      let html = '<thead><tr>';
      html += '<th></th>';
      html += `<th>f (Hz)</th>`;
      if (uCols) html += `<th>±U_f</th>`;
      html += `<th>U_e (V)</th>`;
      if (uCols) html += `<th>±U_Ue</th>`;
      html += `<th>U_s (V)</th>`;
      if (uCols) html += `<th>±U_Us</th>`;
      html += `<th>φ (°)</th>`;
      if (uCols) html += `<th>±U_φ</th>`;
      html += `<th class="computed">g_dB</th>`;
      if (uCols) html += `<th class="computed">±u_gdB</th>`;
      html += `<th class="computed">G_v</th>`;
      html += '</tr></thead><tbody>';

      rows.forEach((r, i) => {
        const g = gdB(r.us, r.ue);
        const u_g = uCols ? gdB_uncertainty(r.us, r.u_us, r.ue, r.u_ue) : null;
        const gvVal = gv(r.us, r.ue);

        html += `<tr data-i="${i}">`;
        html += `<td><button class="btn-del-row" data-del="${i}" title="delete row">✕</button></td>`;

        const fields = uCols
          ? ['f','u_f','ue','u_ue','us','u_us','phi','u_phi']
          : ['f','ue','us','phi'];

        fields.forEach(field => {
          const v = r[field];
          html += `<td><input type="text" data-field="${field}" data-row="${i}"
            value="${v !== null && v !== undefined ? v : ''}"
            placeholder="—"></td>`;
        });

        html += `<td class="computed-cell${g === null ? ' invalid' : ''}">${fmt(g, 2)}</td>`;
        if (uCols) html += `<td class="computed-cell${u_g === null ? ' invalid' : ''}">${u_g !== null ? '±' + fmt(u_g, 2) : '—'}</td>`;
        html += `<td class="computed-cell${gvVal === null ? ' invalid' : ''}">${fmt(gvVal, 4)}</td>`;
        html += '</tr>';
      });

      // Add-row button
      html += `<tr class="add-row"><td colspan="20">
        <button class="btn-add-row" id="${tableId}-add">+ add row</button>
      </td></tr>`;

      html += '</tbody>';
      tableEl.innerHTML = html;

      // Wire input events
      tableEl.querySelectorAll('input[data-field]').forEach(input => {
        input.addEventListener('input', function () {
          const i = parseInt(this.dataset.row);
          const field = this.dataset.field;
          rows[i][field] = parseNum(this.value);
          _refreshComputedCells(i);
          drawPlot();
          if (onChangeCb) onChangeCb(rows);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === 'Tab') {
            // Move to next input
            const inputs = Array.from(tableEl.querySelectorAll('input'));
            const idx = inputs.indexOf(this);
            if (idx >= 0 && idx < inputs.length - 1) {
              e.preventDefault();
              inputs[idx + 1].focus();
            }
          }
        });
      });

      // Wire delete buttons
      tableEl.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', function () {
          const i = parseInt(this.dataset.del);
          if (rows.length <= 1) return;
          rows.splice(i, 1);
          renderTable();
          drawPlot();
          if (onChangeCb) onChangeCb(rows);
        });
      });

      // Wire add-row button
      const addBtn = document.getElementById(tableId + '-add');
      if (addBtn) addBtn.addEventListener('click', () => {
        rows.push(emptyRow());
        renderTable();
        if (onChangeCb) onChangeCb(rows);
        // Focus first input of new row
        const inputs = tableEl.querySelectorAll('input[data-field]');
        const lastRowInputs = Array.from(inputs).filter(
          inp => parseInt(inp.dataset.row) === rows.length - 1
        );
        if (lastRowInputs.length) lastRowInputs[0].focus();
      });
    }

    function _refreshComputedCells(i) {
      if (!tableEl) return;
      const r = rows[i];
      const g = gdB(r.us, r.ue);
      const u_g = showUncert ? gdB_uncertainty(r.us, r.u_us, r.ue, r.u_ue) : null;
      const gvVal = gv(r.us, r.ue);

      const cells = tableEl.querySelectorAll(`tr[data-i="${i}"] td.computed-cell`);
      if (cells[0]) {
        cells[0].textContent = fmt(g, 2);
        cells[0].classList.toggle('invalid', g === null);
      }
      let idx = 1;
      if (showUncert && cells[idx]) {
        cells[idx].textContent = u_g !== null ? '±' + fmt(u_g, 2) : '—';
        cells[idx].classList.toggle('invalid', u_g === null);
        idx++;
      }
      if (cells[idx]) {
        cells[idx].textContent = fmt(gvVal, 4);
        cells[idx].classList.toggle('invalid', gvVal === null);
      }
    }

    // ── Canvas Bode plot ─────────────────────────────────────────────────────

    function drawPlot() {
      if (!canvasEl) return;
      const ctx = canvasEl.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const W = canvasEl.clientWidth || canvasEl.width;
      const H = canvasEl.clientHeight || canvasEl.height;
      if (canvasEl.width !== W * dpr || canvasEl.height !== H * dpr) {
        canvasEl.width = W * dpr; canvasEl.height = H * dpr;
        canvasEl.style.width = W + 'px'; canvasEl.style.height = H + 'px';
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const accent   = getCSSVar('--accent')     || '#c8a96e';
      const exp      = getCSSVar('--exp')        || '#a09880';
      const layer4   = getCSSVar('--layer-4')    || '#9e7ac8';
      const muted    = getCSSVar('--text-muted') || '#7a7570';
      const dim      = getCSSVar('--text-dim')   || '#4a4540';
      const border   = getCSSVar('--border')     || '#2a2a2a';
      const bgCard   = getCSSVar('--bg-card')    || '#161616';
      const mono     = getCSSVar('--font-mono')  || 'monospace';

      // Valid rows
      const valid = rows.filter(r =>
        r.f !== null && r.ue !== null && r.us !== null &&
        r.f > 0 && r.ue > 0
      ).sort((a, b) => a.f - b.f);

      if (valid.length < 2) {
        ctx.fillStyle = dim;
        ctx.font = '11px ' + mono;
        ctx.textAlign = 'center';
        ctx.fillText('Need ≥ 2 rows with f, U_e, U_s to plot', W / 2, H / 2);
        return;
      }

      const PAD_L = 50, PAD_R = 16, PAD_TOP = 14, PAD_BOT = 36;
      // 60/40 split — gain panel gets more space
      const g_top = PAD_TOP;
      const g_bot = Math.floor(H * 0.60);
      const plotW = W - PAD_L - PAD_R;

      // Frequency range
      const fMin = valid[0].f, fMax = valid[valid.length - 1].f;
      const logFMin = Math.log10(fMin * 0.7);
      const logFMax = Math.log10(fMax * 1.5);

      function fToX(f) {
        return PAD_L + (Math.log10(f) - logFMin) / (logFMax - logFMin) * plotW;
      }

      // ── Gain panel ────────────────────────────────────────────────────────
      const gVals = valid.map(r => gdB(r.us, r.ue)).filter(v => v !== null);
      // Dynamic scale: fit all data + uncertainty with padding
      const gValsPlusErr = valid.flatMap(r => {
        const g = gdB(r.us, r.ue);
        if (g === null) return [];
        const u_g = gdB_uncertainty(r.us, r.u_us, r.ue, r.u_ue) || 0;
        return [g - u_g, g + u_g];
      });
      const rawGMin = Math.min(...gValsPlusErr);
      const rawGMax = Math.max(...gValsPlusErr);
      const gPad = Math.max(3, (rawGMax - rawGMin) * 0.12);
      // Always include 0 dB and the −3 dB threshold on scale
      const gMax = Math.max(rawGMax + gPad, rawGMax + 1);
      const gMin = Math.min(rawGMin - gPad, rawGMax - 3 - gPad * 2);

      function gToY(g) {
        return g_bot - (g - gMin) / (gMax - gMin) * (g_bot - g_top);
      }

      function gToYclamped(g) {
        return Math.max(g_top, Math.min(g_bot, gToY(g)));
      }

      drawPanel(ctx, PAD_L, g_top, plotW, g_bot - g_top, bgCard, border);
      drawFreqGrid(ctx, PAD_L, g_top, plotW, g_bot - g_top, fToX, dim, logFMin, logFMax);

      // dB grid — dynamic lines based on actual scale
      const gStep = (gMax - gMin) > 60 ? 20 : (gMax - gMin) > 30 ? 10 : 5;
      const gGridStart = Math.ceil(gMin / gStep) * gStep;
      for (let g = gGridStart; g <= gMax; g += gStep) {
        const y = gToY(g);
        if (y < g_top || y > g_bot) continue;
        ctx.strokeStyle = dim + '44';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW, y); ctx.stroke();
        ctx.fillStyle = dim;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'right';
        ctx.fillText(g + 'dB', PAD_L - 3, y + 3);
      }
      // Always draw −3 dB line relative to gMax data point
      const gCutLine = Math.max(...gVals) - 3;
      const yCut = gToY(gCutLine);
      if (yCut >= g_top && yCut <= g_bot) {
        ctx.strokeStyle = accent + '55';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(PAD_L, yCut); ctx.lineTo(PAD_L + plotW, yCut); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = accent;
        ctx.font = '9px ' + mono;
        ctx.textAlign = 'right';
        ctx.fillText(gCutLine.toFixed(1) + 'dB', PAD_L - 3, yCut + 3);
      }

      // Gain data points + line
      ctx.strokeStyle = exp;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let first = true;
      valid.forEach(r => {
        const g = gdB(r.us, r.ue);
        if (g === null) return;
        const x = fToX(r.f), y = gToY(g);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Error bars for gain
      valid.forEach(r => {
        const g = gdB(r.us, r.ue);
        if (g === null) return;
        const u_g = gdB_uncertainty(r.us, r.u_us, r.ue, r.u_ue);
        const x = fToX(r.f), y = gToYclamped(g);
        ctx.fillStyle = exp;
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill();
        if (u_g !== null && u_g > 0) {
          ctx.strokeStyle = exp + '88';
          ctx.lineWidth = 1;
          const y1 = gToYclamped(g - u_g), y2 = gToYclamped(g + u_g);
          ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
          // Only draw caps if not clamped
          if (y1 > g_top) { ctx.beginPath(); ctx.moveTo(x-3, y1); ctx.lineTo(x+3, y1); ctx.stroke(); }
          if (y2 < g_bot) { ctx.beginPath(); ctx.moveTo(x-3, y2); ctx.lineTo(x+3, y2); ctx.stroke(); }
        }
        // f error bar
        if (r.u_f !== null && r.u_f > 0) {
          const x1 = fToX(r.f - r.u_f), x2 = fToX(r.f + r.u_f);
          ctx.strokeStyle = exp + '55';
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        }
      });

      ctx.fillStyle = muted; ctx.font = '9px ' + mono; ctx.textAlign = 'left';
      ctx.fillText('g_dB', PAD_L + 4, g_top + 12);

      // ── Phase panel ───────────────────────────────────────────────────────
      const phiVals = valid.map(r => r.phi).filter(v => v !== null);
      const p_top = g_bot + 8, p_bot = H - PAD_BOT;

      function phiToY(p) {
        return p_bot - (p - (-180)) / (180 - (-180)) * (p_bot - p_top);
      }

      drawPanel(ctx, PAD_L, p_top, plotW, p_bot - p_top, bgCard, border);
      drawFreqGrid(ctx, PAD_L, p_top, plotW, p_bot - p_top, fToX, dim, logFMin, logFMax);

      [-180, -90, -45, 0, 45, 90, 180].forEach(p => {
        const y = phiToY(p);
        if (y < p_top || y > p_bot) return;
        ctx.strokeStyle = p === 0 ? dim + '66' : dim + '33';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW, y); ctx.stroke();
        ctx.fillStyle = dim; ctx.font = '9px ' + mono; ctx.textAlign = 'right';
        ctx.fillText(p + '°', PAD_L - 3, y + 3);
      });

      if (phiVals.length >= 2) {
        ctx.strokeStyle = layer4;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        let firstP = true;
        valid.forEach(r => {
          if (r.phi === null) return;
          const x = fToX(r.f), y = phiToY(r.phi);
          if (firstP) { ctx.moveTo(x, y); firstP = false; } else ctx.lineTo(x, y);
        });
        ctx.stroke();

        valid.forEach(r => {
          if (r.phi === null) return;
          const x = fToX(r.f), y = phiToY(r.phi);
          ctx.fillStyle = layer4;
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 2 * Math.PI); ctx.fill();
          if (r.u_phi !== null && r.u_phi > 0) {
            ctx.strokeStyle = layer4 + '88';
            ctx.lineWidth = 1;
            const y1 = phiToY(r.phi - r.u_phi), y2 = phiToY(r.phi + r.u_phi);
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
          }
        });
      } else {
        ctx.fillStyle = dim; ctx.font = '9px ' + mono; ctx.textAlign = 'center';
        ctx.fillText('no φ data', PAD_L + plotW / 2, (p_top + p_bot) / 2);
      }

      ctx.fillStyle = muted; ctx.font = '9px ' + mono; ctx.textAlign = 'left';
      ctx.fillText('Δφ (°)', PAD_L + 4, p_top + 12);

      // Frequency axis labels
      ctx.fillStyle = muted; ctx.font = '9px ' + mono; ctx.textAlign = 'center';
      for (let d = Math.ceil(logFMin); d <= Math.floor(logFMax); d++) {
        const f = Math.pow(10, d);
        const x = fToX(f);
        const label = f >= 1e6 ? (f/1e6)+'MHz' : f >= 1e3 ? (f/1e3)+'kHz' : f+'Hz';
        ctx.fillText(label, x, H - 6);
      }
    }

    // ── Drawing helpers ──────────────────────────────────────────────────────

    function drawPanel(ctx, x, y, w, h, bg, border) {
      ctx.fillStyle = bg; ctx.strokeStyle = border; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill(); ctx.stroke();
    }

    function drawFreqGrid(ctx, padL, top, plotW, panelH, fToX, dim, logFMin, logFMax) {
      for (let d = Math.ceil(logFMin); d <= Math.floor(logFMax); d++) {
        const f = Math.pow(10, d);
        const x = fToX(f);
        ctx.strokeStyle = dim + '44'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + panelH); ctx.stroke();
        for (let m = 2; m <= 9; m++) {
          const fm = f * m;
          if (Math.log10(fm) > logFMax) break;
          const xm = fToX(fm);
          ctx.strokeStyle = dim + '22'; ctx.lineWidth = 0.3;
          ctx.beginPath(); ctx.moveTo(xm, top); ctx.lineTo(xm, top + panelH); ctx.stroke();
        }
      }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    function setRows(newRows) {
      rows = newRows.length ? newRows.map(r => Object.assign(emptyRow(), r)) : [emptyRow(), emptyRow(), emptyRow()];
      renderTable();
      drawPlot();
    }

    function getRows() { return rows; }

    function setShowUncert(val) {
      showUncert = val;
      renderTable();
      drawPlot();
    }

    function onchange(fn) { onChangeCb = fn; }

    // Initial render
    renderTable();
    drawPlot();

    return { setRows, getRows, setShowUncert, onchange, drawPlot };
  }

  return { create };
})();