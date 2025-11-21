console.log('content script loaded');

// Readability mode state
let readabilityModeActive = false;
let originalBodyHTML: string | null = null;
let originalBodyStyle: string | null = null;

// Highlighted element state
let highlightedElement: HTMLElement | null = null;
let originalBorder: string | null = null;
let originalOutline: string | null = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'toggle_readability_mode') {
    try {
      if (readabilityModeActive) {
        // Restore original page
        restoreOriginalPage();
        sendResponse({ success: true, active: false });
      } else {
        // Apply readability mode
        applyReadabilityMode(message.article);
        sendResponse({ success: true, active: true });
      }
    } catch (error) {
      console.error('Error toggling readability mode:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else if (message.type === 'highlight_element') {
    try {
      highlightElement(message.selector);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error highlighting element:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return true; // Keep message channel open for async response
});

function applyReadabilityMode(article: {
  title: string;
  content: string;
  byline: string | null;
  siteName: string | null;
}) {
  // Save original page state
  originalBodyHTML = document.body.innerHTML;
  originalBodyStyle = document.body.getAttribute('style');

  // Create reader view styles
  const readerStyles = `
    <style id="readability-mode-styles">
      body {
        max-width: 800px !important;
        margin: 0 auto !important;
        padding: 40px 20px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 18px !important;
        line-height: 1.6 !important;
        color: #333 !important;
        background: #f9f9f9 !important;
      }

      #readability-container {
        background: white;
        padding: 60px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      #readability-title {
        font-size: 2.5em !important;
        font-weight: 700 !important;
        line-height: 1.2 !important;
        margin: 0 0 20px 0 !important;
        color: #000 !important;
      }

      #readability-meta {
        font-size: 0.9em !important;
        color: #666 !important;
        margin-bottom: 30px !important;
        padding-bottom: 20px !important;
        border-bottom: 1px solid #e0e0e0 !important;
      }

      #readability-content {
        font-size: 1.1em !important;
        line-height: 1.8 !important;
      }

      #readability-content p {
        margin: 1.2em 0 !important;
      }

      #readability-content h1,
      #readability-content h2,
      #readability-content h3,
      #readability-content h4,
      #readability-content h5,
      #readability-content h6 {
        margin: 1.5em 0 0.5em 0 !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
      }

      #readability-content img {
        max-width: 100% !important;
        height: auto !important;
        margin: 1.5em 0 !important;
        border-radius: 4px !important;
      }

      #readability-content a {
        color: #0066cc !important;
        text-decoration: none !important;
      }

      #readability-content a:hover {
        text-decoration: underline !important;
      }

      #readability-exit-button {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        background: #333;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }

      #readability-exit-button:hover {
        background: #555;
      }
    </style>
  `;

  // Create reader view HTML
  const readerHTML = `
    ${readerStyles}
    <div id="readability-container">
      <h1 id="readability-title">${escapeHtml(article.title)}</h1>
      ${
        article.byline || article.siteName
          ? `
        <div id="readability-meta">
          ${article.byline ? `<div>By ${escapeHtml(article.byline)}</div>` : ''}
          ${article.siteName ? `<div>${escapeHtml(article.siteName)}</div>` : ''}
        </div>
      `
          : ''
      }
      <div id="readability-content">
        ${article.content}
      </div>
    </div>
  `;

  // Replace body content
  document.body.innerHTML = readerHTML;
  document.body.style.cssText = '';
  readabilityModeActive = true;
}

function restoreOriginalPage() {
  if (originalBodyHTML !== null) {
    document.body.innerHTML = originalBodyHTML;
    if (originalBodyStyle !== null) {
      document.body.setAttribute('style', originalBodyStyle);
    } else {
      document.body.removeAttribute('style');
    }
    originalBodyHTML = null;
    originalBodyStyle = null;
  }

  readabilityModeActive = false;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function highlightElement(selector: string): void {
  // Remove previous highlight if exists
  if (highlightedElement) {
    if (originalBorder !== null) {
      highlightedElement.style.border = originalBorder;
    }
    if (originalOutline !== null) {
      highlightedElement.style.outline = originalOutline;
    }
    highlightedElement = null;
    originalBorder = null;
    originalOutline = null;
  }

  // Find and highlight the new element
  const element = document.querySelector(selector);
  if (element && element instanceof HTMLElement) {
    // Save original styles
    originalBorder = element.style.border;
    originalOutline = element.style.outline;

    // Apply green border highlight
    element.style.border = '3px solid #10b981';
    element.style.outline = '2px solid #10b981';

    // Store reference
    highlightedElement = element;

    // Scroll element into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Focus the element if possible
    if (element.tabIndex >= 0 || element instanceof HTMLAnchorElement || element instanceof HTMLButtonElement) {
      element.focus();
    }
  } else {
    throw new Error(`Element not found with selector: ${selector}`);
  }
}
