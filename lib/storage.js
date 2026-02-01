/**
 * Storage helpers for Web Mark.
 * Must run in extension context (background) - uses chrome.storage.local.
 * Keys: highlights_${normalizedUrl}, notes_${normalizedUrl}
 */

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
    if (host === 'support.google.com' && path.indexOf('/accounts') === 0) return false;
    if (host === 'docs.google.com' && path.indexOf('/spreadsheets/') !== -1) return false;
    return true;
  } catch {
    return false;
  }
}

function highlightsKey(url) {
  return 'highlights_' + normalizeUrl(url);
}

function notesKey(url) {
  return 'notes_' + normalizeUrl(url);
}

async function getHighlightsForUrl(url) {
  const key = highlightsKey(url);
  const result = await chrome.storage.local.get(key);
  return result[key] || [];
}

async function setHighlightsForUrl(url, highlights) {
  const key = highlightsKey(url);
  await chrome.storage.local.set({ [key]: highlights });
}

async function getNotesForUrl(url) {
  const key = notesKey(url);
  const result = await chrome.storage.local.get(key);
  return result[key] || [];
}

async function setNotesForUrl(url, notes) {
  const key = notesKey(url);
  await chrome.storage.local.set({ [key]: notes });
}

async function getAllHighlightsKeys() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter(k => k.startsWith('highlights_'));
}

async function getAllNotesKeys() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter(k => k.startsWith('notes_'));
}

async function getAllDataForSheets() {
  const all = await chrome.storage.local.get(null);
  const highlightsByUrl = {};
  const notesByUrl = {};
  for (const key of Object.keys(all)) {
    if (key.startsWith('highlights_')) {
      const url = key.slice('highlights_'.length);
      if (isContentUrl(url)) highlightsByUrl[url] = all[key];
    } else if (key.startsWith('notes_')) {
      const url = key.slice('notes_'.length);
      if (isContentUrl(url)) notesByUrl[url] = all[key];
    }
  }
  return { highlightsByUrl, notesByUrl };
}

async function removeStorageForExcludedUrls() {
  const all = await chrome.storage.local.get(null);
  const toRemove = {};
  for (const key of Object.keys(all)) {
    if (key.startsWith('highlights_') || key.startsWith('notes_')) {
      const url = key.slice(key.startsWith('highlights_') ? 'highlights_'.length : 'notes_'.length);
      if (!isContentUrl(url)) toRemove[key] = undefined;
    }
  }
  if (Object.keys(toRemove).length > 0) {
    await chrome.storage.local.remove(Object.keys(toRemove));
  }
}

async function removeHighlightsWithNoText() {
  const all = await chrome.storage.local.get(null);
  for (const key of Object.keys(all)) {
    if (!key.startsWith('highlights_')) continue;
    const url = key.slice('highlights_'.length);
    const highlights = all[key];
    if (!Array.isArray(highlights) || highlights.length === 0) continue;
    const kept = highlights.filter(function (h) {
      return (h.text || '').trim().length > 0;
    });
    if (kept.length !== highlights.length) {
      await setHighlightsForUrl(url, kept.length > 0 ? kept : []);
    }
  }
}
