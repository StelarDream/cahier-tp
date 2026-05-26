/* chapters.js
 * Reads all elements with [data-chapter] on the current page,
 * builds a chapter sub-nav, and injects it into the sidebar
 * directly after the active nav link.
 *
 * Usage: add data-chapter="short label" to any heading that
 * should appear in the sidebar. The element's id is used as
 * the anchor href.
 *
 * Example:
 *   <h2 id="sec-potentials" data-chapter="§4 Potentials">
 *     §4 — Scalar and Vector Potentials
 *   </h2>
 */

(function () {
  function buildChapterNav() {
    const chapterEls = document.querySelectorAll('[data-chapter]');
    if (!chapterEls.length) return;

    const activeLink = document.querySelector('#sidebar nav a.active');
    if (!activeLink) return;

    // Build the sub-nav container
    const nav = document.createElement('div');
    nav.className = 'chapter-nav';

    chapterEls.forEach(function (el) {
      const id = el.getAttribute('id');
      const label = el.getAttribute('data-chapter');
      if (!id || !label) return;

      const a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = label;
      a.className = 'chapter-link';
      nav.appendChild(a);
    });

    // Inject immediately after the active link
    activeLink.insertAdjacentElement('afterend', nav);

    // Highlight the chapter link whose section is in view
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          document.querySelectorAll('.chapter-link').forEach(function (a) {
            a.classList.toggle(
              'active',
              a.getAttribute('href') === '#' + id
            );
          });
        }
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });

    chapterEls.forEach(function (el) { observer.observe(el); });
  }

  // sidebar.js runs synchronously so sidebar is already in the DOM,
  // but nav.js marks the active link — wait for it via DOMContentLoaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildChapterNav);
  } else {
    buildChapterNav();
  }
})();
