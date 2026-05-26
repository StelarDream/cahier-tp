/* Marks the current page link as active in the sidebar */
(function () {
  var path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#sidebar nav a').forEach(function (a) {
    var href = a.getAttribute('href').split('/').pop();
    if (href === path) a.classList.add('active');
  });
})();

/* Sidebar smart-scroll — exposes window.resetNavScroll() */
(function () {
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  var manuallyScrolled = false;
  var scrollLockUntil = 0;

  var focusBtn = document.createElement('button');
  focusBtn.id = 'sidebar-focus-reset';
  focusBtn.innerHTML =
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>Go to active';
  sidebar.appendChild(focusBtn);

  function getActiveEl() {
    return sidebar.querySelector('.chapter-link.active')
        || sidebar.querySelector('nav a.active');
  }

  function scrollToActive(smooth) {
    var el = getActiveEl();
    if (!el) return;
    scrollLockUntil = Date.now() + (smooth ? 700 : 150);
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'nearest' });
  }

  sidebar.addEventListener('scroll', function () {
    if (Date.now() < scrollLockUntil) return;
    manuallyScrolled = true;
    focusBtn.classList.add('visible');
  }, { passive: true });

  sidebar.addEventListener('click', function (e) {
    if (!e.target.closest('a')) return;
    manuallyScrolled = false;
    focusBtn.classList.remove('visible');
  });

  focusBtn.addEventListener('click', function () {
    window.resetNavScroll();
  });

  var observer = new MutationObserver(function () {
    if (!manuallyScrolled) scrollToActive(false);
  });
  observer.observe(sidebar, { attributes: true, attributeFilter: ['class'], subtree: true });

  setTimeout(function () { scrollToActive(false); }, 0);

  window.resetNavScroll = function () {
    manuallyScrolled = false;
    focusBtn.classList.remove('visible');
    scrollToActive(true);
  };
})();

/* Back-to-top button — listens on #main, resets nav scroll */
(function () {
  var main = document.getElementById('main');

  var btn = document.createElement('button');
  btn.id = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(btn);

  var scrollTarget = main || window;

  function getScrollTop() {
    return main ? main.scrollTop : window.scrollY;
  }

  scrollTarget.addEventListener('scroll', function () {
    btn.classList.toggle('visible', getScrollTop() > 300);
  }, { passive: true });

  btn.addEventListener('click', function () {
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof window.resetNavScroll === 'function') window.resetNavScroll();
  });
})();

/* Reset nav scroll on internal anchor-link clicks in main content */
(function () {
  var main = document.getElementById('main');
  if (!main) return;
  main.addEventListener('click', function (e) {
    if (!e.target.closest('a[href^="#"]')) return;
    if (typeof window.resetNavScroll === 'function') window.resetNavScroll();
  });
})();
