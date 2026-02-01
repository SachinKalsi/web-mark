(function () {
  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }

  function getCurrentTab() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0]);
  }

  function getPageUrl() {
    return getCurrentTab().then(tab => tab && tab.url ? normalizeUrl(tab.url) : null);
  }

  const colors = document.querySelectorAll('.color');
  const notesInput = document.getElementById('notesInput');
  const saveNotesBtn = document.getElementById('saveNotes');
  const notesStatus = document.getElementById('notesStatus');
  const syncToGoogleBtn = document.getElementById('syncToGoogle');
  const importFromGoogleBtn = document.getElementById('importFromGoogle');
  const syncStatus = document.getElementById('syncStatus');
  const highlightingEnabledCheckbox = document.getElementById('highlightingEnabled');

  chrome.storage.local.get('highlightingEnabled', function (result) {
    highlightingEnabledCheckbox.checked = result.highlightingEnabled === true;
  });
  highlightingEnabledCheckbox.addEventListener('change', function () {
    chrome.runtime.sendMessage({ action: 'setHighlightingEnabled', enabled: highlightingEnabledCheckbox.checked });
  });

  function setActiveColor(color) {
    colors.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === color);
    });
  }

  chrome.storage.local.get('selectedColor', result => {
    setActiveColor(result.selectedColor || 'yellow');
  });

  colors.forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      setActiveColor(color);
      chrome.runtime.sendMessage({ action: 'setCurrentColor', color });
    });
  });

  function loadNotes() {
    getPageUrl().then(url => {
      if (!url) {
        notesInput.placeholder = 'Open a webpage first.';
        return;
      }
      chrome.runtime.sendMessage({ action: 'getNotes', url }, response => {
        if (response && response.notes) {
          const content = Array.isArray(response.notes)
            ? response.notes.map(n => (typeof n === 'string' ? n : n.content || '')).join('\n\n')
            : (response.notes.content || '');
          notesInput.value = content;
        } else {
          notesInput.value = '';
        }
      });
    });
  }

  saveNotesBtn.addEventListener('click', () => {
    getPageUrl().then(url => {
      if (!url) {
        notesStatus.textContent = 'No page URL.';
        return;
      }
      const content = notesInput.value.trim();
      const notes = content ? [{ id: 'n1', content, createdAt: new Date().toISOString() }] : [];
      chrome.runtime.sendMessage({ action: 'saveNotes', url, notes }, response => {
        if (response && response.ok) {
          notesStatus.textContent = 'Saved.';
          setTimeout(() => { notesStatus.textContent = ''; }, 2000);
        } else {
          notesStatus.textContent = 'Save failed.';
        }
      });
    });
  });

  loadNotes();

  function setSyncStatus(text) {
    syncStatus.textContent = text;
  }

  syncToGoogleBtn.addEventListener('click', () => {
    setSyncStatus('Syncing…');
    chrome.runtime.sendMessage({ action: 'syncToGoogle' }, response => {
      if (response && response.ok) {
        setSyncStatus('Synced.');
      } else {
        setSyncStatus(response && response.error ? response.error : 'Sync failed.');
      }
    });
  });

  importFromGoogleBtn.addEventListener('click', () => {
    setSyncStatus('Importing…');
    chrome.runtime.sendMessage({ action: 'importFromGoogle' }, response => {
      if (response && response.ok) {
        setSyncStatus('Imported.');
        loadNotes();
        getCurrentTab().then(tab => {
          if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: 'restoreHighlights' });
          }
        });
      } else {
        setSyncStatus(response && response.error ? response.error : 'Import failed.');
      }
    });
  });
})();
