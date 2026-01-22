console.log('YTSDF: Content script loaded!');
let lastUrl = location.href;

// Inject floating menu UI
function injectUI() {
  if (document.getElementById('ytsdf-toggle')) return; // Already injected

  // Create toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'ytsdf-toggle';
  toggleBtn.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon.png')}" style="width: 30px; height: 30px;">`;
  toggleBtn.title = 'Search Date Filter Settings';
  
  // Create overlay menu
  const overlay = document.createElement('div');
  overlay.id = 'ytsdf-overlay';
  overlay.innerHTML = `
    <button id="ytsdf-close">×</button>
    <h3>Search Date Filter</h3>
    <label>
      <input type="checkbox" id="ytsdf-enabled"> Enable filter
    </label>
    <label>
      <input type="checkbox" id="ytsdf-exactSearch"> Enable exact search
    </label>
    <div class="date-input">
      <label>
        Filter results before:
        <input type="date" id="ytsdf-cutoffDate">
      </label>
    </div>
    <div class="sort-options">
      <strong>Default sort (YouTube only):</strong>
      <label>
        <input type="radio" name="ytsdf-sortOrder" value="relevance" checked> Relevance
        <small>(default)</small>
      </label>
      <label>
        <input type="radio" name="ytsdf-sortOrder" value="date"> Upload date
      </label>
      <label>
        <input type="radio" name="ytsdf-sortOrder" value="viewCount"> View count
      </label>
    </div>
    <button id="ytsdf-save">Save</button>
    <button id="ytsdf-restore">Restore Original Query</button>
  `;
  
  document.body.appendChild(toggleBtn);
  document.body.appendChild(overlay);
  
  // Load saved settings with error handling
  try {
    chrome.storage.sync.get(['enabled', 'exactSearch', 'cutoffDate', 'sortOrder'], (data) => {
      if (chrome.runtime.lastError) {
        console.error('YTSDF: Error loading settings:', chrome.runtime.lastError);
        return;
      }
      
      document.getElementById('ytsdf-enabled').checked = data.enabled || false;
      document.getElementById('ytsdf-exactSearch').checked = data.exactSearch || false;
      document.getElementById('ytsdf-cutoffDate').value = data.cutoffDate || '';
      
      const sortOrder = data.sortOrder || 'relevance';
      const radio = document.querySelector(`input[name="ytsdf-sortOrder"][value="${sortOrder}"]`);
      if (radio) radio.checked = true;
    });
  } catch (error) {
    console.error('YTSDF: Error accessing chrome.storage:', error);
  }
  
  // Toggle overlay
  toggleBtn.addEventListener('click', () => {
    overlay.classList.toggle('visible');
  });
  
  // Close button
  document.getElementById('ytsdf-close').addEventListener('click', () => {
    overlay.classList.remove('visible');
  });
  
  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!overlay.contains(e.target) && !toggleBtn.contains(e.target)) {
      overlay.classList.remove('visible');
    }
  });
  
  // Save button
  document.getElementById('ytsdf-save').addEventListener('click', () => {
    const enabled = document.getElementById('ytsdf-enabled').checked;
    const exactSearch = document.getElementById('ytsdf-exactSearch').checked;
    const date = document.getElementById('ytsdf-cutoffDate').value;
    const sortOrder = document.querySelector('input[name="ytsdf-sortOrder"]:checked').value;
    
    try {
      chrome.storage.sync.set({ 
        enabled, 
        exactSearch,
        cutoffDate: date,
        sortOrder
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('YTSDF: Error saving settings:', chrome.runtime.lastError);
          return;
        }
        
        // Show confirmation
        const originalText = document.getElementById('ytsdf-save').textContent;
        document.getElementById('ytsdf-save').textContent = 'Saved! ✓';
        setTimeout(() => {
          document.getElementById('ytsdf-save').textContent = originalText;
        }, 1500);
      });
    } catch (error) {
      console.error('YTSDF: Error accessing chrome.storage:', error);
    }
  });

  // Restore button
  document.getElementById('ytsdf-restore').addEventListener('click', () => {
    const exactSearch = document.getElementById('ytsdf-exactSearch').checked;
    restoreSearchBar(exactSearch);
    
    // Show confirmation
    const originalText = document.getElementById('ytsdf-restore').textContent;
    document.getElementById('ytsdf-restore').textContent = 'Cleared! ✓';
    setTimeout(() => {
      document.getElementById('ytsdf-restore').textContent = originalText;
    }, 1500);
  });
}

function modifySearch() {
  try {
    chrome.storage.sync.get(['enabled', 'exactSearch', 'cutoffDate', 'sortOrder'], (data) => {
      if (chrome.runtime.lastError) {
        console.error('YTSDF: Error in modifySearch:', chrome.runtime.lastError);
        return;
      }
      
      if (!data.enabled || !data.cutoffDate) return;
      
      const url = new URL(window.location.href);
      
      let queryParam = null;
      let query = null;
      
      if (url.hostname.includes('google.com')) {
        queryParam = 'q';
        query = url.searchParams.get('q');
      } else if (url.hostname.includes('youtube.com')) {
        queryParam = 'search_query';
        query = url.searchParams.get('search_query');
      }
      
      if (query && queryParam && !query.includes('before:')) {
        let newQuery = query;
        
        if (data.exactSearch && !newQuery.startsWith('"')) {
          newQuery = `"${newQuery}"`;
        }
        
        newQuery = `before:${data.cutoffDate} ${newQuery}`;
        
        url.searchParams.set(queryParam, newQuery);
        
        if (url.hostname.includes('youtube.com') && data.sortOrder && data.sortOrder !== 'relevance') {
          if (data.sortOrder === 'date') {
            url.searchParams.set('sp', 'CAI%3D');
          } else if (data.sortOrder === 'viewCount') {
            url.searchParams.set('sp', 'CAM%3D');
          }
        }
        
        window.location.replace(url.toString());
      }
    });
  } catch (error) {
    console.error('YTSDF: Error in modifySearch:', error);
  }
}

function interceptYouTubeSearch() {
  try {
    chrome.storage.sync.get(['enabled', 'exactSearch', 'cutoffDate', 'sortOrder'], (data) => {
      if (chrome.runtime.lastError) {
        console.error('YTSDF: Error in interceptYouTubeSearch:', chrome.runtime.lastError);
        return;
      }
      
      if (!data.enabled || !data.cutoffDate) return;
      
      const checkSearchBox = setInterval(() => {
        const searchBox = document.querySelector('input#search');
        if (searchBox) {
          clearInterval(checkSearchBox);
          
          const form = searchBox.closest('form');
          if (form) {
            form.addEventListener('submit', (e) => {
              let currentQuery = searchBox.value;
              if (currentQuery && !currentQuery.includes('before:')) {
                e.preventDefault();
                
                if (data.exactSearch && !currentQuery.startsWith('"')) {
                  currentQuery = `"${currentQuery}"`;
                }
                
                searchBox.value = `before:${data.cutoffDate} ${currentQuery}`;
                
                if (data.sortOrder && data.sortOrder !== 'relevance') {
                  const formAction = new URL(form.action);
                  if (data.sortOrder === 'date') {
                    formAction.searchParams.set('sp', 'CAI%3D');
                  } else if (data.sortOrder === 'viewCount') {
                    formAction.searchParams.set('sp', 'CAM%3D');
                  }
                  form.action = formAction.toString();
                }
                
                form.submit();
              }
            });
          }
        }
      }, 100);
      
      setTimeout(() => clearInterval(checkSearchBox), 5000);
    });
  } catch (error) {
    console.error('YTSDF: Error in interceptYouTubeSearch:', error);
  }
}

function restoreSearchBar(exactSearch) {
  let searchInput = null;
  
  if (location.hostname.includes('youtube.com')) {
    searchInput = document.querySelector('input#search') 
                  || document.querySelector('input[name="search_query"]')
                  || document.querySelector('ytd-searchbox input');
  } else if (location.hostname.includes('google.com')) {
    // Find the VISIBLE search box, not the hidden input
    searchInput = document.querySelector('textarea[name="q"]:not([type="hidden"])')
                  || document.querySelector('input[name="q"]:not([type="hidden"])')
                  || document.querySelector('textarea[aria-label*="Search"]')
                  || document.querySelector('input[aria-label*="Search"]');
  }
  
  if (!searchInput) return;
  
  let currentValue = searchInput.value;
  
  // Remove any before:YYYY-MM-DD pattern
  const beforePattern = /before:\d{4}-\d{2}-\d{2}\s+/gi;
  currentValue = currentValue.replace(beforePattern, '');
  
  // Remove quotes if exact search was enabled
  if (exactSearch && currentValue.startsWith('"') && currentValue.endsWith('"')) {
    currentValue = currentValue.slice(1, -1);
  }
  
  currentValue = currentValue.trim();
  
  // Set value using the appropriate prototype based on element type
  const isTextarea = searchInput.tagName.toLowerCase() === 'textarea';
  const prototype = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
  nativeValueSetter.call(searchInput, currentValue);
  
  // Trigger multiple events
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  searchInput.dispatchEvent(new Event('change', { bubbles: true }));
  searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  
  // For Google, trigger focus to make sure it updates
  if (location.hostname.includes('google.com')) {
    searchInput.focus();
    searchInput.blur();
  }
}

// Initialize with delays to ensure APIs are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(injectUI, 500);
  });
} else {
  setTimeout(injectUI, 500);
}

modifySearch();

if (location.hostname.includes('youtube.com')) {
  interceptYouTubeSearch();
}

new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    modifySearch();
  }
}).observe(document, { subtree: true, childList: true });