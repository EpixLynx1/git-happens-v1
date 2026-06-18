/* LowK — popup script (MV3, no inline handlers) */
'use strict';

/* ── helpers ─────────────────────────────────── */
const $ = id => document.getElementById(id);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

function showPage(id) {
  ['pg-setup', 'pg-registered', 'pg-dash'].forEach(p => hide($(p)));
  show($(id));
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

/* ── setup: typing capture ───────────────────── */
const emailInput = $('email-input');
const ppInput  = $('pp-input');
const ppDots   = $('pp-dots');
const ppHint   = $('pp-hint');
const btnReg   = $('btn-register');
const tBar     = $('t-bar');

let typingStart  = null;
let typingErrors = 0;
let typingChars  = 0;

function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function updateRegBtn() {
  btnReg.disabled = !(ppInput.value.length >= 8 && validEmail(emailInput.value.trim()));
}

emailInput.addEventListener('input', updateRegBtn);

ppInput.addEventListener('keydown', e => {
  if (!typingStart && e.key.length === 1) typingStart = Date.now();
  if (e.key === 'Backspace' || e.key === 'Delete') typingErrors++;
});

ppInput.addEventListener('input', () => {
  const v = ppInput.value;
  typingChars = v.length;

  /* dot visualiser */
  ppDots.innerHTML = '';
  for (let i = 0; i < v.length; i++) {
    const d = document.createElement('span');
    d.className = 'dot fill';
    ppDots.appendChild(d);
  }

  /* typing-speed bar (max visual at 20 chars) */
  const pct = Math.min(100, Math.round((v.length / 20) * 100));
  tBar.style.width = pct + '%';

  /* hint + button state */
  if (v.length === 0) {
    ppHint.textContent = 'Minimum 8 characters. The text itself is never stored.';
    ppHint.classList.remove('err');
  } else if (v.length < 8) {
    ppHint.textContent = `${8 - v.length} more character${8 - v.length !== 1 ? 's' : ''} needed.`;
    ppHint.classList.add('err');
  } else {
    ppHint.textContent = 'Looking good — click "Save my profile" when ready.';
    ppHint.classList.remove('err');
  }
  updateRegBtn();
});

btnReg.addEventListener('click', async () => {
  const v = ppInput.value;
  if (v.length < 8) return;

  const typingMs = typingStart ? Date.now() - typingStart : 3000;
  const cps      = typingChars / (typingMs / 1000);

  const profile = {
    /* We store biometrics only — the passphrase text is NOT stored */
    email:        emailInput.value.trim(),
    chars:        typingChars,
    typingMs,
    backspaces:   typingErrors,
    cps:          Math.round(cps * 10) / 10,
    registeredAt: Date.now()
  };

  await chrome.storage.local.set({ profile, events: [] });
  showPage('pg-registered');
});

/* ── re-register ─────────────────────────────── */
function startReRegister() {
  chrome.storage.local.remove(['profile', 'events'], () => {
    emailInput.value = '';
    ppInput.value  = '';
    ppDots.innerHTML = '';
    tBar.style.width = '0%';
    ppHint.textContent = 'Minimum 8 characters. The text itself is never stored.';
    ppHint.classList.remove('err');
    btnReg.disabled = true;
    typingStart  = null;
    typingErrors = 0;
    typingChars  = 0;
    showPage('pg-setup');
  });
}

$('btn-re-register').addEventListener('click', startReRegister);
$('btn-re-register-from-success').addEventListener('click', startReRegister);

/* ── dashboard: render events ────────────────── */
function scoreColor(score) {
  if (score >= 70) return '#1e8e3e';
  if (score >= 45) return '#b06000';
  return '#d93025';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderEvent(ev) {
  const color       = scoreColor(ev.score);
  const circ        = 2 * Math.PI * 15;
  const dashOffset  = circ - (circ * ev.score / 100);
  const label       = ev.score >= 70 ? 'Trusted' : ev.score >= 45 ? 'Unusual' : 'Suspicious';

  const card = document.createElement('div');
  card.className = 'event-card';
  card.innerHTML = `
    <div class="trust-ring">
      <svg viewBox="0 0 42 42">
        <circle class="ring-bg" cx="21" cy="21" r="15"/>
        <circle class="ring-fg" cx="21" cy="21" r="15"
          stroke="${color}"
          stroke-dasharray="${circ.toFixed(1)}"
          stroke-dashoffset="${dashOffset.toFixed(1)}"
          stroke-linecap="round"/>
      </svg>
    </div>
    <div class="event-info">
      <div class="event-site">${escHtml(ev.site)}</div>
      <div class="event-meta">${timeAgo(ev.timestamp)} · ${ev.typingMs}ms · ${ev.backspaces} backspace${ev.backspaces !== 1 ? 's' : ''}</div>
    </div>
    <div class="trust-label" style="color:${color}">${ev.score}%<br><span style="font-size:10px;font-weight:400">${label}</span></div>`;
  return card;
}

function renderDashboard(events) {
  const list    = $('event-list');
  const recent  = (events || []).slice(0, 8);

  if (recent.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="ico">🔍</div>
      <div>No sign-ins captured yet.<br>Log in to any site and come back here.</div>
    </div>`;
    return;
  }

  list.innerHTML = '';
  recent.forEach(ev => list.appendChild(renderEvent(ev)));
}

/* ── init & auto-refresh ─────────────────────────────── */
async function loadAndRender() {
  const stored = await chrome.storage.local.get(['profile', 'events']);
  if (!stored.profile) {
    showPage('pg-setup');
    ppInput.focus();
  } else {
    showPage('pg-dash');
    renderDashboard(stored.events);
  }
}

document.addEventListener('DOMContentLoaded', loadAndRender);

window.addEventListener('focus', () => {
  chrome.storage.local.get(['profile', 'events']).then(stored => {
    if (stored.profile) renderDashboard(stored.events);
  });
});
