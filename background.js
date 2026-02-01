/* global normalizeUrl, getHighlightsForUrl, setHighlightsForUrl, getNotesForUrl, setNotesForUrl, getAllDataForSheets */

importScripts('lib/storage.js');

function updateHighlightingBadge(enabled) {
  try {
    chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
    if (enabled) chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
  } catch (e) {}
}

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'toggle-highlighting') {
    chrome.storage.local.get('highlightingEnabled', function (result) {
      const next = !(result.highlightingEnabled === true);
      chrome.storage.local.set({ highlightingEnabled: next });
      updateHighlightingBadge(next);
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.action) {
      case 'getHighlights': {
        const highlights = await getHighlightsForUrl(message.url);
        return { highlights };
      }
      case 'saveHighlight': {
        if (!isContentUrl(message.url)) return { ok: true };
        const highlights = await getHighlightsForUrl(message.url);
        highlights.push(message.highlight);
        await setHighlightsForUrl(message.url, highlights);
        return { ok: true };
      }
      case 'removeHighlight': {
        const highlights = await getHighlightsForUrl(message.url);
        const next = highlights.filter(h => h.id !== message.highlightId);
        await setHighlightsForUrl(message.url, next);
        return { ok: true };
      }
      case 'updateHighlight': {
        const highlights = await getHighlightsForUrl(message.url);
        const idx = highlights.findIndex(h => h.id === message.highlightId);
        if (idx >= 0 && message.color) {
          highlights[idx].color = message.color;
          await setHighlightsForUrl(message.url, highlights);
        }
        return { ok: true };
      }
      case 'getHighlightingEnabled': {
        const result = await chrome.storage.local.get('highlightingEnabled');
        return { enabled: result.highlightingEnabled === true };
      }
      case 'getNotes': {
        const notes = await getNotesForUrl(message.url);
        return { notes };
      }
      case 'saveNotes': {
        if (!isContentUrl(message.url)) return { ok: true };
        await setNotesForUrl(message.url, message.notes);
        return { ok: true };
      }
      case 'getCurrentColor': {
        const result = await chrome.storage.local.get('selectedColor');
        return { color: result.selectedColor || 'yellow' };
      }
      case 'setCurrentColor': {
        await chrome.storage.local.set({ selectedColor: message.color });
        return { ok: true };
      }
      case 'getAllData': {
        const data = await getAllDataForSheets();
        return data;
      }
      case 'importFromSheets': {
        const { highlightsByUrl, notesByUrl } = message.payload;
        for (const [url, highlights] of Object.entries(highlightsByUrl || {})) {
          if (Array.isArray(highlights) && highlights.length > 0) {
            await setHighlightsForUrl(url, highlights);
          }
        }
        for (const [url, notes] of Object.entries(notesByUrl || {})) {
          if (Array.isArray(notes) && notes.length > 0) {
            await setNotesForUrl(url, notes);
          }
        }
        return { ok: true };
      }
      case 'setHighlightingEnabled': {
        const enabled = message.enabled === true;
        await chrome.storage.local.set({ highlightingEnabled: enabled });
        updateHighlightingBadge(enabled);
        return { ok: true };
      }
      case 'syncToGoogle': {
        const token = await getGoogleToken();
        if (!token) return { error: 'Sign in required. Check extension permissions.' };
        await removeStorageForExcludedUrls();
        await removeHighlightsWithNoText();
        const data = await getAllDataForSheets();
        const err = await syncToSheets(token, data);
        if (err) return { error: err };
        return { ok: true };
      }
      case 'importFromGoogle': {
        const token = await getGoogleToken();
        if (!token) return { error: 'Sign in required. Check extension permissions.' };
        const payload = await importFromSheetsAPI(token);
        if (payload.error) return { error: payload.error };
        const { highlightsByUrl, notesByUrl } = payload;
        for (const [url, highlights] of Object.entries(highlightsByUrl || {})) {
          if (Array.isArray(highlights) && highlights.length > 0) {
            await setHighlightsForUrl(url, highlights);
          }
        }
        for (const [url, notes] of Object.entries(notesByUrl || {})) {
          if (Array.isArray(notes) && notes.length > 0) {
            await setNotesForUrl(url, notes);
          }
        }
        return { ok: true };
      }
      default:
        return { error: 'Unknown action' };
    }
  };
  handle().then(sendResponse).catch(err => sendResponse({ error: String(err && err.message || err) }));
  return true;
});

function getGoogleToken() {
  return new Promise(resolve => {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(token);
    });
  });
}

function sheetRangeName(name) {
  const n = (name || '').trim() || 'Sheet1';
  if (/[^\w]/.test(n)) return "'" + n.replace(/'/g, "''") + "'";
  return n;
}

async function getSheetNames() {
  const stored = await chrome.storage.local.get(['sheetsHighlightsName', 'sheetsNotesName']);
  return {
    highlights: (stored.sheetsHighlightsName || 'Highlights').trim() || 'Highlights',
    notes: (stored.sheetsNotesName || 'PageNotes').trim() || 'PageNotes'
  };
}

async function getOrCreateSpreadsheetId(token) {
  const stored = await chrome.storage.local.get('sheetsSpreadsheetId');
  if (stored.sheetsSpreadsheetId) return stored.sheetsSpreadsheetId;
  const names = await getSheetNames();
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: 'Web Mark' },
      sheets: [
        { properties: { title: names.highlights } },
        { properties: { title: names.notes } }
      ]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Create spreadsheet failed: ' + t);
  }
  const json = await res.json();
  const id = json.spreadsheetId;
  await chrome.storage.local.set({ sheetsSpreadsheetId: id });
  return id;
}

async function syncToSheets(token, data) {
  try {
    const spreadsheetId = await getOrCreateSpreadsheetId(token);
    const names = await getSheetNames();
    const highlightsSheet = sheetRangeName(names.highlights);
    const notesSheet = sheetRangeName(names.notes);
    const { highlightsByUrl, notesByUrl } = data;
    const highlightRows = [['URL', 'highlightId', 'highlightedText', 'startXPath', 'startOffset', 'endXPath', 'endOffset', 'color', 'createdAt']];
    for (const [url, highlights] of Object.entries(highlightsByUrl || {})) {
      for (const h of highlights) {
        var text = (h.text || '').trim().replace(/\r?\n/g, ' ');
        if (!text) continue;
        highlightRows.push([
          url,
          h.id || '',
          text,
          h.startXPath || '',
          String(h.startOffset ?? ''),
          h.endXPath || '',
          String(h.endOffset ?? ''),
          h.color || 'yellow',
          h.createdAt || ''
        ]);
      }
    }
    const noteRows = [['URL', 'noteId', 'content', 'createdAt']];
    for (const [url, notes] of Object.entries(notesByUrl || {})) {
      for (const n of notes) {
        const noteObj = typeof n === 'string' ? { id: 'n1', content: n, createdAt: '' } : n;
        noteRows.push([url, noteObj.id || '', (noteObj.content || '').replace(/\r?\n/g, ' '), noteObj.createdAt || '']);
      }
    }
    var clearRange = highlightsSheet + '!A2:I500';
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    var range1 = highlightsSheet + '!A1:I' + Math.max(highlightRows.length, 1);
    const res1 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range1)}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: highlightRows })
    });
    if (!res1.ok) throw new Error(await res1.text());
    const range2 = `${notesSheet}!A1:D${Math.max(noteRows.length, 1)}`;
    const res2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range2)}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: noteRows })
    });
    if (!res2.ok) throw new Error(await res2.text());
    return null;
  } catch (e) {
    return e.message || 'Sync failed';
  }
}

async function importFromSheetsAPI(token) {
  try {
    const stored = await chrome.storage.local.get(['sheetsSpreadsheetId', 'sheetsHighlightsName', 'sheetsNotesName']);
    const spreadsheetId = stored.sheetsSpreadsheetId;
    if (!spreadsheetId) return { error: 'No spreadsheet linked. Sync to Google first to create one.' };
    const highlightsRange = sheetRangeName(stored.sheetsHighlightsName || 'Highlights');
    const notesRange = sheetRangeName(stored.sheetsNotesName || 'PageNotes');
    const r1 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(highlightsRange)}?majorDimension=ROWS`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(notesRange)}?majorDimension=ROWS`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r1.ok || !r2.ok) return { error: 'Failed to read spreadsheet.' };
    const j1 = await r1.json();
    const j2 = await r2.json();
    const highlightRows = j1.values || [];
    const noteRows = j2.values || [];
    const highlightsByUrl = {};
    const notesByUrl = {};
    for (var i = 1; i < highlightRows.length; i++) {
      var row = highlightRows[i];
      if (!row || row.length < 7) continue;
      var url = row[0];
      if (!url || !isContentUrl(url)) continue;
      if (!highlightsByUrl[url]) highlightsByUrl[url] = [];
      var base = row.length >= 9 ? 3 : 2;
      highlightsByUrl[url].push({
        id: row[1] || ('h_' + i),
        text: row.length >= 9 ? (row[2] || '') : '',
        startXPath: row[base] || '',
        startOffset: parseInt(row[base + 1], 10) || 0,
        endXPath: row[base + 2] || '',
        endOffset: parseInt(row[base + 3], 10) || 0,
        color: row[base + 4] || 'yellow',
        createdAt: row[base + 5] || ''
      });
    }
    for (let i = 1; i < noteRows.length; i++) {
      const row = noteRows[i];
      if (!row || row.length < 2) continue;
      const url = row[0];
      if (!url) continue;
      if (!notesByUrl[url]) notesByUrl[url] = [];
      notesByUrl[url].push({
        id: row[1] || ('n_' + i),
        content: (row[2] || '').replace(/ \| \| /g, '\n'),
        createdAt: row[3] || ''
      });
    }
    return { highlightsByUrl, notesByUrl };
  } catch (e) {
    return { error: e.message || 'Import failed' };
  }
}
