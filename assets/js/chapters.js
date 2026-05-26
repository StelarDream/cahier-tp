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

    // Scroll-spy: highlight the last heading scrolled past the top 30% of the
    // viewport. When above the first heading, nothing is active.
    const links = Array.from(nav.querySelectorAll('.chapter-link'));
    const sections = Array.from(chapterEls).filter(function (el) {
      return el.getAttribute('id') && el.getAttribute('data-chapter');
    });

    function setActive(id) {
      links.forEach(function (a) {
        a.classList.toggle('active', id !== null && a.getAttribute('href') === '#' + id);
      });
    }

    function onScroll() {
      const threshold = window.innerHeight * 0.3;
      let current = null;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= threshold) {
          current = sections[i].getAttribute('id');
        } else {
          break;
        }
      }
      setActive(current);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // sidebar.js runs synchronously so sidebar is already in the DOM,
  // but nav.js marks the active link — wait for it via DOMContentLoaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildChapterNav);
  } else {
    buildChapterNav();
  }
})();
