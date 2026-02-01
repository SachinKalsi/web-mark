/**
 * Content script: selection → highlight, restore highlights on load.
 * Uses lib/xpath.js (loaded before this) and messages background for storage.
 */

(function () {
  const HIGHLIGHT_CLASS_PREFIX = 'wh-highlight wh-highlight-';
  const COLOR_CLASSES = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];

  function getCurrentColor() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getCurrentColor' }, response => {
        resolve((response && response.color) || 'yellow');
      });
    });
  }

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }

  function isContentUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const path = u.pathname || '';
      if (u.protocol === 'chrome-extension:' || u.protocol === 'chrome:' || u.protocol === 'about:') return false;
      if (host === 'accounts.google.com' || host.endsWith('.accounts.google.com')) return false;
      if (host === 'console.cloud.google.com' || host.endsWith('.console.cloud.google.com')) return false;
      if (host === 'docs.google.com' && path.indexOf('/spreadsheets/') !== -1) return false;
      return true;
    } catch {
      return false;
    }
  }

  function wrapRangeInHighlight(range, color, id) {
    if (!range || range.collapsed) return null;
    const span = document.createElement('span');
    span.className = HIGHLIGHT_CLASS_PREFIX + (COLOR_CLASSES.includes(color) ? color : 'yellow');
    span.setAttribute('data-wh-highlight-id', id);
    try {
      range.surroundContents(span);
      return span;
    } catch (e) {
      try {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        return span;
      } catch (e2) {
        return null;
      }
    }
  }

  function applyStoredHighlight(h) {
    const doc = document;
    const root = doc.documentElement;
    const range = WebsiteHighlighterXPath.rangeFromPaths(
      doc,
      h.startXPath,
      h.startOffset,
      h.endXPath,
      h.endOffset,
      root
    );
    if (!range) return false;
    wrapRangeInHighlight(range, h.color || 'yellow', h.id);
    return true;
  }

  function restoreHighlights(highlights) {
    if (!Array.isArray(highlights) || highlights.length === 0) return;
    for (let i = highlights.length - 1; i >= 0; i--) {
      applyStoredHighlight(highlights[i]);
    }
  }

  function onPageLoad() {
    const url = normalizeUrl(window.location.href);
    chrome.runtime.sendMessage({ action: 'getHighlights', url }, function (response) {
      if (response && response.highlights && response.highlights.length > 0) {
        function doRestore() {
          restoreHighlights(response.highlights);
        }
        if (document.readyState === 'complete') {
          setTimeout(doRestore, 50);
        } else {
          window.addEventListener('load', function () { setTimeout(doRestore, 50); });
        }
      }
    });
  }

  function updateHighlightSpanColor(span, color) {
    if (!span || !COLOR_CLASSES.includes(color)) return;
    span.className = HIGHLIGHT_CLASS_PREFIX + color;
  }

  function saveSelectionAsHighlight(color) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const serialized = WebsiteHighlighterXPath.serializeRange(range, document.documentElement);
    if (!serialized) return;
    const highlightedText = range.toString();
    const id = 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const colorToUse = color || 'yellow';
    const span = wrapRangeInHighlight(range, colorToUse, id);
    if (!span) return;
    const highlight = {
      id,
      text: highlightedText,
      startXPath: serialized.startXPath,
      startOffset: serialized.startOffset,
      endXPath: serialized.endXPath,
      endOffset: serialized.endOffset,
      color: colorToUse,
      createdAt: new Date().toISOString()
    };
    const url = normalizeUrl(window.location.href);
    if (!isContentUrl(url)) return;
    chrome.runtime.sendMessage({ action: 'saveHighlight', url, highlight }, function (response) {
      if (response && response.error) {
        console.warn('[Web Mark] Save highlight failed:', response.error);
      }
    });
  }

  function onMouseUp() {
    chrome.runtime.sendMessage({ action: 'getHighlightingEnabled' }, function (response) {
      if (!(response && response.enabled)) return;
      runMouseUpHighlight();
    });
  }

  function runMouseUpHighlight() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const serialized = WebsiteHighlighterXPath.serializeRange(range, document.documentElement);
    if (!serialized) return;
    const highlightedText = range.toString();
    const id = 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    var span = wrapRangeInHighlight(range, 'yellow', id);
    if (!span) return;
    const highlightPayload = {
      id,
      text: highlightedText,
      startXPath: serialized.startXPath,
      startOffset: serialized.startOffset,
      endXPath: serialized.endXPath,
      endOffset: serialized.endOffset,
      color: 'yellow',
      createdAt: new Date().toISOString()
    };
    const url = normalizeUrl(window.location.href);
    if (!isContentUrl(url)) return;
    getCurrentColor().then(function (color) {
      const colorToUse = color || 'yellow';
      updateHighlightSpanColor(span, colorToUse);
      highlightPayload.color = colorToUse;
      chrome.runtime.sendMessage({ action: 'saveHighlight', url, highlight: highlightPayload }, function (response) {
        if (response && response.error) {
          console.warn('[Web Mark] Save highlight failed:', response.error);
        }
      });
    });
  }

  function showToast(message) {
    var el = document.createElement('div');
    el.className = 'wh-toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('wh-toast-hide');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, 2500);
  }

  function unwrapHighlight(span) {
    if (!span || !span.parentNode) return;
    while (span.firstChild) {
      span.parentNode.insertBefore(span.firstChild, span);
    }
    span.parentNode.removeChild(span);
  }

  function showHighlightContextMenu(e, span) {
    e.preventDefault();
    e.stopPropagation();
    var menu = document.getElementById('wh-context-menu');
    if (menu) menu.remove();
    menu = document.createElement('div');
    menu.id = 'wh-context-menu';
    menu.className = 'wh-context-menu';
    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove highlight';
    removeBtn.className = 'wh-menu-remove';
    removeBtn.addEventListener('click', function () {
      var id = span.getAttribute('data-wh-highlight-id');
      var url = normalizeUrl(window.location.href);
      unwrapHighlight(span);
      chrome.runtime.sendMessage({ action: 'removeHighlight', url, highlightId: id });
      hideMenu();
      showToast('Removed. Click Sync to Google Sheets to update the sheet.');
    });
    menu.appendChild(removeBtn);
    var colorLabel = document.createElement('span');
    colorLabel.className = 'wh-menu-label';
    colorLabel.textContent = 'Change color:';
    menu.appendChild(colorLabel);
    var colorRow = document.createElement('div');
    colorRow.className = 'wh-menu-colors';
    COLOR_CLASSES.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wh-menu-color ' + c;
      btn.title = c;
      btn.addEventListener('click', function () {
        updateHighlightSpanColor(span, c);
        var id = span.getAttribute('data-wh-highlight-id');
        var url = normalizeUrl(window.location.href);
        chrome.runtime.sendMessage({ action: 'updateHighlight', url, highlightId: id, color: c });
        hideMenu();
      });
      colorRow.appendChild(btn);
    });
    menu.appendChild(colorRow);
    document.body.appendChild(menu);
    var x = e.clientX;
    var y = e.clientY;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    setTimeout(function () {
      document.addEventListener('click', hideMenu);
      document.addEventListener('contextmenu', hideMenu);
    }, 0);
    function hideMenu() {
      document.removeEventListener('click', hideMenu);
      document.removeEventListener('contextmenu', hideMenu);
      if (menu.parentNode) menu.remove();
    }
  }

  document.addEventListener('contextmenu', function (e) {
    var target = e.target;
    while (target && target !== document.body) {
      if (target.classList && target.classList.contains('wh-highlight')) {
        showHighlightContextMenu(e, target);
        return;
      }
      target = target.parentNode;
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'restoreHighlights') {
      chrome.runtime.sendMessage({ action: 'getHighlights', url: normalizeUrl(window.location.href) }, response => {
        if (response && response.highlights) {
          restoreHighlights(response.highlights);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
      });
      return true;
    }
    if (message.action === 'highlightSelection') {
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        getCurrentColor().then(function (color) {
          saveSelectionAsHighlight(color);
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onPageLoad);
  } else {
    onPageLoad();
  }

  document.addEventListener('mouseup', onMouseUp, false);
})();
