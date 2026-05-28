/* loading-table.js
 * Editable R_L vs f_c table with theory overlay plot.
 *
 * Theory for CR high-pass with load R_L:
 *   f_c = (R + R_L) / (2π · C · R · R_L)
 *
 * Usage:
 *   const lt = LoadingTable.create({
 *     tableId:  'tbl-loading',
 *     canvasId: 'canvas-loading',
 *   });
 *   lt.setRows(rows);
 *   lt.getRows();
 *   lt.setComponents({ R, C });
 *   lt.onchange(fn);
 */

const LoadingTable = (function () {

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function emptyRow() {
    return { rl: null, u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null };
  }

  function parseNum(s) {
    if (s === '' || s === null || s === undefined) return null;
    const v = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
    return isNaN(v) ? null : v;
  }

  function fmt(v, d) {
    if (v === null || v === undefined) return '—';
    return v.toFixed(d !== undefined ? d : 1);
  }

  function theoryFc(R, C, rl) {
    if (!R || !C || !rl || rl <= 0) return null;
    return (R + rl) / (2 * Math.PI * C * R * rl);
  }

  function create(opts) {
    const tableId  = opts.tableId;
    const canvasId = opts.canvasId;
    let rows = [
      { rl: 100,  u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
      { rl: 200,  u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
      { rl: 500,  u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
      { rl: 1000, u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
      { rl: 2000, u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
    ];
    let components = { R: 1000, C: 1e-6 };
    let showUncert = true;
    let onChangeCb = null;

    const tableEl  = document.getElementById(tableId);
    const canvasEl = document.getElementById(canvasId);

    // ── Table rendering ──────────────────────────────────────────────────────

    function renderTable() {
      if (!tableEl) return;
      const u = showUncert;

      let html = '<thead><tr>';
      html += '<th></th>';
      html += '<th>R_L (Ω)</th>';
      if (u) html += '<th>±U_RL</th>';
      html += '<th>f_c (Hz)</th>';
      if (u) html += '<th>±U_fc</th>';
      html += '<th>φ (°)</th>';
      if (u) html += '<th>±U_φ</th>';
      html += '<th class="computed">ω_c (rad/s)</th>';
      html += '<th class="computed">f_c theory</th>';
      html += '<th class="computed">error %</th>';
      html += '</tr></thead><tbody>';

      rows.forEach((r, i) => {
        const omega_c = r.fc !== null ? (2 * Math.PI * r.fc).toFixed(1) : null;
        const fc_th = theoryFc(components.R, components.C, r.rl);
        const err = (r.fc !== null && fc_th !== null)
          ? Math.abs(r.fc - fc_th) / fc_th * 100 : null;

        html += `<tr data-i="${i}">`;
        html += `<td><button class="btn-del-row" data-del="${i}" title="delete">✕</button></td>`;

        const fields = u
          ? ['rl','u_rl','fc','u_fc','phi','u_phi']
          : ['rl','fc','phi'];

        fields.forEach(field => {
          const v = r[field];
          html += `<td><input type="text" data-field="${field}" data-row="${i}"
            value="${v !== null && v !== undefined ? v : ''}"
            placeholder="—"></td>`;
        });

        html += `<td class="computed-cell${omega_c === null ? ' invalid' : ''}">${omega_c !== null ? omega_c : '—'}</td>`;
        html += `<td class="computed-cell${fc_th === null ? ' invalid' : ''}">${fc_th !== null ? fc_th.toFixed(1) : '—'}</td>`;
        html += `<td class="computed-cell${err === null ? ' invalid' : err > 15 ? '' : ''}"
          style="${err !== null && err > 15 ? 'color:var(--layer-5)' : err !== null && err < 5 ? 'color:var(--layer-1)' : ''}"
          >${err !== null ? err.toFixed(1) + '%' : '—'}</td>`;
        html += '</tr>';
      });

      html += `<tr class="add-row"><td colspan="20">
        <button class="btn-add-row" id="${tableId}-add">+ add row</button>
      </td></tr>`;
      html += '</tbody>';
      tableEl.innerHTML = html;

      tableEl.querySelectorAll('input[data-field]').forEach(input => {
        input.addEventListener('input', function () {
          const i = parseInt(this.dataset.row);
          rows[i][this.dataset.field] = parseNum(this.value);
          _refreshComputedCells(i);
          drawPlot();
          if (onChangeCb) onChangeCb(rows);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === 'Tab') {
            const inputs = Array.from(tableEl.querySelectorAll('input'));
            const idx = inputs.indexOf(this);
            if (idx >= 0 && idx < inputs.length - 1) {
              e.preventDefault();
              inputs[idx + 1].focus();
            }
          }
        });
      });

      tableEl.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', function () {
          const i = parseInt(this.dataset.del);
          if (rows.length <= 1) return;
          rows.splice(i, 1);
          renderTable(); drawPlot();
          if (onChangeCb) onChangeCb(rows);
        });
      });

      const addBtn = document.getElementById(tableId + '-add');
      if (addBtn) addBtn.addEventListener('click', () => {
        rows.push(emptyRow());
        renderTable();
        if (onChangeCb) onChangeCb(rows);
        const inputs = tableEl.querySelectorAll('input[data-field]');
        const last = Array.from(inputs).filter(
          inp => parseInt(inp.dataset.row) === rows.length - 1
        );
        if (last.length) last[0].focus();
      });
    }

    function _refreshComputedCells(i) {
      if (!tableEl) return;
      const r = rows[i];
      const omega_c = r.fc !== null ? (2 * Math.PI * r.fc).toFixed(1) : null;
      const fc_th = theoryFc(components.R, components.C, r.rl);
      const err = (r.fc !== null && fc_th !== null)
        ? Math.abs(r.fc - fc_th) / fc_th * 100 : null;

      const cells = tableEl.querySelectorAll(`tr[data-i="${i}"] td.computed-cell`);
      if (cells[0]) {
        cells[0].textContent = omega_c !== null ? omega_c : '—';
        cells[0].classList.toggle('invalid', omega_c === null);
      }
      if (cells[1]) {
        cells[1].textContent = fc_th !== null ? fc_th.toFixed(1) : '—';
        cells[1].classList.toggle('invalid', fc_th === null);
      }
      if (cells[2]) {
        cells[2].textContent = err !== null ? err.toFixed(1) + '%' : '—';
        cells[2].classList.toggle('invalid', err === null);
        cells[2].style.color = err !== null
          ? (err > 15 ? 'var(--layer-5)' : err < 5 ? 'var(--layer-1)' : '')
          : '';
      }
    }

    // ── Canvas plot ──────────────────────────────────────────────────────────

    function drawPlot() {
      if (!canvasEl) return;
      const ctx = canvasEl.getContext('2d');
      const W = canvasEl.width, H = canvasEl.height;
      ctx.clearRect(0, 0, W, H);

      const exp    = getCSSVar('--exp')        || '#a09880';
      const layer3 = getCSSVar('--layer-3')    || '#c8a96e';
      const accent = getCSSVar('--accent')     || '#c8a96e';
      const muted  = getCSSVar('--text-muted') || '#7a7570';
      const dim    = getCSSVar('--text-dim')   || '#4a4540';
      const border = getCSSVar('--border')     || '#2a2a2a';
      const bgCard = getCSSVar('--bg-card')    || '#161616';
      const mono   = getCSSVar('--font-mono')  || 'monospace';

      const valid = rows.filter(r => r.rl !== null && r.fc !== null && r.rl > 0)
                        .sort((a, b) => a.rl - b.rl);

      const PAD_L = 58, PAD_R = 20, PAD_TOP = 20, PAD_BOT = 40;
      const plotW = W - PAD_L - PAD_R;
      const plotH = H - PAD_TOP - PAD_BOT;

      // Panel
      ctx.fillStyle = bgCard; ctx.strokeStyle = border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(PAD_L, PAD_TOP, plotW, plotH);
      ctx.fill(); ctx.stroke();

      // Determine axis ranges
      const allRl = valid.map(r => r.rl);
      const allFc = valid.map(r => r.fc);

      // Also include theory curve points
      const rlMin = allRl.length ? Math.min(...allRl) * 0.5 : 50;
      const rlMax = allRl.length ? Math.max(...allRl) * 1.3 : 3000;

      // Theory curve
      const theoryPts = [];
      const nTheory = 200;
      for (let i = 0; i <= nTheory; i++) {
        const rl = rlMin + (rlMax - rlMin) * i / nTheory;
        const fc = theoryFc(components.R, components.C, rl);
        if (fc !== null) theoryPts.push({ rl, fc });
      }

      const theoryFcs = theoryPts.map(p => p.fc);
      const fcMin = Math.min(...(allFc.length ? allFc : [0]), ...theoryFcs) * 0.8;
      const fcMax = Math.max(...(allFc.length ? allFc : [1000]), ...theoryFcs) * 1.2;

      function rlToX(rl) {
        return PAD_L + (rl - rlMin) / (rlMax - rlMin) * plotW;
      }
      function fcToY(fc) {
        return PAD_TOP + plotH - (fc - fcMin) / (fcMax - fcMin) * plotH;
      }

      // Grid
      const fcStep = Math.pow(10, Math.floor(Math.log10((fcMax - fcMin) / 4)));
      const fcGridStart = Math.ceil(fcMin / fcStep) * fcStep;
      for (let fc = fcGridStart; fc <= fcMax; fc += fcStep) {
        const y = fcToY(fc);
        if (y < PAD_TOP || y > PAD_TOP + plotH) continue;
        ctx.strokeStyle = dim + '44'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW, y); ctx.stroke();
        ctx.fillStyle = dim; ctx.font = '9px ' + mono; ctx.textAlign = 'right';
        ctx.fillText(fc >= 1000 ? (fc/1000).toFixed(1)+'k' : fc.toFixed(0), PAD_L - 4, y + 3);
      }

      // R_L axis ticks
      const rlStep = Math.pow(10, Math.floor(Math.log10((rlMax - rlMin) / 4)));
      const rlGridStart = Math.ceil(rlMin / rlStep) * rlStep;
      for (let rl = rlGridStart; rl <= rlMax; rl += rlStep) {
        const x = rlToX(rl);
        ctx.strokeStyle = dim + '44'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x, PAD_TOP); ctx.lineTo(x, PAD_TOP + plotH); ctx.stroke();
        ctx.fillStyle = dim; ctx.font = '9px ' + mono; ctx.textAlign = 'center';
        ctx.fillText(rl >= 1000 ? (rl/1000).toFixed(1)+'k' : rl+'', x, PAD_TOP + plotH + 12);
      }

      // Axis labels
      ctx.fillStyle = muted; ctx.font = '10px ' + mono;
      ctx.textAlign = 'center';
      ctx.fillText('R_L (Ω)', PAD_L + plotW / 2, H - 4);
      ctx.save();
      ctx.translate(12, PAD_TOP + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('f_c (Hz)', 0, 0);
      ctx.restore();

      // Theory curve
      if (theoryPts.length > 1) {
        ctx.strokeStyle = layer3 + 'aa';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        theoryPts.forEach((p, i) => {
          const x = rlToX(p.rl), y = fcToY(p.fc);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Measured points + line
      if (valid.length >= 2) {
        ctx.strokeStyle = exp;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        valid.forEach((r, i) => {
          const x = rlToX(r.rl), y = fcToY(r.fc);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      valid.forEach(r => {
        const x = rlToX(r.rl), y = fcToY(r.fc);
        ctx.fillStyle = exp;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();

        // f_c error bar
        if (r.u_fc !== null && r.u_fc > 0) {
          ctx.strokeStyle = exp + '88'; ctx.lineWidth = 1;
          const y1 = Math.max(PAD_TOP, fcToY(r.fc + r.u_fc));
          const y2 = Math.min(PAD_TOP + plotH, fcToY(r.fc - r.u_fc));
          ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
          if (y1 > PAD_TOP) { ctx.beginPath(); ctx.moveTo(x-3,y1); ctx.lineTo(x+3,y1); ctx.stroke(); }
          if (y2 < PAD_TOP + plotH) { ctx.beginPath(); ctx.moveTo(x-3,y2); ctx.lineTo(x+3,y2); ctx.stroke(); }
        }

        // R_L error bar
        if (r.u_rl !== null && r.u_rl > 0) {
          ctx.strokeStyle = exp + '55'; ctx.lineWidth = 1;
          const x1 = Math.max(PAD_L, rlToX(r.rl - r.u_rl));
          const x2 = Math.min(PAD_L + plotW, rlToX(r.rl + r.u_rl));
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        }
      });

      // Legend
      ctx.font = '10px ' + mono; ctx.textAlign = 'left';
      ctx.strokeStyle = layer3 + 'aa'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(PAD_L + 8, PAD_TOP + 14); ctx.lineTo(PAD_L + 28, PAD_TOP + 14); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = layer3; ctx.fillText('theory', PAD_L + 32, PAD_TOP + 18);

      ctx.fillStyle = exp;
      ctx.beginPath(); ctx.arc(PAD_L + 18, PAD_TOP + 30, 4, 0, 2*Math.PI); ctx.fill();
      ctx.fillText('measured', PAD_L + 32, PAD_TOP + 34);

      // No-load f_c marker
      const fc_noload = components.R && components.C
        ? 1 / (2 * Math.PI * components.R * components.C) : null;
      if (fc_noload !== null) {
        const y_nl = fcToY(fc_noload);
        if (y_nl >= PAD_TOP && y_nl <= PAD_TOP + plotH) {
          ctx.strokeStyle = accent + '55'; ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(PAD_L, y_nl); ctx.lineTo(PAD_L + plotW, y_nl); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = accent + 'aa'; ctx.font = '9px ' + mono;
          ctx.textAlign = 'right';
          ctx.fillText('f_c (no load)', PAD_L + plotW - 4, y_nl - 3);
        }
      }

      if (valid.length < 2) {
        ctx.fillStyle = dim; ctx.font = '11px ' + mono; ctx.textAlign = 'center';
        ctx.fillText('Enter R_L and f_c values to plot', PAD_L + plotW/2, PAD_TOP + plotH/2);
      }
    }

    // ── CSV ──────────────────────────────────────────────────────────────────

    const CSV_HEADER = 'rl_ohm,u_rl_ohm,fc_hz,u_fc_hz,phi_deg,u_phi_deg';
    const CSV_FIELDS = ['rl', 'u_rl', 'fc', 'u_fc', 'phi', 'u_phi'];
    const CSV_ALIASES = {
      rl:    ['rl_ohm','rl(ohm)','rl_(ohm)','rl','r_l'],
      u_rl:  ['u_rl_ohm','u_rl(ohm)','u_rl_(ohm)','u_rl'],
      fc:    ['fc_hz','fc(hz)','f_c(hz)','fc','f_c'],
      u_fc:  ['u_fc_hz','u_fc(hz)','u_f_c(hz)','u_fc','u_f_c'],
      phi:   ['phi_deg','phi(deg)','phi','phase(°)','measured_phase_shift(°)'],
      u_phi: ['u_phi_deg','u_phi(deg)','u_phi','u_measured_phase_shift(°)'],
    };

    function rowsToCsv(r) {
      const lines = [CSV_HEADER];
      r.forEach(row => {
        lines.push(CSV_FIELDS.map(f => {
          const v = row[f];
          return (v === null || v === undefined) ? '' : String(v);
        }).join(','));
      });
      return lines.join('\r\n');
    }

    function csvToRows(text) {
      const sep = text.split('\n')[0].includes(';') ? ';' : ',';
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) return [];
      const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/\s+/g,''));
      const fieldMap = {};
      CSV_FIELDS.forEach(f => {
        const aliases = CSV_ALIASES[f] || [f];
        const idx = header.findIndex(h => aliases.includes(h));
        if (idx >= 0) fieldMap[f] = idx;
      });
      const result = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(sep).map(c => c.trim().replace(',','.').replace(/\s/g,''));
        if (cells.every(c => c === '')) continue;
        const row = {};
        CSV_FIELDS.forEach(f => {
          const idx = fieldMap[f];
          const raw = idx !== undefined ? cells[idx] : '';
          row[f] = (raw === '' || raw === undefined) ? null : parseFloat(raw);
          if (row[f] !== null && isNaN(row[f])) row[f] = null;
        });
        if (row.rl !== null) result.push(row);
      }
      return result;
    }

    function exportCsv() {
      const csv = rowsToCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'loading-effect.csv';
      a.click();
      URL.revokeObjectURL(url);
    }

    function importCsv(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const newRows = csvToRows(e.target.result);
            if (!newRows.length) throw new Error('No valid rows found');
            resolve(newRows);
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    // ── Public API ───────────────────────────────────────────────────────────

    function setRows(newRows) {
      rows = newRows.length
        ? newRows.map(r => Object.assign(emptyRow(), r))
        : [
            { rl: 100,  u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
            { rl: 200,  u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
            { rl: 500,  u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
            { rl: 1000, u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
            { rl: 2000, u_rl: null, fc: null, u_fc: null, phi: null, u_phi: null },
          ];
      renderTable(); drawPlot();
    }

    function getRows() { return rows; }

    function setComponents(c) {
      components = Object.assign(components, c);
      renderTable(); drawPlot();
    }

    function setShowUncert(val) {
      showUncert = val; renderTable(); drawPlot();
    }

    function onchange(fn) { onChangeCb = fn; }

    renderTable();
    drawPlot();

    return { setRows, getRows, setComponents, setShowUncert, onchange, drawPlot, exportCsv, importCsv };
  }

  return { create };
})();