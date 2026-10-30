/**
 * TRACE - WhatsApp Web Content Script
 * 
 * Robust, production-grade message extractor for WhatsApp Web.
 * Privacy Standard: No continuous monitoring, no background surveillance.
 * Extracts content ONLY upon explicit user command from the extension popup.
 * 
 * Key Architecture:
 * 1. Separates "Extract Complete Message" from "Extract Highlighted Selection"
 *    - Never allows a stale or accidental text selection to override the full message.
 * 2. Climbs upward from any clicked/hovered/nested element to the outer message container.
 * 3. Extracts text from the ENTIRE message container tree.
 *    - NEVER calls querySelector('.selectable-text') to find a child span, which previously
 *      caused extraction to collapse into a single mention tag (e.g. "Tanish Loya").
 * 4. Preserves complete announcements: paragraphs, numbered lists, mentions, newlines.
 * 5. Returns comprehensive debug telemetry (element tag, class, length, method).
 */

let lastInteractedElement = null;

// Track user interaction target within the active chat pane (#main)
function registerInteraction(event) {
  const target = event.target;
  if (!target) return;

  const chatPane = document.querySelector('#main') ||
                   document.querySelector('[data-testid="conversation-panel-wrapper"]');
  if (!chatPane || !chatPane.contains(target)) return;

  lastInteractedElement = target;
}

['click', 'contextmenu', 'mouseover', 'focusin'].forEach(evt => {
  document.addEventListener(evt, registerInteraction, { capture: true, passive: true });
});

/**
 * Climbs upward from an inner DOM node to the outermost message boundary
 * inside the WhatsApp active chat pane (#main).
 */
function climbToOuterMessageContainer(startEl) {
  if (!startEl) return null;

  const chatPane = document.querySelector('#main') ||
                   document.querySelector('[data-testid="conversation-panel-wrapper"]');
  if (!chatPane || !chatPane.contains(startEl)) return null;

  let curr = startEl;
  let highestContainer = null;

  while (curr && curr !== chatPane && curr !== document.body) {
    const isBoundary =
      (curr.getAttribute && curr.getAttribute('data-id')) ||
      (curr.getAttribute && curr.getAttribute('role') === 'row') ||
      (curr.classList && (curr.classList.contains('message-in') || curr.classList.contains('message-out'))) ||
      (curr.classList && curr.classList.contains('focusable-list-item')) ||
      (curr.getAttribute && curr.getAttribute('data-pre-plain-text'));

    if (isBoundary) {
      highestContainer = curr;
    }

    // Stop climbing when we reach the conversation message list wrapper
    if (
      (curr.getAttribute && (
        curr.getAttribute('id') === 'main' ||
        curr.getAttribute('data-testid') === 'conversation-panel-messages' ||
        curr.getAttribute('data-testid') === 'conversation-panel-wrapper'
      )) ||
      (curr.classList && (curr.classList.contains('conversation-panel-messages') || curr.classList.contains('copyable-area')))
    ) {
      break;
    }

    curr = curr.parentNode;
  }

  return highestContainer;
}

/**
 * Extracts complete clean message text from the identified message container.
 * Crucial rule: Never call querySelector('.selectable-text') to find a child span!
 * Reads the text of the entire message container tree.
 */
function extractFullTextFromMessageContainer(container) {
  if (!container) return { text: '', rootTag: '', rootClass: '' };

  // Locate the message body text container inside this message container
  let textRoot = null;

  if (container.getAttribute && container.getAttribute('data-pre-plain-text')) {
    textRoot = container;
  } else {
    textRoot = container.querySelector('div.copyable-text[data-pre-plain-text]') ||
               container.querySelector('.copyable-text') ||
               container.querySelector('.message-in, .message-out') ||
               container;
  }

  // Clone textRoot so we can remove metadata without mutating live WhatsApp DOM
  const clone = textRoot.cloneNode(true);

  // Remove UI metadata:
  const unwantedSelectors = [
    // Timestamps and read receipts
    '[data-testid="msg-meta"]',
    '.msg-meta',
    'span[data-testid="msg-meta"]',
    'div[data-testid="status-check"]',
    'div[data-testid="status-dblcheck"]',
    'span[data-testid="status-check"]',
    'span[data-testid="status-dblcheck"]',
    // Group sender / author headers
    '[data-testid="author"]',
    '.author',
    '._ahxd',
    // Quoted / replied message previews
    '[data-testid="quoted-message"]',
    '[aria-label*="Quoted"]',
    '.quoted-mention',
    // Action buttons and reaction badges
    '[data-testid="down-context"]',
    '[data-testid="reactions"]',
    '[data-testid="reaction-bubble"]',
    'button'
  ];

  unwantedSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Replace emoji images with their alt text
  clone.querySelectorAll('img[alt]').forEach(img => {
    const alt = img.getAttribute('alt');
    if (alt) img.replaceWith(document.createTextNode(alt));
  });

  // Convert <br> tags to newlines
  clone.querySelectorAll('br').forEach(br => {
    br.replaceWith(document.createTextNode('\n'));
  });

  // Ensure block containers have newline boundaries
  clone.querySelectorAll('div, p').forEach(b => {
    if (b.previousSibling && !b.previousSibling.textContent?.endsWith('\n')) {
      b.before(document.createTextNode('\n'));
    }
  });

  // Extract innerText or textContent from the complete message container
  let raw = '';
  if (typeof clone.innerText === 'string' && clone.innerText.trim().length > 0) {
    raw = clone.innerText;
  } else {
    raw = clone.textContent || '';
  }

  // Clean trailing spaces on lines, preserve multiline structure
  const lines = raw.split(/\r?\n/).map(l => l.trimEnd());
  const clean = lines.join('\n').replace(/^\n+|\n+$/g, '');

  return {
    text: clean,
    rootTag: textRoot.tagName || '',
    rootClass: textRoot.className || ''
  };
}

/**
 * Main WhatsApp extraction entry point
 * @param {string} mode - 'full_message' (default) or 'selection_only'
 */
function extractWhatsAppContent(mode = 'full_message') {
  console.log('[TRACE Content Script] Extraction requested with mode:', mode);

  // 1. Intentional Option: Highlighted text selection
  if (mode === 'selection_only') {
    const selection = window.getSelection();
    const selText = selection ? selection.toString().trim() : '';
    if (selText.length >= 3) {
      return {
        success: true,
        text: selText,
        source: 'whatsapp',
        method: 'SELECTION_INTENTIONAL',
        debugInfo: {
          targetTagName: 'SELECTION',
          targetClassName: '',
          textRootTagName: 'SELECTION',
          textRootClassName: '',
          extractedLength: selText.length,
          lineCount: selText.split('\n').length,
          extractionMethod: 'SELECTION_INTENTIONAL'
        }
      };
    } else {
      return {
        success: false,
        error: 'No text is currently highlighted in WhatsApp Web. Please highlight text with your mouse first, or use "Extract Complete Message".',
        source: 'whatsapp'
      };
    }
  }

  // 2. Locate active WhatsApp conversation pane (#main)
  const chatPane = document.querySelector('#main') ||
                   document.querySelector('[data-testid="conversation-panel-wrapper"]');
  if (!chatPane) {
    return {
      success: false,
      error: 'No active WhatsApp chat is open. Please click on a conversation in WhatsApp Web to open it.',
      source: 'whatsapp'
    };
  }

  // 3. Collect candidate message containers in the active chat pane
  let candidateContainers = Array.from(chatPane.querySelectorAll('div[role="row"]'));
  if (candidateContainers.length === 0) {
    candidateContainers = Array.from(chatPane.querySelectorAll('.focusable-list-item'));
  }
  if (candidateContainers.length === 0) {
    candidateContainers = Array.from(chatPane.querySelectorAll('.message-in, .message-out'));
  }
  if (candidateContainers.length === 0) {
    candidateContainers = Array.from(chatPane.querySelectorAll('div[data-id]'));
  }
  if (candidateContainers.length === 0) {
    candidateContainers = Array.from(chatPane.querySelectorAll('div[data-pre-plain-text]'));
  }

  // Filter out system encryption banners, date dividers, etc.
  const validMessages = candidateContainers.filter(c => {
    return (
      (c.getAttribute && c.getAttribute('data-pre-plain-text')) ||
      c.querySelector('[data-pre-plain-text], .copyable-text, .selectable-text') !== null
    );
  });

  if (validMessages.length === 0) {
    return {
      success: false,
      error: 'No readable messages found in the active chat. Please click on the message bubble in WhatsApp Web.',
      source: 'whatsapp'
    };
  }

  // 4. Identify the target message container
  let targetContainer = null;
  let extractionMethod = 'DOM_BUBBLE';

  // Strategy A: Check if the user interacted with or hovered over an element in #main
  if (lastInteractedElement && chatPane.contains(lastInteractedElement)) {
    const climbed = climbToOuterMessageContainer(lastInteractedElement);
    if (climbed) {
      targetContainer = climbed;
      extractionMethod = 'DOM_INTERACTED_CLIMBED';
    }
  }

  // Strategy B: Check if a message is currently hovered or focused
  if (!targetContainer) {
    const activeEl = chatPane.querySelector('div[role="row"]:hover, .message-in:hover, .message-out:hover, div[role="row"].selected, div[role="row"]:focus-within');
    if (activeEl) {
      targetContainer = climbToOuterMessageContainer(activeEl) || activeEl;
      extractionMethod = 'DOM_ACTIVE_ROW_CLIMBED';
    }
  }

  // Strategy C: Target the latest incoming message in the chat
  if (!targetContainer) {
    const incoming = validMessages.filter(b => b.classList?.contains('message-in') || b.querySelector?.('.message-in') !== null);
    if (incoming.length > 0) {
      targetContainer = incoming[incoming.length - 1];
      extractionMethod = 'DOM_LATEST_INCOMING';
    } else {
      targetContainer = validMessages[validMessages.length - 1];
      extractionMethod = 'DOM_LATEST_BUBBLE';
    }
  }

  // 5. Extract full text from target container without querying down into child mention spans!
  const extractionResult = extractFullTextFromMessageContainer(targetContainer);
  const fullText = extractionResult.text;

  console.log(`[TRACE Content Script] Extraction complete via ${extractionMethod}: ${fullText.length} chars, ${fullText.split('\n').length} lines`);

  // 6. Reliability Check: Never silently submit empty or partial text
  if (!fullText || fullText.trim().length < 5) {
    return {
      success: false,
      error: 'Could not reliably extract the complete message. Please click directly on the message bubble in WhatsApp Web or use "Extract Highlighted Selection".',
      source: 'whatsapp'
    };
  }

  return {
    success: true,
    text: fullText,
    source: 'whatsapp',
    method: extractionMethod,
    debugInfo: {
      targetTagName: targetContainer.tagName || '',
      targetClassName: targetContainer.className || '',
      textRootTagName: extractionResult.rootTag,
      textRootClassName: extractionResult.rootClass,
      extractedLength: fullText.length,
      lineCount: fullText.split('\n').length,
      extractionMethod: extractionMethod
    }
  };
}

// Listen for explicit extraction requests from TRACE popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_MESSAGE') {
    const mode = request.mode || 'full_message';
    const extraction = extractWhatsAppContent(mode);
    sendResponse(extraction);
  }
  return true;
});

// Export helper for automated test environments (Node.js / JSDOM)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractWhatsAppContent,
    climbToOuterMessageContainer,
    extractFullTextFromMessageContainer
  };
}
