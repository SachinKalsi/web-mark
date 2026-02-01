(function () {
  const colors = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];
  const container = document.getElementById('colorPicker');
  const spreadsheetInput = document.getElementById('spreadsheetId');
  const highlightsSheetInput = document.getElementById('highlightsSheetName');
  const notesSheetInput = document.getElementById('notesSheetName');

  colors.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color ' + color;
    btn.title = color;
    btn.dataset.color = color;
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chrome.storage.local.set({ selectedColor: color });
    });
    container.appendChild(btn);
  });

  chrome.storage.local.get(['selectedColor', 'sheetsSpreadsheetId', 'sheetsHighlightsName', 'sheetsNotesName'], result => {
    const color = result.selectedColor || 'yellow';
    container.querySelector(`[data-color="${color}"]`).classList.add('active');
    if (result.sheetsSpreadsheetId) spreadsheetInput.value = result.sheetsSpreadsheetId;
    highlightsSheetInput.value = result.sheetsHighlightsName || 'Highlights';
    notesSheetInput.value = result.sheetsNotesName || 'PageNotes';
  });

  spreadsheetInput.addEventListener('change', () => {
    const id = spreadsheetInput.value.trim();
    if (id) chrome.storage.local.set({ sheetsSpreadsheetId: id });
    else chrome.storage.local.remove('sheetsSpreadsheetId');
  });

  highlightsSheetInput.addEventListener('change', () => {
    const name = highlightsSheetInput.value.trim() || 'Highlights';
    chrome.storage.local.set({ sheetsHighlightsName: name });
  });

  notesSheetInput.addEventListener('change', () => {
    const name = notesSheetInput.value.trim() || 'PageNotes';
    chrome.storage.local.set({ sheetsNotesName: name });
  });
})();
