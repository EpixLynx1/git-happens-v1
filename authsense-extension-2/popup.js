/* ─── constants ─── */
const DOT_POSITIONS = [[55,38],[305,38],[180,98],[55,145],[305,145]];
const CIRC = 289; // 2π × r=46

/* ─── state ─── */
let R = null, V = null;
let gUser = null; // {email, id}

/* ─── utils ─── */
function el(id) { return document.getElementById(id); }
function show(id, txt) { const e = el(id); if (txt !== undefined) e.textContent = txt; e.classList.remove('hidden'); }
function hide(id) { el(id).classList.add('hidden'); }
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function variance(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return avg(arr.map(x=>(x-m)**2));
}
function clamp(v,lo,hi) { return Math.min(Math.max(v,lo),hi); }
function strict(diff,base) { return 100 - clamp((Math.abs(diff)/Math.max(base,1))*300,0,100); }
function lax(diff,base)    { return 100 - clamp((Math.abs(diff)/Math.max(base,1))*150,0,100); }

function avatarColor(email) {
  const colors = ['#22c55e','#06b6d4','#a78bfa','#fb923c','#f472b6','#34d399'];
  let h = 0; for (let i = 0; i < email.length; i++) h = (h*31 + email.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}
function initials(email) { return email ? email[0].toUpperCase() : '?'; }

function fillBadge(prefix, email) {
  const badge = el(prefix + '-badge');
  if (!email) return;
  badge.classList.remove('hidden');
  el(prefix + '-av').textContent = initials(email);
  el(prefix + '-av').style.background = avatarColor(email);
  el(prefix + '-uname').textContent = email.split('@')[0];
  el(prefix + '-uemail').textContent = email;
}

function toggleEye(inputId, btn) {
  const inp = el(inputId);
  const hidden = inp.type === 'password';
  inp.type = hidden ? 'text' : 'password';
  btn.innerHTML = hidden
    ? '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

/* ─── Google identity ─── */
function loadGoogleUser(cb) {
  if (typeof chrome !== 'undefined' && chrome.identity) {
    try {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, info => {
        gUser = (info && info.email) ? info : null;
        cb(gUser);
      });
    } catch(e) { gUser = null; cb(null); }
  } else { gUser = null; cb(null); }
}

/* ─── routing ─── */
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  el('page-' + page).classList.add('active');
  if (page === 'home')      initHome();
  if (page === 'register')  initReg();
  if (page === 'verify')    initVer();
  if (page === 'dashboard') renderDash();
}

/* ─── home ─── */
function initHome() {
  const hasProfile = !!localStorage.getItem('as_prof');
  if (hasProfile) {
    hide('no-profile-msg');
  } else {
    show('no-profile-msg');
    el('no-profile-msg').textContent = 'No profile yet — click Set Up Profile first.';
  }
  loadGoogleUser(user => {
    if (user) {
      const badge = el('home-badge');
      badge.classList.remove('hidden');
      el('home-av').textContent = initials(user.email);
      el('home-av').style.background = avatarColor(user.email);
      el('home-name').textContent = user.email.split('@')[0];
      el('home-email').textContent = user.email;
      hide('no-google');
    } else {
      hide('home-badge');
      show('no-google');
    }
  });
}

/* ─── register ─── */
function mkState() {
  return { input:'', startTime:null, keyTimes:[], dwellTimes:[], lastDown:null,
           backspaces:0, mousePath:[], wpm:0, reactionStart:null, reactionTime:null,
           reactionGreen:false, dotTimes:[], dotClicks:[], dotsDone:false, _mm:null };
}

function rStep(n) {
  [1,2,3].forEach(i => {
    el('r-step'+i).classList.toggle('hidden', i !== n);
    el('rp'+i).className = 'ps' + (i < n ? ' done' : i === n ? ' act' : '');
  });
  const labels = ['Step 1 of 3 — Choose a passphrase','Step 2 of 3 — Draw your dot pattern','Step 3 of 3 — Reaction test'];
  el('r-step-lbl').textContent = labels[n-1];
}

function initReg() {
  R = mkState();
  const inp = el('r-inp');
  inp.value = ''; inp.disabled = false; inp.type = 'password';
  hide('r-err'); hide('r-wpm'); hide('r-dot-done'); hide('r-rres');
  hide('btn-save-profile');
  el('r-dots').innerHTML = '<span style="color:var(--muted);font-size:.62rem;font-style:italic">start typing…</span>';
  el('r-next1').disabled = true;
  el('r-rbtn').className = 'rbtn'; el('r-rbtn').textContent = 'WAIT FOR IT…'; el('r-rres').textContent = '';
  rStep(1);

  const email = gUser ? gUser.email : localStorage.getItem('as_email') || '';
  fillBadge('r', email);

  inp.oninput = () => {
    R.input = inp.value;
    if (R.input.length > 0 && !R.startTime) R.startTime = Date.now();
    if (R.startTime && R.input.length > 0) {
      const m = (Date.now()-R.startTime)/60000;
      R.wpm = Math.round((R.input.length/5)/m);
      const w = el('r-wpm'); w.textContent = R.wpm+' WPM'; w.classList.remove('hidden');
    }
    el('r-dots').innerHTML = R.input.length
      ? Array.from({length:R.input.length}).map(()=>'<span class="dot fill"></span>').join('')
      : '<span style="color:var(--muted);font-size:.62rem;font-style:italic">start typing…</span>';
    el('r-next1').disabled = R.input.length < 6;
    hide('r-err');
  };
  inp.onkeydown = e => {
    if (e.key==='Backspace') R.backspaces++;
    else if (e.key.length===1) { R.keyTimes.push(Date.now()); R.lastDown=Date.now(); }
    else if (e.key==='Enter' && R.input.length>=6) advanceReg();
  };
  inp.onkeyup = e => {
    if (R.lastDown && e.key.length===1) { R.dwellTimes.push(Date.now()-R.lastDown); R.lastDown=null; }
  };
  R._mm = e => R.mousePath.push({x:e.clientX,y:e.clientY});
  window.addEventListener('mousemove', R._mm);
  setTimeout(()=>inp.focus(),50);
}

function advanceReg() {
  rStep(2);
  requestAnimationFrame(()=>initDotCanvas('dotpat-r','r'));
}

function saveProfile() {
  window.removeEventListener('mousemove', R._mm);
  const email = gUser ? gUser.email : '';
  localStorage.setItem('as_pass', R.input);
  if (email) localStorage.setItem('as_email', email);
  localStorage.setItem('as_prof', JSON.stringify(buildMetrics(R)));
  goTo('verify');
}

/* ─── verify ─── */
function vStep(n) {
  [1,2,3].forEach(i => {
    el('v-step'+i).classList.toggle('hidden', i !== n);
    el('vp'+i).className = 'ps' + (i < n ? ' done' : i === n ? ' act' : '');
  });
  const labels = ['Step 1 of 3 — Type your passphrase','Step 2 of 3 — Draw your dot pattern','Step 3 of 3 — Reaction test'];
  el('v-step-lbl').textContent = labels[n-1];
}

function initVer() {
  const pass = localStorage.getItem('as_pass');
  const prof = localStorage.getItem('as_prof');
  if (!pass || !prof) {
    show('no-profile-msg', 'No profile found — set one up first.');
    goTo('home');
    return;
  }
  V = mkState();
  const inp = el('v-inp');
  inp.value = ''; inp.disabled = false; inp.type = 'password';
  hide('v-wpm'); hide('v-accepted'); hide('v-dot-done'); hide('btn-run-analysis');
  el('v-rbtn').className = 'rbtn'; el('v-rbtn').textContent = 'WAIT FOR IT…'; el('v-rres').textContent = '';
  renderVerDots('');
  vStep(1);

  const email = gUser ? gUser.email : localStorage.getItem('as_email') || '';
  fillBadge('v', email);

  inp.oninput = () => {
    if (V.locked) return;
    if (inp.value.length > pass.length) inp.value = inp.value.slice(0, pass.length);
    V.input = inp.value;
    if (V.input.length > 0 && !V.startTime) V.startTime = Date.now();
    if (V.startTime && V.input.length > 0) {
      const m = (Date.now()-V.startTime)/60000;
      V.wpm = Math.round((V.input.length/5)/m);
      const w = el('v-wpm'); w.textContent = V.wpm+' WPM'; w.classList.remove('hidden');
    }
    renderVerDots(V.input);
    if (V.input === pass && !V.locked) {
      V.locked = true; inp.disabled = true;
      show('v-accepted');
      setTimeout(()=>{ vStep(2); requestAnimationFrame(()=>initDotCanvas('dotpat-v','v')); }, 500);
    }
  };
  inp.onkeydown = e => {
    if (V.locked) return;
    if (e.key==='Backspace') V.backspaces++;
    else if (e.key.length===1) { V.keyTimes.push(Date.now()); V.lastDown=Date.now(); }
  };
  inp.onkeyup = e => {
    if (V.lastDown && e.key.length===1) { V.dwellTimes.push(Date.now()-V.lastDown); V.lastDown=null; }
  };
  V._mm = e => V.mousePath.push({x:e.clientX,y:e.clientY});
  window.addEventListener('mousemove', V._mm);
  setTimeout(()=>inp.focus(),50);
}

function renderVerDots(cur) {
  const pass = localStorage.getItem('as_pass') || '';
  el('v-dots').innerHTML = Array.from({length:pass.length}).map((_,i)=>{
    let c = 'dot';
    if (i < cur.length) c += cur[i]===pass[i]?' ok':' bad';
    return '<span class="'+c+'"></span>';
  }).join('');
}

function runAnalysis() {
  window.removeEventListener('mousemove', V._mm);
  const prof = JSON.parse(localStorage.getItem('as_prof'));
  const sess = buildMetrics(V);
  const scores = compare(prof, sess);
  localStorage.setItem('as_sess', JSON.stringify({profile:prof,session:sess,scores}));
  goTo('dashboard');
}

/* ─── dot canvas ─── */
function initDotCanvas(canvasId, prefix) {
  const cv = el(canvasId);
  const ratio = window.devicePixelRatio || 1;
  const LW = 360, LH = 165;
  cv.width = LW*ratio; cv.height = LH*ratio;
  cv.style.maxWidth = LW+'px';
  const ctx = cv.getContext('2d');
  ctx.scale(ratio, ratio);
  const state = prefix==='r' ? R : V;
  const PX = DOT_POSITIONS;
  const DOT_R = 22;
  let nextDot = 0;
  let lastClickTime = Date.now();

  function draw() {
    ctx.clearRect(0,0,LW,LH);
    if (nextDot > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(34,197,94,.2)';
      ctx.lineWidth = 1.5;
      for (let i=1;i<nextDot;i++) { ctx.moveTo(PX[i-1][0],PX[i-1][1]); ctx.lineTo(PX[i][0],PX[i][1]); }
      ctx.stroke();
    }
    PX.forEach(([x,y],i) => {
      ctx.beginPath(); ctx.arc(x,y,DOT_R,0,Math.PI*2);
      if (i < nextDot) {
        ctx.fillStyle='rgba(34,197,94,.2)'; ctx.fill();
        ctx.strokeStyle='#22c55e';
      } else if (i === nextDot) {
        ctx.fillStyle='rgba(34,197,94,.09)'; ctx.fill();
        ctx.strokeStyle='#22c55e';
        ctx.lineWidth=2;
      } else {
        ctx.strokeStyle='#1a2540';
      }
      ctx.lineWidth=i===nextDot?2:1.5; ctx.stroke();
      ctx.fillStyle = i<=nextDot ? '#22c55e' : '#475569';
      ctx.font='bold 12px Consolas,monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(i+1,x,y);
    });
    // label
    if (nextDot < 5) {
      ctx.fillStyle='rgba(34,197,94,.6)';
      ctx.font='10px Consolas,monospace';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText('→ click '+( nextDot+1 ),PX[nextDot][0]+DOT_R+5,PX[nextDot][1]-6);
    }
  }

  draw();

  cv.onclick = e => {
    if (nextDot >= 5) return;
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX-rect.left)*(LW/rect.width);
    const my = (e.clientY-rect.top)*(LH/rect.height);
    const [tx,ty] = PX[nextDot];
    if (Math.hypot(mx-tx,my-ty) <= DOT_R+8) {
      const now = Date.now();
      state.dotTimes.push(now-lastClickTime);
      state.dotClicks.push({x:mx,y:my,target:{x:tx,y:ty}});
      lastClickTime = now; nextDot++; draw();
      if (nextDot===5) {
        state.dotsDone=true; cv.style.cursor='default';
        show(prefix+'-dot-done');
        setTimeout(()=>{
          if (prefix==='r') { rStep(3); startReact('r'); }
          else              { vStep(3); startReact('v'); }
        }, 400);
      }
    }
  };
}

/* ─── reaction ─── */
function startReact(px) {
  const s = px==='r' ? R : V;
  setTimeout(()=>{
    s.reactionStart=Date.now(); s.reactionGreen=true;
    const btn=el(px+'-rbtn');
    btn.className='rbtn '+(px==='r'?'go':'goa');
    btn.textContent='TAP NOW!';
  }, Math.random()*2000+800);
}

function handleReact(px) {
  const s = px==='r' ? R : V;
  if (!s.reactionGreen || s.reactionTime!==null) return;
  s.reactionTime = Date.now()-s.reactionStart;
  const btn = el(px+'-rbtn');
  btn.className='rbtn done';
  btn.textContent=s.reactionTime+'ms ✓';
  el(px+'-rres').textContent='Reaction: '+s.reactionTime+'ms';
  show(px==='r'?'btn-save-profile':'btn-run-analysis');
}

/* ─── metrics ─── */
function buildMetrics(s) {
  const times=s.keyTimes;
  const intervals=[];
  for(let i=1;i<times.length;i++) intervals.push(times[i]-times[i-1]);
  const avgDotInt = avg(s.dotTimes.slice(1));
  const dotAccuracy = s.dotClicks.length
    ? avg(s.dotClicks.map(c=>Math.max(0,1-Math.hypot(c.x-c.target.x,c.y-c.target.y)/30)))*100
    : 50;
  return { wpm:s.wpm, avgInt:avg(intervals), varInt:variance(intervals), avgDwell:avg(s.dwellTimes),
           backspaces:s.backspaces, reactionTime:s.reactionTime||0, avgDotInt, dotAccuracy, mousePath:s.mousePath };
}

function compare(p,s) {
  const wpmM    = strict(s.wpm-p.wpm, p.wpm);
  const rhythmM = strict(s.avgInt-p.avgInt, p.avgInt);
  const conM    = lax(Math.sqrt(s.varInt)-Math.sqrt(p.varInt), Math.max(Math.sqrt(p.varInt),1));
  const dwellM  = lax(s.avgDwell-p.avgDwell, Math.max(p.avgDwell,1));
  const bsM     = Math.max(0,100-Math.abs(s.backspaces-p.backspaces)*15);
  const reactM  = lax(s.reactionTime-p.reactionTime, p.reactionTime);
  const dotM    = strict(s.avgDotInt-p.avgDotInt, Math.max(p.avgDotInt,1));
  const dotAccM = Math.max(0,100-Math.abs(s.dotAccuracy-p.dotAccuracy)*2);
  const overall = wpmM*0.35+rhythmM*0.18+conM*0.12+dwellM*0.10+bsM*0.05+reactM*0.10+dotM*0.05+dotAccM*0.05;
  return { wpm:Math.round(wpmM), rhythm:Math.round(rhythmM), consistency:Math.round(conM),
           dwell:Math.round(dwellM), backspace:Math.round(bsM), reaction:Math.round(reactM),
           mousePattern:Math.round((dotM+dotAccM)/2), overall:Math.round(overall) };
}

/* ─── dashboard ─── */
function renderDash() {
  const data = JSON.parse(localStorage.getItem('as_sess'));
  if (!data) return;
  const { profile:p, session:s, scores:sc } = data;
  const col = sc.overall>=90?'var(--primary)':sc.overall>=70?'var(--accent)':sc.overall>=50?'var(--amber)':'var(--danger)';
  const arc = el('arc-fill');
  arc.style.stroke=col; arc.style.strokeDashoffset=CIRC;
  setTimeout(()=>arc.style.strokeDashoffset=CIRC*(1-sc.overall/100),50);
  animCount('overall-val',sc.overall,'%'); el('overall-val').style.color=col;
  const vd=el('verdict'); vd.classList.remove('hidden');
  if      (sc.overall>=90) { vd.className='verdict vs'; vd.textContent='IDENTITY CONFIRMED'; }
  else if (sc.overall>=70) { vd.className='verdict vw'; vd.textContent='IDENTITY UNCERTAIN'; }
  else if (sc.overall>=50) { vd.className='verdict vw'; vd.textContent='LOW CONFIDENCE'; }
  else                      { vd.className='verdict vd'; vd.textContent='POSSIBLE IMPOSTOR'; }

  const email = localStorage.getItem('as_email');
  const ea = el('email-alert');
  if (sc.overall<80 && email) {
    ea.classList.remove('hidden');
    ea.innerHTML='Score below 80 — alert sent to <strong>'+email+'</strong>';
    const body=encodeURIComponent('AuthSense alert: trust score '+sc.overall+'% on '+new Date().toLocaleString());
    const subj=encodeURIComponent('AuthSense: Low Trust Score Alert');
    setTimeout(()=>window.open('mailto:'+email+'?subject='+subj+'&body='+body,'_blank'),600);
  } else { ea.classList.add('hidden'); }

  const metrics=[
    {key:'wpm', label:'Typing Speed', val:sc.wpm, color:'var(--primary)'},
    {key:'rhy', label:'Rhythm',       val:sc.rhythm, color:'var(--accent)'},
    {key:'con', label:'Consistency',  val:sc.consistency, color:'#a78bfa'},
    {key:'dw',  label:'Key Hold',     val:sc.dwell, color:'#fb923c'},
    {key:'re',  label:'Reaction',     val:sc.reaction, color:'#f472b6'},
    {key:'mp',  label:'Mouse Pat.',   val:sc.mousePattern, color:'var(--accent)'},
  ];
  el('sgrid').innerHTML=metrics.map(m=>
    `<div class="sc"><div class="mn">${m.label}</div><div class="mv" id="mv-${m.key}" style="color:${m.color}">0%</div><div class="bt"><div class="bf" id="bf-${m.key}" style="width:0%;background:${m.color}"></div></div></div>`
  ).join('');
  setTimeout(()=>{ metrics.forEach(m=>{el('bf-'+m.key).style.width=m.val+'%'; animCount('mv-'+m.key,m.val,'%');}); },50);
  drawHeatmap(s.mousePath||[]);
}

function animCount(id,target,suf) {
  const e=el(id); let c=0; const step=target/35;
  const t=setInterval(()=>{ c=Math.min(c+step,target); e.textContent=Math.round(c)+(suf||''); if(c>=target)clearInterval(t); },20);
}

function drawHeatmap(path) {
  const cv=el('hm');
  const ratio=window.devicePixelRatio||1;
  const W=cv.offsetWidth||360,H=110;
  cv.width=W*ratio; cv.height=H*ratio;
  const ctx=cv.getContext('2d'); ctx.scale(ratio,ratio);
  ctx.clearRect(0,0,W,H);
  if(!path||path.length<2){
    ctx.fillStyle='rgba(71,85,105,.5)'; ctx.font='11px Consolas,monospace';
    ctx.fillText('No mouse data.',10,18); return;
  }
  const xs=path.map(p=>p.x),ys=path.map(p=>p.y);
  const [mnx,mxx,mny,mxy]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
  const nx=x=>((x-mnx)/Math.max(mxx-mnx,1))*(W-20)+10;
  const ny=y=>((y-mny)/Math.max(mxy-mny,1))*(H-20)+10;
  ctx.beginPath(); ctx.moveTo(nx(path[0].x),ny(path[0].y));
  for(let i=1;i<path.length;i++) ctx.lineTo(nx(path[i].x),ny(path[i].y));
  ctx.strokeStyle='rgba(6,182,212,.4)'; ctx.lineWidth=1.5; ctx.stroke();
  const dot=(x,y,c)=>{ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();};
  dot(nx(path[0].x),ny(path[0].y),'#22c55e');
  dot(nx(path[path.length-1].x),ny(path[path.length-1].y),'#ef4444');
}

/* ─── actions ─── */
function reregister() {
  ['as_prof','as_sess','as_pass','as_email'].forEach(k=>localStorage.removeItem(k));
  goTo('register');
}

function simulateImpostor() {
  const data=JSON.parse(localStorage.getItem('as_sess'));
  if(!data) return;
  const {profile:p}=data;
  const fake={
    wpm:Math.round(p.wpm*(Math.random()*1.3+0.3)),
    avgInt:Math.round(p.avgInt*(Math.random()*1.5+0.4)),
    varInt:Math.round(p.varInt*(Math.random()*2+0.5)),
    avgDwell:Math.round(p.avgDwell*(Math.random()*1.4+0.4)),
    backspaces:Math.round(Math.random()*10),
    reactionTime:Math.round(p.reactionTime*(Math.random()*1.6+0.5)),
    avgDotInt:Math.round(p.avgDotInt*(Math.random()*1.8+0.3)),
    dotAccuracy:Math.round(Math.random()*60+10),
    mousePath:data.session.mousePath
  };
  const sc=compare(p,fake);
  localStorage.setItem('as_sess',JSON.stringify({profile:p,session:fake,scores:sc}));
  renderDash();
}

/* ─── boot ─── */
document.addEventListener('DOMContentLoaded', () => {
  loadGoogleUser(()=>initHome());

  el('btn-goto-register').addEventListener('click', ()=>goTo('register'));
  el('btn-goto-verify').addEventListener('click', ()=>{
    if (!localStorage.getItem('as_prof')) {
      show('no-profile-msg','No profile yet — set one up first.');
    } else { goTo('verify'); }
  });
  el('r-back').addEventListener('click', ()=>goTo('home'));
  el('v-back').addEventListener('click', ()=>goTo('home'));
  el('eye-r').addEventListener('click', function(){ toggleEye('r-inp',this); });
  el('eye-v').addEventListener('click', function(){ toggleEye('v-inp',this); });
  el('r-next1').addEventListener('click', ()=>advanceReg());
  el('r-rbtn').addEventListener('click', ()=>handleReact('r'));
  el('v-rbtn').addEventListener('click', ()=>handleReact('v'));
  el('btn-save-profile').addEventListener('click', ()=>saveProfile());
  el('btn-run-analysis').addEventListener('click', ()=>runAnalysis());
  el('btn-test-again').addEventListener('click', ()=>goTo('verify'));
  el('btn-reregister').addEventListener('click', ()=>reregister());
  el('btn-simulate').addEventListener('click', ()=>simulateImpostor());
});
