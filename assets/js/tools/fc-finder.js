/* fc-finder.js
 * Finds the cutoff frequency f_c from Bode table data.
 * Uses cubic polynomial interpolation in log-frequency space.
 *
 * Usage:
 *   FcFinder.init('fc-finder-id', bodeTableInstance, { nPoints: 4 });
 *
 * The element with the given id receives the result UI.
 * bodeTableInstance is a BodeTable created by BodeTable.create().
 */

const FcFinder = (function () {

  // ── Polynomial helpers (Horner evaluation, polyfit via Vandermonde) ────────

  function polyval(coeffs, x) {
    return coeffs.reduce((acc, c) => acc * x + c, 0);
  }

  // Least-squares polynomial fit — returns coeffs high→low
  function polyfit(xs, ys, deg) {
    const n = xs.length;
    deg = Math.min(deg, n - 1);
    // Build Vandermonde matrix A (n × deg+1)
    const A = xs.map(x => {
      const row = [];
      for (let p = deg; p >= 0; p--) row.push(Math.pow(x, p));
      return row;
    });
    // Normal equations: (A^T A) c = A^T y
    const d = deg + 1;
    const AtA = Array.from({length: d}, (_, i) =>
      Array.from({length: d}, (_, j) =>
        A.reduce((s, row) => s + row[i] * row[j], 0)));
    const Aty = Array.from({length: d}, (_, i) =>
      A.reduce((s, row, ri) => s + row[i] * ys[ri], 0));
    // Gaussian elimination
    for (let col = 0; col < d; col++) {
      let maxRow = col;
      for (let row = col + 1; row < d; row++)
        if (Math.abs(AtA[row][col]) > Math.abs(AtA[maxRow][col])) maxRow = row;
      [AtA[col], AtA[maxRow]] = [AtA[maxRow], AtA[col]];
      [Aty[col], Aty[maxRow]] = [Aty[maxRow], Aty[col]];
      for (let row = col + 1; row < d; row++) {
        const f = AtA[row][col] / AtA[col][col];
        for (let k = col; k < d; k++) AtA[row][k] -= f * AtA[col][k];
        Aty[row] -= f * Aty[col];
      }
    }
    const c = new Array(d).fill(0);
    for (let i = d - 1; i >= 0; i--) {
      c[i] = Aty[i];
      for (let k = i + 1; k < d; k++) c[i] -= AtA[i][k] * c[k];
      c[i] /= AtA[i][i];
    }
    return c;
  }

  // Find real roots of polynomial in [xMin, xMax] via bisection + Newton
  function findRootsInRange(coeffs, xMin, xMax, tol) {
    tol = tol || 1e-8;
    const N = 200;
    const roots = [];
    const dx = (xMax - xMin) / N;
    let prev = polyval(coeffs, xMin);
    for (let i = 1; i <= N; i++) {
      const x = xMin + i * dx;
      const curr = polyval(coeffs, x);
      if (prev * curr <= 0) {
        // Bisection
        let lo = x - dx, hi = x;
        for (let j = 0; j < 60; j++) {
          const mid = (lo + hi) / 2;
          if (polyval(coeffs, mid) * polyval(coeffs, lo) <= 0) hi = mid;
          else lo = mid;
          if (hi - lo < tol) break;
        }
        const root = (lo + hi) / 2;
        if (!roots.find(r => Math.abs(r - root) < 1e-6)) roots.push(root);
      }
      prev = curr;
    }
    return roots;
  }

  // ── Core f_c computation ──────────────────────────────────────────────────

  function computeFc(rows, nPoints, searchMode) {
    // searchMode: 'before-max' | 'after-max' | 'both'
    const valid = rows.filter(r =>
      r.f != null && r.ue != null && r.us != null && r.f > 0 && r.ue > 0
    ).map(r => ({
      f: r.f,
      gdB: 20 * Math.log10(Math.abs(r.us / r.ue))
    })).sort((a, b) => a.f - b.f);

    if (valid.length < 3) return { error: 'Need ≥ 3 valid rows' };

    const logFs = valid.map(v => Math.log10(v.f));
    const gdBs  = valid.map(v => v.gdB);

    const iMax = gdBs.indexOf(Math.max(...gdBs));
    const gCut = gdBs[iMax] - 3;

    const results = {};

    function findCrossing(slice_logF, slice_gdB, label) {
      for (let i = 0; i < slice_gdB.length - 1; i++) {
        if ((slice_gdB[i] - gCut) * (slice_gdB[i+1] - gCut) <= 0) {
          // Found a crossing — fit cubic around it
          const i0 = Math.max(0, i - Math.floor((nPoints - 2) / 2));
          const i1 = Math.min(slice_logF.length, i0 + nPoints);
          const xPts = slice_logF.slice(i0, i1);
          const yPts = slice_gdB.slice(i0, i1).map(g => g - gCut);
          if (xPts.length < 2) continue;
          const deg = Math.min(3, xPts.length - 1);
          const coeffs = polyfit(xPts, yPts, deg);
          const roots = findRootsInRange(coeffs, xPts[0], xPts[xPts.length-1]);
          if (roots.length > 0) {
            results[label] = {
              fc: Math.pow(10, roots[0]),
              gMax: gdBs[iMax],
              gCut
            };
            return;
          }
        }
      }
    }

    if (searchMode !== 'after-max') {
      findCrossing(logFs.slice(0, iMax + 1), gdBs.slice(0, iMax + 1), 'fc_low');
    }
    if (searchMode !== 'before-max') {
      findCrossing(
        logFs.slice(iMax).reverse(),
        gdBs.slice(iMax).reverse(),
        'fc_high'
      );
    }

    if (!results.fc_low && !results.fc_high) {
      return { error: 'No −3 dB crossing found', gMax: gdBs[iMax], gCut };
    }

    return {
      fc_low:  results.fc_low  ? results.fc_low.fc  : null,
      fc_high: results.fc_high ? results.fc_high.fc : null,
      gMax:    gdBs[iMax],
      gCut,
      f_at_max: valid[iMax].f
    };
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  function init(containerId, bodeTable, opts) {
    const el = document.getElementById(containerId);
    if (!el) return;

    let nPoints = (opts && opts.nPoints) || 4;
    let searchMode = (opts && opts.searchMode) || 'before-max';
    let theory = (opts && opts.theory) || null; // { fc: number, label: string }

    function getCSSVar(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function render() {
      const rows = bodeTable.getRows();
      const result = computeFc(rows, nPoints, searchMode);

      let html = `<div class="fc-result">`;

      if (result.error) {
        html += `<div class="fc-item"><span class="fc-lbl">f_c</span><span class="fc-val">${result.error}</span></div>`;
      } else {
        if (result.fc_low !== null) {
          html += `<div class="fc-item">
            <span class="fc-lbl">f_c (low side)</span>
            <span class="fc-val">${fmtFreq(result.fc_low)}</span>
          </div>`;
        }
        if (result.fc_high !== null) {
          html += `<div class="fc-item">
            <span class="fc-lbl">f_c (high side)</span>
            <span class="fc-val">${fmtFreq(result.fc_high)}</span>
          </div>`;
        }
        if (result.fc_low !== null && result.fc_high !== null) {
          html += `<div class="fc-item">
            <span class="fc-lbl">Δf bandwidth</span>
            <span class="fc-val">${fmtFreq(result.fc_high - result.fc_low)}</span>
          </div>`;
        }
        html += `<div class="fc-item">
          <span class="fc-lbl">G_max</span>
          <span class="fc-val">${result.gMax.toFixed(2)} dB</span>
        </div>`;
        html += `<div class="fc-item">
          <span class="fc-lbl">G_cut (−3 dB)</span>
          <span class="fc-val">${result.gCut.toFixed(2)} dB</span>
        </div>`;
      }

      if (theory && theory.fc) {
        html += `<div class="fc-item">
          <span class="fc-lbl">${theory.label || 'f_c theory'}</span>
          <span class="fc-val theory">${fmtFreq(theory.fc)}</span>
        </div>`;
        // Relative error
        const fcMeas = result.fc_low || result.fc_high;
        if (fcMeas && !result.error) {
          const relErr = Math.abs(fcMeas - theory.fc) / theory.fc * 100;
          html += `<div class="fc-item">
            <span class="fc-lbl">Relative error</span>
            <span class="fc-val">${relErr.toFixed(1)}%</span>
          </div>`;
        }
      }

      html += `</div>`;

      // Controls
      html += `<div class="tool-toolbar" style="margin-top:0.5rem;">
        <label style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim)">
          Interp. points:
        </label>
        <select id="${containerId}-npts" style="font-family:var(--font-mono);font-size:0.68rem;background:var(--bg);color:var(--text-muted);border:1px solid var(--border-hi);border-radius:4px;padding:0.2em 0.4em;">
          ${[3,4,5,6].map(n => `<option value="${n}"${n===nPoints?' selected':''}>${n} pts</option>`).join('')}
        </select>
        <label style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim)">
          Search:
        </label>
        <select id="${containerId}-mode" style="font-family:var(--font-mono);font-size:0.68rem;background:var(--bg);color:var(--text-muted);border:1px solid var(--border-hi);border-radius:4px;padding:0.2em 0.4em;">
          <option value="before-max"${searchMode==='before-max'?' selected':''}>before max</option>
          <option value="after-max"${searchMode==='after-max'?' selected':''}>after max</option>
          <option value="both"${searchMode==='both'?' selected':''}>both sides</option>
        </select>
      </div>`;

      el.innerHTML = html;

      document.getElementById(containerId + '-npts').addEventListener('change', function () {
        nPoints = parseInt(this.value);
        render();
      });
      document.getElementById(containerId + '-mode').addEventListener('change', function () {
        searchMode = this.value;
        render();
      });
    }

    // Re-render when table changes
    bodeTable.onchange(render);

    // Also expose setTheory
    render();
    return {
      setTheory: (fc, label) => { theory = { fc, label }; render(); },
      recompute: render
    };
  }

  function fmtFreq(f) {
    if (f == null) return '—';
    if (f >= 1e6) return (f/1e6).toFixed(3) + ' MHz';
    if (f >= 1e3) return (f/1e3).toFixed(3) + ' kHz';
    return f.toFixed(1) + ' Hz';
  }

  return { init, computeFc };
})();
