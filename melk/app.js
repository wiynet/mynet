/* Мельк — короткие видео на Supabase (проект mynet, таблицы melk_*) */
const SUPABASE_URL = 'https://nbjaysdarixncuumjarc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G0ywq5XbqYa8SRKSLOLgBg_ohjrxqzN';
const BUCKET = 'melk-videos';
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
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l14-8z"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 18V5l11-2v13" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>'
};
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1e4 ? (n / 1e3).toFixed(1).replace('.', ',') + ' тыс.' : String(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capHTML = s => esc(s).replace(/#([\wа-яё]+)/gi, '<span class="tag">#$1</span>');
const ago = iso => { const t = new Date(iso).getTime(), m = Math.floor((Date.now() - t) / 6e4); if (m < 1) return 'только что'; if (m < 60) return m + ' мин. назад'; const h = Math.floor(m / 60); if (h < 24) return h + ' ч. назад'; const d = Math.floor(h / 24); return d < 30 ? d + ' дн. назад' : new Date(t).toLocaleDateString('ru-RU'); };
const hue = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const color = id => `hsl(${hue(id)},80%,64%)`;
const initial = p => ((p && (p.name || p.username)) || '?')[0].toUpperCase();
const videoUrl = path => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
function toast(t) { app.querySelectorAll('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; app.appendChild(d); setTimeout(() => d.remove(), 2700); }
function armButton(btn, armedLabel, fn) { const label = btn.textContent; btn.onclick = e => { e.stopPropagation(); if (btn.classList.contains('arm')) fn(); else { btn.classList.add('arm'); btn.textContent = armedLabel; setTimeout(() => { btn.classList.remove('arm'); btn.textContent = label; }, 3000); } }; }
const dbErr = e => { console.error(e); toast(navigator.onLine ? 'Не получилось. Попробуйте ещё раз.' : 'Нет интернета.'); };

/* ---------- state ---------- */
const S = { user: null, me: null, admin: false, liked: new Set(), saved: new Set(), following: new Set() };
const F = { tab: 'fy', posts: [], done: false, loading: false, active: null, paused: false, muted: false };
const POSTS = new Map(); // id -> post

const POST_SELECT = 'id,video_path,caption,sound,created_at,author_id,author:melk_profiles!melk_posts_author_id_fkey(id,username,name),likes:melk_likes(count),comments:melk_comments(count)';
function normPost(r) { return { ...r, likeCount: r.likes?.[0]?.count ?? 0, commentCount: r.comments?.[0]?.count ?? 0 }; }

/* ---------- auth ---------- */
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null; S.me = null; S.admin = false;
  S.liked = new Set(); S.saved = new Set(); S.following = new Set();
  if (S.user) {
    const uid = S.user.id;
    const [me, adm, fol, sav] = await Promise.all([
      sb.from('melk_profiles').select('id,username,name,bio').eq('id', uid).maybeSingle(),
      sb.from('melk_admins').select('user_id').eq('user_id', uid).maybeSingle(),
      sb.from('melk_follows').select('followee_id').eq('follower_id', uid),
      sb.from('melk_saves').select('post_id').eq('user_id', uid)
    ]);
    S.me = me.data; S.admin = !!adm.data;
    (fol.data || []).forEach(r => S.following.add(r.followee_id));
    (sav.data || []).forEach(r => S.saved.add(r.post_id));
  }
  $('nav-me-t').textContent = S.user ? 'Профиль' : 'Войти';
}
async function loadMyLikes(ids) {
  if (!S.user || !ids.length) return;
  const { data } = await sb.from('melk_likes').select('post_id').eq('user_id', S.user.id).in('post_id', ids);
  (data || []).forEach(r => S.liked.add(r.post_id));
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
      // аккаунт создаёт серверная функция: без почты и без писем
      let res;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/melk-signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, body: JSON.stringify({ username: u, password: pass, name }) });
        res = await r.json();
      } catch (_) { return fail('Нет связи с сервером. Попробуйте ещё раз.'); }
      if (!res.ok) return fail(res.error === 'taken' ? 'Этот ник уже занят. Попробуйте другой.' : res.error === 'bad_username' ? 'Ник: от 3 до 20 символов, только латиница, цифры и _.' : res.error === 'bad_password' || res.error === 'weak_password' ? 'Пароль слишком простой. Придумайте другой, от 6 символов.' : 'Не получилось зарегистрироваться. Попробуйте ещё раз.');
      const { error } = await sb.auth.signInWithPassword({ email: res.email || `${u}@${LOGIN_DOMAIN}`, password: pass });
      if (error) return fail('Аккаунт создан, но войти не получилось. Попробуйте во вкладке «Вход».');
    }
    closePage(); await onAuthChanged(); toast(mode === 'in' ? 'Вы вошли' : 'Добро пожаловать в «Мельк»!');
  };
}
async function onAuthChanged() { await loadMe(); await loadMyLikes(F.posts.map(p => p.id)); if (F.tab === 'follow') await reloadFeed(); else refreshSlides(); }

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
  await loadMyLikes(F.posts.map(p => p.id));
  feed.innerHTML = '';
  if (!F.posts.length) return renderEmpty();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) activate(e.target); }), { root: feed, threshold: .6 });
  F.posts.forEach(appendSlide);
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
    F.done = page.length < PAGE; await loadMyLikes(fresh.map(p => p.id));
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
    <button class="avatar" aria-label="Профиль автора" style="background:${color(p.author_id)}">${esc(initial(p.author))}${mine ? '' : '<span class="follow" role="button" aria-label="Подписаться"></span>'}</button>
    <button class="act like">${ICON.heart}<span></span></button>
    <button class="act cm">${ICON.chat}<span></span></button>
    <button class="act sv">${ICON.save}<span></span></button>
    <button class="act sh">${ICON.share}<span>Поделиться</span></button>
    <div class="disc"><span style="background:${color(p.author_id)}"></span></div>
  </div>
  <div class="info"><button class="handle"></button><div class="cap">${capHTML(p.caption)}</div>
    <div class="sound">${ICON.note}<b>${esc(p.sound)} · ${esc(p.sound)}</b></div><div class="when">${ago(p.created_at)}</div></div>
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
  el.querySelector('.sv').onclick = () => { if (!needLogin('Войдите, чтобы сохранять ролики.')) toggleSave(p); };
  el.querySelector('.sh').onclick = () => share(p);
  el.querySelector('.avatar').onclick = e => { if (e.target.classList.contains('follow')) { e.stopPropagation(); if (!needLogin('Войдите, чтобы подписываться.')) toggleFollow(p.author_id); return; } openProfile(p.author_id); };
  el.querySelector('.handle').onclick = () => openProfile(p.author_id);
  el.querySelector('.mute').onclick = () => { F.muted = !F.muted; feed.querySelectorAll('video').forEach(x => x.muted = F.muted); feed.querySelectorAll('.mute').forEach(b => b.textContent = F.muted ? 'Звук выкл.' : 'Звук вкл.'); };
  fillSlide(el, p);
  return el;
}
function fillSlide(el, p) {
  const lk = el.querySelector('.like'); lk.classList.toggle('liked', S.liked.has(p.id)); setCount(lk.querySelector('span'), fmt(p.likeCount));
  setCount(el.querySelector('.cm span'), fmt(p.commentCount));
  const sv = el.querySelector('.sv'), saved = S.saved.has(p.id); sv.classList.toggle('saved', saved); sv.querySelector('span').textContent = saved ? 'В избранном' : 'Сохранить';
  const f = el.querySelector('.follow');
  if (S.user && p.author_id === S.user.id) { if (f) f.remove(); }
  else if (f) { const on = S.following.has(p.author_id); if (f.classList.contains('on') !== on) { f.classList.toggle('on', on); replay(f, 'morph'); } f.textContent = on ? '✓' : '+'; }
}
function setCount(span, t) { if (span.textContent !== t) { const first = span.textContent === ''; span.textContent = t; if (!first) replay(span, 'tick'); } }
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
async function toggleLike(p) {
  const key = 'like' + p.id; if (busy.has(key)) return; busy.add(key);
  const on = !S.liked.has(p.id);
  on ? S.liked.add(p.id) : S.liked.delete(p.id); p.likeCount += on ? 1 : -1; refreshSlides();
  feed.querySelectorAll(`[data-id="${p.id}"] .like`).forEach(b => { replay(b, on ? 'pop' : 'shrink'); if (on) sparks(b, 'var(--heart)'); });
  const { error } = on ? await sb.from('melk_likes').insert({ post_id: p.id, user_id: S.user.id })
                       : await sb.from('melk_likes').delete().eq('post_id', p.id).eq('user_id', S.user.id);
  if (error && error.code !== '23505') { on ? S.liked.delete(p.id) : S.liked.add(p.id); p.likeCount += on ? -1 : 1; refreshSlides(); dbErr(error); }
  busy.delete(key);
}
async function toggleSave(p) {
  const on = !S.saved.has(p.id); on ? S.saved.add(p.id) : S.saved.delete(p.id); refreshSlides();
  feed.querySelectorAll(`[data-id="${p.id}"] .sv`).forEach(b => { replay(b, on ? 'pop' : 'shrink'); if (on) sparks(b, 'var(--sun)'); });
  const { error } = on ? await sb.from('melk_saves').insert({ post_id: p.id, user_id: S.user.id })
                       : await sb.from('melk_saves').delete().eq('post_id', p.id).eq('user_id', S.user.id);
  if (error && error.code !== '23505') { on ? S.saved.delete(p.id) : S.saved.add(p.id); refreshSlides(); return dbErr(error); }
  toast(on ? 'Сохранено в избранное' : 'Убрано из избранного');
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
function share(p) {
  const url = location.origin + location.pathname + '#p/' + p.id;
  const done = () => toast('Ссылка на ролик скопирована');
  if (navigator.share) { navigator.share({ title: 'Мельк', text: p.caption, url }).catch(() => { }); return; }
  try { navigator.clipboard.writeText(url).then(done, () => toast(url)); } catch (_) { toast(url); }
}
async function deletePost(p) {
  await sb.storage.from(BUCKET).remove([p.video_path]);
  const { error } = await sb.from('melk_posts').delete().eq('id', p.id);
  if (error) return dbErr(error);
  POSTS.delete(p.id); F.posts = F.posts.filter(x => x.id !== p.id);
  feed.querySelector(`[data-id="${p.id}"]`)?.remove(); if (!F.posts.length) renderEmpty();
  toast('Ролик удалён');
}

/* ---------- tabs & nav ---------- */
function setTab(t) { F.tab = t; $('tab-fy').setAttribute('aria-selected', t === 'fy'); $('tab-follow').setAttribute('aria-selected', t === 'follow'); closeAll(); reloadFeed(); }
$('tab-fy').onclick = () => setTab('fy');
$('tab-follow').onclick = () => setTab('follow');
$('nav-home').onclick = () => { closeAll(); if (F.tab !== 'fy') setTab('fy'); else feed.scrollTo({ top: 0, behavior: 'smooth' }); };
$('nav-up').onclick = () => openUpload();
$('nav-me').onclick = () => { if (needLogin()) return; openProfile(S.user.id); };
async function goToPost(id) { closeAll(); const s = feed.querySelector(`[data-id="${id}"]`); if (s && F.tab === 'fy') { s.scrollIntoView(); return; } F.tab = 'fy'; $('tab-fy').setAttribute('aria-selected', true); $('tab-follow').setAttribute('aria-selected', false); await reloadFeed(id); }

/* ---------- sheets ---------- */
let sheetEls = [], pageEl = null, pagePushed = false;
function closeSheet() { const els = sheetEls; sheetEls = []; els.forEach(x => { x.classList.add('closing'); setTimeout(() => x.remove(), 230); }); }
function removePage() { if (!pageEl) return; const el = pageEl; pageEl = null; el.classList.add('closing'); setTimeout(() => el.remove(), 260); }
function closePage() { if (!pageEl) return; if (pagePushed) { pagePushed = false; history.back(); } removePage(); }
function closeAll() { closeSheet(); closePage(); }
addEventListener('popstate', () => { pagePushed = false; removePage(); });
/* full-screen window with a back button (login, profile) */
function page(title, body, hash) {
  closeSheet();
  if (!pageEl) { pageEl = document.createElement('div'); pageEl.className = 'page'; pageEl.setAttribute('role', 'dialog'); app.appendChild(pageEl);
    if (!pagePushed) { history.pushState({ melkPage: 1 }, '', hash || location.pathname + location.search); pagePushed = true; } }
  else if (hash) history.replaceState({ melkPage: 1 }, '', hash);
  pageEl.innerHTML = '<header class="phead"><button class="back" aria-label="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><span class="ttl"></span><span class="pad"></span></header>';
  pageEl.querySelector('.ttl').textContent = title; pageEl.querySelector('.back').onclick = closePage;
  const wrap = document.createElement('div'); wrap.className = 'pbody'; wrap.appendChild(body); pageEl.appendChild(wrap);
  return pageEl;
}
function pageHash(h) { if (pageEl && pagePushed) history.replaceState({ melkPage: 1 }, '', h); }
function sheet(title, body) {
  closeSheet(); const s = document.createElement('div'); s.className = 'scrim'; s.onclick = closeSheet;
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog');
  sh.innerHTML = '<header><span class="ttl"></span><button class="x" aria-label="Закрыть">×</button></header>'; sh.querySelector('.ttl').textContent = title; sh.appendChild(body);
  sh.querySelector('.x').onclick = closeSheet; app.append(s, sh); sheetEls = [s, sh]; return sh;
}

async function openComments(p) {
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;min-height:0;flex:1';
  body.innerHTML = `<div class="clist"><p class="hint" style="text-align:center;padding:20px">Загружаем…</p></div><form class="compose"><input id="c-input" placeholder="${S.user ? 'Добавьте комментарий…' : 'Войдите, чтобы комментировать'}" autocomplete="off" maxlength="300"><button type="submit" disabled>Отправить</button></form>`;
  const list = body.querySelector('.clist'), inp = body.querySelector('input'), btn = body.querySelector('button[type=submit]');
  const sh = sheet('Комментарии', body);
  let items = [];
  const draw = () => {
    sh.querySelector('.ttl').textContent = `${items.length} комментариев`; list.innerHTML = '';
    if (!items.length) { list.innerHTML = '<p class="hint" style="text-align:center;padding:20px">Пока нет комментариев. Будьте первым.</p>'; return; }
    for (const c of items) {
      const row = document.createElement('div'); row.className = 'c';
      row.innerHTML = `<button class="av" style="background:${color(c.author_id)}" aria-label="Профиль">${esc(initial(c.author))}</button><div style="min-width:0"><div class="who"></div><div class="txt"></div></div><div></div>`;
      row.querySelector('.who').textContent = '@' + (c.author?.username || 'user') + ' · ' + ago(c.created_at);
      row.querySelector('.txt').textContent = c.body;
      row.querySelector('.av').onclick = () => openProfile(c.author_id);
      if (S.user && (c.author_id === S.user.id || S.admin)) {
        const d = document.createElement('button'); d.className = 'del'; d.textContent = 'Удалить';
        armButton(d, 'Точно?', async () => { const { error } = await sb.from('melk_comments').delete().eq('id', c.id); if (error) return dbErr(error); items = items.filter(x => x.id !== c.id); p.commentCount = Math.max(0, p.commentCount - 1); refreshSlides(); draw(); });
        row.lastElementChild.appendChild(d);
      }
      list.appendChild(row);
    }
  };
  const { data, error } = await sb.from('melk_comments').select('id,body,created_at,author_id,author:melk_profiles!melk_comments_author_id_fkey(username,name)').eq('post_id', p.id).order('created_at', { ascending: false }).limit(200);
  if (error) { list.innerHTML = '<p class="err" style="text-align:center;padding:20px">Комментарии не загрузились.</p>'; return; }
  items = data; p.commentCount = Math.max(p.commentCount, items.length); refreshSlides(); draw();
  inp.oninput = () => btn.disabled = !inp.value.trim();
  inp.onfocus = () => { if (!S.user) { inp.blur(); openAuth('Войдите, чтобы комментировать.'); } };
  body.querySelector('form').onsubmit = async e => {
    e.preventDefault(); const t = inp.value.trim(); if (!t || needLogin('Войдите, чтобы комментировать.')) return;
    btn.disabled = true;
    const { data: row, error } = await sb.from('melk_comments').insert({ post_id: p.id, author_id: S.user.id, body: t }).select('id,body,created_at,author_id,author:melk_profiles!melk_comments_author_id_fkey(username,name)').single();
    if (error) { btn.disabled = false; return dbErr(error); }
    inp.value = ''; items.unshift(row); p.commentCount++; refreshSlides(); draw(); list.scrollTop = 0;
  };
}

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
    closeSheet(); await goToPost(data.id); toast('Опубликовано');
  };
}

/* ---------- profile ---------- */
async function openProfile(uid) {
  const body = document.createElement('div'); body.className = 'prof';
  body.innerHTML = '<p class="hint" style="padding:30px">Загружаем профиль…</p>';
  const me = S.user && uid === S.user.id;
  page(me ? 'Мой профиль' : 'Профиль', body);
  const [prof, posts, fers, fing] = await Promise.all([
    sb.from('melk_profiles').select('id,username,name,bio').eq('id', uid).maybeSingle(),
    sb.from('melk_posts').select(POST_SELECT).eq('author_id', uid).order('created_at', { ascending: false }).limit(60),
    sb.from('melk_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', uid),
    sb.from('melk_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', uid)
  ]);
  if (!prof.data) { body.innerHTML = '<p class="err" style="padding:30px">Профиль не найден.</p>'; return; }
  const P = prof.data, own = (posts.data || []).map(normPost);
  pageHash('#@' + P.username); if (pageEl) pageEl.querySelector('.ttl').textContent = me ? 'Мой профиль' : '@' + P.username;
  let followerCount = fers.count || 0, tab = 'posts', editing = false, lists = { liked: null, saved: null };
  const likesGot = own.reduce((s, p) => s + p.likeCount, 0);

  const tile = (p, canDel) => {
    const b = document.createElement('div'); b.className = 'tile'; b.tabIndex = 0; b.setAttribute('role', 'button');
    const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = videoUrl(p.video_path) + '#t=0.5'; b.appendChild(v);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = '♥ ' + fmt(p.likeCount); b.appendChild(n);
    b.onclick = () => goToPost(p.id); b.onkeydown = e => { if (e.key === 'Enter') goToPost(p.id); };
    if (canDel) { const x = document.createElement('button'); x.className = 'rm'; x.textContent = 'Удалить'; armButton(x, 'Точно?', async () => { await deletePost(p); b.remove(); }); b.appendChild(x); }
    return b;
  };
  async function loadList(kind) {
    const tbl = kind === 'liked' ? 'melk_likes' : 'melk_saves';
    const { data } = await sb.from(tbl).select(`created_at,post:melk_posts(${POST_SELECT})`).eq('user_id', uid).order('created_at', { ascending: false }).limit(60);
    lists[kind] = (data || []).filter(r => r.post).map(r => normPost(r.post)); draw();
  }
  function draw() {
    body.innerHTML = `<div class="avatar big" style="background:${color(P.id)}">${esc(initial(P))}</div><div class="nm"></div><div class="un"></div><p class="bio"></p>
    <div class="stats"><div><b>${fmt(followerCount)}</b>подписчики</div><div><b>${fmt(fing.count || 0)}</b>подписки</div><div><b>${fmt(likesGot)}</b>лайки</div></div>
    <div class="row" id="pf-actions"></div><div id="pf-edit" style="width:100%"></div>
    ${me ? '<div class="ptabs" role="tablist"><button data-t="posts">Ролики</button><button data-t="liked">Понравилось</button><button data-t="saved">Избранное</button></div>' : ''}
    <div class="grid"></div>${me ? '<button class="linkbtn" id="pf-out">Выйти из аккаунта</button>' : ''}`;
    body.querySelector('.nm').textContent = P.name; body.querySelector('.un').textContent = '@' + P.username;
    const bio = body.querySelector('.bio'); bio.textContent = P.bio || (me ? 'Добавьте пару слов о себе.' : ''); bio.hidden = !bio.textContent;
    const acts = body.querySelector('#pf-actions');
    if (me) {
      const e = document.createElement('button'); e.className = 'ghost'; e.textContent = editing ? 'Отмена' : 'Изменить профиль'; e.onclick = () => { editing = !editing; draw(); };
      const up = document.createElement('button'); up.className = 'primary'; up.textContent = 'Новый ролик'; up.onclick = openUpload; acts.append(e, up);
    } else {
      const f = document.createElement('button'), on = S.following.has(uid); f.className = on ? 'ghost' : 'primary'; f.textContent = on ? 'Вы подписаны' : 'Подписаться';
      f.onclick = async () => { if (needLogin('Войдите, чтобы подписываться.')) return; const was = S.following.has(uid); if (await toggleFollow(uid)) { followerCount += was ? -1 : 1; draw(); } };
      acts.append(f);
    }
    if (me && editing) {
      const ed = body.querySelector('#pf-edit'); ed.className = 'form'; ed.style.padding = '0';
      ed.innerHTML = `<div class="field"><label for="pf-name">Имя</label><input type="text" id="pf-name" maxlength="40"></div>
      <div class="field"><label for="pf-bio">О себе</label><textarea id="pf-bio" rows="3" maxlength="160"></textarea></div><p class="err" id="pf-err" hidden></p><button class="primary" id="pf-save">Сохранить</button>`;
      ed.querySelector('#pf-name').value = P.name; ed.querySelector('#pf-bio').value = P.bio || '';
      ed.querySelector('#pf-save').onclick = async () => {
        const name = ed.querySelector('#pf-name').value.trim().slice(0, 40), bioT = ed.querySelector('#pf-bio').value.trim().slice(0, 160);
        if (!name) { const er = ed.querySelector('#pf-err'); er.textContent = 'Имя не может быть пустым.'; er.hidden = false; return; }
        const { error } = await sb.from('melk_profiles').update({ name, bio: bioT }).eq('id', uid);
        if (error) return dbErr(error);
        P.name = name; P.bio = bioT; if (S.me) { S.me.name = name; S.me.bio = bioT; } editing = false; draw(); toast('Профиль сохранён');
      };
    }
    let items = own;
    if (me) {
      body.querySelectorAll('.ptabs button').forEach(b => { b.setAttribute('aria-selected', b.dataset.t === tab); b.onclick = () => { tab = b.dataset.t; draw(); }; });
      if (tab !== 'posts') { items = lists[tab]; if (!items) { loadList(tab); items = []; } }
      body.querySelector('#pf-out').onclick = async () => { await sb.auth.signOut(); closePage(); await onAuthChanged(); toast('Вы вышли из аккаунта'); };
    }
    const g = body.querySelector('.grid');
    if (!items.length) {
      const e = document.createElement('p'); e.className = 'hint gridempty';
      e.textContent = tab !== 'posts' && lists[tab] === null ? 'Загружаем…' : tab === 'liked' ? 'Ставьте лайки, и ролики соберутся здесь.' : tab === 'saved' ? 'Пока ничего не сохранено.' : me ? 'Вы ещё ничего не опубликовали.' : 'У автора пока нет роликов.';
      g.appendChild(e);
    }
    items.forEach(p => g.appendChild(tile(p, tab === 'posts' && (me || S.admin))));
  }
  draw();
}

/* ---------- start ---------- */
(async () => {
  await loadMe();
  const m = location.hash.match(/^#p\/([0-9a-f-]{36})$/i);
  await reloadFeed(m ? m[1] : null);
  const u = location.hash.match(/^#@([a-z0-9_]{3,20})$/i);
  if (location.hash === '#login' && !S.user) { history.replaceState(null, '', location.pathname); openAuth(); }
  if (u) { history.replaceState(null, '', location.pathname); const { data } = await sb.from('melk_profiles').select('id').eq('username', u[1].toLowerCase()).maybeSingle(); if (data) openProfile(data.id); }
})();
