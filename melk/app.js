/* Мельк — короткие видео на Supabase (проект mynet, таблицы melk_*) */
const SUPABASE_URL = 'https://nbjaysdarixncuumjarc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G0ywq5XbqYa8SRKSLOLgBg_ohjrxqzN';
const BUCKET = 'melk-videos';
const AVATARS = 'melk-avatars';
const LOGIN_DOMAIN = 'melk.mestario.top';    // ник превращается в служебный адрес, писем на него не бывает
const PAGE = 12;
const MAX_MB = 50;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const app = $('app'), feed = $('feed');
const ICON = {
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2.4 4 6.4 4c2.3 0 3.9 1.3 5.6 3.3C13.7 5.3 15.3 4 17.6 4c4 0 6 4.3 4.4 7.7C19.5 16.4 12 21 12 21z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.8 2 11.5c0 2.6 1.4 4.9 3.6 6.5L5 22l4.3-2.4c.9.2 1.8.4 2.7.4 5.5 0 10-3.8 10-8.5S17.5 3 12 3z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12a1 1 0 0 1 1 1v19l-7-5-7 5V3a1 1 0 0 1 1-1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 4v4C6 9 3 14 2 20c3-4 6.5-5.5 12-5.5V19l8-7.5z"/></svg>',
  repost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l14-8z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>',
  smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.4 2.4 2 4 2s3-.6 4-2"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
};
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1e4 ? (n / 1e3).toFixed(1).replace('.', ',') + ' тыс.' : String(Math.max(0, n || 0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capHTML = s => esc(s).replace(/#([\wа-яё]+)/gi, '<span class="tag">#$1</span>');
const ago = iso => { const t = new Date(iso).getTime(), m = Math.floor((Date.now() - t) / 6e4); if (m < 1) return 'только что'; if (m < 60) return m + ' мин. назад'; const h = Math.floor(m / 60); if (h < 24) return h + ' ч. назад'; const d = Math.floor(h / 24); return d < 30 ? d + ' дн. назад' : new Date(t).toLocaleDateString('ru-RU'); };
const clock = iso => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const hue = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const color = id => `hsl(${hue(id)},80%,64%)`;
const initial = p => ((p && (p.name || p.username)) || '?')[0].toUpperCase();
const videoUrl = path => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const avatarUrl = path => path ? sb.storage.from(AVATARS).getPublicUrl(path).data.publicUrl : '';
/* avatar: photo when there is one, otherwise a colored circle with the first letter */
function avStyle(prof, id) { const u = avatarUrl(prof?.avatar_path); return `background-color:${color(id || prof?.id)}` + (u ? `;background-image:url('${esc(u)}')` : ''); }
function avText(prof) { return prof?.avatar_path ? '' : esc(initial(prof)); }
function toast(t) { app.querySelectorAll('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; app.appendChild(d); setTimeout(() => d.remove(), 2700); }
function armButton(btn, armedLabel, fn) { const label = btn.textContent; btn.onclick = e => { e.stopPropagation(); if (btn.classList.contains('arm')) fn(); else { btn.classList.add('arm'); btn.textContent = armedLabel; setTimeout(() => { btn.classList.remove('arm'); btn.textContent = label; }, 3000); } }; }
const dbErr = e => { console.error(e); toast(navigator.onLine ? 'Не получилось. Попробуйте ещё раз.' : 'Нет интернета.'); };
const postLink = id => location.origin + location.pathname + '#p/' + id;
async function copy(text, okMsg) { try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (_) { toast(text); } }

/* ---------- stickers ---------- */
const STICKERS = [
  ['fire', '🔥', 'огонь', 'pulse'], ['love', '😍', 'обожаю', 'bounce'], ['lol', '😂', 'ахах', 'shake'], ['wow', '😮', 'вау', 'pop'],
  ['cry', '😭', 'плачу', 'wobble'], ['cool', '😎', 'круто', 'tilt'], ['clap', '👏', 'браво', 'shake'], ['heart', '❤️', 'люблю', 'pulse'],
  ['party', '🥳', 'ура', 'bounce'], ['think', '🤔', 'хм', 'tilt'], ['skull', '💀', 'умер', 'wobble'], ['hi', '👋', 'привет', 'wave'],
  ['ok', '👌', 'ок', 'pop'], ['sleep', '😴', 'сплю', 'float'], ['angry', '😤', 'злюсь', 'shake'], ['star', '🤩', 'звезда', 'spin'],
  ['hundred', '💯', 'сотка', 'pop'], ['rocket', '🚀', 'погнали', 'float'], ['cat', '😺', 'мяу', 'bounce'], ['ghost', '👻', 'бу!', 'float'],
  ['eyes', '👀', 'смотрю', 'tilt'], ['pray', '🙏', 'спасибо', 'pulse'], ['gift', '🎁', 'тебе', 'wobble'], ['melk', '✨', 'мельк', 'spin']
];
const STK = Object.fromEntries(STICKERS.map(s => [s[0], s]));
function stickerHTML(id, big) { const s = STK[id] || STK.melk; return `<div class="stk a-${s[3]}${big ? ' big' : ''}" style="--h:${hue(s[0])}"><span class="e">${s[1]}</span><span class="t">${esc(s[2])}</span></div>`; }

/* ---------- state ---------- */
const S = { user: null, me: null, admin: false, liked: new Set(), saved: new Set(), reposted: new Set(), following: new Set(), unread: 0, chats: new Map() };
const F = { tab: 'fy', posts: [], done: false, loading: false, active: null, paused: false, muted: false };
const POSTS = new Map(); // id -> post
const PROFILE_COLS = 'id,username,name,bio,avatar_path,show_likes,show_saves,allow_comments';
const POST_SELECT = 'id,video_path,caption,sound,created_at,author_id,like_count,comment_count,repost_count,author:melk_profiles!melk_posts_author_id_fkey(id,username,name,avatar_path,allow_comments)';
function normPost(r) { return { ...r, likeCount: r.like_count ?? 0, commentCount: r.comment_count ?? 0, repostCount: r.repost_count ?? 0 }; }

/* ---------- auth ---------- */
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null; S.me = null; S.admin = false;
  S.liked = new Set(); S.saved = new Set(); S.reposted = new Set(); S.following = new Set();
  if (S.user) {
    const uid = S.user.id;
    const [me, adm, fol, sav] = await Promise.all([
      sb.from('melk_profiles').select(PROFILE_COLS).eq('id', uid).maybeSingle(),
      sb.from('melk_admins').select('user_id').eq('user_id', uid).maybeSingle(),
      sb.from('melk_follows').select('followee_id').eq('follower_id', uid),
      sb.from('melk_saves').select('post_id').eq('user_id', uid)
    ]);
    S.me = me.data; S.admin = !!adm.data;
    (fol.data || []).forEach(r => S.following.add(r.followee_id));
    (sav.data || []).forEach(r => S.saved.add(r.post_id));
  }
  $('nav-me-t').textContent = S.user ? 'Профиль' : 'Войти';
  startRealtime(); refreshUnread();
}
async function loadMine(ids) {
  if (!S.user || !ids.length) return;
  const [l, r] = await Promise.all([
    sb.from('melk_likes').select('post_id').eq('user_id', S.user.id).in('post_id', ids),
    sb.from('melk_reposts').select('post_id').eq('user_id', S.user.id).in('post_id', ids)
  ]);
  (l.data || []).forEach(x => S.liked.add(x.post_id));
  (r.data || []).forEach(x => S.reposted.add(x.post_id));
}
function needLogin(why) { if (S.user && S.me) return false; openAuth(why); return true; }

function openAuth(why, mode = 'in') {
  const body = document.createElement('div'); body.className = 'form';
  body.innerHTML = `
    <div class="hero"><div class="logo">мельк</div><p>Короткие видео от людей вокруг тебя</p></div>
    ${why ? `<p class="why">${esc(why)}</p>` : ''}
    <div class="seg" role="tablist"><button data-m="in">Вход</button><button data-m="up">Регистрация</button></div>
    <form id="auth-form" class="form" style="padding:0" novalidate>
      <div class="field"><label for="a-user" id="a-user-l">Ник</label><input type="text" id="a-user" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="80"></div>
      <div class="field" id="a-name-f"><label for="a-name">Имя</label><input type="text" id="a-name" maxlength="40" autocomplete="name" placeholder="Как вас показывать"></div>
      <div class="field"><label for="a-pass">Пароль</label><input type="password" id="a-pass" minlength="6" maxlength="72"></div>
      <p class="err" id="a-err" hidden></p>
      <button class="primary" id="a-go" type="submit">Войти</button>
      <p class="hint" id="a-hint"></p>
    </form>`;
  page('Аккаунт', body, '#login');
  const form = body.querySelector('#auth-form'), err = body.querySelector('#a-err'), go = body.querySelector('#a-go');
  const set = m => {
    mode = m; body.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-selected', b.dataset.m === m));
    body.querySelector('#a-name-f').hidden = m === 'in';
    body.querySelector('#a-user-l').textContent = m === 'in' ? 'Ник или почта' : 'Ник';
    body.querySelector('#a-pass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
    go.textContent = m === 'in' ? 'Войти' : 'Создать аккаунт';
    body.querySelector('#a-hint').textContent = m === 'in' ? 'Аккаунт из mynet тоже подходит: войдите его почтой или ником.' : 'Ник: 3–20 символов, латиница, цифры и _. Пароль от 6 символов. Почта не нужна.';
    err.hidden = true;
  };
  body.querySelectorAll('.seg button').forEach(b => b.onclick = () => set(b.dataset.m));
  set(mode);
  const fail = t => { err.textContent = t; err.hidden = false; go.disabled = false; go.textContent = mode === 'in' ? 'Войти' : 'Создать аккаунт'; };
  form.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const raw = body.querySelector('#a-user').value.trim(), pass = body.querySelector('#a-pass').value;
    if (pass.length < 6) return fail('Пароль должен быть не короче 6 символов.');
    go.disabled = true; go.textContent = mode === 'in' ? 'Входим…' : 'Создаём…';
    if (mode === 'in') {
      if (!raw) return fail('Введите ник или почту.');
      const email = raw.includes('@') ? raw.toLowerCase() : `${raw.toLowerCase()}@${LOGIN_DOMAIN}`;
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) return fail(/invalid/i.test(error.message) ? 'Неверный ник или пароль.' : 'Не получилось войти: ' + error.message);
    } else {
      const u = raw.toLowerCase(), name = body.querySelector('#a-name').value.trim() || u;
      if (!/^[a-z0-9_]{3,20}$/.test(u)) return fail('Ник: от 3 до 20 символов, только латиница, цифры и _.');
      const free = await sb.rpc('melk_username_free', { u });
      if (free.error) return fail('Нет связи с сервером. Попробуйте ещё раз.');
      if (!free.data) return fail('Этот ник уже занят. Попробуйте другой.');
      let res;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/melk-signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, body: JSON.stringify({ username: u, password: pass, name }) });
        res = await r.json();
      } catch (_) { return fail('Нет связи с сервером. Попробуйте ещё раз.'); }
      if (!res.ok) return fail(res.error === 'taken' ? 'Этот ник уже занят. Попробуйте другой.' : res.error === 'bad_username' ? 'Ник: от 3 до 20 символов, только латиница, цифры и _.' : res.error === 'bad_password' || res.error === 'weak_password' ? 'Пароль слишком простой. Придумайте другой, от 6 символов.' : 'Не получилось зарегистрироваться. Попробуйте ещё раз.');
      const { error } = await sb.auth.signInWithPassword({ email: res.email || `${u}@${LOGIN_DOMAIN}`, password: pass });
      if (error) return fail('Аккаунт создан, но войти не получилось. Попробуйте во вкладке «Вход».');
    }
    closeTop(); await onAuthChanged(); toast(mode === 'in' ? 'Вы вошли' : 'Добро пожаловать в «Мельк»!');
  };
}
async function onAuthChanged() { await loadMe(); await loadMine(F.posts.map(p => p.id)); if (F.tab === 'follow') await reloadFeed(); else refreshSlides(); }

/* ---------- motion ---------- */
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastPoint = null;
document.addEventListener('pointerdown', e => { lastPoint = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
function originIn(el) { const r = el.getBoundingClientRect(); if (lastPoint && Date.now() - lastPoint.t < 800) return { x: lastPoint.x - r.left, y: lastPoint.y - r.top }; return { x: r.width - 40, y: r.height - 32 }; }

let depthRaf = 0;
feed.addEventListener('scroll', () => { if (!RM && !depthRaf) depthRaf = requestAnimationFrame(depth); }, { passive: true });
function depth() {
  depthRaf = 0; const h = feed.clientHeight || 1, top = feed.scrollTop, i0 = Math.floor(top / h);
  for (let i = Math.max(0, i0 - 1); i <= i0 + 2; i++) {
    const el = feed.children[i]; if (!el || !el.classList.contains('slide')) continue;
    const p = (el.offsetTop - top) / h, a = Math.min(1, Math.max(0, -p)), b = Math.min(1, Math.max(0, p));
    el.style.setProperty('--a', a.toFixed(4)); el.style.setProperty('--b', b.toFixed(4));
  }
}

function confetti() {
  if (RM) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; app.appendChild(c);
  const r = app.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); c.width = r.width * dpr; c.height = r.height * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const cols = ['#ffc93c', '#5fe3c0', '#ff4f6d', '#f3f1ea'];
  const ps = Array.from({ length: 140 }, () => ({ x: r.width / 2, y: r.height * .55, vx: (Math.random() - .5) * 14, vy: -8 - Math.random() * 12, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[Math.random() * 4 | 0] }));
  const t0 = performance.now();
  (function frame(now) {
    const t = now - t0; g.clearRect(0, 0, r.width, r.height);
    for (const p of ps) { p.vy += .35; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.max(0, 1 - t / 1800); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2))); g.restore(); }
    if (t < 1800) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

function draggable(el, handle, axis, onClose, scrim) {
  let st = null, d = 0, v = 0, lt = 0;
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (axis === 'x' && e.clientX - el.getBoundingClientRect().left > 36) return;
    if (axis === 'y' && e.target.closest('button,input,textarea,a,label')) return;
    st = { x: e.clientX, y: e.clientY }; d = 0; v = 0; lt = performance.now();
  });
  handle.addEventListener('pointermove', e => {
    if (!st) return;
    const raw = axis === 'y' ? e.clientY - st.y : e.clientX - st.x;
    if (!el.classList.contains('dragging')) { if (raw < 6) return; el.classList.add('dragging'); try { handle.setPointerCapture(e.pointerId); } catch (_) { } }
    const now = performance.now(), nd = Math.max(0, raw); v = (nd - d) / Math.max(1, now - lt); d = nd; lt = now;
    el.style.transform = axis === 'y' ? `translateY(${d}px)` : `translateX(${d}px)`;
    if (scrim) scrim.style.opacity = String(1 - Math.min(1, d / 400));
  });
  const up = () => {
    if (!st) return; st = null; if (!el.classList.contains('dragging')) return;
    el.classList.remove('dragging'); const size = axis === 'y' ? el.offsetHeight : el.offsetWidth;
    if (d > size * .28 || v > .55) { el.dataset.dragged = '1'; el.style.transition = 'transform .24s cubic-bezier(.4,0,1,1)'; el.style.transform = axis === 'y' ? 'translateY(100%)' : 'translateX(100%)'; if (scrim) { scrim.style.transition = 'opacity .24s'; scrim.style.opacity = '0'; } setTimeout(onClose, 200); }
    else { el.style.transition = 'transform .5s cubic-bezier(.34,1.56,.64,1)'; el.style.transform = ''; if (scrim) { scrim.style.transition = 'opacity .3s'; scrim.style.opacity = ''; } setTimeout(() => { el.style.transition = ''; if (scrim) scrim.style.transition = ''; }, 500); }
  };
  handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
}

(() => {
  const ind = document.createElement('div'); ind.className = 'ptr'; ind.innerHTML = '<span>мельк</span>'; app.appendChild(ind);
  let y0 = null, dy = 0;
  feed.addEventListener('touchstart', e => { y0 = feed.scrollTop <= 0 && !sheetEls.length && !pages.length ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  feed.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); const k = Math.min(1, dy / 110); ind.style.transform = `translate(-50%, ${k * 90 - 50}px) rotate(${k * 200}deg) scale(${.6 + k * .4})`; ind.style.opacity = String(k); ind.classList.toggle('armed', k >= 1); }, { passive: true });
  feed.addEventListener('touchend', async () => {
    if (y0 === null) return; y0 = null;
    if (dy >= 110) { ind.classList.add('spin'); ind.style.transform = 'translate(-50%, 40px)'; await reloadFeed(); toast('Лента обновлена'); }
    ind.classList.remove('spin', 'armed'); ind.style.transform = ''; ind.style.opacity = '0';
  });
})();

/* ---------- feed ---------- */
let io;
async function fetchPosts(from) {
  let q = sb.from('melk_posts').select(POST_SELECT).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
  if (F.tab === 'follow') { const ids = [...S.following]; if (!ids.length) return []; q = q.in('author_id', ids); }
  const { data, error } = await q; if (error) throw error;
  return data.map(normPost);
}
async function reloadFeed(focusId) {
  F.posts = []; F.done = false; POSTS.clear();
  if (io) io.disconnect(); feed.querySelectorAll('video').forEach(v => v.pause());
  feed.innerHTML = '<div class="loader"><div class="lg">мельк</div><div class="bars"><i></i><i></i><i></i></div></div>'; F.active = null;
  try {
    let first = [];
    if (focusId) { const { data } = await sb.from('melk_posts').select(POST_SELECT).eq('id', focusId).maybeSingle(); if (data) first = [{ ...normPost(data), _pinned: true }]; }
    const page = await fetchPosts(0);
    F.posts = first.concat(page.filter(p => !first.some(f => f.id === p.id)));
    F.done = page.length < PAGE;
  } catch (e) { feed.innerHTML = '<div class="empty"><h2>Лента не загрузилась</h2><p>Проверьте интернет и обновите страницу.</p></div>'; console.error(e); return; }
  await loadMine(F.posts.map(p => p.id));
  feed.innerHTML = '';
  if (!F.posts.length) return renderEmpty();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) activate(e.target); }), { root: feed, threshold: .6 });
  F.posts.forEach(appendSlide);
  depth();
}
function renderEmpty() {
  const follow = F.tab === 'follow';
  feed.innerHTML = `<div class="empty"><h2>${follow ? (S.user ? 'Здесь пока пусто' : 'Войдите, чтобы видеть подписки') : 'Роликов пока нет'}</h2>
    <p>${follow ? 'Подпишитесь на авторов в ленте «Для вас», и их ролики появятся тут.' : 'Опубликуйте первый ролик, и его увидят все, кто откроет «Мельк».'}</p>
    <button id="empty-go">${follow ? (S.user ? 'Открыть «Для вас»' : 'Войти') : 'Опубликовать ролик'}</button></div>`;
  $('empty-go').onclick = () => follow ? (S.user ? setTab('fy') : openAuth()) : openUpload();
}
async function loadMore() {
  if (F.loading || F.done) return; F.loading = true;
  try {
    const page = await fetchPosts(F.posts.filter(p => !p._pinned).length);
    const fresh = page.filter(p => !POSTS.has(p.id));
    F.done = page.length < PAGE; await loadMine(fresh.map(p => p.id));
    fresh.forEach(p => { F.posts.push(p); appendSlide(p); });
  } catch (e) { console.error(e); }
  F.loading = false;
}
function appendSlide(p) { POSTS.set(p.id, p); const el = slide(p); feed.appendChild(el); io.observe(el); }

function slide(p) {
  const el = document.createElement('section'); el.className = 'slide'; el.dataset.id = p.id;
  const mine = S.user && p.author_id === S.user.id;
  el.innerHTML = `<div class="stage"><video src="${esc(videoUrl(p.video_path))}" loop playsinline preload="metadata"></video></div>
  <div class="shade"></div><div class="playicon">${ICON.play}</div>
  <button class="mute">${F.muted ? 'Звук выкл.' : 'Звук вкл.'}</button>
  <div class="rail">
    <button class="avatar" aria-label="Профиль автора" style="${avStyle(p.author, p.author_id)}">${avText(p.author)}${mine ? '' : '<span class="follow" role="button" aria-label="Подписаться"></span>'}</button>
    <button class="act like">${ICON.heart}<span></span></button>
    <button class="act cm">${ICON.chat}<span></span></button>
    <button class="act rp">${ICON.repost}<span></span></button>
    <button class="act sv">${ICON.save}<span></span></button>
    <button class="act sh">${ICON.share}<span>Отправить</span></button>
    <div class="disc" style="${avStyle(p.author, p.author_id)}"></div>
  </div>
  <div class="info"><button class="handle"></button><div class="cap">${capHTML(p.caption)}</div>
    <div class="sound"><span class="eqz"><i></i><i></i><i></i></span><b>${esc(p.sound)} · ${esc(p.sound)}</b></div><div class="when">${ago(p.created_at)}</div></div>
  <div class="progress"><i></i></div>`;
  el.querySelector('.handle').textContent = '@' + (p.author?.username || 'user');
  const v = el.querySelector('video');
  v.addEventListener('loadeddata', () => v.classList.add('ready'), { once: true });
  v.addEventListener('error', () => { if (!el.querySelector('.missing')) { const m = document.createElement('div'); m.className = 'missing'; m.textContent = 'Видео не воспроизводится в этом браузере или было удалено.'; el.querySelector('.stage').appendChild(m); } });
  v.addEventListener('timeupdate', () => { if (v.duration) el.querySelector('.progress i').style.width = (v.currentTime / v.duration * 100) + '%'; });
  let lastTap = 0, tapT;
  el.querySelector('.stage').addEventListener('click', e => {
    const now = Date.now();
    if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; if (needLogin('Войдите, чтобы ставить лайки.')) return; burst(el, e); if (!S.liked.has(p.id)) toggleLike(p); }
    else { lastTap = now; tapT = setTimeout(togglePause, 300); }
  });
  el.querySelector('.like').onclick = () => { if (!needLogin('Войдите, чтобы ставить лайки.')) toggleLike(p); };
  el.querySelector('.cm').onclick = () => openComments(p);
  el.querySelector('.rp').onclick = () => { if (!needLogin('Войдите, чтобы делать репосты.')) toggleRepost(p); };
  el.querySelector('.sv').onclick = () => { if (!needLogin('Войдите, чтобы сохранять ролики.')) toggleSave(p); };
  el.querySelector('.sh').onclick = () => openShare(p);
  el.querySelector('.avatar').onclick = e => { if (e.target.classList.contains('follow')) { e.stopPropagation(); if (!needLogin('Войдите, чтобы подписываться.')) toggleFollow(p.author_id); return; } openProfile(p.author_id); };
  el.querySelector('.handle').onclick = () => openProfile(p.author_id);
  el.querySelector('.mute').onclick = () => { F.muted = !F.muted; feed.querySelectorAll('video').forEach(x => x.muted = F.muted); feed.querySelectorAll('.mute').forEach(b => b.textContent = F.muted ? 'Звук выкл.' : 'Звук вкл.'); };
  fillSlide(el, p);
  return el;
}
function fillSlide(el, p) {
  const lk = el.querySelector('.like'); lk.classList.toggle('liked', S.liked.has(p.id)); setCount(lk.querySelector('span'), fmt(p.likeCount), p.likeCount);
  setCount(el.querySelector('.cm span'), fmt(p.commentCount), p.commentCount);
  const rp = el.querySelector('.rp'); rp.classList.toggle('reposted', S.reposted.has(p.id)); setCount(rp.querySelector('span'), p.repostCount ? fmt(p.repostCount) : 'Репост', p.repostCount);
  const sv = el.querySelector('.sv'), saved = S.saved.has(p.id); sv.classList.toggle('saved', saved); sv.querySelector('span').textContent = saved ? 'В избранном' : 'Сохранить';
  const f = el.querySelector('.follow');
  if (S.user && p.author_id === S.user.id) { if (f) f.remove(); }
  else if (f) { const on = S.following.has(p.author_id); if (f.classList.contains('on') !== on) { f.classList.toggle('on', on); replay(f, 'morph'); } f.textContent = on ? '✓' : '+'; }
}
function setCount(span, t, n) {
  if (span.textContent === t) return;
  const first = span.textContent === '', old = span._n ?? n; span._n = n; span.textContent = t;
  if (!first) { span.classList.remove('up', 'down'); span.classList.add(n >= old ? 'up' : 'down'); replay(span, 'tick'); }
}
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); const end = e => { if (e.target !== el) return; el.classList.remove(cls); el.removeEventListener('animationend', end); }; el.addEventListener('animationend', end); }
function sparks(btn, colorVar) {
  const svg = btn.querySelector('svg'); if (!svg) return;
  for (let i = 0; i < 8; i++) { const s = document.createElement('i'); s.className = 'spark'; s.style.setProperty('--a', (i * 45 + Math.random() * 20) + 'deg'); s.style.setProperty('--c', colorVar); btn.appendChild(s); setTimeout(() => s.remove(), 700); }
  const ring = document.createElement('i'); ring.className = 'ring'; ring.style.setProperty('--c', colorVar); btn.appendChild(ring); setTimeout(() => ring.remove(), 600);
}
function refreshSlides() { feed.querySelectorAll('.slide').forEach(el => { const p = POSTS.get(el.dataset.id); if (p) fillSlide(el, p); }); }
function activate(el) {
  if (F.active === el) return;
  if (F.active) F.active.querySelector('video')?.pause();
  if (F.active) F.active.classList.remove('live');
  F.active = el; F.paused = false; el.classList.remove('paused'); el.classList.add('live');
  const v = el.querySelector('video'); v.muted = F.muted; v.currentTime = 0;
  v.play().catch(() => { v.muted = F.muted = true; feed.querySelectorAll('.mute').forEach(b => b.textContent = 'Звук выкл.'); v.play().catch(() => { }); });
  const idx = [...feed.children].indexOf(el); if (idx >= feed.children.length - 3) loadMore();
}
function togglePause() { if (!F.active) return; F.paused = !F.paused; F.active.classList.toggle('paused', F.paused); const v = F.active.querySelector('video'); F.paused ? v.pause() : v.play().catch(() => { }); }
function burst(el, e) {
  const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const h = document.createElement('div'); h.className = 'burst'; h.innerHTML = ICON.heart; h.style.left = x + 'px'; h.style.top = y + 'px'; h.style.setProperty('--r', (Math.random() * 30 - 15) + 'deg'); el.appendChild(h); setTimeout(() => h.remove(), 900);
  for (let i = 0; i < 6; i++) { const m = document.createElement('div'); m.className = 'mini'; m.innerHTML = ICON.heart; m.style.left = x + 'px'; m.style.top = y + 'px';
    m.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); m.style.setProperty('--dy', (-60 - Math.random() * 120) + 'px'); m.style.setProperty('--d', (i * 40) + 'ms');
    el.appendChild(m); setTimeout(() => m.remove(), 1100); }
}

/* ---------- actions ---------- */
const busy = new Set();
async function toggleRel(p, set, table, countKey, btnSel, color2, msgs) {
  const key = table + p.id; if (busy.has(key)) return; busy.add(key);
  const on = !set.has(p.id);
  on ? set.add(p.id) : set.delete(p.id); if (countKey) p[countKey] += on ? 1 : -1; refreshSlides();
  feed.querySelectorAll(`[data-id="${p.id}"] ${btnSel}`).forEach(b => { replay(b, on ? 'pop' : 'shrink'); if (on) sparks(b, color2); });
  const { error } = on ? await sb.from(table).insert({ post_id: p.id, user_id: S.user.id })
                       : await sb.from(table).delete().eq('post_id', p.id).eq('user_id', S.user.id);
  busy.delete(key);
  if (error && error.code !== '23505') { on ? set.delete(p.id) : set.add(p.id); if (countKey) p[countKey] += on ? -1 : 1; refreshSlides(); return dbErr(error); }
  if (msgs) toast(on ? msgs[0] : msgs[1]);
}
const toggleLike = p => toggleRel(p, S.liked, 'melk_likes', 'likeCount', '.like', 'var(--heart)');
const toggleSave = p => toggleRel(p, S.saved, 'melk_saves', null, '.sv', 'var(--sun)', ['Сохранено в избранное', 'Убрано из избранного']);
const toggleRepost = p => toggleRel(p, S.reposted, 'melk_reposts', 'repostCount', '.rp', 'var(--mint)', ['Репост в вашем профиле', 'Репост убран']);
async function toggleFollow(uid) {
  const key = 'f' + uid; if (busy.has(key)) return false; busy.add(key);
  const on = !S.following.has(uid); on ? S.following.add(uid) : S.following.delete(uid); refreshSlides();
  const { error } = on ? await sb.from('melk_follows').insert({ follower_id: S.user.id, followee_id: uid })
                       : await sb.from('melk_follows').delete().eq('follower_id', S.user.id).eq('followee_id', uid);
  busy.delete(key);
  if (error && error.code !== '23505') { on ? S.following.delete(uid) : S.following.add(uid); refreshSlides(); dbErr(error); return false; }
  toast(on ? 'Вы подписались' : 'Подписка отменена'); return true;
}
async function deletePost(p) {
  await sb.storage.from(BUCKET).remove([p.video_path]);
  const { error } = await sb.from('melk_posts').delete().eq('id', p.id);
  if (error) return dbErr(error);
  POSTS.delete(p.id); F.posts = F.posts.filter(x => x.id !== p.id);
  feed.querySelector(`[data-id="${p.id}"]`)?.remove(); if (!F.posts.length) renderEmpty();
  toast('Ролик удалён');
}

/* ---------- share to friends ---------- */
async function shareTargets() {
  // people you chat with first, then people you follow
  const out = new Map();
  const inbox = await loadInbox().catch(() => []);
  inbox.forEach(c => { if (c.other) out.set(c.other.id, c.other); });
  const ids = [...S.following].filter(id => !out.has(id)).slice(0, 30);
  if (ids.length) { const { data } = await sb.from('melk_profiles').select('id,username,name,avatar_path').in('id', ids); (data || []).forEach(p => out.set(p.id, p)); }
  return [...out.values()];
}
async function openShare(p) {
  const body = document.createElement('div'); body.className = 'sharebox';
  body.innerHTML = `${S.user ? '<div class="field"><input type="text" id="sh-q" placeholder="Найти друга по нику" autocomplete="off" autocapitalize="none"></div><div class="people" id="sh-people"><p class="hint">Загружаем друзей…</p></div>' : '<p class="hint">Войдите, чтобы отправлять ролики друзьям в чат.</p>'}
    <div class="shacts"><button class="shact" id="sh-copy"><span class="ic">${ICON.link}</span>Скопировать ссылку</button>
    ${navigator.share ? `<button class="shact" id="sh-more"><span class="ic">${ICON.share}</span>Другие приложения</button>` : ''}
    ${S.user ? '' : '<button class="shact" id="sh-login"><span class="ic">' + ICON.chat + '</span>Войти</button>'}</div>`;
  sheet('Отправить', body);
  body.querySelector('#sh-copy').onclick = () => copy(postLink(p.id), 'Ссылка на ролик скопирована');
  body.querySelector('#sh-more')?.addEventListener('click', () => navigator.share({ title: 'Мельк', text: p.caption, url: postLink(p.id) }).catch(() => { }));
  body.querySelector('#sh-login')?.addEventListener('click', () => openAuth('Войдите, чтобы отправлять ролики друзьям.'));
  if (!S.user) return;
  const box = body.querySelector('#sh-people'), q = body.querySelector('#sh-q');
  const draw = list => {
    box.innerHTML = list.length ? '' : '<p class="hint">Никого не нашли. Подпишитесь на авторов или найдите друга по нику.</p>';
    list.forEach((u, i) => {
      const b = document.createElement('button'); b.className = 'person'; b.style.setProperty('--i', i);
      b.innerHTML = `<span class="pav" style="${avStyle(u, u.id)}">${avText(u)}</span><span class="pn"></span>`; b.querySelector('.pn').textContent = u.name || u.username;
      b.onclick = async () => {
        if (b.classList.contains('sent')) return; b.classList.add('sending');
        try { const cid = await openDm(u.id); const { error } = await sb.from('melk_messages').insert({ chat_id: cid, sender_id: S.user.id, kind: 'post', post_id: p.id, body: '' }); if (error) throw error;
          b.classList.remove('sending'); b.classList.add('sent'); replay(b, 'pop'); }
        catch (e) { b.classList.remove('sending'); dbErr(e); }
      };
      box.appendChild(b);
    });
  };
  const base = await shareTargets(); draw(base);
  let t; q.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const s = q.value.trim().toLowerCase(); if (!s) return draw(base); draw(await searchPeople(s)); }, 250); };
}
async function searchPeople(s) {
  const clean = s.replace(/[^a-z0-9_]/g, ''); if (!clean) return [];
  const { data } = await sb.from('melk_profiles').select('id,username,name,avatar_path').ilike('username', clean + '%').neq('id', S.user?.id || '').limit(20);
  return data || [];
}

/* ---------- chats ---------- */
let rtChannel = null;
function startRealtime() {
  if (rtChannel) { sb.removeChannel(rtChannel); rtChannel = null; }
  if (!S.user) return;
  rtChannel = sb.channel('melk-messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'melk_messages' }, ({ new: m }) => {
    if (openChatState && openChatState.id === m.chat_id) { openChatState.push(m); return; }
    if (m.sender_id !== S.user?.id) { refreshUnread(); toast('Новое сообщение'); }
  }).subscribe();
}
async function openDm(uid) { const { data, error } = await sb.rpc('melk_open_dm', { other: uid }); if (error) throw error; return data; }
async function loadInbox() {
  if (!S.user) return [];
  const { data: mine } = await sb.from('melk_chat_members').select('chat_id,last_read_at,chat:melk_chats(last_message_at)').eq('user_id', S.user.id);
  if (!mine || !mine.length) return [];
  const ids = mine.map(r => r.chat_id);
  const [others, msgs] = await Promise.all([
    sb.from('melk_chat_members').select('chat_id,user_id,profile:melk_profiles(id,username,name,avatar_path)').in('chat_id', ids).neq('user_id', S.user.id),
    sb.from('melk_messages').select('chat_id,kind,body,sender_id,created_at').in('chat_id', ids).order('created_at', { ascending: false }).limit(300)
  ]);
  const last = {}; (msgs.data || []).forEach(m => { if (!last[m.chat_id]) last[m.chat_id] = m; });
  const other = {}; (others.data || []).forEach(o => { other[o.chat_id] = o.profile; });
  return mine.map(r => ({ id: r.chat_id, other: other[r.chat_id], last: last[r.chat_id], at: r.chat?.last_message_at, unread: last[r.chat_id] && last[r.chat_id].sender_id !== S.user.id && new Date(r.chat?.last_message_at) > new Date(r.last_read_at) }))
    .filter(c => c.other).sort((a, b) => new Date(b.at) - new Date(a.at));
}
async function refreshUnread() {
  const badge = $('chat-badge'); if (!S.user) { badge.hidden = true; return; }
  const list = await loadInbox().catch(() => []); const n = list.filter(c => c.unread).length;
  if (n !== S.unread && n > 0) replay(badge, 'pop');
  S.unread = n; badge.textContent = n > 9 ? '9+' : String(n); badge.hidden = !n;
}
function preview(m) { if (!m) return 'Чат создан'; const who = m.sender_id === S.user?.id ? 'Вы: ' : ''; return who + (m.kind === 'sticker' ? 'Стикер ' + (STK[m.body]?.[1] || '') : m.kind === 'post' ? 'Ролик' : m.body); }

async function openInbox() {
  if (needLogin('Войдите, чтобы переписываться с друзьями.')) return;
  const body = document.createElement('div'); body.className = 'inbox';
  body.innerHTML = '<div class="field"><input type="text" id="ib-q" placeholder="Найти человека по нику" autocomplete="off" autocapitalize="none"></div><div class="ilist"><p class="hint" style="text-align:center;padding:30px">Загружаем чаты…</p></div>';
  page('Сообщения', body, '#chats');
  const list = body.querySelector('.ilist'), q = body.querySelector('#ib-q');
  const row = (u, sub, unread, onClick, i) => {
    const b = document.createElement('button'); b.className = 'irow' + (unread ? ' unread' : ''); b.style.setProperty('--i', i);
    b.innerHTML = `<span class="pav" style="${avStyle(u, u.id)}">${avText(u)}</span><span class="it"><b></b><small></small></span>${unread ? '<i class="dot"></i>' : ''}`;
    b.querySelector('b').textContent = u.name || u.username; b.querySelector('small').textContent = sub; b.onclick = onClick; return b;
  };
  const drawChats = chats => {
    list.innerHTML = '';
    if (!chats.length) { list.innerHTML = '<div class="empty small"><h2>Пока нет чатов</h2><p>Найдите друга по нику сверху или нажмите «Написать» в его профиле.</p></div>'; return; }
    chats.forEach((c, i) => list.appendChild(row(c.other, preview(c.last) + (c.at ? ' · ' + ago(c.at) : ''), c.unread, () => openChat(c.id, c.other), i)));
  };
  const chats = await loadInbox(); drawChats(chats);
  let t; q.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const s = q.value.trim().toLowerCase(); if (!s) return drawChats(chats);
    const people = await searchPeople(s); list.innerHTML = people.length ? '' : '<p class="hint" style="text-align:center;padding:24px">Никого с таким ником.</p>';
    people.forEach((u, i) => list.appendChild(row(u, '@' + u.username, false, async () => { try { openChat(await openDm(u.id), u); } catch (e) { dbErr(e); } }, i)));
  }, 250); };
}

let openChatState = null;
async function openChatWith(uid, prof) { if (needLogin('Войдите, чтобы написать.')) return; try { openChat(await openDm(uid), prof); } catch (e) { dbErr(e); } }
async function openChat(cid, other) {
  const body = document.createElement('div'); body.className = 'chat';
  body.innerHTML = `<div class="msgs"><p class="hint" style="text-align:center;padding:30px">Загружаем…</p></div>
    <div class="stkpanel" hidden>${STICKERS.map(s => `<button class="stkbtn" data-s="${s[0]}" aria-label="${esc(s[2])}">${stickerHTML(s[0])}</button>`).join('')}</div>
    <form class="compose chatbar"><button type="button" class="stkt" aria-label="Стикеры">${ICON.smile}</button><input id="ch-input" placeholder="Сообщение…" autocomplete="off" maxlength="1000"><button type="submit" class="sendb" aria-label="Отправить" disabled>${ICON.send}</button></form>`;
  const pg = page(other?.name || 'Чат', body);
  const ttl = pg.querySelector('.ttl'); ttl.innerHTML = `<button class="chathead"><span class="pav sm" style="${avStyle(other, other?.id)}">${avText(other)}</span><span class="cn"></span></button>`;
  ttl.querySelector('.cn').textContent = other?.name || other?.username || 'Чат'; ttl.querySelector('.chathead').onclick = () => other && openProfile(other.id);
  const box = body.querySelector('.msgs'), inp = body.querySelector('#ch-input'), send = body.querySelector('.sendb'), panel = body.querySelector('.stkpanel');
  const postsCache = new Map(); const seen = new Set();
  async function hydratePosts(ms) {
    const need = [...new Set(ms.filter(m => m.kind === 'post' && m.post_id && !postsCache.has(m.post_id)).map(m => m.post_id))];
    if (!need.length) return;
    const { data } = await sb.from('melk_posts').select(POST_SELECT).in('id', need); (data || []).forEach(p => postsCache.set(p.id, normPost(p)));
    need.forEach(id => { if (!postsCache.has(id)) postsCache.set(id, null); });
  }
  let lastDay = '';
  function bubble(m, animate) {
    if (seen.has(m.id)) return; seen.add(m.id);
    const day = new Date(m.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (day !== lastDay) { lastDay = day; const d = document.createElement('div'); d.className = 'day'; d.textContent = day; box.appendChild(d); }
    const mine = m.sender_id === S.user.id, el = document.createElement('div');
    el.className = 'msg ' + (mine ? 'me' : 'them') + ' k-' + m.kind + (animate ? ' new' : '');
    if (m.kind === 'sticker') el.innerHTML = stickerHTML(m.body, true);
    else if (m.kind === 'post') {
      const p = postsCache.get(m.post_id);
      if (!p) el.innerHTML = '<div class="pcard gone">Ролик удалён</div>';
      else { el.innerHTML = `<button class="pcard"><video muted playsinline preload="metadata" src="${esc(videoUrl(p.video_path))}#t=0.5"></video><span class="pmeta"><b></b><small></small></span><span class="pplay">${ICON.play}</span></button>`;
        el.querySelector('b').textContent = '@' + (p.author?.username || 'user'); el.querySelector('small').textContent = p.caption || 'Ролик'; el.querySelector('.pcard').onclick = () => goToPost(p.id); }
    } else { const t = document.createElement('div'); t.className = 'txt'; t.textContent = m.body; el.appendChild(t); }
    const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = clock(m.created_at); el.appendChild(tm);
    if (mine) { el.addEventListener('contextmenu', e => { e.preventDefault(); delMsg(m, el); }); }
    box.appendChild(el);
  }
  async function delMsg(m, el) { const { error } = await sb.from('melk_messages').delete().eq('id', m.id); if (error) return dbErr(error); el.classList.add('gone'); setTimeout(() => el.remove(), 300); }
  const toBottom = smooth => box.scrollTo({ top: box.scrollHeight, behavior: smooth && !RM ? 'smooth' : 'auto' });
  const { data, error } = await sb.from('melk_messages').select('id,chat_id,sender_id,kind,body,post_id,created_at').eq('chat_id', cid).order('created_at', { ascending: false }).limit(150);
  if (error) { box.innerHTML = '<p class="err" style="text-align:center;padding:30px">Чат не загрузился.</p>'; return; }
  const ms = (data || []).reverse(); await hydratePosts(ms);
  box.innerHTML = ms.length ? '' : `<div class="empty small chatempty"><div class="pav big" style="${avStyle(other, other?.id)}">${avText(other)}</div><h2></h2><p>Напишите первым или отправьте стикер.</p></div>`;
  if (!ms.length) box.querySelector('h2').textContent = other?.name || '';
  ms.forEach(m => bubble(m, false)); toBottom(false);
  markRead(cid);
  openChatState = { id: cid, push: async m => { if (box.querySelector('.chatempty')) box.innerHTML = ''; await hydratePosts([m]); bubble(m, true); toBottom(true); if (m.sender_id !== S.user.id) markRead(cid); } };
  const stillOpen = () => document.body.contains(pg);
  const watch = setInterval(() => { if (!stillOpen()) { clearInterval(watch); if (openChatState?.id === cid) openChatState = null; refreshUnread(); } }, 800);
  async function sendMsg(kind, text) {
    const row = { chat_id: cid, sender_id: S.user.id, kind, body: text };
    const { data: m, error } = await sb.from('melk_messages').insert(row).select('id,chat_id,sender_id,kind,body,post_id,created_at').single();
    if (error) return dbErr(error);
    if (box.querySelector('.chatempty')) box.innerHTML = '';
    bubble(m, true); toBottom(true);
  }
  inp.oninput = () => send.disabled = !inp.value.trim();
  body.querySelector('form').onsubmit = e => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; inp.value = ''; send.disabled = true; sendMsg('text', t); };
  body.querySelector('.stkt').onclick = () => { panel.hidden = !panel.hidden; body.querySelector('.stkt').classList.toggle('on', !panel.hidden); if (!panel.hidden) replay(panel, 'open'); };
  panel.querySelectorAll('.stkbtn').forEach(b => b.onclick = () => { panel.hidden = true; body.querySelector('.stkt').classList.remove('on'); sendMsg('sticker', b.dataset.s); });
}
async function markRead(cid) { await sb.from('melk_chat_members').update({ last_read_at: new Date().toISOString() }).eq('chat_id', cid).eq('user_id', S.user.id); refreshUnread(); }

/* ---------- tabs & nav ---------- */
function setTab(t) {
  const dir = t === 'fy' ? 1 : -1, changed = F.tab !== t;
  F.tab = t; $('tab-fy').setAttribute('aria-selected', t === 'fy'); $('tab-follow').setAttribute('aria-selected', t === 'follow'); moveTabLine(); closeAll();
  const run = reloadFeed();
  if (changed && !RM) run.then(() => feed.animate([{ transform: `translateX(${dir * 28}%)`, opacity: 0, filter: 'blur(6px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], { duration: 480, easing: 'cubic-bezier(.22,1,.36,1)' }));
}
function moveTabLine() {
  const line = document.querySelector('.tabline'), cur = document.querySelector('.top [aria-selected="true"]'); if (!line || !cur) return;
  const nr = cur.parentElement.getBoundingClientRect(), r = cur.getBoundingClientRect();
  line.style.width = (r.width * .45) + 'px'; line.style.transform = `translateX(${r.left - nr.left + r.width * .275}px)`;
}
addEventListener('resize', moveTabLine); document.fonts && document.fonts.ready.then(moveTabLine); setTimeout(moveTabLine, 0);
$('tab-fy').onclick = () => setTab('fy');
$('tab-follow').onclick = () => setTab('follow');
$('nav-home').onclick = () => { closeAll(); if (F.tab !== 'fy') setTab('fy'); else feed.scrollTo({ top: 0, behavior: 'smooth' }); };
$('nav-up').onclick = () => openUpload();
$('nav-chat').onclick = () => openInbox();
$('nav-me').onclick = () => { if (needLogin()) return; openProfile(S.user.id); };
async function goToPost(id) { closeAll(); const s = feed.querySelector(`[data-id="${id}"]`); if (s && F.tab === 'fy') { s.scrollIntoView(); return; } F.tab = 'fy'; $('tab-fy').setAttribute('aria-selected', true); $('tab-follow').setAttribute('aria-selected', false); moveTabLine(); await reloadFeed(id); }

/* ---------- windows (stacked, each one is a history step) and sheets ---------- */
let sheetEls = [];
const pages = [];
function closeSheet() { const els = sheetEls; sheetEls = []; els.forEach(x => { if (x.dataset.dragged) { x.remove(); return; } x.classList.add('closing'); setTimeout(() => x.remove(), 260); }); }
function dismissPage(el) { if (el.dataset.dragged) { el.remove(); return; } el.classList.add('closing'); setTimeout(() => el.remove(), 420); }
function closeTop() { if (pages.length) history.back(); }
function closeAll() { closeSheet(); if (pages.length) history.go(-pages.length); }
addEventListener('popstate', () => { const depthNow = history.state?.melkPage || 0; while (pages.length > depthNow) dismissPage(pages.pop()); if (!pages.length) openChatState = null; });
function page(title, body, hash, opts = {}) {
  closeSheet();
  const el = document.createElement('div'); el.className = 'page'; el.setAttribute('role', 'dialog'); el.style.zIndex = String(9 + pages.length);
  const o = originIn(app); el.style.setProperty('--ox', o.x + 'px'); el.style.setProperty('--oy', o.y + 'px');
  el.innerHTML = '<header class="phead"><button class="back" aria-label="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><span class="ttl"></span><span class="pad"></span></header>';
  el.querySelector('.ttl').textContent = title; el.querySelector('.back').onclick = closeTop;
  if (opts.menu) { const m = document.createElement('button'); m.className = 'back menu'; m.setAttribute('aria-label', 'Меню'); m.innerHTML = ICON.dots; m.onclick = opts.menu; el.querySelector('.pad').replaceWith(m); }
  const wrap = document.createElement('div'); wrap.className = 'pbody'; wrap.appendChild(body); el.appendChild(wrap);
  app.appendChild(el); pages.push(el);
  history.pushState({ melkPage: pages.length }, '', hash || location.pathname + location.search);
  draggable(el, el, 'x', closeTop);
  return el;
}
function pageHash(el, h) { if (pages[pages.length - 1] === el) history.replaceState({ melkPage: pages.length }, '', h); }
function sheet(title, body, cls) {
  closeSheet(); const s = document.createElement('div'); s.className = 'scrim'; s.onclick = closeSheet;
  const sh = document.createElement('div'); sh.className = 'sheet' + (cls ? ' ' + cls : ''); sh.setAttribute('role', 'dialog');
  sh.innerHTML = '<header><i class="grab"></i><span class="ttl"></span><button class="x" aria-label="Закрыть">×</button></header>'; sh.querySelector('.ttl').textContent = title; sh.appendChild(body);
  sh.querySelector('.x').onclick = closeSheet; app.append(s, sh); sheetEls = [s, sh];
  draggable(sh, sh.querySelector('header'), 'y', () => { s.dataset.dragged = sh.dataset.dragged = '1'; closeSheet(); }, s);
  return sh;
}

/* ---------- comments ---------- */
async function openComments(p) {
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;min-height:0;flex:1';
  body.innerHTML = `<div class="clist"><p class="hint" style="text-align:center;padding:20px">Загружаем…</p></div><form class="compose"><span class="pav sm" id="c-me"></span><input id="c-input" placeholder="${S.user ? 'Добавьте комментарий…' : 'Войдите, чтобы комментировать'}" autocomplete="off" maxlength="300"><button type="submit" disabled>Отправить</button></form>`;
  const list = body.querySelector('.clist'), inp = body.querySelector('input'), btn = body.querySelector('button[type=submit]');
  const meAv = body.querySelector('#c-me'); if (S.me) { meAv.setAttribute('style', avStyle(S.me, S.me.id)); meAv.innerHTML = avText(S.me); } else meAv.remove();
  const sh = sheet('Комментарии', body, 'big');
  const isAuthor = S.user && S.user.id === p.author_id;
  const closed = p.author && p.author.allow_comments === false && !isAuthor;
  if (closed) { inp.disabled = true; inp.placeholder = 'Автор закрыл комментарии'; }
  let items = [], myLikes = new Set(), authorLikes = new Set();
  const order = () => items.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created_at) - new Date(a.created_at)));
  const draw = () => {
    sh.querySelector('.ttl').textContent = `${fmt(items.length)} комментариев`; list.innerHTML = '';
    if (!items.length) { list.innerHTML = `<p class="hint" style="text-align:center;padding:30px">${closed ? 'Автор закрыл комментарии к этому ролику.' : 'Пока нет комментариев. Будьте первым.'}</p>`; return; }
    order().forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'c' + (c.pinned ? ' pinned' : ''); row.style.setProperty('--i', Math.min(i, 8));
      row.innerHTML = `<button class="av" style="${avStyle(c.author, c.author_id)}" aria-label="Профиль">${avText(c.author)}</button>
        <div style="min-width:0">${c.pinned ? `<div class="pinl">${ICON.pin} Закреплено автором</div>` : ''}<div class="who"><b class="wn"></b>${c.author_id === p.author_id ? '<span class="atag">Автор</span>' : ''}<span class="wt"></span></div><div class="txt"></div>
        <div class="cacts">${authorLikes.has(c.id) && c.author_id !== p.author_id ? `<span class="byauthor"><span class="pav xs" style="${avStyle(p.author, p.author_id)}">${avText(p.author)}</span>${ICON.heart} от автора</span>` : ''}</div></div>
        <button class="clike${myLikes.has(c.id) ? ' on' : ''}" aria-label="Нравится">${ICON.heart}<span>${c.like_count ? fmt(c.like_count) : ''}</span></button>`;
      row.querySelector('.wn').textContent = c.author?.username || 'user'; row.querySelector('.wt').textContent = ' · ' + ago(c.created_at);
      row.querySelector('.txt').textContent = c.body;
      row.querySelector('.av').onclick = () => openProfile(c.author_id);
      const acts = row.querySelector('.cacts');
      if (isAuthor) { const pb = document.createElement('button'); pb.className = 'del'; pb.textContent = c.pinned ? 'Открепить' : 'Закрепить'; pb.onclick = () => pin(c); acts.appendChild(pb); }
      if (S.user && (c.author_id === S.user.id || S.admin)) {
        const d = document.createElement('button'); d.className = 'del'; d.textContent = 'Удалить';
        armButton(d, 'Точно?', async () => { const { error } = await sb.from('melk_comments').delete().eq('id', c.id); if (error) return dbErr(error); items = items.filter(x => x.id !== c.id); p.commentCount = Math.max(0, p.commentCount - 1); refreshSlides(); draw(); });
        acts.appendChild(d);
      }
      row.querySelector('.clike').onclick = e => likeComment(c, e.currentTarget);
      list.appendChild(row);
    });
  };
  async function pin(c) {
    const on = !c.pinned; const { error } = await sb.rpc('melk_pin_comment', { cid: c.id, pin: on });
    if (error) return dbErr(error); items.forEach(x => x.pinned = false); c.pinned = on; draw(); list.scrollTop = 0; toast(on ? 'Комментарий закреплён' : 'Комментарий откреплён');
  }
  async function likeComment(c, b) {
    if (needLogin('Войдите, чтобы ставить лайки.')) return;
    const on = !myLikes.has(c.id); on ? myLikes.add(c.id) : myLikes.delete(c.id); c.like_count += on ? 1 : -1;
    if (isAuthor) on ? authorLikes.add(c.id) : authorLikes.delete(c.id);
    b.classList.toggle('on', on); b.querySelector('span').textContent = c.like_count ? fmt(c.like_count) : ''; replay(b, on ? 'pop' : 'shrink'); if (on) sparks(b, 'var(--heart)');
    const { error } = on ? await sb.from('melk_comment_likes').insert({ comment_id: c.id, user_id: S.user.id }) : await sb.from('melk_comment_likes').delete().eq('comment_id', c.id).eq('user_id', S.user.id);
    if (error && error.code !== '23505') { dbErr(error); }
    if (isAuthor) draw();
  }
  const CSEL = 'id,body,created_at,author_id,pinned,like_count,author:melk_profiles!melk_comments_author_id_fkey(username,name,avatar_path)';
  const { data, error } = await sb.from('melk_comments').select(CSEL).eq('post_id', p.id).order('created_at', { ascending: false }).limit(300);
  if (error) { list.innerHTML = '<p class="err" style="text-align:center;padding:20px">Комментарии не загрузились.</p>'; return; }
  items = data;
  if (items.length) {
    const who = [p.author_id]; if (S.user) who.push(S.user.id);
    const { data: cl } = await sb.from('melk_comment_likes').select('comment_id,user_id').in('comment_id', items.map(c => c.id)).in('user_id', who);
    (cl || []).forEach(r => { if (r.user_id === p.author_id) authorLikes.add(r.comment_id); if (S.user && r.user_id === S.user.id) myLikes.add(r.comment_id); });
  }
  p.commentCount = Math.max(p.commentCount, items.length); refreshSlides(); draw();
  inp.oninput = () => btn.disabled = !inp.value.trim();
  inp.onfocus = () => { if (!S.user) { inp.blur(); openAuth('Войдите, чтобы комментировать.'); } };
  body.querySelector('form').onsubmit = async e => {
    e.preventDefault(); const t = inp.value.trim(); if (!t || closed || needLogin('Войдите, чтобы комментировать.')) return;
    btn.disabled = true;
    const { data: row, error } = await sb.from('melk_comments').insert({ post_id: p.id, author_id: S.user.id, body: t }).select(CSEL).single();
    if (error) { btn.disabled = false; return error.code === '42501' ? toast('Автор закрыл комментарии') : dbErr(error); }
    inp.value = ''; items.push(row); p.commentCount++; refreshSlides(); draw(); list.scrollTop = 0;
    list.querySelector(`.c:not(.pinned)`)?.classList.add('fresh');
  };
}

/* ---------- upload ---------- */
function openUpload() {
  if (needLogin('Войдите, чтобы публиковать ролики.')) return;
  const body = document.createElement('div'); body.className = 'form';
  body.innerHTML = `<label class="drop" id="drop" for="up-file"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg><span>Выберите вертикальное видео (MP4, WebM или MOV), до ${MAX_MB} МБ</span><input type="file" id="up-file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden></label>
  <div class="field"><label for="up-cap">Подпись</label><textarea id="up-cap" rows="3" maxlength="300" placeholder="Расскажите о ролике и добавьте #хэштеги"></textarea></div>
  <div class="field"><label for="up-sound">Звук</label><input type="text" id="up-sound" maxlength="60" value="Оригинальный звук"></div>
  <p class="err" id="up-err" hidden></p>
  <button class="primary" id="up-go" disabled>Опубликовать</button>
  <p class="hint">Ролик сразу увидят все, кто открывает «Мельк». Удалить его можно в своём профиле.</p>`;
  sheet('Новый ролик', body);
  let file = null, type = null, preview = null;
  const f = body.querySelector('#up-file'), drop = body.querySelector('#drop'), go = body.querySelector('#up-go'), err = body.querySelector('#up-err');
  const fail = t => { err.textContent = t; err.hidden = false; };
  f.onchange = () => {
    err.hidden = true; const x = f.files[0]; if (!x) return;
    const ext = (x.name.split('.').pop() || '').toLowerCase();
    type = ['video/mp4', 'video/webm', 'video/quicktime'].includes(x.type) ? x.type : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : ['mp4', 'm4v'].includes(ext) ? 'video/mp4' : null;
    if (!type) { go.disabled = true; return fail('Этот формат не подходит. Нужен MP4, WebM или MOV.'); }
    if (x.size > MAX_MB * 1048576) { go.disabled = true; return fail(`Файл весит ${(x.size / 1048576).toFixed(1)} МБ, а можно до ${MAX_MB} МБ. Обрежьте или сожмите ролик.`); }
    file = x; if (preview) URL.revokeObjectURL(preview); preview = URL.createObjectURL(x); drop.classList.add('has');
    drop.innerHTML = '<video muted autoplay loop playsinline></video><span></span>'; drop.querySelector('video').src = preview; drop.querySelector('span').textContent = x.name; go.disabled = false;
  };
  go.onclick = async () => {
    if (!file) return; go.disabled = true; go.classList.add('loading'); go.textContent = 'Загружаем…'; err.hidden = true;
    const ext = type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4';
    const path = `${S.user.id}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: type, cacheControl: '31536000' });
    if (up.error) { go.disabled = false; go.classList.remove('loading'); go.textContent = 'Опубликовать'; return fail(/size|large/i.test(up.error.message) ? `Файл слишком большой, можно до ${MAX_MB} МБ.` : /mime|type/i.test(up.error.message) ? 'Этот формат не подходит.' : 'Видео не загрузилось. Попробуйте ещё раз.'); }
    const { data, error } = await sb.from('melk_posts').insert({
      author_id: S.user.id, video_path: path,
      caption: body.querySelector('#up-cap').value.trim().slice(0, 300),
      sound: body.querySelector('#up-sound').value.trim().slice(0, 60) || 'Оригинальный звук'
    }).select('id').single();
    if (error) { await sb.storage.from(BUCKET).remove([path]); go.disabled = false; go.classList.remove('loading'); go.textContent = 'Опубликовать'; return fail('Не получилось опубликовать. Попробуйте ещё раз.'); }
    if (preview) URL.revokeObjectURL(preview);
    closeSheet(); await goToPost(data.id); confetti(); toast('Опубликовано');
  };
}

/* ---------- avatar ---------- */
async function squareJpeg(file, size = 360) {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .88));
}
async function changeAvatar(file, P) {
  if (!file) return false;
  if (!/^image\//.test(file.type)) { toast('Нужна картинка: JPG, PNG или WebP.'); return false; }
  let blob; try { blob = await squareJpeg(file); } catch (_) { toast('Не получилось открыть эту картинку. Попробуйте JPG или PNG.'); return false; }
  const path = `${S.user.id}/${Date.now()}.jpg`;
  const up = await sb.storage.from(AVATARS).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (up.error) { dbErr(up.error); return false; }
  const old = P.avatar_path;
  const { error } = await sb.from('melk_profiles').update({ avatar_path: path }).eq('id', S.user.id);
  if (error) { await sb.storage.from(AVATARS).remove([path]); dbErr(error); return false; }
  if (old) sb.storage.from(AVATARS).remove([old]);
  P.avatar_path = path; if (S.me) S.me.avatar_path = path;
  POSTS.forEach(p => { if (p.author_id === S.user.id && p.author) p.author.avatar_path = path; });
  feed.querySelectorAll('.slide').forEach(el => { const p = POSTS.get(el.dataset.id); if (p && p.author_id === S.user.id) { el.querySelector('.avatar').setAttribute('style', avStyle(p.author, p.author_id)); el.querySelector('.avatar').firstChild?.nodeType === 3 && (el.querySelector('.avatar').firstChild.textContent = ''); el.querySelector('.disc').setAttribute('style', avStyle(p.author, p.author_id)); } });
  toast('Аватарка обновлена'); return true;
}

/* ---------- profile ---------- */
function openProfileMenu(P, me, redraw) {
  const body = document.createElement('div'); body.className = 'menu';
  const item = (label, sub, fn, cls = '') => { const b = document.createElement('button'); b.className = 'mitem ' + cls; b.innerHTML = '<span class="ml"></span><small></small>'; b.querySelector('.ml').textContent = label; b.querySelector('small').textContent = sub || ''; b.onclick = fn; body.appendChild(b); return b; };
  const toggle = (label, sub, key) => {
    const b = document.createElement('button'); b.className = 'mitem tog'; b.setAttribute('role', 'switch');
    b.innerHTML = '<span class="ml"></span><small></small><i class="sw"></i>'; b.querySelector('.ml').textContent = label; b.querySelector('small').textContent = sub;
    const paint = () => { b.setAttribute('aria-checked', P[key] ? 'true' : 'false'); b.classList.toggle('on', !!P[key]); };
    paint();
    b.onclick = async () => { P[key] = !P[key]; paint(); const { error } = await sb.from('melk_profiles').update({ [key]: P[key] }).eq('id', P.id); if (error) { P[key] = !P[key]; paint(); return dbErr(error); } if (S.me) S.me[key] = P[key]; redraw(); };
    body.appendChild(b);
  };
  if (me) {
    const h = document.createElement('p'); h.className = 'mhead'; h.textContent = 'Кто что видит'; body.appendChild(h);
    toggle('Показывать мои лайки', 'Другие увидят вкладку «Понравилось» в профиле', 'show_likes');
    toggle('Показывать избранное', 'Другие увидят вкладку «Избранное» в профиле', 'show_saves');
    toggle('Комментарии к моим видео', 'Если выключить, новые комментарии никто не сможет оставить', 'allow_comments');
    const h2 = document.createElement('p'); h2.className = 'mhead'; h2.textContent = 'Аккаунт'; body.appendChild(h2);
    item('Скопировать ссылку на профиль', '', () => copy(location.origin + location.pathname + '#@' + P.username, 'Ссылка на профиль скопирована'));
    item('Выйти из аккаунта', '', async () => { closeSheet(); await sb.auth.signOut(); closeAll(); await onAuthChanged(); toast('Вы вышли из аккаунта'); }, 'danger');
  } else {
    item('Написать', '', () => { closeSheet(); openChatWith(P.id, P); });
    item('Скопировать ссылку на профиль', '', () => { closeSheet(); copy(location.origin + location.pathname + '#@' + P.username, 'Ссылка на профиль скопирована'); });
  }
  sheet(me ? 'Настройки' : '@' + P.username, body);
}

async function openProfile(uid) {
  const body = document.createElement('div'); body.className = 'prof';
  body.innerHTML = '<p class="hint" style="padding:30px">Загружаем профиль…</p>';
  const me = S.user && uid === S.user.id;
  let P = null, redraw = () => { };
  const pg = page(me ? 'Мой профиль' : 'Профиль', body, null, { menu: () => P && openProfileMenu(P, me, () => redraw()) });
  const [prof, posts, fers, fing] = await Promise.all([
    sb.from('melk_profiles').select(PROFILE_COLS).eq('id', uid).maybeSingle(),
    sb.from('melk_posts').select(POST_SELECT).eq('author_id', uid).order('created_at', { ascending: false }).limit(60),
    sb.from('melk_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', uid),
    sb.from('melk_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', uid)
  ]);
  if (!prof.data) { body.innerHTML = '<p class="err" style="padding:30px">Профиль не найден.</p>'; return; }
  P = prof.data; const own = (posts.data || []).map(normPost);
  pageHash(pg, '#@' + P.username); pg.querySelector('.ttl').textContent = me ? 'Мой профиль' : '@' + P.username;
  let followerCount = fers.count || 0, tab = 'posts', editing = false;
  const lists = { reposts: null, liked: null, saved: null };
  const likesGot = own.reduce((s, p) => s + p.likeCount, 0);

  const tile = (p, canDel, badge) => {
    const b = document.createElement('div'); b.className = 'tile'; b.tabIndex = 0; b.setAttribute('role', 'button');
    const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = videoUrl(p.video_path) + '#t=0.5'; b.appendChild(v);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = '♥ ' + fmt(p.likeCount); b.appendChild(n);
    if (badge) { const k = document.createElement('span'); k.className = 'tb'; k.innerHTML = badge; b.appendChild(k); }
    b.onclick = () => goToPost(p.id); b.onkeydown = e => { if (e.key === 'Enter') goToPost(p.id); };
    if (canDel) { const x = document.createElement('button'); x.className = 'rm'; x.textContent = 'Удалить'; armButton(x, 'Точно?', async () => { await deletePost(p); b.remove(); }); b.appendChild(x); }
    return b;
  };
  async function loadList(kind) {
    const tbl = { reposts: 'melk_reposts', liked: 'melk_likes', saved: 'melk_saves' }[kind];
    const { data } = await sb.from(tbl).select(`created_at,post:melk_posts(${POST_SELECT})`).eq('user_id', uid).order('created_at', { ascending: false }).limit(60);
    lists[kind] = (data || []).filter(r => r.post).map(r => normPost(r.post)); draw();
  }
  function tabsFor() {
    const t = [['posts', 'Ролики'], ['reposts', 'Репосты']];
    if (me || P.show_likes) t.push(['liked', 'Понравилось']);
    if (me || P.show_saves) t.push(['saved', 'Избранное']);
    return t;
  }
  function draw() {
    const tabs = tabsFor(); if (!tabs.some(t => t[0] === tab)) tab = 'posts';
    body.innerHTML = `<div class="avwrap"><div class="avatar big" style="${avStyle(P, P.id)}">${avText(P)}</div>${me ? `<label class="avedit" for="pf-av" aria-label="Сменить аватарку">${ICON.camera}<input type="file" id="pf-av" accept="image/jpeg,image/png,image/webp,image/*" hidden></label>` : ''}</div>
    <div class="nm"></div><div class="un"></div><p class="bio"></p>
    <div class="stats"><div><b>${fmt(followerCount)}</b>подписчики</div><div><b>${fmt(fing.count || 0)}</b>подписки</div><div><b>${fmt(likesGot)}</b>лайки</div></div>
    <div class="row" id="pf-actions"></div><div id="pf-edit" style="width:100%"></div>
    <div class="ptabs" role="tablist">${tabs.map(t => `<button data-t="${t[0]}">${t[1]}${me && ((t[0] === 'liked' && !P.show_likes) || (t[0] === 'saved' && !P.show_saves)) ? ' ' + ICON.lock : ''}</button>`).join('')}</div>
    <div class="grid"></div>`;
    body.querySelector('.nm').textContent = P.name; body.querySelector('.un').textContent = '@' + P.username;
    const bio = body.querySelector('.bio'); bio.textContent = P.bio || (me ? 'Добавьте пару слов о себе.' : ''); bio.hidden = !bio.textContent;
    const avIn = body.querySelector('#pf-av');
    if (avIn) avIn.onchange = async () => { const a = body.querySelector('.avatar.big'); a.classList.add('loading'); if (await changeAvatar(avIn.files[0], P)) draw(); else a.classList.remove('loading'); };
    const acts = body.querySelector('#pf-actions');
    if (me) {
      const e = document.createElement('button'); e.className = 'ghost'; e.textContent = editing ? 'Отмена' : 'Изменить профиль'; e.onclick = () => { editing = !editing; draw(); };
      const up = document.createElement('button'); up.className = 'primary'; up.textContent = 'Новый ролик'; up.onclick = openUpload; acts.append(e, up);
    } else {
      const f = document.createElement('button'), on = S.following.has(uid); f.className = on ? 'ghost' : 'primary'; f.textContent = on ? 'Вы подписаны' : 'Подписаться';
      f.onclick = async () => { if (needLogin('Войдите, чтобы подписываться.')) return; const was = S.following.has(uid); if (await toggleFollow(uid)) { followerCount += was ? -1 : 1; draw(); } };
      const w = document.createElement('button'); w.className = 'ghost'; w.textContent = 'Написать'; w.onclick = () => openChatWith(uid, P);
      acts.append(f, w);
    }
    if (me && editing) {
      const ed = body.querySelector('#pf-edit'); ed.className = 'form'; ed.style.padding = '0';
      ed.innerHTML = `<div class="field"><label for="pf-name">Имя</label><input type="text" id="pf-name" maxlength="40"></div>
      <div class="field"><label for="pf-bio">О себе</label><textarea id="pf-bio" rows="3" maxlength="160"></textarea></div><p class="err" id="pf-err" hidden></p><button class="primary" id="pf-save">Сохранить</button>
      <p class="hint">Аватарку можно сменить, нажав на значок камеры у фото. Кто видит лайки и избранное, настраивается в меню «⋯» сверху.</p>`;
      ed.querySelector('#pf-name').value = P.name; ed.querySelector('#pf-bio').value = P.bio || '';
      ed.querySelector('#pf-save').onclick = async () => {
        const name = ed.querySelector('#pf-name').value.trim().slice(0, 40), bioT = ed.querySelector('#pf-bio').value.trim().slice(0, 160);
        if (!name) { const er = ed.querySelector('#pf-err'); er.textContent = 'Имя не может быть пустым.'; er.hidden = false; return; }
        const { error } = await sb.from('melk_profiles').update({ name, bio: bioT }).eq('id', uid);
        if (error) return dbErr(error);
        P.name = name; P.bio = bioT; if (S.me) { S.me.name = name; S.me.bio = bioT; } editing = false; draw(); toast('Профиль сохранён');
      };
    }
    body.querySelectorAll('.ptabs button').forEach(b => { b.setAttribute('aria-selected', b.dataset.t === tab); b.onclick = () => { tab = b.dataset.t; draw(); }; });
    let items = own;
    if (tab !== 'posts') { items = lists[tab]; if (!items) { loadList(tab); items = []; } }
    const g = body.querySelector('.grid');
    if (!items.length) {
      const e = document.createElement('p'); e.className = 'hint gridempty';
      e.textContent = tab !== 'posts' && lists[tab] === null ? 'Загружаем…'
        : tab === 'reposts' ? (me ? 'Нажмите «Репост» у ролика, и он появится здесь.' : 'Репостов пока нет.')
        : tab === 'liked' ? (me ? 'Ставьте лайки, и ролики соберутся здесь.' : 'Пока ничего.')
        : tab === 'saved' ? (me ? 'Пока ничего не сохранено.' : 'Пока ничего.')
        : me ? 'Вы ещё ничего не опубликовали.' : 'У автора пока нет роликов.';
      g.appendChild(e);
    }
    items.forEach(p => g.appendChild(tile(p, tab === 'posts' && (me || S.admin), tab === 'reposts' ? ICON.repost : '')));
  }
  redraw = draw; draw();
}

/* ---------- start ---------- */
(async () => {
  await loadMe();
  const m = location.hash.match(/^#p\/([0-9a-f-]{36})$/i);
  await reloadFeed(m ? m[1] : null);
  const u = location.hash.match(/^#@([a-z0-9_]{3,20})$/i);
  const h = location.hash;
  if (h === '#login' || h === '#chats' || u) history.replaceState(null, '', location.pathname);
  if (h === '#login' && !S.user) openAuth();
  if (h === '#chats' && S.user) openInbox();
  if (u) { const { data } = await sb.from('melk_profiles').select('id').eq('username', u[1].toLowerCase()).maybeSingle(); if (data) openProfile(data.id); }
})();
