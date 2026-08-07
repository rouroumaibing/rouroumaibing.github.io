// main.js — General interaction logic for hexo-theme-native
// Static JS file: NO EJS syntax allowed. Config read from window.NATIVE_CONFIG.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // A. Dark mode 3-state toggle (light -> dark -> system -> light)
  // ---------------------------------------------------------------------------
  var themeOrder = ['light', 'dark', 'system'];

  function getCurrentTheme() {
    return localStorage.getItem('theme') || (window.NATIVE_CONFIG && window.NATIVE_CONFIG.themeDefault) || 'system';
  }

  function applyTheme(theme) {
    var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    // Update toggle button icon
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', 'Theme: ' + theme);
    }
  }

  var themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function () {
      var current = getCurrentTheme();
      var nextIndex = (themeOrder.indexOf(current) + 1) % themeOrder.length;
      var next = themeOrder[nextIndex];
      if (next === 'system') {
        localStorage.removeItem('theme');
      } else {
        localStorage.setItem('theme', next);
      }
      applyTheme(next);
    });
  }

  // Cross-tab sync
  window.addEventListener('storage', function (e) {
    if (e.key === 'theme') {
      applyTheme(getCurrentTheme());
    }
  });

  // Init on load
  applyTheme(getCurrentTheme());

  // ---------------------------------------------------------------------------
  // B. Mobile drawer toggle with scroll lock + Esc
  // ---------------------------------------------------------------------------
  var drawer = document.getElementById('mobile-drawer');
  var drawerToggle = document.getElementById('mobile-menu-toggle');

  function toggleDrawer(open) {
    if (!drawer) return;
    var isOpen = open !== undefined ? open : drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden', !isOpen);
    document.body.classList.toggle('overflow-hidden', isOpen);
    if (drawerToggle) drawerToggle.setAttribute('aria-expanded', String(isOpen));
  }

  if (drawerToggle) {
    drawerToggle.addEventListener('click', function () { toggleDrawer(); });
  }
  if (drawer) {
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer) toggleDrawer(false);
    });
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') toggleDrawer(false);
    });
  }

  // ---------------------------------------------------------------------------
  // C. Mobile drawer submenu accordion
  // ---------------------------------------------------------------------------
  var submenuToggles = document.querySelectorAll('[data-drawer-submenu-toggle]');
  for (var i = 0; i < submenuToggles.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var submenu = btn.nextElementSibling;
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        if (submenu) submenu.classList.toggle('hidden');
      });
    })(submenuToggles[i]);
  }

  // ---------------------------------------------------------------------------
  // D. Cmd+K shortcut + modal toggle buttons + platform-aware shortcut text
  // ---------------------------------------------------------------------------
  // Update shortcut display based on platform
  var shortcutEl = document.getElementById('search-shortcut');
  if (shortcutEl) {
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    if (!isMac) shortcutEl.textContent = 'Ctrl+K';
  }

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (typeof openSearchModal === 'function') openSearchModal();
    }
  });

  var modalToggles = document.querySelectorAll('[data-modal-toggle]');
  for (var j = 0; j < modalToggles.length; j++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-modal-toggle');
        if (targetId === 'search-modal' && typeof openSearchModal === 'function') {
          // Close mobile drawer if open
          var drawer = document.getElementById('mobile-drawer');
          if (drawer && !drawer.classList.contains('hidden')) {
            toggleDrawer(false);
          }
          openSearchModal();
        }
      });
    })(modalToggles[j]);
  }

  // ---------------------------------------------------------------------------
  // E. Code block copy buttons (mount on .highlight outer container)
  // ---------------------------------------------------------------------------
  var codeBlocks = document.querySelectorAll('.highlight');
  for (var k = 0; k < codeBlocks.length; k++) {
    (function (codeBlock) {
      var btn = document.createElement('button');
      btn.className = 'absolute top-2 right-2 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code');
      btn.addEventListener('click', function () {
        var code = codeBlock.querySelector('.code pre') || codeBlock.querySelector('pre');
        var text = code ? code.textContent : codeBlock.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = 'Copy'; }, 2000);
          });
        }
      });
      codeBlock.classList.add('relative', 'group');
      codeBlock.appendChild(btn);
    })(codeBlocks[k]);
  }

  // ---------------------------------------------------------------------------
  // F. External links in prose: target="_blank"
  // ---------------------------------------------------------------------------
  var proseLinks = document.querySelectorAll('article.prose a[href]');
  for (var m = 0; m < proseLinks.length; m++) {
    (function (link) {
      var href = link.getAttribute('href');
      if (href && href.indexOf('http') === 0 && href.indexOf(window.location.origin) !== 0) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    })(proseLinks[m]);
  }
})();
