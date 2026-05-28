/* slot-manager.js
 * LocalStorage slot system for experiment data.
 *
 * Storage key format: "bode:{namespace}:{slot-name}"
 * Each slot contains: { label, created, modified, components, rows }
 *
 * Usage:
 *   const sm = SlotManager.create('rc-filter');
 *   sm.renderBar('slot-bar-id');      // renders slot picker UI into element
 *   sm.onLoad(fn);                    // called with rows[] when slot loads
 *   sm.save(rows, components);        // saves current rows to active slot
 */

const SlotManager = (function () {

  const PREFIX = 'bode:';

  function create(namespace) {
    let activeSlot = null;
    let onLoadCb = null;

    // ── Storage helpers ─────────────────────────────────────────────────────

    function storageKey(slotName) {
      return PREFIX + namespace + ':' + slotName;
    }

    function listSlots() {
      const slots = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const pfx = PREFIX + namespace + ':';
        if (k && k.startsWith(pfx)) {
          const name = k.slice(pfx.length);
          try {
            const data = JSON.parse(localStorage.getItem(k));
            slots.push({ name, label: data.label || name, modified: data.modified });
          } catch (_) {
            slots.push({ name, label: name, modified: '' });
          }
        }
      }
      slots.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
      return slots;
    }

    function loadSlot(name) {
      const key = storageKey(name);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (_) { return null; }
    }

    function saveSlot(name, data) {
      localStorage.setItem(storageKey(name), JSON.stringify(data));
    }

    function deleteSlot(name) {
      localStorage.removeItem(storageKey(name));
    }

    function newSlotName() {
      const slots = listSlots();
      let i = slots.length + 1;
      while (slots.find(s => s.name === 'slot-' + i)) i++;
      return 'slot-' + i;
    }

    // ── CSV ─────────────────────────────────────────────────────────────────

    const CSV_HEADER = 'f_hz,u_f_hz,ue_v,u_ue_v,us_v,u_us_v,phi_deg,u_phi_deg';
    const CSV_FIELDS = ['f', 'u_f', 'ue', 'u_ue', 'us', 'u_us', 'phi', 'u_phi'];

    function rowsToCsv(rows) {
      const lines = [CSV_HEADER];
      rows.forEach(r => {
        lines.push(CSV_FIELDS.map(f => {
          const v = r[f];
          return (v === null || v === undefined || v === '') ? '' : String(v);
        }).join(','));
      });
      return lines.join('\r\n');
    }

    function csvToRows(text) {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) return [];
      const header = lines[0].trim().toLowerCase().split(',').map(h => h.trim());
      const fieldMap = {};
      CSV_FIELDS.forEach((f, i) => {
        const aliases = {
          f: ['f_hz', 'f(hz)', 'frequency', 'freq'],
          u_f: ['u_f_hz', 'u_f(hz)', 'u_frequency'],
          ue: ['ue_v', 'ue(v)', 'ue'],
          u_ue: ['u_ue_v', 'u_ue(v)', 'u_ue'],
          us: ['us_v', 'us(v)', 'us'],
          u_us: ['u_us_v', 'u_us(v)', 'u_us'],
          phi: ['phi_deg', 'phi(deg)', 'phi', 'phase', 'phase_deg'],
          u_phi: ['u_phi_deg', 'u_phi(deg)', 'u_phi', 'u_phase'],
        };
        const list = aliases[f] || [f];
        const idx = header.findIndex(h => list.includes(h));
        if (idx >= 0) fieldMap[f] = idx;
      });

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim());
        if (cells.every(c => c === '')) continue;
        const row = {};
        CSV_FIELDS.forEach(f => {
          const idx = fieldMap[f];
          const raw = idx !== undefined ? cells[idx] : '';
          row[f] = (raw === '' || raw === undefined) ? null : parseFloat(raw.replace(',', '.'));
          if (row[f] !== null && isNaN(row[f])) row[f] = null;
        });
        if (row.f !== null) rows.push(row);
      }
      return rows;
    }

    function exportCsv(name) {
      const data = loadSlot(name);
      if (!data) return;
      const csv = rowsToCsv(data.rows || []);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (namespace + '-' + name + '.csv').replace(/[^a-zA-Z0-9_-]/g, '-');
      a.click();
      URL.revokeObjectURL(url);
    }

    function importCsv(file, labelOverride) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const rows = csvToRows(e.target.result);
            const name = newSlotName();
            const now = new Date().toISOString();
            saveSlot(name, {
              label: labelOverride || file.name.replace(/\.csv$/i, ''),
              created: now, modified: now,
              components: {}, rows
            });
            resolve({ name, rows });
          } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    // ── Slot picker UI ───────────────────────────────────────────────────────

    let barEl = null;

    function renderBar(containerId) {
      barEl = document.getElementById(containerId);
      if (!barEl) return;
      _rebuildBar();
    }

    function _rebuildBar() {
      if (!barEl) return;
      const slots = listSlots();

      barEl.innerHTML = `
        <label>Slot</label>
        <select id="_sm_select">
          ${slots.length === 0
            ? '<option value="">— no slots —</option>'
            : slots.map(s => `<option value="${_esc(s.name)}"${s.name === activeSlot ? ' selected' : ''}>${_esc(s.label)}</option>`).join('')}
        </select>
        <input type="text" id="_sm_label" placeholder="slot label" value="${activeSlot ? _esc((loadSlot(activeSlot) || {}).label || activeSlot) : ''}">
        <button class="tool-btn primary" id="_sm_new">+ New</button>
        <button class="tool-btn" id="_sm_rename">Rename</button>
        <button class="tool-btn" id="_sm_del">Delete</button>
        <span style="flex:1"></span>
        <button class="tool-btn" id="_sm_export">↓ CSV</button>
        <label class="tool-btn" style="cursor:pointer">↑ Import<input type="file" accept=".csv" style="display:none" id="_sm_import_file"></label>
      `;

      barEl.querySelector('#_sm_select').addEventListener('change', function () {
        activeSlot = this.value || null;
        const data = activeSlot ? loadSlot(activeSlot) : null;
        const labelEl = barEl.querySelector('#_sm_label');
        if (labelEl) labelEl.value = data ? (data.label || activeSlot) : '';
        if (onLoadCb && data) onLoadCb(data.rows || [], data.components || {});
      });

      barEl.querySelector('#_sm_new').addEventListener('click', () => {
        const name = newSlotName();
        const now = new Date().toISOString();
        saveSlot(name, { label: name, created: now, modified: now, components: {}, rows: [] });
        activeSlot = name;
        _rebuildBar();
        if (onLoadCb) onLoadCb([], {});
      });

      barEl.querySelector('#_sm_rename').addEventListener('click', () => {
        if (!activeSlot) return;
        const labelEl = barEl.querySelector('#_sm_label');
        const newLabel = (labelEl ? labelEl.value.trim() : '') || activeSlot;
        const data = loadSlot(activeSlot) || {};
        data.label = newLabel;
        data.modified = new Date().toISOString();
        saveSlot(activeSlot, data);
        _rebuildBar();
      });

      barEl.querySelector('#_sm_del').addEventListener('click', () => {
        if (!activeSlot) return;
        if (!confirm('Delete slot "' + activeSlot + '"?')) return;
        deleteSlot(activeSlot);
        activeSlot = null;
        const remaining = listSlots();
        if (remaining.length) {
          activeSlot = remaining[0].name;
          const data = loadSlot(activeSlot);
          if (onLoadCb && data) onLoadCb(data.rows || [], data.components || {});
        } else {
          if (onLoadCb) onLoadCb([], {});
        }
        _rebuildBar();
      });

      barEl.querySelector('#_sm_export').addEventListener('click', () => {
        if (!activeSlot) return alert('No slot selected.');
        exportCsv(activeSlot);
      });

      barEl.querySelector('#_sm_import_file').addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        importCsv(file).then(({ name, rows }) => {
          activeSlot = name;
          _rebuildBar();
          if (onLoadCb) onLoadCb(rows, {});
        }).catch(err => alert('Import failed: ' + err.message));
        this.value = '';
      });

      // Auto-select first slot on first render but do NOT fire onLoadCb here —
      // the page wires onLoad after renderBar, so we defer to an explicit load() call.
      if (!activeSlot && slots.length) {
        activeSlot = slots[0].name;
        const labelEl = barEl.querySelector('#_sm_label');
        const data = loadSlot(activeSlot);
        if (labelEl && data) labelEl.value = data.label || activeSlot;
      }
    }

    function _esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    }

    // ── Public API ───────────────────────────────────────────────────────────

    function onLoad(fn) { onLoadCb = fn; }

    // Call this after onLoad() is registered to trigger the initial data load.
    function load() {
      if (!activeSlot) return;
      const data = loadSlot(activeSlot);
      if (onLoadCb && data) onLoadCb(data.rows || [], data.components || {});
    }

    function save(rows, components) {
      if (!activeSlot) {
        const name = newSlotName();
        activeSlot = name;
      }
      const existing = loadSlot(activeSlot) || {};
      const now = new Date().toISOString();
      saveSlot(activeSlot, {
        label: existing.label || activeSlot,
        created: existing.created || now,
        modified: now,
        components: components || existing.components || {},
        rows
      });
      _rebuildBar();
    }

    function getActiveRows() {
      if (!activeSlot) return [];
      const data = loadSlot(activeSlot);
      return data ? (data.rows || []) : [];
    }

    return { renderBar, onLoad, load, save, getActiveRows, csvToRows, rowsToCsv };
  }

  return { create };
})();
