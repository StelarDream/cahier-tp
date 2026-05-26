/* Marks the current page link as active in the sidebar */
(function () {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#sidebar nav a').forEach(function (a) {
    const href = a.getAttribute('href').split('/').pop();
    if (href === path) a.classList.add('active');
  });
})();

/* Back-to-top button */
(function () {
  const btn = document.createElement('button');
  btn.id = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(btn);

  window.addEventListener('scroll', function () {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
