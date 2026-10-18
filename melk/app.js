/* Мельк — короткие видео на Supabase (проект mynet, таблицы melk_*) */
const SUPABASE_URL = 'https://nbjaysdarixncuumjarc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G0ywq5XbqYa8SRKSLOLgBg_ohjrxqzN';
const BUCKET = 'melk-videos';
const AVATARS = 'melk-avatars';
const LOGIN_DOMAIN = 'melk.mestario.top';    // ник превращается в служебный адрес, писем на него не бывает
const PAGE = 12;
const MAX_MB = 50;

const AUTH_KEY = 'melk-auth', ACCOUNTS_KEY = 'melk-accounts';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { } }
};
// move a session saved by older versions of the site under Melk's own key
if (!store.get(AUTH_KEY)) { const legacy = store.get('sb-nbjaysdarixncuumjarc-auth-token'); if (legacy) store.set(AUTH_KEY, legacy); }
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_KEY, storage: { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v), removeItem: k => store.del(k) } } });
/* accounts remembered on this device: tap to come back without typing the password */
const accounts = {
  all() { try { return JSON.parse(store.get(ACCOUNTS_KEY) || '[]'); } catch (_) { return []; } },
  save(list) { store.set(ACCOUNTS_KEY, JSON.stringify(list.slice(0, 8))); },
  remember(session, prof) {
    if (!session?.user || !session.refresh_token) return;
    const list = accounts.all().filter(a => a.uid !== session.user.id), old = accounts.all().find(a => a.uid === session.user.id) || {};
    list.unshift({ uid: session.user.id, refresh: session.refresh_token, username: prof?.username || old.username || '', name: prof?.name || old.name || '', avatar_path: prof?.avatar_path ?? old.avatar_path ?? null, at: Date.now() });
    accounts.save(list);
  },
  forget(uid) { accounts.save(accounts.all().filter(a => a.uid !== uid)); }
};
sb.auth.onAuthStateChange((ev, session) => { if (session && (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED' || ev === 'INITIAL_SESSION')) accounts.remember(session, S.me && S.me.id === session.user.id ? S.me : null); });
async function switchTo(acc) {
  const { data, error } = await sb.auth.refreshSession({ refresh_token: acc.refresh });
  if (error || !data.session) { accounts.forget(acc.uid); toast('Вход устарел. Войдите паролем ещё раз.'); return false; }
  return true;
}
// leaving keeps the account remembered on this device (the session is not revoked)
async function leaveAccount() { const { data: { session } } = await sb.auth.getSession(); if (session) accounts.remember(session, S.me); store.del(AUTH_KEY); location.replace(location.pathname); }

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
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
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
const PROFILE_COLS = 'id,username,name,bio,avatar_path,show_likes,show_saves,allow_comments,banner,is_bot';
const POST_SELECT = 'id,kind,gen,video_path,caption,sound,sound_post_id,created_at,author_id,like_count,comment_count,repost_count,sound_src:sound_post_id(id,video_path,kind,gen),author:melk_profiles!melk_posts_author_id_fkey(id,username,name,avatar_path,allow_comments,is_bot)';
const soundName = p => (!p.sound || p.sound === 'Оригинальный звук') && !p.sound_post_id ? `Оригинальный звук — @${p.author?.username || 'user'}` : p.sound;
const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 17.3V20h2.7l9.9-9.9-2.7-2.7zM19.7 7a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0l-1.6 1.6 2.7 2.7z"/></svg>';
const BANNERS = {
  g1: 'linear-gradient(135deg,#ff4f6d,#ffc93c)', g2: 'linear-gradient(135deg,#5fe3c0,#2b6cff)', g3: 'linear-gradient(135deg,#2b1d4a,#ff7a59 70%,#ffc93c)',
  g4: 'linear-gradient(160deg,#0f2027,#2c5364)', g5: 'radial-gradient(circle at 20% 30%,#ff4f6d 0 18%,transparent 19%),radial-gradient(circle at 75% 60%,#5fe3c0 0 22%,transparent 23%),radial-gradient(circle at 50% 10%,#ffc93c 0 10%,transparent 11%),#171a22',
  g6: 'repeating-linear-gradient(45deg,#ffc93c 0 14px,#171a22 14px 28px)', g7: 'linear-gradient(120deg,#8e2de2,#4a00e0)', g8: 'conic-gradient(from 200deg at 70% 40%,#ff4f6d,#ffc93c,#5fe3c0,#2b6cff,#ff4f6d)'
};
function bannerMedia(P) { const b = P?.banner || ''; return b.startsWith('vid:') ? `<video class="bnvid" autoplay muted loop playsinline preload="auto" src="${esc(videoUrl(b.slice(4)))}"></video>` : ''; }
function bannerStyle(P) {
  const b = P?.banner || '';
  if (b.startsWith('vid:')) return `background:linear-gradient(135deg,${color(P?.id)},#171a22)`;
  if (b.startsWith('img:')) return `background-image:url('${esc(avatarUrl(b.slice(4)))}');background-size:cover;background-position:center`;
  return `background:${BANNERS[b] || `linear-gradient(135deg,${color(P?.id)},#171a22)`}`;
}
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
    S.me = me.data; S.admin = !!adm.data; accounts.remember(session, S.me);
    (fol.data || []).forEach(r => S.following.add(r.followee_id));
    (sav.data || []).forEach(r => S.saved.add(r.post_id));
  }
  $('nav-me-t').textContent = S.user ? 'Профиль' : 'Войти';
  startRealtime(); refreshUnread();
}
async function loadReposters(posts) {
  const ids = posts.filter(p => p.repostCount > 0 || S.reposted.has(p.id)).map(p => p.id); if (!ids.length) return;
  const { data } = await sb.from('melk_reposts').select('post_id,note,created_at,user_id,user:melk_profiles(username,name)').in('post_id', ids).order('created_at', { ascending: false }).limit(300);
  const best = {};
  (data || []).forEach(r => { const score = (S.user && r.user_id === S.user.id ? 3 : 0) + (S.following.has(r.user_id) ? 2 : 0) + (r.note ? 1 : 0); if (!best[r.post_id] || score > best[r.post_id].score) best[r.post_id] = { score, name: r.user?.name || r.user?.username, note: r.note, mine: S.user && r.user_id === S.user.id }; });
  posts.forEach(p => { p.rpBy = best[p.id] || null; });
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
    <div class="saved" id="a-saved" hidden><p class="mhead">Войти как</p><div class="slist"></div></div>
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
  const saved = accounts.all().filter(a => a.uid !== S.user?.id), sbox = body.querySelector('#a-saved');
  if (saved.length) {
    sbox.hidden = false;
    saved.forEach((a, i) => {
      const row = document.createElement('div'); row.className = 'srow'; row.style.setProperty('--i', i);
      row.innerHTML = `<button class="sgo"><span class="pav sm2" style="${avStyle(a, a.uid)}">${avText({ ...a, id: a.uid })}</span><span class="it"><b></b><small></small></span><span class="go">Войти</span></button><button class="sx" aria-label="Забыть аккаунт">×</button>`;
      row.querySelector('b').textContent = a.name || a.username; row.querySelector('small').textContent = '@' + a.username;
      row.querySelector('.sgo').onclick = async () => { row.classList.add('busy'); if (await switchTo(a)) { closeTop(); await onAuthChanged(); toast('Вы вошли как ' + (a.name || a.username)); } else row.remove(); };
      row.querySelector('.sx').onclick = () => { accounts.forget(a.uid); row.remove(); if (!sbox.querySelector('.srow')) sbox.hidden = true; };
      sbox.querySelector('.slist').appendChild(row);
    });
  }
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

let depthRaf = 0, lastTop = 0, scrollDir = 1, settleT;
feed.addEventListener('scroll', () => {
  if (!depthRaf) depthRaf = requestAnimationFrame(depth);
  clearTimeout(settleT); settleT = setTimeout(settle, 90);
}, { passive: true });
function depth() {
  depthRaf = 0; const h = feed.clientHeight || 1, top = feed.scrollTop;
  if (top !== lastTop) { scrollDir = top > lastTop ? 1 : -1; lastTop = top; }
  const i0 = Math.floor(top / h);
  feed.querySelectorAll('.slide.moving').forEach(el => { const k = [...feed.children].indexOf(el); if (k < i0 - 1 || k > i0 + 2) clear(el); });
  for (let i = Math.max(0, i0 - 1); i <= i0 + 2; i++) {
    const el = feed.children[i]; if (!el || !el.classList.contains('slide')) continue;
    const p = (el.offsetTop - top) / h; // <0 above the screen, >0 below
    if (RM || Math.abs(p) < .001 || Math.abs(p) >= 1) { clear(el); continue; }
    // the slide being left sinks back, the slide coming in stays flat and on top
    const leaving = scrollDir > 0 ? p < 0 : p > 0, k = Math.min(1, Math.abs(p));
    el.classList.add('moving');
    if (leaving) {
      el.style.zIndex = '1'; el.style.transformOrigin = scrollDir > 0 ? '50% 0' : '50% 100%';
      el.style.transform = `translateY(${scrollDir * k * 38}%) scale(${1 - k * .12})`;
      el.style.borderRadius = (k * 34) + 'px'; el.style.filter = `brightness(${1 - k * .6})`;
      el.style.setProperty('--b', '0');
    } else {
      el.style.zIndex = '2'; el.style.transform = ''; el.style.borderRadius = ''; el.style.filter = '';
      el.style.setProperty('--b', k.toFixed(4)); el.style.setProperty('--dir', String(scrollDir));
    }
  }
}
function clear(el) { el.classList.remove('moving'); el.style.zIndex = ''; el.style.transform = ''; el.style.borderRadius = ''; el.style.filter = ''; el.style.setProperty('--b', '0'); }
function currentIndex() { const h = feed.clientHeight || 1; return Math.round(feed.scrollTop / h); }
function settle() {
  const el = feed.children[currentIndex()];
  if (el && el.classList.contains('slide')) activate(el);
}
function go(delta) {
  const n = feed.children.length; if (!n || !feed.firstElementChild?.classList.contains('slide')) return;
  const k = Math.max(0, Math.min(n - 1, currentIndex() + delta)); if (k === currentIndex()) { replay(feed, delta > 0 ? 'bump-down' : 'bump-up'); return; }
  feed.scrollTo({ top: k * feed.clientHeight, behavior: RM ? 'auto' : 'smooth' });
}
/* keyboard: space pauses, arrows and W A S D flip videos, M mutes, L likes */
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (sheetEls.length || pages.length) { if (e.key === 'Escape') { if (sheetEls.length) closeSheet(); else closeTop(); } return; }
  const k = e.key.toLowerCase(), code = e.code;
  if (code === 'Space' || k === 'k') { e.preventDefault(); togglePause(); if (F.active) replay(F.active.querySelector('.playicon'), 'tap'); return; }
  if (k === 'arrowdown' || k === 'arrowright' || code === 'KeyS' || code === 'KeyD') { e.preventDefault(); go(1); return; }
  if (k === 'arrowup' || k === 'arrowleft' || code === 'KeyW' || code === 'KeyA') { e.preventDefault(); go(-1); return; }
  if (code === 'KeyM') { F.muted = !F.muted; applyMute(); toast(F.muted ? 'Звук выключен' : 'Звук включён'); return; }
  if (code === 'KeyL' && F.active) { const p = POSTS.get(F.active.dataset.id); if (p && !needLogin('Войдите, чтобы ставить лайки.')) toggleLike(p); }
});

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

/* ---------- generative clips (bot posts are recipes drawn live) ---------- */
function rng(seed) { let a = (Number(seed) >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const GEN = {
  waves(c, w, h, t, s, g) {
    const H = g.hue, gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${H + 250},45%,18%)`); gr.addColorStop(.5, `hsl(${H + 10},90%,62%)`); gr.addColorStop(.62, `hsl(${H + 40},100%,66%)`); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = `hsl(${H + 50},100%,88%)`; c.beginPath(); c.arc(w / 2, h * .55 - Math.sin(t * .3) * 10, w * .13, 0, 7); c.fill();
    for (let k = 0; k < 6; k++) { const y0 = h * .58 + k * h * .07; c.fillStyle = `hsla(${H + 200 - k * 6},60%,${28 - k * 3}%,.92)`; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) c.lineTo(x, y0 + Math.sin(x * .012 + t * (1 + k * .3) + k) * (8 + k * 3) * w / 400); c.lineTo(w, h); c.fill(); }
  },
  neonrain(c, w, h, t, s, g) {
    c.fillStyle = 'rgba(8,10,24,.35)'; c.fillRect(0, 0, w, h); const r = s.r || (s.r = rng(g.seed));
    s.d = s.d || Array.from({ length: 160 }, () => ({ x: r() * w, y: r() * h, v: 4 + r() * 8, hue: r() < .5 ? g.hue : g.hue + 130 }));
    s.p = s.p || []; c.lineWidth = 2 * w / 400;
    for (const d of s.d) { d.y += d.v * (h / 700); if (d.y > h * .85) { s.p.push({ x: d.x, y: h * .85 + r() * h * .12, a: 1, hue: d.hue }); d.y = -20; d.x = r() * w; }
      c.strokeStyle = `hsla(${d.hue},100%,65%,.8)`; c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x, d.y + 18 * h / 700); c.stroke(); }
    s.p = s.p.filter(q => (q.a -= .03) > 0); for (const q of s.p) { c.strokeStyle = `hsla(${q.hue},100%,65%,${q.a})`; c.beginPath(); c.ellipse(q.x, q.y, (1 - q.a) * 40 * w / 400, (1 - q.a) * 8 * w / 400, 0, 0, 7); c.stroke(); }
  },
  lava(c, w, h, t, s, g) {
    c.fillStyle = `hsl(${g.hue + 330},60%,7%)`; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) { const x = w * (.5 + .32 * Math.sin(t * .4 + i * 1.7)), y = h * (.5 + .4 * Math.sin(t * .27 + i * 2.3)), rr = w * (.22 + .06 * Math.sin(t + i));
      const gr = c.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `hsla(${g.hue + i * 12},100%,60%,.9)`); gr.addColorStop(1, 'hsla(0,100%,50%,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }
    c.globalCompositeOperation = 'source-over';
  },
  warp(c, w, h, t, s, g) {
    c.fillStyle = 'rgba(2,3,10,.4)'; c.fillRect(0, 0, w, h); const r = s.r || (s.r = rng(g.seed));
    s.st = s.st || Array.from({ length: 280 }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, z: r() }));
    for (const q of s.st) { const z0 = q.z; q.z -= .012; if (q.z <= .01) { q.x = r() * 2 - 1; q.y = r() * 2 - 1; q.z = 1; continue; }
      const k = w * .5, x1 = w / 2 + q.x / z0 * k, y1 = h / 2 + q.y / z0 * k, x2 = w / 2 + q.x / q.z * k, y2 = h / 2 + q.y / q.z * k;
      c.strokeStyle = `hsla(${g.hue + q.x * 60},90%,${60 + 30 * (1 - q.z)}%,${1 - q.z})`; c.lineWidth = (2 * (1 - q.z) + .5) * w / 400; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  },
  tunnel(c, w, h, t, s, g) {
    c.fillStyle = `hsl(${g.hue},40%,7%)`; c.fillRect(0, 0, w, h); c.save(); c.translate(w / 2, h / 2);
    for (let i = 18; i > 0; i--) { const z = Math.pow(1.18, i) * 8 * w / 400 * (1 + (t % 1) * .18); c.save(); c.rotate(t * .5 + i * .18); c.strokeStyle = i % 2 ? `hsl(${g.hue},80%,62%)` : `hsl(${g.hue + 60},100%,62%)`; c.lineWidth = Math.max(1, z / 40); c.strokeRect(-z / 2, -z / 2, z, z); c.restore(); }
    c.restore();
  },
  aurora(c, w, h, t, s, g) {
    const r = s.r || (s.r = rng(g.seed)); s.stars = s.stars || Array.from({ length: 120 }, () => [r() * w, r() * h * .7, r()]);
    c.fillStyle = `hsl(${g.hue + 220},50%,6%)`; c.fillRect(0, 0, w, h);
    for (const [x, y, k] of s.stars) { c.fillStyle = `rgba(255,255,255,${.3 + .5 * Math.abs(Math.sin(t * 2 + k * 9))})`; c.fillRect(x, y, 1.5, 1.5); }
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) for (let x = 0; x < w; x += 4) {
      const y = h * (.28 + i * .08) + Math.sin(x * .006 + t * .5 + i * 2) * h * .07 + Math.sin(x * .017 - t * .8) * h * .02;
      const gr = c.createLinearGradient(0, y, 0, y + h * .3); gr.addColorStop(0, `hsla(${g.hue + 90 + i * 40},90%,60%,0)`); gr.addColorStop(.2, `hsla(${g.hue + 90 + i * 40},90%,60%,.10)`); gr.addColorStop(1, 'hsla(0,0%,0%,0)');
      c.fillStyle = gr; c.fillRect(x, y, 4, h * .3);
    }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = `hsl(${g.hue + 220},40%,4%)`; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 10) c.lineTo(x, h * .82 - Math.abs(Math.sin(x * .013 + g.seed)) * h * .08); c.lineTo(w, h); c.fill();
  },
  galaxy(c, w, h, t, s, g) {
    const r = s.r || (s.r = rng(g.seed)); s.p = s.p || Array.from({ length: 1400 }, () => { const arm = Math.floor(r() * 3), d = Math.pow(r(), .6); return [d, arm * 2.094 + d * 5 + (r() - .5) * .6, r()]; });
    c.fillStyle = 'rgba(3,2,12,.45)'; c.fillRect(0, 0, w, h); c.save(); c.translate(w / 2, h / 2); const R = Math.min(w, h) * .48;
    for (const q of s.p) { const a = q[1] + t * (.25 / (q[0] + .15)), x = Math.cos(a) * q[0] * R, y = Math.sin(a) * q[0] * R * .62;
      c.fillStyle = `hsla(${g.hue + q[0] * 120},90%,${85 - q[0] * 40}%,${.5 + q[2] * .5})`; const z = (1 - q[0]) * 2 + .6; c.fillRect(x, y, z, z); }
    const core = c.createRadialGradient(0, 0, 0, 0, 0, R * .25); core.addColorStop(0, `hsla(${g.hue + 40},100%,90%,.9)`); core.addColorStop(1, 'transparent'); c.fillStyle = core; c.fillRect(-R, -R, 2 * R, 2 * R);
    c.restore();
  },
  matrix(c, w, h, t, s, g) {
    const fs = Math.max(12, w / 26), cols = Math.ceil(w / fs), r = s.r || (s.r = rng(g.seed));
    s.y = s.y || Array.from({ length: cols }, () => r() * -h);
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, 0, w, h); c.font = `${fs}px monospace`;
    const glyphs = 'アカサタナハマヤラワ0123456789МЕЛЬК#$%';
    for (let i = 0; i < cols; i++) { const ch = glyphs[Math.floor(r() * glyphs.length)]; c.fillStyle = r() < .05 ? '#fff' : `hsl(${g.hue},100%,${45 + r() * 25}%)`; c.fillText(ch, i * fs, s.y[i]); s.y[i] += fs * .55; if (s.y[i] > h + r() * h) s.y[i] = 0; }
  },
  fireworks(c, w, h, t, s, g) {
    const r = s.r || (s.r = rng(g.seed)); s.ps = s.ps || []; s.next = s.next ?? 0;
    c.fillStyle = 'rgba(5,4,15,.22)'; c.fillRect(0, 0, w, h);
    if (t > s.next) { s.next = t + .45 + r() * .5; const x = w * (.2 + r() * .6), y = h * (.15 + r() * .4), hu = g.hue + r() * 140; for (let i = 0; i < 90; i++) { const a = r() * 6.283, v = (1 + r() * 4) * w / 400; s.ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1, hu }); } }
    c.globalCompositeOperation = 'lighter';
    s.ps = s.ps.filter(q => (q.l -= .012) > 0);
    for (const q of s.ps) { q.vy += .04 * w / 400; q.vx *= .985; q.vy *= .985; q.x += q.vx; q.y += q.vy; c.fillStyle = `hsla(${q.hu},100%,65%,${q.l})`; c.fillRect(q.x, q.y, 2.2, 2.2); }
    c.globalCompositeOperation = 'source-over';
  },
  city(c, w, h, t, s, g) {
    const r = s.r || (s.r = rng(g.seed));
    if (!s.layers) s.layers = [0, 1, 2].map(L => { const bs = []; let x = 0; while (x < w * 2.2) { const bw = (24 + r() * 50) * w / 400; bs.push({ x, bw, bh: h * (.12 + r() * .35) * (1 - L * .2), win: r() }); x += bw + 2; } return { bs, span: x }; });
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${g.hue + 240},60%,8%)`); gr.addColorStop(1, `hsl(${g.hue + 300},70%,22%)`); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = `hsla(${g.hue + 40},100%,85%,.9)`; c.beginPath(); c.arc(w * .75, h * .2, w * .07, 0, 7); c.fill();
    s.layers.forEach((Ly, L) => {
      const off = (t * (8 + L * 14) * w / 400) % Ly.span, base = h * (.72 + L * .1);
      for (const b of Ly.bs) { let x = b.x - off; if (x + b.bw < 0) x += Ly.span; if (x > w) continue;
        c.fillStyle = `hsl(${g.hue + 250},30%,${6 + L * 4}%)`; c.fillRect(x, base - b.bh, b.bw, b.bh + h);
        if (L === 2 || L === 1) { const sz = 4 * w / 400; for (let yy = base - b.bh + sz * 2; yy < base - sz; yy += sz * 2.4) for (let xx = x + sz; xx < x + b.bw - sz; xx += sz * 2.2) {
          const k = Math.sin(xx * 7.1 + yy * 3.3 + b.win * 99); if (k > .35) { c.fillStyle = `hsla(${g.hue + (k > .8 ? 160 : 40)},100%,${60 + 20 * Math.sin(t + k * 9)}%,.85)`; c.fillRect(xx, yy, sz, sz); } } } }
    });
  },
  blob(c, w, h, t, s, g) {
    c.fillStyle = `hsl(${g.hue + 200},35%,8%)`; c.fillRect(0, 0, w, h);
    c.save(); c.filter = 'blur(' + Math.round(w / 30) + 'px)';
    for (let i = 0; i < 6; i++) { const x = w * (.5 + .3 * Math.sin(t * .5 + i * 2.1)), y = h * (.5 + .3 * Math.cos(t * .37 + i * 1.3)), rr = w * (.16 + .05 * Math.sin(t * 1.3 + i));
      c.fillStyle = `hsl(${g.hue + i * 28},90%,60%)`; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); }
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.ellipse(w * .35, h * .3, w * .3, h * .08, -.4, 0, 7); c.fill();
  },
  flow(c, w, h, t, s, g) {
    const r = s.r || (s.r = rng(g.seed)); if (!s.ps) { s.ps = Array.from({ length: 700 }, () => [r() * w, r() * h]); c.fillStyle = '#05060a'; c.fillRect(0, 0, w, h); }
    c.fillStyle = 'rgba(5,6,10,.06)'; c.fillRect(0, 0, w, h); c.lineWidth = 1.2 * w / 400; const f = .004 * 400 / w;
    for (const q of s.ps) { const a = (Math.sin(q[0] * f + t * .2) + Math.cos(q[1] * f - t * .15)) * Math.PI, x2 = q[0] + Math.cos(a) * 2 * w / 400, y2 = q[1] + Math.sin(a) * 2 * w / 400;
      c.strokeStyle = `hsla(${g.hue + (q[1] / h) * 80},90%,62%,.6)`; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(x2, y2); c.stroke(); q[0] = x2; q[1] = y2;
      if (q[0] < 0 || q[0] > w || q[1] < 0 || q[1] > h) { q[0] = r() * w; q[1] = r() * h; } }
  },
  kaleido(c, w, h, t, s, g) {
    const r = s.r || (s.r = rng(g.seed)); s.sh = s.sh || Array.from({ length: 7 }, () => ({ a: r() * 6, d: .1 + r() * .35, z: .03 + r() * .09, sp: .2 + r() * .6, k: Math.floor(r() * 3), hu: g.hue + r() * 120 }));
    c.fillStyle = `hsl(${g.hue + 180},40%,6%)`; c.fillRect(0, 0, w, h); const R = Math.max(w, h) * .7, n = 12;
    c.save(); c.translate(w / 2, h / 2); c.rotate(t * .1);
    for (let k = 0; k < n; k++) { c.save(); c.rotate(k * 6.283 / n); if (k % 2) c.scale(1, -1);
      for (const q of s.sh) { const d = (q.d + .08 * Math.sin(t * q.sp + q.a)) * R, a = .26 * Math.sin(t * q.sp * .7 + q.a), x = Math.cos(a) * d, y = Math.sin(a) * d * .4, z = q.z * R;
        c.fillStyle = `hsla(${q.hu + t * 20},90%,62%,.75)`; c.beginPath();
        if (q.k === 0) c.arc(x, y, z, 0, 7); else if (q.k === 1) { c.moveTo(x, y - z); c.lineTo(x + z, y + z); c.lineTo(x - z, y + z); } else c.rect(x - z / 2, y - z / 2, z, z); c.fill(); }
      c.restore(); }
    c.restore();
  },
  type(c, w, h, t, s, g) {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${g.hue + t * 15},80%,55%)`); gr.addColorStop(1, `hsl(${g.hue + 120 + t * 15},80%,30%)`); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    const word = String(g.word || 'МЕЛЬК'), fs = Math.min(w / (word.length * .62), h * .2);
    c.font = `700 ${fs}px Unbounded, Manrope, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let e = 4; e >= 0; e--) { c.strokeStyle = `rgba(255,255,255,${.12 + .05 * (4 - e)})`; c.lineWidth = 2; c.strokeText(word, w / 2, h / 2 - e * fs * .5 * Math.sin(t * 1.2) + e * fs * .5); }
    const tw = c.measureText(word).width; let x = w / 2 - tw / 2;
    for (let i = 0; i < word.length; i++) { const ch = word[i], cw = c.measureText(ch).width, y = h / 2 + Math.sin(t * 3 + i * .6) * fs * .12, sc = 1 + .08 * Math.sin(t * 4 + i);
      c.save(); c.translate(x + cw / 2, y); c.scale(sc, sc); c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; c.fillText(ch, 0, 0); c.restore(); x += cw; }
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  }
};
const GEN_LOOP = 12000;
function sizeCanvas(cv, maxDpr = 1.5) { const r = Math.min(devicePixelRatio || 1, maxDpr), W = Math.round(cv.clientWidth * r), H = Math.round(cv.clientHeight * r); if (W && H && (cv.width !== W || cv.height !== H)) { cv.width = W; cv.height = H; return true; } return false; }
function genFrame(cv, g, t) { const st = {}, c = cv.getContext('2d'), fn = GEN[g?.style] || GEN.waves; const steps = 24; for (let i = 0; i <= steps; i++) fn(c, cv.width, cv.height, t * i / steps, st, g); }
function genThumb(g, w = 180, h = 240) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.className = 'gthumb'; try { genFrame(cv, g, 3); } catch (_) { } return cv; }
function mediaThumb(p) { if (p.kind === 'gen') return genThumb(p.gen); const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = videoUrl(p.video_path) + '#t=0.5'; return v; }
let genT = 0;
(function genLoop(now) {
  requestAnimationFrame(genLoop);
  const el = F.active; if (!el || el.dataset.kind !== 'gen' || F.paused) return;
  const p = POSTS.get(el.dataset.id), cv = el.querySelector('canvas.gen'); if (!p || !cv) return;
  if (sizeCanvas(cv)) el._gs = {};
  const dt = Math.min(50, now - (el._lt || now)); el._lt = now; el._acc = (el._acc || 0) + dt;
  try { (GEN[p.gen?.style] || GEN.waves)(cv.getContext('2d'), cv.width, cv.height, el._acc / 1000, el._gs || (el._gs = {}), p.gen); } catch (_) { }
  el.querySelector('.progress i').style.width = ((el._acc % GEN_LOOP) / GEN_LOOP * 100) + '%';
})(performance.now());

/* generative music: a soft arpeggio + pad from the recipe's seed */
let AC = null;
function audioCtx() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } } if (AC.state === 'suspended') AC.resume().catch(() => { }); return AC; }
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (AC && AC.state === 'suspended') AC.resume().catch(() => { }); }, true));
function genMusic(g) {
  const ac = audioCtx(); if (!ac || !g) return null;
  const r = rng((g.seed || 1) + 7), master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); master.gain.linearRampToValueAtTime(.14, ac.currentTime + .8);
  const scale = [0, 3, 5, 7, 10, 12, 15, 17], root = 48 + Math.floor(r() * 12), beat = 60 / (g.tempo || 90) / 2;
  const pat = Array.from({ length: 8 }, () => scale[Math.floor(r() * scale.length)]), hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const pads = [0, 7, 12].map(iv => { const o = ac.createOscillator(), gg = ac.createGain(); o.type = 'sine'; o.frequency.value = hz(root + iv - 12); gg.gain.value = .045; o.connect(gg).connect(master); o.start(); return o; });
  let step = 0, next = ac.currentTime + .05;
  const timer = setInterval(() => { while (next < ac.currentTime + .25) {
    const o = ac.createOscillator(), e = ac.createGain(); o.type = step % 4 === 0 ? 'triangle' : 'sine'; o.frequency.value = hz(root + 12 + pat[step % 8] + (step % 16 >= 8 ? 2 : 0));
    e.gain.setValueAtTime(0, next); e.gain.linearRampToValueAtTime(.16, next + .01); e.gain.exponentialRampToValueAtTime(.001, next + beat * 1.8);
    o.connect(e).connect(master); o.start(next); o.stop(next + beat * 2); next += beat; step++; } }, 60);
  return { stop() { clearInterval(timer); const t = ac.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + .3); setTimeout(() => { pads.forEach(o => { try { o.stop(); } catch (_) { } }); master.disconnect(); }, 450); } };
}
/* what plays for a slide: its own video sound, a borrowed sound file, or generated music */
function synthFor(p) { if (p.kind === 'gen') return p.gen; if (p.sound_src && p.sound_src.kind === 'gen') return p.sound_src.gen; return null; }
function stopSynth(el) { if (el && el._music) { el._music.stop(); el._music = null; } }
function startSynth(el) { stopSynth(el); const p = POSTS.get(el.dataset.id); const g = p && synthFor(p); if (g && !F.muted && !F.paused) el._music = genMusic(g); }

/* ---------- feed ---------- */
let io;
async function fetchPosts(from) {
  let q = sb.from('melk_posts').select(POST_SELECT).order('created_at', { ascending: false }).range(from, from + PAGE - 1);
  if (F.tab === 'follow') {
    const ids = [...S.following]; if (!ids.length) return [];
    if (!F.followReposts) { const { data } = await sb.from('melk_reposts').select('post_id').in('user_id', ids).order('created_at', { ascending: false }).limit(200); F.followReposts = [...new Set((data || []).map(r => r.post_id))]; }
    q = F.followReposts.length ? q.or(`author_id.in.(${ids.join(',')}),id.in.(${F.followReposts.join(',')})`) : q.in('author_id', ids);
  }
  const { data, error } = await q; if (error) throw error;
  return data.map(normPost);
}
async function reloadFeed(focusId) {
  F.posts = []; F.done = false; POSTS.clear(); F.followReposts = null;
  if (io) io.disconnect(); feed.querySelectorAll('video').forEach(v => v.pause());
  feed.innerHTML = '<div class="loader"><div class="lg">мельк</div><div class="bars"><i></i><i></i><i></i></div></div>'; F.active = null;
  try {
    let first = [];
    if (focusId) { const { data } = await sb.from('melk_posts').select(POST_SELECT).eq('id', focusId).maybeSingle(); if (data) first = [{ ...normPost(data), _pinned: true }]; }
    const page = await fetchPosts(0);
    F.posts = first.concat(page.filter(p => !first.some(f => f.id === p.id)));
    F.done = page.length < PAGE;
  } catch (e) { feed.innerHTML = '<div class="empty"><h2>Лента не загрузилась</h2><p>Проверьте интернет и обновите страницу.</p></div>'; console.error(e); return; }
  await loadMine(F.posts.map(p => p.id)); await loadReposters(F.posts).catch(() => { });
  feed.innerHTML = '';
  if (!F.posts.length) return renderEmpty();
  io = { observe() { }, disconnect() { } };
  F.posts.forEach(appendSlide);
  lastTop = feed.scrollTop; depth(); settle();
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
    F.done = page.length < PAGE; await loadMine(fresh.map(p => p.id)); await loadReposters(fresh).catch(() => { });
    fresh.forEach(p => { F.posts.push(p); appendSlide(p); });
  } catch (e) { console.error(e); }
  F.loading = false;
}
function appendSlide(p) { POSTS.set(p.id, p); const el = slide(p); feed.appendChild(el); io.observe(el); }

function slide(p) {
  const el = document.createElement('section'); el.className = 'slide'; el.dataset.id = p.id;
  const mine = S.user && p.author_id === S.user.id;
  el.dataset.kind = p.kind || 'video';
  el.innerHTML = `<div class="stage">${p.kind === 'gen' ? '<canvas class="gen"></canvas><span class="genchip">✦ Сгенерировано</span>' : `<video src="${esc(videoUrl(p.video_path))}" loop playsinline preload="metadata"></video>`}</div>
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
  <div class="info"><div class="who2"><button class="handle"></button><div class="subline"><button class="uname" title="Скопировать ник"></button><button class="rpill"></button></div></div><div class="cap">${capHTML(p.caption)}</div>
    <button class="sound" aria-label="Звук"><span class="eqz"><i></i><i></i><i></i></span><b>${esc(soundName(p))} · ${esc(soundName(p))}</b></button><div class="when">${ago(p.created_at)}</div>${mine ? `<button class="editbar">${ICON_EDIT}<span>Изменить ролик</span></button>` : ''}</div>
  <div class="progress"><i></i></div>`;
  el.querySelector('.handle').textContent = p.author?.name || p.author?.username || 'user';
  el.querySelector('.uname').textContent = '@' + (p.author?.username || 'user');
  el.querySelector('.uname').onclick = e => { e.stopPropagation(); copy('@' + (p.author?.username || ''), 'Ник скопирован'); };
  el.querySelector('.rpill').onclick = e => { e.stopPropagation(); if (!needLogin('Войдите, чтобы делать репосты.')) openRepost(p); };
  if (p.author?.is_bot) el.querySelector('.handle').insertAdjacentHTML('beforeend', ' <span class="botchip">ИИ-бот</span>');
  if (p.kind === 'gen') { const cv = el.querySelector('canvas.gen'); requestAnimationFrame(() => { sizeCanvas(cv); try { genFrame(cv, p.gen, 2); } catch (_) { } }); }
  const v = el.querySelector('.stage video') || document.createElement('video');
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
  el.querySelector('.rp').onclick = () => { if (!needLogin('Войдите, чтобы делать репосты.')) openRepost(p); };
  el.querySelector('.sound').onclick = () => openSound(p);
  el.querySelector('.editbar')?.addEventListener('click', e => { e.stopPropagation(); openEdit(p); });
  if (p.sound_src && p.sound_src.id !== p.id && p.sound_src.kind !== 'gen' && p.sound_src.video_path) { const a = document.createElement('audio'); a.className = 'aux'; a.loop = true; a.preload = 'none'; a.src = videoUrl(p.sound_src.video_path); el.appendChild(a); el.dataset.borrowed = '1'; }
  el.querySelector('.sv').onclick = () => { if (!needLogin('Войдите, чтобы сохранять ролики.')) toggleSave(p); };
  el.querySelector('.sh').onclick = () => openShare(p);
  el.querySelector('.avatar').onclick = e => { if (e.target.classList.contains('follow')) { e.stopPropagation(); if (!needLogin('Войдите, чтобы подписываться.')) toggleFollow(p.author_id); return; } openProfile(p.author_id); };
  el.querySelector('.handle').onclick = () => openProfile(p.author_id);
  el.querySelector('.mute').onclick = () => { F.muted = !F.muted; applyMute(); };
  fillSlide(el, p);
  return el;
}
function fillSlide(el, p) {
  const lk = el.querySelector('.like'); lk.classList.toggle('liked', S.liked.has(p.id)); setCount(lk.querySelector('span'), fmt(p.likeCount), p.likeCount);
  setCount(el.querySelector('.cm span'), fmt(p.commentCount), p.commentCount);
  const pill = el.querySelector('.rpill');
  if (pill) { const by = p.rpBy; pill.classList.toggle('on', S.reposted.has(p.id)); pill.classList.toggle('has', !!by);
    pill.innerHTML = ICON.repost + '<span></span>';
    pill.querySelector('span').textContent = S.reposted.has(p.id) ? (by && by.mine && by.note ? `Ваш репост: «${by.note}»` : 'Ваш репост · заметка') : by ? `${by.name}${by.note ? ': «' + by.note + '»' : ' репостнул(а)'}` : 'Репост с заметкой'; }
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
function applyMute() {
  feed.querySelectorAll('.slide').forEach(sl => { const v = sl.querySelector('.stage video'), a = sl.querySelector('audio.aux'), p = POSTS.get(sl.dataset.id);
    if (a) { a.muted = F.muted; if (v) v.muted = true; } else if (v) v.muted = p && synthFor(p) ? true : F.muted; });
  if (F.active) { if (F.muted) stopSynth(F.active); else if (!F.active._music) startSynth(F.active); }
  feed.querySelectorAll('.mute').forEach(b => b.textContent = F.muted ? 'Звук выкл.' : 'Звук вкл.');
}
function activate(el) {
  if (F.active === el) return;
  if (F.active) { F.active.querySelector('.stage video')?.pause(); F.active.querySelector('audio.aux')?.pause(); stopSynth(F.active); F.active.classList.remove('live'); }
  F.active = el; F.paused = false; el.classList.remove('paused'); el.classList.add('live');
  const p = POSTS.get(el.dataset.id), v = el.querySelector('.stage video'), aux = el.querySelector('audio.aux');
  el._acc = 0; el._lt = performance.now(); el._gs = {};
  const fallback = () => { F.muted = true; applyMute(); v?.play().catch(() => { }); aux?.play().catch(() => { }); };
  if (v) v.currentTime = 0;
  if (aux) { v.muted = true; aux.muted = F.muted; aux.currentTime = 0; v.play().catch(() => { }); aux.play().catch(fallback); }
  else if (v && p && synthFor(p)) { v.muted = true; v.play().catch(() => { }); startSynth(el); }
  else if (v) { v.muted = F.muted; v.play().catch(fallback); }
  else startSynth(el);
  const idx = [...feed.children].indexOf(el); if (idx >= feed.children.length - 3) loadMore();
}
function togglePause() {
  if (!F.active) return; F.paused = !F.paused; F.active.classList.toggle('paused', F.paused);
  const v = F.active.querySelector('.stage video'), a = F.active.querySelector('audio.aux');
  if (F.paused) { v?.pause(); a?.pause(); stopSynth(F.active); } else { F.active._lt = performance.now(); v?.play().catch(() => { }); a?.play().catch(() => { }); startSynth(F.active); }
}
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
async function openRepost(p) {
  const on = S.reposted.has(p.id);
  const body = document.createElement('div'); body.className = 'form';
  body.innerHTML = `<div class="rpcard"><span class="rpth"></span><div><b></b><small></small></div></div>
    <div class="field"><label for="rp-note">Заметка к репосту</label><textarea id="rp-note" rows="3" maxlength="150" placeholder="Почему стоит посмотреть? Необязательно"></textarea><span class="count" id="rp-c">0/150</span></div>
    <p class="err" id="rp-err" hidden></p>
    <button class="primary" id="rp-go">${on ? 'Сохранить заметку' : 'Репостнуть'}</button>
    ${on ? '<button class="ghost danger" id="rp-del">Убрать репост</button>' : ''}
    <p class="hint">Репост с заметкой появится во вкладке «Репосты» в вашем профиле.</p>`;
  sheet(on ? 'Ваш репост' : 'Репост', body);
  body.querySelector('.rpth').replaceWith(mediaThumb(p));
  body.querySelector('.rpcard b').textContent = '@' + (p.author?.username || 'user'); body.querySelector('.rpcard small').textContent = p.caption || soundName(p);
  const ta = body.querySelector('#rp-note'), cnt = body.querySelector('#rp-c'), go = body.querySelector('#rp-go');
  ta.oninput = () => cnt.textContent = ta.value.length + '/150';
  if (on) { const { data } = await sb.from('melk_reposts').select('note').eq('post_id', p.id).eq('user_id', S.user.id).maybeSingle(); ta.value = data?.note || ''; ta.oninput(); }
  go.onclick = async () => {
    go.disabled = true; const note = ta.value.trim().slice(0, 150);
    const { error } = on ? await sb.from('melk_reposts').update({ note }).eq('post_id', p.id).eq('user_id', S.user.id)
                         : await sb.from('melk_reposts').insert({ post_id: p.id, user_id: S.user.id, note });
    go.disabled = false; if (error && error.code !== '23505') return dbErr(error);
    p.rpBy = { name: S.me?.name || S.me?.username, note, mine: true, score: 9 };
    if (!on) { S.reposted.add(p.id); p.repostCount++; refreshSlides(); feed.querySelectorAll(`[data-id="${p.id}"] .rp`).forEach(b => { replay(b, 'pop'); sparks(b, 'var(--mint)'); }); }
    refreshSlides(); closeSheet(); toast(on ? 'Заметка сохранена' : 'Репост в вашем профиле');
  };
  body.querySelector('#rp-del')?.addEventListener('click', async () => {
    const { error } = await sb.from('melk_reposts').delete().eq('post_id', p.id).eq('user_id', S.user.id); if (error) return dbErr(error);
    S.reposted.delete(p.id); p.repostCount = Math.max(0, p.repostCount - 1); if (p.rpBy?.mine) p.rpBy = null; refreshSlides(); closeSheet(); toast('Репост убран');
  });
}

/* ---------- edit own video ---------- */
function openEdit(p) {
  const body = document.createElement('div'); body.className = 'form';
  body.innerHTML = `<div class="editvid"><video muted loop playsinline autoplay src="${esc(videoUrl(p.video_path))}"></video><label class="ghost swap" for="ed-file">Заменить видео<input type="file" id="ed-file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden></label></div>
    <div class="field"><label for="ed-cap">Подпись</label><textarea id="ed-cap" rows="3" maxlength="300"></textarea></div>
    ${p.sound_post_id ? `<div class="soundchip">${ICON.play}<span></span></div>` : '<div class="field"><label for="ed-sound">Звук</label><input type="text" id="ed-sound" maxlength="60"></div>'}
    <p class="err" id="ed-err" hidden></p>
    <button class="primary" id="ed-go">Сохранить</button>
    <button class="ghost danger" id="ed-del">Удалить ролик</button>`;
  sheet('Изменить ролик', body);
  body.querySelector('#ed-cap').value = p.caption || '';
  if (p.sound_post_id) body.querySelector('.soundchip span').textContent = 'Звук: ' + soundName(p); else body.querySelector('#ed-sound').value = p.sound || '';
  let file = null, type = null, prev = null;
  const err = body.querySelector('#ed-err'), fail = t => { err.textContent = t; err.hidden = false; }, go = body.querySelector('#ed-go');
  body.querySelector('#ed-file').onchange = e => {
    const x = e.target.files[0]; if (!x) return; err.hidden = true; type = pickVideoType(x);
    if (!type) return fail('Этот формат не подходит. Нужен MP4, WebM или MOV.');
    if (x.size > MAX_MB * 1048576) return fail(`Файл весит ${(x.size / 1048576).toFixed(1)} МБ, а можно до ${MAX_MB} МБ.`);
    file = x; if (prev) URL.revokeObjectURL(prev); prev = URL.createObjectURL(x); const v = body.querySelector('.editvid video'); v.src = prev; replay(body.querySelector('.editvid'), 'pop');
  };
  go.onclick = async () => {
    go.disabled = true; go.classList.add('loading'); go.textContent = 'Сохраняем…';
    const upd = { caption: body.querySelector('#ed-cap').value.trim().slice(0, 300) };
    if (!p.sound_post_id) upd.sound = body.querySelector('#ed-sound').value.trim().slice(0, 60) || 'Оригинальный звук';
    let oldPath = null;
    if (file) {
      const ext = type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4', path = `${S.user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: type, cacheControl: '31536000' });
      if (up.error) { go.disabled = false; go.classList.remove('loading'); go.textContent = 'Сохранить'; return fail('Видео не загрузилось. Попробуйте ещё раз.'); }
      upd.video_path = path; oldPath = p.video_path;
    }
    const { error } = await sb.from('melk_posts').update(upd).eq('id', p.id);
    if (error) { if (upd.video_path) sb.storage.from(BUCKET).remove([upd.video_path]); go.disabled = false; go.classList.remove('loading'); go.textContent = 'Сохранить'; return fail('Не получилось сохранить. Попробуйте ещё раз.'); }
    if (oldPath) sb.storage.from(BUCKET).remove([oldPath]);
    Object.assign(p, upd); const live = POSTS.get(p.id); if (live && live !== p) Object.assign(live, upd);
    const el = feed.querySelector(`[data-id="${p.id}"]`);
    if (el) {
      el.querySelector('.cap').innerHTML = capHTML(p.caption);
      el.querySelector('.sound b').textContent = soundName(p) + ' · ' + soundName(p);
      if (upd.video_path) { const v = el.querySelector('.stage video'); v.classList.remove('ready'); v.src = videoUrl(p.video_path); v.addEventListener('loadeddata', () => v.classList.add('ready'), { once: true }); if (F.active === el) v.play().catch(() => { }); }
      replay(el.querySelector('.info'), 'flash');
    }
    if (prev) URL.revokeObjectURL(prev);
    closeSheet(); toast('Ролик обновлён');
  };
  const del = body.querySelector('#ed-del'); armButton(del, 'Точно удалить?', async () => { closeSheet(); await deletePost(p); document.querySelectorAll(`.tile[data-pid="${p.id}"]`).forEach(t => t.remove()); });
}
function pickVideoType(x) { const ext = (x.name.split('.').pop() || '').toLowerCase(); return ['video/mp4', 'video/webm', 'video/quicktime'].includes(x.type) ? x.type : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : ['mp4', 'm4v'].includes(ext) ? 'video/mp4' : null; }

/* ---------- sound page ---------- */
async function openSound(p) {
  const rootId = p.sound_post_id || p.id;
  const body = document.createElement('div'); body.className = 'soundpg';
  body.innerHTML = '<p class="hint" style="padding:30px;text-align:center">Загружаем звук…</p>';
  const pg = page('Звук', body);
  const [rootQ, listQ] = await Promise.all([
    sb.from('melk_posts').select(POST_SELECT).eq('id', rootId).maybeSingle(),
    sb.from('melk_posts').select(POST_SELECT).or(`id.eq.${rootId},sound_post_id.eq.${rootId}`).order('like_count', { ascending: false }).limit(60)
  ]);
  const root = rootQ.data ? normPost(rootQ.data) : null;
  if (!root) { body.innerHTML = '<div class="empty small"><h2>Звук недоступен</h2><p>Оригинальный ролик удалён.</p></div>'; return; }
  const vids = (listQ.data || []).map(normPost).sort((a, b) => (b.id === rootId) - (a.id === rootId));
  const name = soundName(root);
  body.innerHTML = `<div class="shero"><button class="sdisc" aria-label="Послушать"><span class="pav big" style="${avStyle(root.author, root.author_id)}">${avText(root.author)}</span><i class="sp">${ICON.play}</i></button>
    <div class="sinfo"><h2></h2><button class="sauthor"></button><small>${fmt(vids.length)} ${plural(vids.length, 'видео', 'видео', 'видео')} с этим звуком</small></div></div>
    ${root.kind === 'gen' ? '' : `<audio class="sprev" loop preload="none" src="${esc(videoUrl(root.video_path))}"></audio>`}
    <div class="row"><button class="primary" id="s-shoot">${ICON.camera} Снять с этим звуком</button></div>
    <div class="row"><button class="ghost" id="s-pick">Загрузить из галереи</button><button class="ghost" id="s-share">${ICON.link} Ссылка</button></div>
    <div class="grid"></div>`;
  body.querySelector('h2').textContent = name; body.querySelector('.sauthor').textContent = '@' + (root.author?.username || 'user');
  body.querySelector('.sauthor').onclick = () => openProfile(root.author_id);
  const au = body.querySelector('.sprev'), disc = body.querySelector('.sdisc'); let syn = null;
  const stopPrev = () => { au?.pause(); syn?.stop(); syn = null; disc.classList.remove('playing'); };
  disc.onclick = () => {
    const playing = disc.classList.contains('playing'); if (playing) return stopPrev();
    feed.querySelectorAll('video,audio').forEach(m => m.pause()); if (F.active) stopSynth(F.active);
    if (root.kind === 'gen') { syn = genMusic(root.gen); if (syn) disc.classList.add('playing'); else toast('Не получилось включить звук'); }
    else au.play().then(() => disc.classList.add('playing')).catch(() => toast('Не получилось включить звук'));
  };
  const watchPrev = setInterval(() => { if (!document.body.contains(pg)) { stopPrev(); clearInterval(watchPrev); } }, 500);
  const useSound = gallery => { stopPrev(); openUpload({ soundId: rootId, soundName: name, soundSrc: root.video_path, soundGen: root.kind === 'gen' ? root.gen : null, gallery }); };
  body.querySelector('#s-shoot').onclick = () => useSound(false);
  body.querySelector('#s-pick').onclick = () => useSound(true);
  body.querySelector('#s-share').onclick = () => copy(postLink(rootId), 'Ссылка на звук скопирована');
  const g = body.querySelector('.grid');
  vids.forEach((v, i) => {
    const b = document.createElement('div'); b.className = 'tile'; b.tabIndex = 0; b.setAttribute('role', 'button'); b.style.animationDelay = Math.min(i, 8) * 40 + 'ms';
    b.innerHTML = `<span class="n">♥ ${fmt(v.likeCount)}</span>${v.id === rootId ? '<span class="orig">Оригинал</span>' : ''}`;
    b.prepend(mediaThumb(v)); b.onclick = () => goToPost(v.id); g.appendChild(b);
  });
}
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
  if (p.video_path) await sb.storage.from(BUCKET).remove([p.video_path]);
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
      else { el.innerHTML = `<button class="pcard"><span class="pth"></span><span class="pmeta"><b></b><small></small></span><span class="pplay">${ICON.play}</span></button>`;
        el.querySelector('b').textContent = '@' + (p.author?.username || 'user'); el.querySelector('small').textContent = p.caption || 'Ролик'; el.querySelector('.pth').replaceWith(mediaThumb(p)); el.querySelector('.pcard').onclick = () => goToPost(p.id); }
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
    sh.querySelector('.ttl').textContent = `${fmt(items.length)} ${plural(items.length, 'комментарий', 'комментария', 'комментариев')}`; list.innerHTML = '';
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
function openUpload(opts = {}) {
  if (needLogin('Войдите, чтобы публиковать ролики.')) return;
  let snd = opts.soundId ? { id: opts.soundId, name: opts.soundName, src: opts.soundSrc, gen: opts.soundGen } : null;
  const body = document.createElement('div'); body.className = 'form';
  body.innerHTML = `<div class="drop" id="drop"><div class="pick">
      <label class="pickbtn" for="up-cam">${ICON.camera}<b>Снять</b><input type="file" id="up-cam" accept="video/*" capture="user" hidden></label>
      <label class="pickbtn" for="up-file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg><b>Из галереи</b><input type="file" id="up-file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden></label>
    </div><span class="dh">Вертикальное видео MP4, WebM или MOV, до ${MAX_MB} МБ</span></div>
  <div id="up-snd"></div>
  <div class="field"><label for="up-cap">Подпись</label><textarea id="up-cap" rows="3" maxlength="300" placeholder="Расскажите о ролике и добавьте #хэштеги"></textarea></div>
  <p class="err" id="up-err" hidden></p>
  <button class="primary" id="up-go" disabled>Опубликовать</button>
  <p class="hint">Ролик сразу увидят все, кто открывает «Мельк». Изменить или удалить его можно кнопкой «Изменить» у ролика.</p>`;
  sheet(snd ? 'Ролик со звуком' : 'Новый ролик', body);
  const sndBox = body.querySelector('#up-snd');
  let au = null;
  const drawSound = () => {
    if (snd) {
      sndBox.innerHTML = `<div class="soundchip on"><span class="eqz"><i></i><i></i><i></i></span><span class="sn"></span><button class="x2" aria-label="Убрать звук">×</button></div><p class="hint">В ролике будет играть этот звук вместо звука с камеры.</p>`;
      sndBox.querySelector('.sn').textContent = snd.name;
      sndBox.querySelector('.x2').onclick = () => { snd = null; au?.pause(); au = null; drawSound(); };
      if (snd.gen) { let m = null; au = { paused: true, currentTime: 0, play() { m?.stop(); m = genMusic(snd.gen); this.paused = false; return Promise.resolve(); }, pause() { m?.stop(); m = null; this.paused = true; } }; }
      else { au = new Audio(videoUrl(snd.src)); au.loop = true; }
    } else sndBox.innerHTML = '<div class="field"><label for="up-sound">Звук</label><input type="text" id="up-sound" maxlength="60" value="Оригинальный звук"></div>';
  };
  drawSound();
  let file = null, type = null, preview = null;
  const drop = body.querySelector('#drop'), go = body.querySelector('#up-go'), err = body.querySelector('#up-err');
  const fail = t => { err.textContent = t; err.hidden = false; };
  const onPick = e => {
    err.hidden = true; const x = e.target.files[0]; if (!x) return;
    type = pickVideoType(x);
    if (!type) { go.disabled = true; return fail('Этот формат не подходит. Нужен MP4, WebM или MOV.'); }
    if (x.size > MAX_MB * 1048576) { go.disabled = true; return fail(`Файл весит ${(x.size / 1048576).toFixed(1)} МБ, а можно до ${MAX_MB} МБ. Обрежьте или сожмите ролик.`); }
    file = x; if (preview) URL.revokeObjectURL(preview); preview = URL.createObjectURL(x); drop.classList.add('has');
    drop.innerHTML = '<video muted autoplay loop playsinline></video><span></span>'; const v = drop.querySelector('video'); v.src = preview; drop.querySelector('span').textContent = x.name; go.disabled = false;
    if (au) { au.currentTime = 0; au.play().catch(() => { }); v.onplay = () => { au.currentTime = v.currentTime; }; }
  };
  body.querySelector('#up-cam').onchange = onPick; body.querySelector('#up-file').onchange = onPick;
  if (opts.gallery === false) setTimeout(() => body.querySelector('#up-cam').click(), 350);
  if (opts.gallery === true) setTimeout(() => body.querySelector('#up-file').click(), 350);
  const stopAudio = new MutationObserver(() => { if (!document.body.contains(body)) { au?.pause(); stopAudio.disconnect(); } }); stopAudio.observe(app, { childList: true });
  go.onclick = async () => {
    if (!file) return; go.disabled = true; go.classList.add('loading'); go.textContent = 'Загружаем…'; err.hidden = true;
    const ext = type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4';
    const path = `${S.user.id}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: type, cacheControl: '31536000' });
    if (up.error) { go.disabled = false; go.classList.remove('loading'); go.textContent = 'Опубликовать'; return fail(/size|large/i.test(up.error.message) ? `Файл слишком большой, можно до ${MAX_MB} МБ.` : /mime|type/i.test(up.error.message) ? 'Этот формат не подходит.' : 'Видео не загрузилось. Попробуйте ещё раз.'); }
    const row = { author_id: S.user.id, video_path: path, caption: body.querySelector('#up-cap').value.trim().slice(0, 300) };
    if (snd) { row.sound_post_id = snd.id; row.sound = snd.name.slice(0, 60); } else row.sound = (body.querySelector('#up-sound')?.value || '').trim().slice(0, 60) || 'Оригинальный звук';
    const { data, error } = await sb.from('melk_posts').insert(row).select('id').single();
    if (error) { await sb.storage.from(BUCKET).remove([path]); go.disabled = false; go.classList.remove('loading'); go.textContent = 'Опубликовать'; return fail('Не получилось опубликовать. Попробуйте ещё раз.'); }
    if (preview) URL.revokeObjectURL(preview); au?.pause();
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

/* ---------- profile background ---------- */
async function bannerJpeg(file) {
  const img = await createImageBitmap(file); const w = Math.min(1200, img.width), h = Math.round(w / 2.4);
  const sr = img.width / img.height > 2.4 ? [(img.width - img.height * 2.4) / 2, 0, img.height * 2.4, img.height] : [0, (img.height - img.width / 2.4) / 2, img.width, img.width / 2.4];
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, ...sr, 0, 0, w, h);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .85));
}
function openBannerPicker(P, redraw) {
  const body = document.createElement('div'); body.className = 'form';
  body.innerHTML = `<div class="bnprev" style="${bannerStyle(P)}">${bannerMedia(P)}</div>
    <div class="swatches">${Object.keys(BANNERS).map(k => `<button class="swatch${P.banner === k ? ' on' : ''}" data-b="${k}" style="background:${BANNERS[k]}" aria-label="Фон ${k.slice(1)}"></button>`).join('')}</div>
    <div class="row"><label class="ghost" for="bn-file">${ICON.camera} Картинка<input type="file" id="bn-file" accept="image/jpeg,image/png,image/webp,image/*" hidden></label>
    <label class="ghost" for="bn-vid">${ICON.play} Видео до 10 с<input type="file" id="bn-vid" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden></label></div>
    <p class="err" id="bn-err" hidden></p>
    ${P.banner ? '<button class="linkbtn" id="bn-reset">Вернуть обычный фон</button>' : ''}`;
  sheet('Фон профиля', body);
  const set = async val => {
    const old = P.banner; const { error } = await sb.from('melk_profiles').update({ banner: val }).eq('id', P.id);
    if (error) return dbErr(error);
    if (old && old !== val) { if (old.startsWith('img:')) sb.storage.from(AVATARS).remove([old.slice(4)]); if (old.startsWith('vid:')) sb.storage.from(BUCKET).remove([old.slice(4)]); }
    P.banner = val; if (S.me) S.me.banner = val; const pv = body.querySelector('.bnprev'); pv.setAttribute('style', bannerStyle(P)); pv.innerHTML = bannerMedia(P); replay(body.querySelector('.bnprev'), 'pop');
    body.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s.dataset.b === val)); redraw(); toast('Фон обновлён');
  };
  body.querySelectorAll('.swatch').forEach(b => b.onclick = () => set(b.dataset.b));
  body.querySelector('#bn-reset')?.addEventListener('click', () => { set(null); closeSheet(); });
  body.querySelector('#bn-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; if (!/^image\//.test(f.type)) return toast('Нужна картинка: JPG, PNG или WebP.');
    let blob; try { blob = await bannerJpeg(f); } catch (_) { return toast('Не получилось открыть эту картинку.'); }
    const path = `${S.user.id}/banner-${Date.now()}.jpg`;
    const up = await sb.storage.from(AVATARS).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up.error) return dbErr(up.error);
    set('img:' + path);
  };
  body.querySelector('#bn-vid').onchange = async e => {
    const f = e.target.files[0], er = body.querySelector('#bn-err'); if (!f) return; er.hidden = true;
    const fail = t => { er.textContent = t; er.hidden = false; };
    const type = pickVideoType(f); if (!type) return fail('Нужно видео MP4, WebM или MOV.');
    if (f.size > 20 * 1048576) return fail('Видео для фона должно весить до 20 МБ.');
    const dur = await new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => { res(v.duration); URL.revokeObjectURL(v.src); }; v.onerror = () => res(NaN); v.src = URL.createObjectURL(f); });
    if (!isFinite(dur)) return fail('Не получилось прочитать это видео. Попробуйте MP4.');
    if (dur > 10.5) return fail(`Видео длится ${Math.round(dur)} с, а для фона можно до 10 секунд. Обрежьте его.`);
    toast('Загружаем видео для фона…');
    const ext = type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4', path = `${S.user.id}/banner-${Date.now()}.${ext}`;
    const up = await sb.storage.from(BUCKET).upload(path, f, { contentType: type, cacheControl: '31536000' });
    if (up.error) return fail('Видео не загрузилось. Попробуйте ещё раз.');
    set('vid:' + path);
  };
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
    item('Сменить аккаунт', 'Войти в другой аккаунт, этот останется сохранённым', () => { closeSheet(); openAuth(); });
    item('Выйти из аккаунта', 'Аккаунт останется на этом устройстве, войти обратно можно в одно касание', () => { closeSheet(); leaveAccount(); }, 'danger');
    item('Выйти и забыть это устройство', '', async () => { closeSheet(); accounts.forget(S.user.id); await sb.auth.signOut({ scope: 'local' }); location.replace(location.pathname); }, 'danger');
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
    b.appendChild(mediaThumb(p));
    const n = document.createElement('span'); n.className = 'n'; n.textContent = '♥ ' + fmt(p.likeCount); b.appendChild(n);
    if (badge) { const k = document.createElement('span'); k.className = 'tb'; k.innerHTML = badge; b.appendChild(k); }
    b.dataset.pid = p.id;
    if (p._note) { const q = document.createElement('span'); q.className = 'tnote'; q.textContent = p._note; b.appendChild(q); }
    b.onclick = () => goToPost(p.id); b.onkeydown = e => { if (e.key === 'Enter') goToPost(p.id); };
    if (canDel && S.user && p.author_id === S.user.id) { const x = document.createElement('button'); x.className = 'rm ed2'; x.innerHTML = ICON_EDIT + 'Изменить'; x.onclick = e => { e.stopPropagation(); openEdit(p); }; b.appendChild(x); }
    else if (canDel) { const x = document.createElement('button'); x.className = 'rm'; x.textContent = 'Удалить'; armButton(x, 'Точно?', async () => { await deletePost(p); b.remove(); }); b.appendChild(x); }
    return b;
  };
  async function loadList(kind) {
    const tbl = { reposts: 'melk_reposts', liked: 'melk_likes', saved: 'melk_saves' }[kind];
    const { data } = await sb.from(tbl).select(`created_at,${kind === 'reposts' ? 'note,' : ''}post:melk_posts(${POST_SELECT})`).eq('user_id', uid).order('created_at', { ascending: false }).limit(60);
    lists[kind] = (data || []).filter(r => r.post).map(r => ({ ...normPost(r.post), _note: r.note || '' })); draw();
  }
  function tabsFor() {
    const t = [['posts', 'Ролики'], ['reposts', 'Репосты']];
    if (me || P.show_likes) t.push(['liked', 'Понравилось']);
    if (me || P.show_saves) t.push(['saved', 'Избранное']);
    return t;
  }
  function draw() {
    const tabs = tabsFor(); if (!tabs.some(t => t[0] === tab)) tab = 'posts';
    body.innerHTML = `<div class="banner" style="${bannerStyle(P)}">${bannerMedia(P)}${me ? '<button class="bnedit" id="pf-bn">' + ICON.camera + ' Фон</button>' : ''}</div><div class="avwrap"><div class="avatar big" style="${avStyle(P, P.id)}">${avText(P)}</div>${me ? `<label class="avedit" for="pf-av" aria-label="Сменить аватарку">${ICON.camera}<input type="file" id="pf-av" accept="image/jpeg,image/png,image/webp,image/*" hidden></label>` : ''}</div>
    <div class="nm"></div><button class="un" title="Скопировать ник"></button><p class="bio"></p>
    <div class="stats"><div><b>${fmt(followerCount)}</b>подписчики</div><div><b>${fmt(fing.count || 0)}</b>подписки</div><div><b>${fmt(likesGot)}</b>лайки</div></div>
    <div class="row" id="pf-actions"></div><div id="pf-edit" style="width:100%"></div>
    <div class="ptabs" role="tablist">${tabs.map(t => `<button data-t="${t[0]}">${t[1]}${me && ((t[0] === 'liked' && !P.show_likes) || (t[0] === 'saved' && !P.show_saves)) ? ' ' + ICON.lock : ''}</button>`).join('')}</div>
    <div class="grid"></div>`;
    body.querySelector('.nm').textContent = P.name; body.querySelector('.un').innerHTML = '<span></span><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
    body.querySelector('.un span').textContent = '@' + P.username; body.querySelector('.un').onclick = () => copy('@' + P.username, 'Ник скопирован');
    if (P.is_bot) body.querySelector('.un').insertAdjacentHTML('beforeend', ' <span class="botchip">ИИ-бот</span>');
    const bio = body.querySelector('.bio'); bio.textContent = P.bio || (me ? 'Добавьте пару слов о себе.' : ''); bio.hidden = !bio.textContent;
    const avIn = body.querySelector('#pf-av');
    if (avIn) avIn.onchange = async () => { const a = body.querySelector('.avatar.big'); a.classList.add('loading'); if (await changeAvatar(avIn.files[0], P)) draw(); else a.classList.remove('loading'); };
    body.querySelector('#pf-bn')?.addEventListener('click', () => openBannerPicker(P, draw));
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
      <p class="hint">Аватарку можно сменить значком камеры у фото, а фон профиля кнопкой «Фон» сверху. Кто видит лайки и избранное, настраивается в меню «⋯» сверху.</p>`;
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
