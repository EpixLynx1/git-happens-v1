/* LowK — content script (injected into every page) */

(function () {
  'use strict';

  /* Track each password field independently */
  function attachToField(field) {
    if (field.__gkAttached) return;
    field.__gkAttached = true;

    let startTime   = null;
    let backspaces  = 0;
    let charCount   = 0;
    let didType     = false;

    field.addEventListener('keydown', (e) => {
      /* start timer on first printable keystroke */
      if (!startTime && e.key.length === 1) {
        startTime = Date.now();
        didType   = true;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') backspaces++;
    });

    field.addEventListener('input', () => {
      charCount = field.value.length;
    });

    /* Capture on form submit */
    const form = field.closest('form');
    if (form && !form.__gkAttached) {
      form.__gkAttached = true;
      form.addEventListener('submit', () => capture(field, startTime, backspaces, charCount, didType));
    }

    /* Fallback: capture on blur if enough was typed */
    field.addEventListener('blur', () => {
      if (didType && charCount >= 4) {
        capture(field, startTime, backspaces, charCount, didType);
      }
    });
  }

  function capture(field, startTime, backspaces, chars, didType) {
    if (!didType || !startTime || chars < 4) return;
    /* prevent double-sending from both submit and blur */
    if (field.__gkSent) return;
    field.__gkSent = true;

    const typingMs = Date.now() - startTime;
    const site     = location.hostname.replace(/^www\./, '');

    chrome.runtime.sendMessage({
      type: 'signin_attempt',
      data: { site, typingMs, backspaces, chars }
    });
  }

  /* Scan existing fields, then watch for dynamically added ones */
  function scan() {
    document.querySelectorAll('input[type="password"]').forEach(attachToField);
  }

  scan();

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
})();
