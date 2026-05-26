/* Injects the shared sidebar. Each page calls: buildSidebar(root) where
   root is the relative path prefix to reach the repo root, e.g. '' or '../' */
function buildSidebar(root) {
  const r = root || '';
  const layers = [
    { id: 'L0', title: 'Voltage & Current',   file: 'L0-voltage-current.html',  color: 'var(--layer-0)' },
    { id: 'L1', title: 'Kirchhoff Laws',       file: 'L1-kirchhoff.html',        color: 'var(--layer-1)' },
    { id: 'L2', title: 'Component Laws',       file: 'L2-components.html',       color: 'var(--layer-2)' },
    { id: 'L3', title: 'Complex Impedance',    file: 'L3-impedance.html',        color: 'var(--layer-3)' },
    { id: 'L4', title: 'Filters & Bode',       file: 'L4-filters.html',          color: 'var(--layer-4)' },
    { id: 'L5', title: 'Op-Amp Circuits',      file: 'L5-opamp.html',            color: 'var(--layer-5)' },
  ];

  const navItems = layers.map(l => `
    <a href="${r}layers/${l.file}">
      <span class="layer-tag" style="background:${l.color}22; color:${l.color}; border:1px solid ${l.color}44">${l.id}</span>
      ${l.title}
    </a>`).join('');

  const html = `
  <div class="logo">
    <h1>Cahier<br>d'Électrocinétique</h1>
    <p>UE 404 · L2 · 2025–26</p>
  </div>
  <nav>
    <a href="${r}index.html">← Overview</a>
    <div class="section-label">Theory Layers</div>
    ${navItems}
  </nav>`;

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.innerHTML = html;
}
