/**
 * TRACE - Gmail Web Content Script
 * 
 * Extracts message content ONLY upon explicit user command from the extension popup.
 * Privacy Standard: No continuous monitoring, no background surveillance.
 * Priority:
 * 1. User highlighted / selected text (highest priority)
 * 2. Active open email in Gmail DOM (subject + sender + body)
 */

function extractGmailContent() {
  // 1. High Priority: User highlighted text with mouse
  const userSelection = window.getSelection() ? window.getSelection().toString().trim() : '';
  if (userSelection.length > 5) {
    return {
      success: true,
      text: userSelection,
      source: 'gmail',
      method: 'SELECTION',
      note: 'Extracted from highlighted text selection in Gmail.'
    };
  }

  // 2. Target active open email in Gmail DOM
  // Gmail standard DOM selectors for subject, sender, and email body
  const subjectEl = document.querySelector('h2.hP') || document.querySelector('div[role="main"] h2');
  const senderEl = document.querySelector('span.gD') || document.querySelector('[email]');
  
  // Standard Gmail email body classes: .a3s.aiL or .adn.ads or .ii.gt
  const bodyEl = document.querySelector('.a3s.aiL') || 
                 document.querySelector('div[data-message-id] .ii.gt') ||
                 document.querySelector('div[role="main"] .adn.ads');

  const subject = subjectEl ? subjectEl.innerText.trim() : '';
  const sender = senderEl ? (senderEl.getAttribute('email') || senderEl.innerText.trim()) : '';
  const body = bodyEl ? bodyEl.innerText.trim() : '';

  if (body.length > 10) {
    let combined = '';
    if (sender) combined += `From: ${sender}\n`;
    if (subject) combined += `Subject: ${subject}\n\n`;
    combined += body;

    return {
      success: true,
      text: combined.trim(),
      source: 'gmail',
      method: 'DOM_EXTRACT',
      subject: subject,
      sender: sender,
      debugInfo: {
        targetTagName: bodyEl.tagName,
        targetClassName: bodyEl.className || '',
        textRootTagName: bodyEl.tagName,
        textRootClassName: bodyEl.className || '',
        extractedLength: combined.trim().length,
        lineCount: combined.trim().split('\n').length,
        extractionMethod: 'DOM_EXTRACT'
      }
    };
  }

  // 3. Fallback: Search all open message bodies if multiple messages in thread
  const allBodies = document.querySelectorAll('.a3s');
  if (allBodies.length > 0) {
    const latestBody = allBodies[allBodies.length - 1].innerText.trim();
    if (latestBody.length > 10) {
      return {
        success: true,
        text: latestBody,
        source: 'gmail',
        method: 'DOM_THREAD_LATEST'
      };
    }
  }

  return {
    success: false,
    error: 'No active email found. Please click to open an email or highlight text in Gmail.',
    source: 'gmail'
  };
}

// Listen for explicit extraction requests from TRACE popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_MESSAGE') {
    const extraction = extractGmailContent();
    sendResponse(extraction);
  }
  return true;
});

