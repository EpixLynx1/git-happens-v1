/* LowK — background service worker (MV3) */

/* ── EmailJS config — fill these in before loading the extension ── */
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';

/* ── scoring ─────────────────────────────────────────── */
function computeScore(attempt, profile) {
  /* Speed: ratio of typing durations (1.0 = identical) */
  const speedRatio = attempt.typingMs / (profile.typingMs || 2000);
  const speedScore = Math.max(0, Math.round(100 - Math.abs(speedRatio - 1) * 130));

  /* Errors: absolute difference in backspace count */
  const errDiff  = Math.abs(attempt.backspaces - (profile.backspaces || 0));
  const errScore = Math.max(0, 100 - errDiff * 20);

  /* Pace: chars-per-second ratio */
  const profCps  = (profile.chars || 8) / ((profile.typingMs || 2000) / 1000);
  const verCps   = (attempt.chars  || 8) / ((attempt.typingMs   || 2000) / 1000);
  const cpsRatio = verCps / profCps;
  const cpsScore = Math.max(0, Math.round(100 - Math.abs(cpsRatio - 1) * 130));

  return Math.round(0.40 * speedScore + 0.30 * errScore + 0.30 * cpsScore);
}

/* ── message handler ─────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'signin_attempt') {
    handleAttempt(msg.data, sender.tab).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function handleAttempt(data, tab) {
  const stored = await chrome.storage.local.get(['profile', 'events']);
  const profile = stored.profile;
  if (!profile) return;

  const score   = computeScore(data, profile);
  const trusted = score >= 65;

  const event = {
    site:      data.site,
    timestamp: Date.now(),
    score,
    trusted,
    typingMs:  data.typingMs,
    backspaces: data.backspaces,
    chars:     data.chars
  };

  const events = [event, ...(stored.events || [])].slice(0, 30);
  await chrome.storage.local.set({ events });

  if (!trusted) {
    chrome.notifications.create(`lowk-${Date.now()}`, {
      type:    'basic',
      iconUrl: 'icon48.png',
      title:   'LowK — Suspicious sign-in',
      message: `Typing pattern on ${data.site} looks unusual (trust: ${score}%).`
    });

    if (profile.email) sendAlertEmail(event, profile);
  }

  openPopupWindow();
}

/* ── EmailJS alert email ──────────────────────────────── */
async function sendAlertEmail(event, profile) {
  const time = new Date(event.timestamp).toLocaleString('en-US', {
    dateStyle: 'medium', timeStyle: 'short'
  });

  const body = {
    service_id:  EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id:     EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email:    profile.email,
      alert_time:  time,
      website:     event.site,
      trust_score: `${event.score}%`,
      typing_ms:   `${event.typingMs} ms`,
      backspaces:  String(event.backspaces),
      chars:       String(event.chars)
    }
  };

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    if (!res.ok) console.warn('LowK EmailJS error:', res.status, await res.text());
  } catch (err) {
    console.warn('LowK EmailJS fetch failed:', err);
  }
}

/* ── popup window management ─────────────────────────── */
async function openPopupWindow() {
  const POPUP_URL = chrome.runtime.getURL('popup.html');

  const allWindows = await chrome.windows.getAll({ populate: true });
  for (const win of allWindows) {
    if (win.type === 'popup' && win.tabs.some(t => t.url && t.url.startsWith(POPUP_URL))) {
      chrome.windows.update(win.id, { focused: true });
      return;
    }
  }

  chrome.windows.create({
    url:     POPUP_URL,
    type:    'popup',
    width:   410,
    height:  560,
    focused: true
  });
}
