/* LowK — content script (injected into every page) */

(function () {
  'use strict';

  function attachToField(field) {
    if (field.__lowkAttached) return;
    field.__lowkAttached = true;

    let startTime   = null;
    let backspaces  = 0;
    let charCount   = 0;
    let didType     = false;

    field.addEventListener('keydown', (e) => {
      if (!startTime && e.key.length === 1) {
        startTime = Date.now();
        didType   = true;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') backspaces++;
    });

    field.addEventListener('input', () => {
      charCount = field.value.length;
    });

    const form = field.closest('form');
    if (form && !form.__lowkAttached) {
      form.__lowkAttached = true;
      form.addEventListener('submit', () => capture(field, startTime, backspaces, charCount, didType));
    }

    field.addEventListener('blur', () => {
      if (didType && charCount >= 4) {
        capture(field, startTime, backspaces, charCount, didType);
      }
    });
  }

  function capture(field, startTime, backspaces, chars, didType) {
    if (!didType || !startTime || chars < 4) return;
    if (field.__lowkSent) return;
    field.__lowkSent = true;

    const typingMs = Date.now() - startTime;
    const site     = location.hostname.replace(/^www\./, '');

    chrome.runtime.sendMessage({
      type: 'signin_attempt',
      data: { site, typingMs, backspaces, chars }
    });
  }

  function scan() {
    document.querySelectorAll('input[type="password"]').forEach(attachToField);
  }

  scan();

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
})();
