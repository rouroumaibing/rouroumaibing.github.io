// search.js — Search logic for hexo-theme-native
// Static JS file: NO EJS syntax allowed. Config read from window.NATIVE_CONFIG.

// HTML escape to prevent XSS
function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Highlight match with <mark> tags (after escaping)
function highlightMatch(text, query) {
  var escaped = escapeHtml(text);
  if (!query) return escaped;
  var escapedQuery = escapeHtml(query);
  var regex = new RegExp('(' + escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return escaped.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 text-inherit">$1</mark>');
}

// Get excerpt centered around query match
function getExcerpt(content, query, length) {
  var plain = content.replace(/<[^>]*>/g, '');
  var idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return plain.substring(0, length) + (plain.length > length ? '...' : '');
  var start = Math.max(0, idx - Math.floor(length / 2));
  var end = start + length;
  return (start > 0 ? '...' : '') + plain.substring(start, end) + (end < plain.length ? '...' : '');
}

// Lazy load search data
var searchData = null;
var searchLoading = null;
function ensureSearchData() {
  if (searchData) return Promise.resolve(searchData);
  if (searchLoading) return searchLoading;
  var searchPath = (window.NATIVE_CONFIG && window.NATIVE_CONFIG.searchPath) || ((window.NATIVE_CONFIG && window.NATIVE_CONFIG.root || '/') + 'search.json');
  searchLoading = fetch(searchPath).then(function(res) { return res.json(); }).then(function(data) {
    searchData = data;
    searchLoading = null;
    return data;
  });
  return searchLoading;
}

// Perform search
function performSearch(query) {
  if (!query || !query.trim()) return [];
  if (!searchData) return [];
  var q = query.toLowerCase();
  var results = [];
  for (var i = 0; i < searchData.length; i++) {
    var post = searchData[i];
    var titleMatch = post.title.toLowerCase().indexOf(q) !== -1;
    var contentMatch = post.content && post.content.toLowerCase().indexOf(q) !== -1;
    if (titleMatch || contentMatch) {
      results.push({
        title: post.title,
        url: post.url,
        excerpt: getExcerpt(post.content || '', query, 120)
      });
    }
  }
  return results.slice(0, 10);
}

// Search UI factory function (instance-scoped state, reusable for modal and page)
function initSearchUI(inputId, resultsId) {
  var input = document.getElementById(inputId);
  var container = document.getElementById(resultsId);
  if (!input || !container) return null;

  var searchResults = [];
  var activeIndex = -1;
  var lastQuery = '';
  var debounceTimer = null;

  function render() {
    if (!searchResults.length) {
      var noResultsText = (window.NATIVE_CONFIG && window.NATIVE_CONFIG.searchNoResults) || 'No results';
      container.innerHTML = '<p class="px-4 py-3 text-gray-500 dark:text-gray-400">' + escapeHtml(noResultsText) + '</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < searchResults.length; i++) {
      var r = searchResults[i];
      html += '<a class="search-result-item block px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" href="' + escapeHtml(r.url) + '" data-index="' + i + '">' +
        '<div class="font-medium text-gray-900 dark:text-white">' + highlightMatch(r.title, lastQuery) + '</div>' +
        '<div class="text-sm text-gray-500 dark:text-gray-400 mt-1">' + escapeHtml(r.excerpt) + '</div>' +
        '</a>';
    }
    container.innerHTML = html;
  }

  function updateActiveHighlight() {
    var items = container.querySelectorAll('.search-result-item');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var isSelected = i === activeIndex;
      el.classList.toggle('bg-gray-100', isSelected);
      el.classList.toggle('dark:bg-gray-800', isSelected);
      if (isSelected) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  input.addEventListener('input', function(e) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      lastQuery = e.target.value.trim();
      ensureSearchData().then(function() {
        searchResults = performSearch(lastQuery);
        activeIndex = -1;
        render();
      });
    }, 300);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length) {
        activeIndex = Math.min(activeIndex + 1, searchResults.length - 1);
        updateActiveHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveHighlight();
    } else if (e.key === 'Enter' && activeIndex >= 0 && searchResults[activeIndex]) {
      e.preventDefault();
      window.location.href = searchResults[activeIndex].url;
    }
  });

  return { input: input, container: container, updateActiveHighlight: updateActiveHighlight };
}

// Modal control
function openSearchModal() {
  var modal = document.getElementById('search-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  var input = document.getElementById('search-input');
  if (input) input.focus();
  document.body.classList.add('overflow-hidden');
}

function closeSearchModal() {
  var modal = document.getElementById('search-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  var input = document.getElementById('search-input');
  if (input) input.value = '';
  var results = document.getElementById('search-results');
  if (results) results.innerHTML = '';
  document.body.classList.remove('overflow-hidden');
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  // Modal search
  initSearchUI('search-input', 'search-results');

  // Page search (if on standalone search page)
  initSearchUI('page-search-input', 'page-search-results');

  // Bind [data-close-modal] click -> closeSearchModal()
  var closeEls = document.querySelectorAll('[data-close-modal]');
  for (var i = 0; i < closeEls.length; i++) {
    closeEls[i].addEventListener('click', function(e) {
      e.preventDefault();
      closeSearchModal();
    });
  }

  // Esc key -> closeSearchModal() when modal is open
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var modal = document.getElementById('search-modal');
      if (modal && !modal.classList.contains('hidden')) {
        closeSearchModal();
      }
    }
  });

  // Auto-focus page-search-input if on search page
  var pageInput = document.getElementById('page-search-input');
  if (pageInput) pageInput.focus();
});
