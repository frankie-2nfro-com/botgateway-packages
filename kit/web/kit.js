// App kit - page part (botgateway-packages/kit; copy kit/web/ into a package's web/kit/). The page of an
// application built with kit/server.js: the owner's local page (127.0.0.1) and its website (visitors get
// only what the collections' `public` allow - `M.public`). It talks only to its own api/ (relative
// addresses: the local page lives under /apps/<gateway>/<app>/, the website at /). Every change sends the
// x-botgateway header (the gateway's CSRF check). Looks: the app's `look` (colours, font, icon), each
// collection's view (list, cards, files), a collection's `look` field (class look-<value> on an item's
// page, styled by the app's own CSS) and `scale` (amounts that follow a base value, display only).
// look.icon: an emoji, or a picture in the app's web/ (e.g. "icon.png" - also the browser tab's icon).
// look.cover: a picture in web/ for items without their own cover (else a coloured block with the first letter).
// A collection's `publish` ({field, value}): the owner gets Publish / Unpublish on an item's page; visitors
// only ever get published items (the server decides).
// A collection's `years` ("updated" / "created"): a year menu next to the search (the server lists the years).
// Preview (the owner, a collection visitors may read): an item's page has 👁 Preview - #<collection>/<id>/preview
// shows it exactly as the website does (the visitors' view of the app: no owner buttons, no private parts),
// with a note on top and the way back.
// A collection's `dates: true`: an item's page ends with a quiet footer - when it was created and last
// changed. A field's `auto: true`: kept by the program (not in the form, shown in that footer, not as a
// chip); `format` ("v{n}"): how its number shows.
// A collection's `album` ("<images field>"): its cover shows the number of photos and opens a viewer with the
// cover and the album (pictures of any images field open the same viewer).
// Languages: the app's `languages` (e.g. ["en", "zh"]) and `words` ({ zh: { "Recipes": "食譜", "easy": "容易" } }:
// its names, field titles, choices, units, actions) - with more than one, the top bar gets a switch (kept in
// this browser; first time: the browser's language). The kit's own words are below (KIT_WORDS). The items'
// content is not translated.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const APP_ID = '';

// ---------- languages ----------
const LANG_NAMES = { en: 'EN', zh: '中' };
// The kit's own words; the English text is the key ({name} = a value put in). `en` only for keys that
// are not plain English.
const KIT_WORDS = {
  en: { 'count {n} {what}': '{n} {what}' },
  zh: {
    'count {n} {what}': '{n} 個{what}',
    '{n} {what}': '{what} {n}',
    "Can't reach this application right now - it may be switched off, or its computer is offline or restarting. Try again later (reload the page).": '暫時連接不到這個應用程式 - 它可能已關閉，或者它的電腦離線或正在重新啟動。請稍後再試（重新載入頁面）。',
    "This page's session ended - open the application again from the BotGateway app (left, under Applications).": '這個頁面的連線已結束 - 請從 BotGateway 應用程式再次開啟（左邊 Applications 下）。',
    'Untitled {what}': '未命名{what}',
    "This application is switched off at the moment, so the assistant can't work on it. You can still look at and change everything here.": '這個應用程式現在已關閉，助手暫時不能處理。你仍然可以在這裏查看和修改所有內容。',
    'This application is private.': '這個應用程式不公開。',
    'Search {what}': '搜尋{what}',
    '✎ Write a note': '✎ 寫筆記',
    '＋ Add files': '＋ 加入檔案',
    '＋ New {what}': '＋ 新增{what}',
    'Nothing found.': '找不到。',
    'No {what} yet - add files, or drop them here.': '未有{what} - 加入檔案，或者拖放到這裏。',
    'No {what} yet.': '未有{what}。',
    'not used yet': '未使用',
    '{name} is larger than 9 MB': '{name} 大於 9 MB',
    'Write a note': '寫筆記',
    'It is kept as a text file with your {what}.': '它會以文字檔保存在你的{what}中。',
    'Note': '筆記',
    'Cancel': '取消',
    'Save note': '儲存筆記',
    'Write something first.': '請先寫點內容。',
    'Added {when}': '加入於 {when}',
    'Use it for': '用於',
    'Delete': '刪除',
    'Download': '下載',
    'Close': '關閉',
    'Save': '儲存',
    'Really delete?': '確定刪除？',
    '{what} for “{name}”': '「{name}」的{what}',
    'Tick the ones that belong here.': '剔選屬於這裏的項目。',
    'No {what} yet - add files below.': '未有{what} - 在下面加入檔案。',
    '＋ Add new files': '＋ 加入新檔案',
    'Done': '完成',
    'change this amount - the others follow': '改這個份量 - 其他會跟着變',
    'reset': '還原',
    '← All {what}': '← 所有{what}',
    'Edit': '編輯',
    'Nothing written here yet.': '這裏還未有內容。',
    ' Press “{action}” and the assistant fills it in.': '按「{action}」，助手會幫你填寫。',
    '＋ Add {what}': '＋ 加入{what}',
    'None yet.': '未有。',
    'How much {what}?': '{what}要多少？',
    'Now {n}. The other amounts follow.': '現在 {n}。其他份量會跟着變。',
    'Amount': '份量',
    'OK': '確定',
    'Write an amount, e.g. 2 or 1.5': '請輸入份量，例如 2 或 1.5',
    'Extra requirements (optional)': '額外要求（可選）',
    '✨ Send to the assistant': '✨ 交給助手',
    'Unpublished': '未發佈',
    'only you see it - not on the website': '只有你看到 - 不在網站上',
    'Unpublish': '取消發佈',
    '🌐 Publish': '🌐 發佈',
    'Publish': '發佈',
    'Unpublish “{name}”?': '取消發佈「{name}」？',
    "It is taken off the website at once: visitors can't open it any more (pages they already have open keep what they show). It stays here, and you can publish it again.": '它會即時從網站移除：訪客不能再開啟（已開啟的頁面會保留顯示的內容）。它仍然保留在這裏，你可以再次發佈。',
    'Publish “{name}”?': '發佈「{name}」？',
    "Visitors of this application's website can then read it, with its pictures. Your materials stay private. (Nothing is public while the website itself isn't published - BotGateway → Dashboard.)": '這個應用程式網站的訪客便可以閱讀它和它的圖片。你的素材仍然保密。（網站本身未發佈時，所有內容都不公開 - BotGateway → Dashboard。）',
    "{action}: the assistant is working on it… it can't be changed until then.": '{action}：助手正在處理… 完成前不能修改。',
    '{action} was cancelled': '{action} 已取消',
    "{action} didn't work": '{action} 未能完成',
    'remove': '移除',
    'One per line.': '每行一項。',
    '＋ Add a line': '＋ 加一行',
    'Nothing to choose yet.': '還未有可選項目。',
    'keep': '保留',
    '← Back': '← 返回',
    'Edit {name}': '編輯「{name}」',
    'New {what}': '新增{what}',
    'Delete {what}': '刪除{what}',
    'Add': '加入',
    'also deletes {list} used only here': '同時刪除只在這裏使用的 {list}',
    'keeps {list} also used elsewhere': '保留其他地方也有使用的 {list}',
    'Really delete?{extra} Click again': '確定刪除？{extra} 再按一次',
    '{what}: not valid JSON': '{what}：不是有效的 JSON',
    '{what} is needed': '必須填寫{what}',
    '{n} photos': '{n} 張相片',
    'Created {when}': '建立於 {when}',
    'Updated {when}': '更新於 {when}',
    'Previous': '上一張',
    'Next': '下一張',
    'Show the photos': '看相片',
    'All years': '所有年份',
    'Year': '年份',
    '👁 Preview': '👁 預覽',
    'how visitors see it on the website': '訪客在網站上看到的樣子',
    'Preview - this is how visitors see it on the website.': '預覽 - 這是訪客在網站上看到的樣子。',
    "It isn't published yet: visitors can't open it until you publish it.": '它還未發佈：發佈之前訪客不能開啟。',
    '← Back to editing': '← 返回編輯',
    'no answer from the assistant in 15 minutes': '助手 15 分鐘內沒有回覆',
    'the action is gone': '這個動作已不存在',
    'the item was deleted': '項目已被刪除',
  },
};
const LANGS = () => (M && Array.isArray(M.languages) && M.languages.length ? M.languages : ['en']);
let LANG = 'en';
function pickLang() {
  let saved = '';
  try { saved = localStorage.getItem('kit-lang') || ''; } catch (_) {}
  const langs = LANGS(), browser = (navigator.language || '').slice(0, 2).toLowerCase();
  LANG = langs.includes(saved) ? saved : langs.includes(browser) ? browser : langs[0];
  document.documentElement.lang = LANG === 'zh' ? 'zh-Hant' : LANG;
}
/** The kit's words: the English text (with {name} values) in the page's language. */
function t(key, vars = {}) {
  const w = ((M && M.words && M.words[LANG]) || {})[key] ?? (KIT_WORDS[LANG] || {})[key] ?? KIT_WORDS.en[key] ?? key;
  return String(w).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
/** The app's own names (titles, choices, units, actions) in the page's language. */
const tn = s => (s === null || s === undefined || s === '') ? s : String(((M && M.words && M.words[LANG]) || {})[s] ?? s);
const API = 'api';
async function api(path, opts = {}) {
  let res;
  // No answer at all (an old page from the browser's cache, the website switched off, the owner's computer offline).
  try { res = await fetch(API + path, { ...opts, credentials: 'same-origin', headers: { 'x-botgateway': '1', 'Content-Type': 'application/json', 'Accept-Language': LANG, ...(opts.headers || {}) } }); }
  catch (_) { throw new Error(t("Can't reach this application right now - it may be switched off, or its computer is offline or restarting. Try again later (reload the page).")); }
  if (res.status === 401) throw new Error(t("This page's session ended - open the application again from the BotGateway app (left, under Applications)."));
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}
function openModal(html) { $('modal').innerHTML = html; $('modalBg').classList.remove('hidden'); }
function closeModal() { $('modalBg').classList.add('hidden'); $('modal').innerHTML = ''; }
$('modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
$('modalBg').addEventListener('click', e => { if (e.target === $('modalBg')) closeModal(); });
// A button that asks once more before it does something that can't be undone.
function armed(btn, word, run) {
  btn.addEventListener('click', async () => {
    if (!btn.classList.contains('armed')) { btn.classList.add('armed'); btn.textContent = word; return; }
    btn.disabled = true;
    try { await run(); } catch (e) { const er = $('mErr') || $('fErr'); if (er) er.textContent = e.message; btn.disabled = false; }
  });
}

let M = null;   // the application: collections, actions, look (in a preview: the visitors' view of it)
let OWNER = null;   // the application as the server gave it (M outside a preview)
// What visitors get of the application (the server's meta for them): only collections they may use, only
// public actions.
const visitorMeta = m => ({ ...m, public: true, collections: m.collections.filter(c => (c.public || []).length), actions: (m.actions || []).filter(a => a.public) });
const call = (op, args) => api('/call', { method: 'POST', body: JSON.stringify({ op, arguments: args || {} }) });
const coll = name => M.collections.find(c => c.name === name);
// On the application's public website only what the package opens to visitors (`public`); the owner's
// local page can do everything.
const may = (c, what) => !M.public || (c.public || []).includes(what);
const title = c => tn(c.title || c.name);
// In running text: the collection's name / one item, lower case (English).
const T = c => title(c).toLowerCase();
const word = c => tn(c.item || (c.title || c.name).replace(/s$/i, '')).toLowerCase();
const ftitle = f => tn(f.title || f.name);
const fileField = c => c.fields.find(f => f.type === 'file' || f.type === 'image');
const tagField = c => c.fields.find(f => f.type === 'refs' || f.type === 'ref');
const labelField = c => c.fields.find(f => f.type === 'text' || f.type === 'longtext');
const ids = v => Array.isArray(v) ? v : (v === null || v === undefined || v === '' ? [] : [v]);
const fileUrl = name => `${API}/files/${encodeURIComponent(name)}`;
const fileOf = v => v && typeof v === 'object' ? v.file : v;
// Stored files are called <collection>-<id>-<field>-<name>; people see <name>.
const shownName = name => String(name || '').replace(/^[a-z0-9_]+-\d+-[a-z0-9_]+-/, '');
const ext = name => (String(name).split('.').pop() || '').toLowerCase();
const isImg = name => ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext(name));
const isText = name => ['txt', 'md', 'json', 'csv'].includes(ext(name));
const fileIcon = name => ({ pdf: '📄', txt: '📝', md: '📝', csv: '📊', json: '🗒️' }[ext(name)] || '📎');
const whenTime = iso => { const d = new Date(iso || ''); return isNaN(d) ? '' : d.toLocaleString(LANG === 'zh' ? 'zh-HK' : LANG, { dateStyle: 'medium', timeStyle: 'short' }); };
const when = iso => { const d = new Date(iso || ''); return isNaN(d) ? '' : d.toLocaleDateString(LANG === 'zh' ? 'zh-HK' : LANG, { day: 'numeric', month: 'short', year: 'numeric' }); };
const num = v => Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
// Amounts read like a cook writes them: 1½, ¼, 0.3 -> 0.3.
const FRACTIONS = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];
function amount(v) {
  if (!Number.isFinite(v)) return '';
  const whole = Math.floor(v), rest = v - whole;
  if (rest < 0.02) return String(whole);
  if (v < 10) for (const [x, ch] of FRACTIONS) if (Math.abs(rest - x) < 0.04) return (whole ? whole : '') + ch;
  return String(Math.round(v * (v < 10 ? 10 : 1)) / (v < 10 ? 10 : 1));
}
// An item's name: the collection's `label` field, a file's name (files view), else its first text.
function label(c, it) {
  const named = c.label && it[c.label];
  if (named) return typeof named === 'object' ? shownName(named.file) : String(named);
  const f = c.view !== 'files' && c.fields.find(f => (f.type === 'text' || f.type === 'longtext') && it[f.name]);
  if (f) return String(it[f.name]);
  const ff = fileField(c);
  if (ff && it[ff.name] && it[ff.name].file) return shownName(it[ff.name].file);
  return t('Untitled {what}', { what: word(c) });
}
const itemsOf = async name => (await call(name + '_list', { limit: 200 })).items;
// Collections whose items point here (e.g. a recipe's materials).
const childrenOf = c => M.collections.flatMap(o => o.fields.filter(f => (f.type === 'ref' || f.type === 'refs') && f.ref === c.name).map(f => ({ o, f })));
function fileB64(file) {
  return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = bad; r.readAsDataURL(file); });
}
function textB64(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const MAX_FILE = 9 * 1024 * 1024;   // the relay takes 12 MB per message (base64 makes files a third bigger)

// ---------- page and navigation (#<collection>, #<collection>/<id>, #<collection>/<id>/edit, #<collection>/new) ----------
async function start() {
  try { M = OWNER = await api('/meta'); }
  catch (e) { $('avTitle').textContent = document.title; $('avView').innerHTML = `<div class="note">${esc(e.message)}</div>`; return; }
  const look = M.look || {}, colour = /^#[0-9a-fA-F]{6}$/;
  if (colour.test(look.accent || '')) document.documentElement.style.setProperty('--look-accent', look.accent);
  if (colour.test(look.paper || '')) document.documentElement.style.setProperty('--look-paper', look.paper);
  if (['serif', 'sans', 'rounded'].includes(look.font)) document.body.classList.add('f-' + look.font);
  if (look.icon) { $('avIcon').innerHTML = iconHtml(); $('avIcon').classList.remove('hidden'); }
  if (iconFile()) {
    const l = document.createElement('link'); l.rel = 'icon'; l.href = iconFile(); document.head.appendChild(l);
  }
  pickLang();
  frame();
  if (!M.collections.length) return;
  window.addEventListener('hashchange', () => render().catch(showErr));
  await render();
}
// The page's frame in the current language: name, note, tabs, the language switch.
function frame() {
  $('avTitle').textContent = tn(M.name);
  // The version, small and grey after the name.
  let ver = $('avVer');
  if (!ver && M.version) { ver = document.createElement('span'); ver.id = 'avVer'; ver.className = 'ver'; $('avTitle').after(ver); }
  if (ver) ver.textContent = M.version ? 'v' + M.version : '';
  document.title = tn(M.name);
  $('avNote').innerHTML = M.enabled ? '' : `<div class="note">${esc(t("This application is switched off at the moment, so the assistant can't work on it. You can still look at and change everything here."))}</div>`;
  $('avTabs').innerHTML = M.collections.length > 1 ? M.collections.map(c => `<a href="#${esc(c.name)}" data-tab="${esc(c.name)}">${esc(title(c))}</a>`).join('') : '';
  let sw = $('avLang');
  if (LANGS().length > 1) {
    if (!sw) { sw = document.createElement('div'); sw.id = 'avLang'; sw.className = 'langs'; document.querySelector('header.top').appendChild(sw); }
    sw.innerHTML = LANGS().map(l => `<button type="button" data-lang="${esc(l)}" class="${l === LANG ? 'on' : ''}">${esc(LANG_NAMES[l] || l)}</button>`).join('');
  }
  if (!M.collections.length) $('avView').innerHTML = `<div class="empty"><span class="big">🔒</span>${esc(t('This application is private.'))}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === LANG) return;
  LANG = b.dataset.lang;
  try { localStorage.setItem('kit-lang', LANG); } catch (_) {}
  document.documentElement.lang = LANG === 'zh' ? 'zh-Hant' : LANG;
  frame();
  render().catch(showErr);
});
// The app's icon: a picture file of its pages (a plain name, .png / .svg) or an emoji.
const webFile = (v, exts) => { const i = String(v || ''); return new RegExp(`^[A-Za-z0-9_-][A-Za-z0-9._/-]*\\.(${exts})$`).test(i) && !i.includes('..') ? i : ''; };
function iconFile() { return webFile(M && M.look && M.look.icon, 'png|svg'); }
// An item without a cover picture: the app's default cover, or its first letter on a soft colour.
function noCover(c, it, cls) {
  const f = webFile((M.look || {}).cover, 'png|svg|jpg|jpeg|webp');
  if (f) return `<img class="${cls} defcover" src="${esc(f)}" alt="">`;
  return `<div class="${cls} ph">${esc((String(label(c, it) || '').trim()[0] || '·').toUpperCase())}</div>`;
}
function iconHtml() { return iconFile() ? `<img class="appimg" src="${esc(iconFile())}" alt="">` : esc((M.look || {}).icon || ''); }
function showErr(e) { $('avView').innerHTML = `<div class="note">${esc(e.message)}</div>`; }
function go(hash) { if (location.hash === '#' + hash) render().catch(showErr); else location.hash = hash; }
async function render() {
  clearTimeout(runsT);
  closeModal();
  const [name, id, sub] = decodeURIComponent(location.hash.slice(1)).split('/');
  // A preview uses the visitors' view of the app; anything else the real one.
  const preview = sub === 'preview' && !OWNER.public && (((OWNER.collections.find(x => x.name === name) || {}).public) || []).includes('read');
  const want = preview ? visitorMeta(OWNER) : OWNER;
  if ((M === OWNER) !== (want === OWNER)) { M = want; frame(); }
  const c = coll(name) || M.collections[0];
  document.querySelectorAll('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === c.name));
  if (id === 'new' && c.view !== 'files') return editView(c, null);
  if (id && c.view !== 'files') {
    const it = await call(c.name + '_get', { id: Number(id) }).catch(() => null);
    if (it && preview) { previewNote(c, it); return sheet(c, it); }
    if (it) return sub === 'edit' ? editView(c, it) : sheet(c, it);
  }
  return browse(c);
}

// On top of a preview: what it is, whether visitors can open it yet, and the way back.
function previewNote(c, it) {
  const off = c.publish && it[c.publish.field] !== c.publish.value;
  $('avNote').innerHTML = `<div class="note preview">👁 ${esc(t('Preview - this is how visitors see it on the website.'))}
    ${off ? `<b>${esc(t("It isn't published yet: visitors can't open it until you publish it."))}</b>` : ''}
    <a class="btn small" href="#${esc(c.name)}/${it.id}">${esc(t('← Back to editing'))}</a></div>`;
}

// ---------- browsing a collection ----------
let query = '', queryT = 0, year = '', yearsOf = '';
async function browse(c) {
  const files = c.view === 'files';
  if (yearsOf !== c.name) { year = ''; yearsOf = c.name; }
  $('avView').innerHTML = `<div class="bar"><input type="search" id="q" placeholder="${esc(t('Search {what}', { what: T(c) }))}" value="${esc(query)}">
      ${c.years ? `<select id="yr" title="${esc(t('Year'))}"><option value="">${esc(t('All years'))}</option></select>` : ''}<span class="grow"></span>
      ${!may(c, 'add') ? '' : files ? `<button type="button" class="btn" id="noteBtn">${esc(t('✎ Write a note'))}</button>
        <label class="btn primary">${esc(t('＋ Add files'))}<input type="file" id="upl" multiple hidden></label>`
      : `<button type="button" class="btn primary" id="newBtn">${esc(t('＋ New {what}', { what: word(c) }))}</button>`}</div>
    <div class="err" id="bErr"></div>
    <div id="items" class="${files ? 'folder' : c.view === 'cards' ? 'cards' : 'rows'}"></div>`;
  $('q').addEventListener('input', () => { query = $('q').value.trim(); clearTimeout(queryT); queryT = setTimeout(() => fill(c).catch(showErr), 250); });
  $('yr')?.addEventListener('change', () => { year = $('yr').value; fill(c).catch(showErr); });
  $('newBtn')?.addEventListener('click', () => go(c.name + '/new'));
  if (files && may(c, 'add')) {
    const done = () => fill(c).catch(showErr);
    $('upl').addEventListener('change', e => uploadInto(c, [...e.target.files], null, $('bErr')).then(done));
    $('noteBtn').addEventListener('click', () => noteModal(c, null, done));
    const box = $('items');
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drop'); });
    box.addEventListener('dragleave', () => box.classList.remove('drop'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drop'); uploadInto(c, [...e.dataTransfer.files], null, $('bErr')).then(done); });
  }
  await fill(c);
}
async function fill(c) {
  const args = { limit: 200 };
  if (query) args.query = query;
  if (c.years && year) args.year = year;
  const r = await call(c.name + '_list', args);
  const box = $('items');
  if (!box) return;
  // The year menu: the years there are (the chosen one stays even when nothing is left in it).
  const yr = $('yr');
  if (yr && Array.isArray(r.years)) {
    const ys = [...new Set([...r.years, ...(year ? [year] : [])])].sort().reverse();
    yr.innerHTML = `<option value="">${esc(t('All years'))}</option>` + ys.map(y => `<option value="${esc(y)}" ${y === year ? 'selected' : ''}>${esc(y)}</option>`).join('');
  }
  if (!r.items.length) {
    box.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="big">${iconHtml() || '·'}</span>
      ${esc(query || year ? t('Nothing found.') : t(c.view === 'files' ? 'No {what} yet - add files, or drop them here.' : 'No {what} yet.', { what: T(c) }))}</div>`;
    return;
  }
  if (c.view === 'files') {
    const tf = tagField(c), names = await tagNames(tf);
    box.innerHTML = r.items.map(it => `<button type="button" class="tile" data-file="${it.id}">${thumb(c, it)}
        <div class="fname">${esc(label(c, it))}</div>${tf ? `<div class="tags">${tagChips(tf, it, names)}</div>` : ''}</button>`).join('');
    box.querySelectorAll('[data-file]').forEach(b => b.addEventListener('click', () => {
      const it = r.items.find(x => x.id === Number(b.dataset.file));
      fileModal(c, it, () => fill(c).catch(showErr));
    }));
    return;
  }
  box.innerHTML = r.items.map(it => {
    const cover = c.cover && it[c.cover] && it[c.cover].file;
    return c.view === 'cards'
      ? `<a class="card" href="#${esc(c.name)}/${it.id}">${pubFlag(c, it)}${photoCount(c, it, cover)}${cover ? `<img src="${fileUrl(cover)}" alt="" loading="lazy">` : noCover(c, it, 'cimg')}
          <div class="cbody"><b>${esc(label(c, it))}</b><div class="chips">${chips(c, it)}</div></div></a>`
      : `<a class="rowi" href="#${esc(c.name)}/${it.id}"><b>${esc(label(c, it))}</b><span class="chips">${chips(c, it)}</span>
          <span class="muted">${esc(when(it.updated))}</span></a>`;
  }).join('');
}
// Short facts: choices, numbers (with the field's `unit`), yes/no. On an item's page the scaled base is
// left out (the scale control shows it).
function chips(c, it, page) {
  return c.fields.filter(f => f.name !== c.look && !(page && c.scale && c.scale.base === f.name)).map(f => {
    const v = it[f.name];
    if (v === null || v === undefined || v === '') return '';
    if (c.publish && f.name === c.publish.field) return ''; // shown on the cover instead (pubFlag)
    if (f.auto) return '';                                  // in the footer (itemFoot)
    if (f.type === 'choice') return `<span class="chip">${esc(tn(v))}</span>`;
    if (f.type === 'number' && f.format) return `<span class="chip" title="${esc(ftitle(f))}">${esc(t(f.format, { n: num(v) }))}</span>`;
    if (f.type === 'number') return `<span class="chip">${f.unit ? `${esc(ftitle(f))} ${esc(num(v))} ${esc(tn(f.unit))}` : esc(t('{n} {what}', { n: num(v), what: ftitle(f).toLowerCase() }))}</span>`;
    if (f.type === 'bool') return v ? `<span class="chip">${esc(ftitle(f))}</span>` : '';
    return '';
  }).join('');
}
function thumb(c, it) {
  const ff = fileField(c), n = ff && it[ff.name] && it[ff.name].file;
  return `<div class="thumb">${n && isImg(n) ? `<img src="${fileUrl(n)}" alt="" loading="lazy">` : `<span>${n ? fileIcon(n) : '📎'}</span>`}</div>`;
}
// The items a ref / refs field can point to, as id -> label.
async function tagNames(tf) {
  const t = tf && coll(tf.ref);
  if (!t) return {};
  try { return Object.fromEntries((await itemsOf(t.name)).map(x => [x.id, label(t, x)])); } catch (_) { return {}; }
}
function tagChips(tf, it, names) {
  const on = ids(it[tf.name]).filter(id => names[id] !== undefined);
  return on.length ? on.map(id => `<span class="tag">${esc(names[id])}</span>`).join('') : `<span class="tag none">${esc(t('not used yet'))}</span>`;
}

// ---------- files: add, write a note, look at one, tag it ----------
async function uploadInto(c, files, parentId, errEl) {
  const ff = fileField(c), tf = tagField(c);
  try {
    for (const file of files) {
      if (file.size > MAX_FILE) throw new Error(t('{name} is larger than 9 MB', { name: file.name }));
      const args = { [ff.name]: { name: file.name, media_type: file.type || 'application/octet-stream', data: await fileB64(file) } };
      if (parentId && tf) args[tf.name] = tf.type === 'refs' ? [parentId] : parentId;
      await call(c.name + '_add', args);
    }
  } catch (e) { if (errEl) errEl.textContent = e.message; }
}
function noteModal(c, parentId, after) {
  openModal(`<h3>${esc(t('Write a note'))}</h3><p class="muted" style="margin:0 0 12px">${esc(t('It is kept as a text file with your {what}.', { what: T(c) }))}</p>
    <label class="field"><span>${esc(t('Note'))}</span><textarea id="nText" style="min-height:180px"></textarea></label><div class="err" id="mErr"></div>
    <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button type="button" class="btn primary" id="nSave">${esc(t('Save note'))}</button></div>`);
  $('nText').focus();
  $('nSave').addEventListener('click', async () => {
    const text = $('nText').value.trim();
    if (!text) { $('mErr').textContent = t('Write something first.'); return; }
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `note-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.txt`;
    const ff = fileField(c), tf = tagField(c);
    const args = { [ff.name]: { name, media_type: 'text/plain', data: textB64(text) } };
    if (parentId && tf) args[tf.name] = tf.type === 'refs' ? [parentId] : parentId;
    try { await call(c.name + '_add', args); closeModal(); after(); } catch (e) { $('mErr').textContent = e.message; }
  });
}
async function fileModal(c, it, after) {
  const ff = fileField(c), tf = tagField(c), n = (it[ff.name] && it[ff.name].file) || '';
  const target = tf ? coll(tf.ref) : null;
  const tags = target && may(c, 'change');
  const opts = tags ? await itemsOf(target.name).catch(() => []) : [];
  const cur = tf ? ids(it[tf.name]) : [];
  openModal(`<h3>${esc(label(c, it))}</h3><span class="muted">${esc(t('Added {when}', { when: when(it.created) }))}</span>
    <div class="preview" id="pv">${n && isImg(n) ? `<img src="${fileUrl(n)}" alt="">` : `<div class="big">${n ? fileIcon(n) : '📎'}</div>`}</div>
    ${tags ? `<h4>${esc(t('Use it for'))}</h4><div class="checks">${opts.map(o => `<label class="check"><input type="${tf.type === 'refs' ? 'checkbox' : 'radio'}" name="tg" value="${o.id}" ${cur.includes(o.id) ? 'checked' : ''}> ${esc(label(target, o))}</label>`).join('')
      || `<span class="muted">${esc(t('No {what} yet.', { what: T(target) }))}</span>`}</div>` : ''}
    <div class="err" id="mErr"></div>
    <div class="actions spread"><div>${may(c, 'delete') ? `<button type="button" class="btn danger" id="fDel">${esc(t('Delete'))}</button>` : ''}
        ${n ? `<a class="btn" href="${fileUrl(n)}" download="${esc(shownName(n))}">${esc(t('Download'))}</a>` : ''}</div>
      <div><button type="button" class="btn" data-close>${esc(t('Close'))}</button>${tags ? `<button type="button" class="btn primary" id="fSave">${esc(t('Save'))}</button>` : ''}</div></div>`);
  if (n && isText(n)) {
    fetch(fileUrl(n), { credentials: 'same-origin' }).then(r => r.ok ? r.text() : '').then(t => {
      const pv = $('pv'); if (!pv || !t) return;
      const pre = document.createElement('pre'); pre.textContent = t.slice(0, 20000); pv.replaceChildren(pre);
    }).catch(() => {});
  }
  $('fSave')?.addEventListener('click', async () => {
    const on = [...document.querySelectorAll('#modal [name=tg]:checked')].map(x => Number(x.value));
    try { await call(c.name + '_update', { id: it.id, [tf.name]: tf.type === 'refs' ? on : (on[0] ?? null) }); closeModal(); after(); }
    catch (e) { $('mErr').textContent = e.message; }
  });
  if ($('fDel')) armed($('fDel'), t('Really delete?'), async () => { await call(c.name + '_delete', { id: it.id }); closeModal(); after(); });
}
// Choose which items of `o` (e.g. materials) belong to `parent` (a recipe); new files can be added here too.
async function pickModal(c, parent, o, f, after) {
  const all = await itemsOf(o.name);
  const has = x => ids(x[f.name]).includes(parent.id);
  const files = o.view === 'files';
  openModal(`<h3>${esc(t('{what} for “{name}”', { what: title(o), name: label(c, parent) }))}</h3><p class="muted" style="margin:0">${esc(t('Tick the ones that belong here.'))}</p>
    <div class="${files ? 'folder pick' : 'checks'}" style="margin:12px 0">${all.map(x => files
      ? `<label class="tile ${has(x) ? 'on' : ''}"><input type="checkbox" value="${x.id}" ${has(x) ? 'checked' : ''}>${thumb(o, x)}<div class="fname">${esc(label(o, x))}</div></label>`
      : `<label class="check"><input type="checkbox" value="${x.id}" ${has(x) ? 'checked' : ''}> ${esc(label(o, x))}</label>`).join('')
      || `<p class="muted">${esc(t(files ? 'No {what} yet - add files below.' : 'No {what} yet.', { what: T(o) }))}</p>`}</div>
    ${files ? `<div class="row"><label class="btn small">${esc(t('＋ Add new files'))}<input type="file" id="pUpl" multiple hidden></label>
      <button type="button" class="btn small" id="pNote">${esc(t('✎ Write a note'))}</button></div>` : ''}
    <div class="err" id="mErr"></div>
    <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button type="button" class="btn primary" id="pSave">${esc(t('Done'))}</button></div>`);
  document.querySelectorAll('#modal .tile input').forEach(x => x.addEventListener('change', () => x.closest('.tile').classList.toggle('on', x.checked)));
  const again = () => pickModal(c, parent, o, f, after);
  $('pUpl')?.addEventListener('change', async e => { await uploadInto(o, [...e.target.files], parent.id, $('mErr')); if (!$('mErr').textContent) again(); });
  $('pNote')?.addEventListener('click', () => noteModal(o, parent.id, again));
  $('pSave').addEventListener('click', async () => {
    try {
      for (const box of document.querySelectorAll('#modal input[type=checkbox]')) {
        const x = all.find(y => y.id === Number(box.value));
        if (!x || box.checked === has(x)) continue;
        const now = ids(x[f.name]).filter(id => id !== parent.id);
        const value = f.type === 'refs' ? (box.checked ? [...now, parent.id] : now) : (box.checked ? parent.id : null);
        await call(o.name + '_update', { id: x.id, [f.name]: value });
      }
      closeModal(); after();
    } catch (e) { $('mErr').textContent = e.message; }
  });
}

// ---------- one item: reading it ----------
// An amount someone types: 2, 1.5, 1,5, 1/2, 1 1/2, ½, 1½ (NaN when it isn't one).
function parseAmount(v) {
  const x = String(v ?? '').trim().replace(',', '.').replace(/[½¼¾⅓⅔]/g, ch => ' ' + { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3' }[ch]).trim();
  const m = /^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/.exec(x);
  if (!m || (!m[1] && !m[2])) return NaN;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}
let factor = 1;   // scaling of the open item's amounts (collection `scale`), display only
function tableSection(c, f, v, h) {
  const cols = f.columns || [];
  const txt = cols.filter(col => !col.type || col.type === 'text'), nums = cols.filter(col => col.type === 'number'), imgs = cols.filter(col => col.type === 'image');
  const scaled = scaledTables(c).includes(f.name);
  if (f.numbered) {
    return `<section>${h}<ol class="steps">${v.map(r => `<li><span>${esc(txt.map(col => r[col.name]).filter(Boolean).join(' · '))}
      ${imgs.map(col => fileOf(r[col.name]) ? `<img class="stepimg" src="${fileUrl(fileOf(r[col.name]))}" alt="" loading="lazy">` : '').join('')}</span></li>`).join('')}</ol></section>`;
  }
  // A row: bold lead (the amount and, after it, the first text column - e.g. "2 tbsp"), then the rest.
  const numCol = nums[0];
  const leadCols = numCol ? txt.slice(0, 1) : [];
  const restCols = numCol ? txt.slice(1) : txt.slice(1);
  return `<section>${h}<ul class="ingr">${v.map((r, i) => {
    const n = numCol ? r[numCol.name] : undefined;
    const lead = numCol ? [Number.isFinite(n) ? amount(scaled ? n * factor : n) : '', ...leadCols.map(col => r[col.name] || '')].filter(Boolean).join(' ')
      : (txt[0] ? r[txt[0].name] || '' : '');
    const rest = restCols.map(col => r[col.name]).filter(Boolean).join(' · ');
    const pic = imgs.map(col => fileOf(r[col.name])).find(Boolean);
    const tap = scaled && Number.isFinite(n) ? ` data-scale="${esc(f.name)}|${i}" title="${esc(t('change this amount - the others follow'))}"` : '';
    return `<li>${pic ? `<img class="ingimg" src="${fileUrl(pic)}" alt="" loading="lazy">` : ''}${lead ? `<b${tap}>${esc(lead)}</b>` : ''}${esc(rest)}</li>`;
  }).join('')}</ul></section>`;
}
function section(c, f, v) {
  const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
  if (empty) return '';
  const h = `<h3>${esc(ftitle(f))}</h3>`;
  switch (f.type) {
    case 'table': return tableSection(c, f, v, h);
    case 'list': return `<section>${h}<ol class="${f.numbered ? 'steps' : 'bullets'}">${v.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ol></section>`;
    case 'longtext': return `<section>${h}<p class="prose">${esc(v)}</p></section>`;
    case 'text': return `<section>${h}<p class="prose">${/^https?:\/\/\S+$/i.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v)}</p></section>`;
    case 'image': return v.file ? `<section>${h}<img class="heroimg" style="max-width:420px" src="${fileUrl(v.file)}" alt=""></section>` : '';
    case 'images': {
      viewSets[f.name] = v.map(x => x.file);
      return `<section>${h}<div class="gallery${c.album === f.name ? ' album' : ''}">${v.map((x, i) => `<button type="button" data-view="${i}" data-set="${esc(f.name)}" title="${esc(t('Show the photos'))}"><img src="${fileUrl(x.file)}" alt="" loading="lazy"></button>`).join('')}</div></section>`;
    }
    case 'file': return v.file ? `<section>${h}<a class="btn small" href="${fileUrl(v.file)}" download="${esc(shownName(v.file))}">${fileIcon(v.file)} ${esc(shownName(v.file))}</a></section>` : '';
    case 'json': return `<section>${h}<pre class="json">${esc(JSON.stringify(v, null, 2))}</pre></section>`;
    default: return '';
  }
}
// The scale control: the base value (e.g. servings) with − / +; amounts follow (display only).
// The tables whose amounts follow the base: `scale.table` is one table's name or a list of them.
const scaledTables = c => (c.scale ? [c.scale.table].flat().filter(Boolean) : []);
function scaleBar(c, it) {
  const s = c.scale; if (!s) return '';
  const base = Number(it[s.base]); const bf = c.fields.find(f => f.name === s.base);
  if (!Number.isFinite(base) || base <= 0) return '';
  return `<div class="scale"><span class="muted">${esc(bf ? ftitle(bf) : s.base)}</span><button type="button" class="btn small" data-sc="-">−</button>
    <b id="scBase">${esc(amount(base * factor))}</b><button type="button" class="btn small" data-sc="+">＋</button>
    ${factor !== 1 ? `<button type="button" class="btn small ghost" data-sc="0">${esc(t('reset'))}</button>` : ''}</div>`;
}
let runsT = 0;
async function sheet(c, it, keep) {
  if (!keep) factor = 1;
  const lf = labelField(c);
  const coverName = c.cover || (c.fields.find(f => f.type === 'image') || {}).name;
  const cover = coverName && it[coverName] && it[coverName].file;
  const acts = (M.actions || []).filter(a => a.on === c.name && a.runnable);
  const refs = c.fields.filter(f => f.type === 'ref' || f.type === 'refs');
  const refNames = {};
  for (const f of refs) refNames[f.name] = await tagNames(f);
  viewSets = {};
  // The tables that follow the servings (e.g. ingredients, seasonings) stay together in one block (.scaled),
  // where the first of them is.
  const shownFields = c.fields.filter(f => f !== lf && f.name !== coverName && !['choice', 'number', 'bool', 'ref', 'refs'].includes(f.type));
  const st = scaledTables(c), scaledHtml = shownFields.filter(f => st.includes(f.name)).map(f => section(c, f, it[f.name])).join('');
  let grouped = false;
  const body = shownFields.map(f => {
    if (!st.includes(f.name)) return section(c, f, it[f.name]);
    if (grouped || !scaledHtml) return '';
    grouped = true;
    return `<div class="scaled">${scaledHtml}</div>`;
  }).join('');
  const kids = childrenOf(c);
  const album = albumOf(c, it);
  viewSets._all = cover ? [cover, ...album] : album;
  const heroPic = cover ? `<img class="heroimg" src="${fileUrl(cover)}" alt="">` : noCover(c, it, 'heroimg');
  $('avView').innerHTML = `<a class="back" href="#${esc(c.name)}">${esc(t('← All {what}', { what: T(c) }))}</a>
    <article class="sheet${c.look && it[c.look] ? ' look-' + esc(String(it[c.look]).toLowerCase().replace(/[^a-z0-9-]/g, '-')) : ''}">
      <div class="hero"><div class="coverbox">${pubFlag(c, it)}${viewSets._all.length > 1
        ? `<button type="button" class="coverbtn" data-view="0" data-set="_all" title="${esc(t('Show the photos'))}">${heroPic}${photoCount(c, it, cover)}</button>` : heroPic}</div>
        <div class="hinfo"><h2>${esc(label(c, it))}</h2><div class="chips">${chips(c, it, true)}</div>${scaleBar(c, it)}
          ${refs.map(f => ids(it[f.name]).length ? `<div class="refs"><span class="muted">${esc(ftitle(f))}:</span> ${ids(it[f.name]).map(id =>
            `<a class="chip" href="#${esc(f.ref)}/${id}">${esc(refNames[f.name][id] ?? '?')}</a>`).join(' ')}</div>` : '').join('')}
          <div class="acts">${acts.map(a => `<button type="button" class="btn primary" data-act="${esc(a.name)}">✨ ${esc(tn(a.title || a.name))}</button>`).join('')}
            ${may(c, 'change') ? `<button type="button" class="btn" id="editBtn">${esc(t('Edit'))}</button>` : ''}${pubBtn(c, it)}
            ${!M.public && (c.public || []).includes('read') ? `<a class="btn" href="#${esc(c.name)}/${it.id}/preview" title="${esc(t('how visitors see it on the website'))}">${esc(t('👁 Preview'))}</a>` : ''}</div>
          <div id="runs"></div><div class="err" id="sErr"></div></div></div>
      ${body || `<p class="muted">${esc(t('Nothing written here yet.'))}${acts.length ? esc(t(' Press “{action}” and the assistant fills it in.', { action: tn(acts[0].title || acts[0].name) })) : ''}</p>`}
      ${kids.map(({ o, f }) => `<section><div class="shead"><h3>${esc(title(o))}</h3>
          ${may(o, 'change') ? `<button type="button" class="btn small" data-pick="${esc(o.name)}|${esc(f.name)}">${esc(t('＋ Add {what}', { what: T(o) }))}</button>` : ''}</div>
        <div id="kids_${esc(o.name)}" class="${o.view === 'files' ? 'folder mini' : 'checks'}"><span class="muted">…</span></div></section>`).join('')}
      ${itemFoot(c, it)}
    </article>`;
  $('editBtn')?.addEventListener('click', () => go(`${c.name}/${it.id}/edit`));
  $('pubBtn')?.addEventListener('click', () => publish(c, it));
  // Scaling: − / + on the base value, or a new amount for one ingredient (the others follow).
  const base = c.scale ? Number(it[c.scale.base]) : 0;
  document.querySelectorAll('[data-sc]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.sc, cur = base * factor;
    const next = k === '0' ? base : Math.max(1, k === '+' ? Math.floor(cur) + 1 : Math.ceil(cur) - 1);
    factor = next / base; sheet(c, it, true);
  }));
  document.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => {
    const [table, row] = b.dataset.scale.split('|');
    const f = c.fields.find(x => x.name === table), col = (f.columns || []).find(x => x.type === 'number');
    const was = it[f.name][Number(row)][col.name];
    // Its name: the text column after the one that follows the amount (e.g. amount, unit, NAME, note).
    const texts = (f.columns || []).filter(x => !x.type || x.type === 'text'), nameCol = texts[1] || texts[0];
    const what = nameCol ? it[f.name][Number(row)][nameCol.name] || '' : '';
    if (!(was > 0)) return;
    const now = amount(was * factor);
    openModal(`<h3>${esc(t('How much {what}?', { what }))}</h3><p class="muted" style="margin:0 0 12px">${esc(t('Now {n}. The other amounts follow.', { n: now }))}</p>
      <label class="field"><span>${esc(t('Amount'))}</span><input id="scAmt" inputmode="decimal" autocomplete="off" value="${esc(now)}"></label><div class="err" id="mErr"></div>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button type="button" class="btn primary" id="scOk">${esc(t('OK'))}</button></div>`);
    const input = $('scAmt');
    input.focus(); input.select();
    const ok = () => {
      const n = parseAmount(input.value);
      if (!Number.isFinite(n) || n <= 0) { $('mErr').textContent = t('Write an amount, e.g. 2 or 1.5'); return; }
      factor = n / was; closeModal(); sheet(c, it, true);
    };
    $('scOk').addEventListener('click', ok);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  }));
  const start = async (b, extra) => {
    b.disabled = true;
    try { await api('/action', { method: 'POST', body: JSON.stringify({ action: b.dataset.act, item: it.id, extra }) }); $('runs').dataset.w = '1'; }
    catch (e) { $('sErr').textContent = e.message; b.disabled = false; }
    runs(c, it.id);
  };
  // An action with `ask` first asks for optional extra requirements (Cancel: nothing is sent).
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = acts.find(x => x.name === b.dataset.act);
    if (!a || !a.ask) return start(b, '');
    openModal(`<h3>${esc(tn(a.ask.title || a.title || a.name))}</h3>${a.ask.hint ? `<p class="muted" style="margin:0 0 12px">${esc(tn(a.ask.hint))}</p>` : ''}
      <label class="field"><span>${esc(t('Extra requirements (optional)'))}</span><textarea id="aExtra" maxlength="4000" style="min-height:140px"></textarea></label>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button type="button" class="btn primary" id="aGo">${esc(t('✨ Send to the assistant'))}</button></div>`);
    $('aExtra').focus();
    $('aGo').addEventListener('click', () => { const extra = $('aExtra').value.trim(); closeModal(); start(b, extra); });
  }));
  const reload = async () => { const fresh = await call(c.name + '_get', { id: it.id }).catch(() => null); if (fresh) sheet(c, fresh); };
  document.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    const [o, f] = b.dataset.pick.split('|');
    pickModal(c, it, coll(o), coll(o).fields.find(x => x.name === f), reload);
  }));
  for (const { o, f } of kids) {
    call(o.name + '_list', { [f.name]: it.id, limit: 200 }).then(r => {
      const el = $('kids_' + o.name);
      if (!el) return;
      if (!r.items.length) { el.innerHTML = `<span class="muted">${esc(t('None yet.'))}</span>`; return; }
      el.innerHTML = r.items.map(x => o.view === 'files'
        ? `<button type="button" class="tile" data-kid="${x.id}">${thumb(o, x)}<div class="fname">${esc(label(o, x))}</div></button>`
        : `<a class="chip" href="#${esc(o.name)}/${x.id}">${esc(label(o, x))}</a>`).join('');
      el.querySelectorAll('[data-kid]').forEach(b => b.addEventListener('click', () => fileModal(o, r.items.find(x => x.id === Number(b.dataset.kid)), reload)));
    }).catch(() => {});
  }
  if (acts.length) runs(c, it.id);
}
// The quiet footer at the end of an item's page: its `auto` fields (e.g. "v3") and, with `dates`,
// "Created … · Updated …".
function itemFoot(c, it) {
  const parts = c.fields.filter(f => f.auto && it[f.name] !== undefined && it[f.name] !== null && it[f.name] !== '')
    .map(f => f.format ? t(f.format, { n: num(it[f.name]) }) : `${ftitle(f)} ${it[f.name]}`);
  if (c.dates && it.created) {
    parts.push(t('Created {when}', { when: whenTime(it.created) }));
    if (it.updated && it.updated !== it.created) parts.push(t('Updated {when}', { when: whenTime(it.updated) }));
  }
  return parts.length ? `<footer class="itemfoot">${esc(parts.join(' · '))}</footer>` : '';
}
// ---------- photos: the album and the viewer ----------
let viewSets = {};   // the open item's photo lists (file names) by set: an images field, or _all = cover + album
const albumOf = (c, it) => (c.album && Array.isArray(it[c.album]) ? it[c.album].map(x => x && x.file).filter(Boolean) : []);
// "📷 N" on a cover when the item has more photos than the cover.
function photoCount(c, it, cover) {
  const n = albumOf(c, it).length + (cover ? 1 : 0);
  return n > 1 ? `<span class="photocount">📷 ${esc(t('{n} photos', { n }))}</span>` : '';
}
function viewer(files, at) {
  if (!files || !files.length) return;
  let i = Math.max(0, Math.min(at, files.length - 1));
  const box = document.createElement('div');
  box.className = 'lightbox';
  const many = files.length > 1;
  box.innerHTML = `<img alt=""><div class="lbbar">${many ? `<button type="button" data-lb="-1" title="${esc(t('Previous'))}">‹</button><span class="lbn"></span><button type="button" data-lb="1" title="${esc(t('Next'))}">›</button>` : ''}
    <button type="button" data-lb="x" title="${esc(t('Close'))}">✕</button></div>`;
  const show = () => { box.querySelector('img').src = fileUrl(files[i]); const n = box.querySelector('.lbn'); if (n) n.textContent = `${i + 1} / ${files.length}`; };
  const close = () => { box.remove(); document.removeEventListener('keydown', key); };
  const step = d => { i = (i + d + files.length) % files.length; show(); };
  const key = e => { if (e.key === 'Escape') close(); else if (many && e.key === 'ArrowLeft') step(-1); else if (many && e.key === 'ArrowRight') step(1); };
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-lb]');
    if (b) return b.dataset.lb === 'x' ? close() : step(Number(b.dataset.lb));
    if (e.target === box) close();
  });
  document.addEventListener('keydown', key);
  document.body.appendChild(box);
  show();
}
$('avView').addEventListener('click', e => {
  const b = e.target.closest('[data-view]');
  if (b) viewer(viewSets[b.dataset.set], Number(b.dataset.view));
});
// Not published: a flag on the cover's top right corner (published items need no mark; visitors never see it).
function pubFlag(c, it) {
  if (!c.publish || M.public || it[c.publish.field] === c.publish.value) return '';
  return `<span class="pubflag" title="${esc(t('only you see it - not on the website'))}">${esc(t('Unpublished'))}</span>`;
}
// Publish / Unpublish (a collection with `publish`, the owner only). The other choice of the field is "not published".
function pubBtn(c, it) {
  if (!c.publish || M.public || !may(c, 'change')) return '';
  const on = it[c.publish.field] === c.publish.value;
  return `<button type="button" class="btn${on ? '' : ' pubgo'}" id="pubBtn">${esc(t(on ? 'Unpublish' : '🌐 Publish'))}</button>`;
}
function publish(c, it) {
  const p = c.publish, f = c.fields.find(x => x.name === p.field) || {};
  const on = it[p.field] === p.value;
  const off = (f.choices || []).find(x => x !== p.value) || null;
  const set = async () => {
    await call(c.name + '_update', { id: it.id, [p.field]: on ? off : p.value });
    closeModal();
    const fresh = await call(c.name + '_get', { id: it.id }); sheet(c, fresh);
  };
  openModal(on
    ? `<h3>${esc(t('Unpublish “{name}”?', { name: label(c, it) }))}</h3><p>${esc(t("It is taken off the website at once: visitors can't open it any more (pages they already have open keep what they show). It stays here, and you can publish it again."))}</p>`
    : `<h3>${esc(t('Publish “{name}”?', { name: label(c, it) }))}</h3><p>${esc(t("Visitors of this application's website can then read it, with its pictures. Your materials stay private. (Nothing is public while the website itself isn't published - BotGateway → Dashboard.)"))}</p>`
    + `<div class="err" id="mErr"></div><div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button type="button" class="btn primary" id="pubGo">${esc(t(on ? 'Unpublish' : 'Publish'))}</button></div>`);
  $('pubGo').addEventListener('click', async () => { $('pubGo').disabled = true; try { await set(); } catch (e) { $('mErr').textContent = e.message; $('pubGo').disabled = false; } });
}
// The item's latest assistant action; while it works, asks again every 2 s and shows the result.
async function runs(c, id) {
  clearTimeout(runsT);
  const el = $('runs');
  if (!el) return;
  let list = [];
  try { list = await api(`/runs?collection=${encodeURIComponent(c.name)}&item=${id}`); } catch (_) { return; }
  const r = list[0];
  if (!r) { el.innerHTML = ''; return; }
  const a = (M.actions || []).find(x => x.name === r.action), name = a ? tn(a.title || a.name) : r.action;
  const waiting = r.state === 'waiting';
  // While the assistant works on it, nothing of it can change (the server refuses it too).
  document.querySelectorAll('[data-act], #editBtn, [data-pick], [data-kid]').forEach(b => { b.disabled = waiting; });
  el.innerHTML = waiting ? `<div class="run wait"><span class="spin"></span>${esc(t("{action}: the assistant is working on it… it can't be changed until then.", { action: name }))}
      ${M.public ? '' : `<button type="button" class="btn small ghost" id="runCancel">${esc(t('Cancel'))}</button>`}</div>`
    : r.state === 'done' ? `<div class="run ok">✓ ${esc(name)} · ${esc(when(r.finished))}</div>`
    : r.state === 'cancelled' ? `<div class="run">${esc(t('{action} was cancelled', { action: name }))} · ${esc(when(r.finished))}</div>`
    : `<div class="run bad">${esc(t("{action} didn't work", { action: name }))}${r.error ? ': ' + esc(t(r.error)) : ''}</div>`;
  $('runCancel')?.addEventListener('click', async () => {
    try { await api('/cancel', { method: 'POST', body: JSON.stringify({ collection: c.name, item: id }) }); } catch (e) { $('sErr').textContent = e.message; }
    el.dataset.w = ''; runs(c, id);
  });
  if (waiting) { el.dataset.w = '1'; runsT = setTimeout(() => runs(c, id), 2000); return; }
  if (el.dataset.w === '1' && location.hash === `#${c.name}/${id}`) {
    el.dataset.w = '';
    const fresh = await call(c.name + '_get', { id }).catch(() => null);
    if (fresh) sheet(c, fresh);
  }
}

// ---------- one item: the form (new: it = null) ----------
let formRow = () => {};   // adds an empty line to a table field of the open form
$('avView').addEventListener('click', e => {
  const add = e.target.closest('[data-addrow]');
  if (add) return formRow(add.dataset.addrow);
  const del = e.target.closest('[data-delrow]');
  if (del) del.closest('.trow').remove();
});
async function editView(c, it) {
  clearTimeout(runsT);
  const opts = {};
  for (const f of c.fields.filter(f => (f.type === 'ref' || f.type === 'refs') && coll(f.ref))) opts[f.name] = { t: coll(f.ref), items: await itemsOf(f.ref).catch(() => []) };
  const v = f => it ? it[f.name] : undefined;
  const cell = (col, r) => {
    const x = r ? r[col.name] : undefined, ph = esc(ftitle(col));
    if (col.type === 'number') return `<input type="number" step="any" class="num" data-col="${esc(col.name)}" placeholder="${ph}" value="${x ?? ''}">`;
    if (col.type === 'image') return `<label class="cellimg" title="${ph}">${fileOf(x) ? `<img src="${fileUrl(fileOf(x))}" alt="">` : '🖼'}
      <input type="file" accept="image/*" hidden data-col="${esc(col.name)}" data-keep="${esc(fileOf(x) || '')}"></label>`;
    return `<input data-col="${esc(col.name)}" placeholder="${ph}" value="${esc(x || '')}">`;
  };
  const trow = (f, r) => `<div class="trow${f.numbered ? ' long' : ''}">${(f.columns || []).map(col => cell(col, r)).join('')}
      <button type="button" class="btn small ghost" data-delrow title="${esc(t('remove'))}">×</button></div>`;
  const input = f => {
    const id = 'f_' + f.name, x = v(f), lab = `<span>${esc(ftitle(f))}${f.required ? ' *' : ''}</span>`;
    if (f.auto) return '';   // kept by the program
    if ((f.type === 'ref' || f.type === 'refs') && !opts[f.name]) return '';   // points to something visitors can't see
    switch (f.type) {
      case 'longtext': return `<label class="field">${lab}<textarea id="${id}">${esc(x || '')}</textarea></label>`;
      case 'json': return `<label class="field">${lab}<textarea id="${id}" class="mono" spellcheck="false">${esc(x === undefined || x === null ? '' : JSON.stringify(x, null, 2))}</textarea></label>`;
      case 'list': return `<label class="field">${lab}<textarea id="${id}" style="min-height:150px">${esc(ids(x).join('\n'))}</textarea><span class="hint">${esc(t('One per line.'))}</span></label>`;
      case 'table': return `<div class="field">${lab}<div class="tbled" id="${id}">${(Array.isArray(x) && x.length ? x : [{}]).map(r => trow(f, r)).join('')}</div>
          <div><button type="button" class="btn small" data-addrow="${esc(f.name)}">${esc(t('＋ Add a line'))}</button></div></div>`;
      case 'number': return `<label class="field">${lab}<input type="number" id="${id}" value="${x ?? ''}" step="any"></label>`;
      case 'bool': return `<label class="check field"><input type="checkbox" id="${id}" ${x ? 'checked' : ''}> ${esc(ftitle(f))}</label>`;
      case 'choice': return `<label class="field">${lab}<select id="${id}"><option value=""></option>${f.choices.map(o => `<option value="${esc(o)}" ${o === x ? 'selected' : ''}>${esc(tn(o))}</option>`).join('')}</select></label>`;
      case 'ref': return `<label class="field">${lab}<select id="${id}"><option value=""></option>${opts[f.name].items.map(r => `<option value="${r.id}" ${r.id === x ? 'selected' : ''}>${esc(label(opts[f.name].t, r))}</option>`).join('')}</select></label>`;
      case 'refs': return `<div class="field">${lab}<div class="checks" id="${id}">${opts[f.name].items.map(r => `<label class="check"><input type="checkbox" value="${r.id}" ${ids(x).includes(r.id) ? 'checked' : ''}> ${esc(label(opts[f.name].t, r))}</label>`).join('')
          || `<span class="muted">${esc(t('Nothing to choose yet.'))}</span>`}</div></div>`;
      case 'images': return `<div class="field">${lab}<div class="gallery edit" id="${id}">${ids(x).map(p => `<label class="keep"><img src="${fileUrl(p.file)}" alt="">
          <span><input type="checkbox" checked data-keep="${esc(p.file)}"> ${esc(t('keep'))}</span></label>`).join('')}</div><input type="file" accept="image/*" multiple id="${id}_new"></div>`;
      case 'image': case 'file': return `<label class="field">${lab}<div class="filepick">${x && x.file ? (f.type === 'image' && isImg(x.file) ? `<img src="${fileUrl(x.file)}" alt="">` : `<span>${fileIcon(x.file)} ${esc(shownName(x.file))}</span>`) : ''}
          <input type="file" id="${id}" ${f.type === 'image' ? 'accept="image/*"' : ''}></div></label>`;
      default: return `<label class="field">${lab}<input id="${id}" value="${esc(x || '')}"></label>`;
    }
  };
  $('avView').innerHTML = `<a class="back" href="#${esc(c.name)}${it ? '/' + it.id : ''}">${esc(it ? t('← Back') : t('← All {what}', { what: T(c) }))}</a>
    <article class="sheet"><h2 style="margin:0 0 18px;font:600 26px/1.2 var(--font)">${esc(it ? t('Edit {name}', { name: label(c, it) }) : t('New {what}', { what: word(c) }))}</h2>
      ${c.fields.map(input).join('')}
      <div class="err" id="fErr"></div>
      <div class="formfoot"><div>${it && may(c, 'delete') ? `<button type="button" class="btn danger" id="fDel">${esc(t('Delete {what}', { what: word(c) }))}</button>` : ''}</div>
        <div><a class="btn" href="#${esc(c.name)}${it ? '/' + it.id : ''}">${esc(t('Cancel'))}</a><button type="button" class="btn primary" id="fSave">${esc(t(it ? 'Save' : 'Add'))}</button></div></div>
    </article>`;
  formRow = name => { const f = c.fields.find(x => x.name === name); $('f_' + f.name).insertAdjacentHTML('beforeend', trow(f, {})); };
  // Deleting: the first click says what goes with it (e.g. materials used only here) and what is kept.
  const del = $('fDel');
  del?.addEventListener('click', async () => {
    if (!del.classList.contains('armed')) {
      let extra = '';
      try {
        const p = await call(c.name + '_delete', { id: it.id, preview: true });
        const count = l => Object.entries(l.reduce((m, x) => ({ ...m, [x.collection]: (m[x.collection] || 0) + 1 }), {}))
          .map(([n, k]) => { const o = coll(n) || { name: n }; return t('count {n} {what}', { n: k, what: k === 1 ? word(o) : T(o) }); }).join(', ');
        extra = [p.also.length ? t('also deletes {list} used only here', { list: count(p.also) }) : '', p.kept.length ? t('keeps {list} also used elsewhere', { list: count(p.kept) }) : ''].filter(Boolean).join('; ');
      } catch (e) { $('fErr').textContent = e.message; return; }
      del.classList.add('armed'); del.textContent = t('Really delete?{extra} Click again', { extra: extra ? ` (${extra})` : '' }); return;
    }
    del.disabled = true;
    try { await call(c.name + '_delete', { id: it.id }); go(c.name); } catch (e) { $('fErr').textContent = e.message; del.disabled = false; }
  });
  $('fSave').addEventListener('click', async () => {
    const args = it ? { id: it.id } : {};
    try {
      for (const f of c.fields) {
        const el = $('f_' + f.name), put = val => { if (val !== null || it) args[f.name] = val; };
        if (!el) continue;
        switch (f.type) {
          case 'bool': args[f.name] = el.checked; continue;
          case 'image': case 'file': {
            const file = el.files[0]; if (!file) continue;
            if (file.size > MAX_FILE) throw new Error(t('{name} is larger than 9 MB', { name: file.name }));
            args[f.name] = { name: file.name, media_type: file.type || 'application/octet-stream', data: await fileB64(file) }; continue;
          }
          case 'refs': args[f.name] = [...el.querySelectorAll('input:checked')].map(x => Number(x.value)); continue;
          case 'images': {
            const kept = [...el.querySelectorAll('[data-keep]:checked')].map(x => ({ file: x.dataset.keep }));
            const added = [];
            for (const file of $('f_' + f.name + '_new').files) {
              if (file.size > MAX_FILE) throw new Error(t('{name} is larger than 9 MB', { name: file.name }));
              added.push({ name: file.name, media_type: file.type || 'application/octet-stream', data: await fileB64(file) });
            }
            args[f.name] = [...kept, ...added]; continue;
          }
          case 'list': { const l = el.value.split('\n').map(s => s.trim()).filter(Boolean); put(l.length ? l : null); continue; }
          case 'table': {
            const rows = [];
            for (const tr of el.querySelectorAll('.trow')) {
              const r = {};
              for (const i of tr.querySelectorAll('[data-col]')) {
                if (i.type === 'file') {
                  const file = i.files[0];
                  if (file) {
                    if (file.size > MAX_FILE) throw new Error(t('{name} is larger than 9 MB', { name: file.name }));
                    r[i.dataset.col] = { name: file.name, media_type: file.type || 'application/octet-stream', data: await fileB64(file) };
                  } else if (i.dataset.keep) r[i.dataset.col] = { file: i.dataset.keep };
                } else if (i.value.trim() !== '') r[i.dataset.col] = i.type === 'number' ? Number(i.value) : i.value.trim();
              }
              if (Object.keys(r).length) rows.push(r);
            }
            put(rows.length ? rows : null); continue;
          }
        }
        const raw = el.value;
        if (raw.trim() === '') { put(null); continue; }
        if (f.type === 'number' || f.type === 'ref') args[f.name] = Number(raw);
        else if (f.type === 'json') { try { args[f.name] = JSON.parse(raw); } catch (_) { throw new Error(t('{what}: not valid JSON', { what: ftitle(f) })); } }
        else args[f.name] = raw;
      }
      for (const f of c.fields) if (f.required && (it ? args[f.name] === null : args[f.name] === undefined || args[f.name] === null)) throw new Error(t('{what} is needed', { what: ftitle(f) }));
      const saved = await call(c.name + (it ? '_update' : '_add'), args);
      go(c.name + '/' + saved.id);
    } catch (e) { $('fErr').textContent = e.message; }
  });
}

start().catch(showErr);
