// App kit - page part (botgateway-packages/kit; copy kit/web/ into a package's web/kit/). The page of an
// application built with kit/server.js: the owner's local page (127.0.0.1) and its website (visitors get
// only what the collections' `public` allow - `M.public`). It talks only to its own api/ (relative
// addresses: the local page lives under /apps/<gateway>/<app>/, the website at /). Every change sends the
// x-botgateway header (the gateway's CSRF check). Looks: the app's `look` (colours, font, icon), each
// collection's view (list, cards, files), a collection's `look` field (class look-<value> on an item's
// page, styled by the app's own CSS) and `scale` (amounts that follow a base value, display only).
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const APP_ID = '';
const API = 'api';
async function api(path, opts = {}) {
  let res;
  // No answer at all (an old page from the browser's cache, the website switched off, the owner's computer offline).
  try { res = await fetch(API + path, { ...opts, credentials: 'same-origin', headers: { 'x-botgateway': '1', 'Content-Type': 'application/json', ...(opts.headers || {}) } }); }
  catch (_) { throw new Error('Can\'t reach this application right now - it may be switched off, or its computer is offline or restarting. Try again later (reload the page).'); }
  if (res.status === 401) throw new Error('This page\'s session ended - open the application again from the BotGateway app (left, under Applications).');
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

let M = null;   // the application: collections, actions, look
const call = (op, args) => api('/call', { method: 'POST', body: JSON.stringify({ op, arguments: args || {} }) });
const coll = name => M.collections.find(c => c.name === name);
// On the application's public website only what the package opens to visitors (`public`); the owner's
// local page can do everything.
const may = (c, what) => !M.public || (c.public || []).includes(what);
const title = c => c.title || c.name;
const word = c => (c.item || title(c).replace(/s$/i, '')).toLowerCase();
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
const when = iso => { const d = new Date(iso || ''); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
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
  return 'Untitled ' + word(c);
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
  try { M = await api('/meta'); }
  catch (e) { $('avTitle').textContent = document.title; $('avView').innerHTML = `<div class="note">${esc(e.message)}</div>`; return; }
  const look = M.look || {}, colour = /^#[0-9a-fA-F]{6}$/;
  if (colour.test(look.accent || '')) document.documentElement.style.setProperty('--look-accent', look.accent);
  if (colour.test(look.paper || '')) document.documentElement.style.setProperty('--look-paper', look.paper);
  if (['serif', 'sans', 'rounded'].includes(look.font)) document.body.classList.add('f-' + look.font);
  if (look.icon) { $('avIcon').textContent = look.icon; $('avIcon').classList.remove('hidden'); }
  $('avTitle').textContent = M.name;
  document.title = M.name;
  $('avNote').innerHTML = M.enabled ? '' : '<div class="note">This application is switched off at the moment, so the assistant can\'t work on it. You can still look at and change everything here.</div>';
  $('avTabs').innerHTML = M.collections.length > 1 ? M.collections.map(c => `<a href="#${esc(c.name)}" data-tab="${esc(c.name)}">${esc(title(c))}</a>`).join('') : '';
  if (!M.collections.length) { $('avView').innerHTML = '<div class="empty"><span class="big">🔒</span>This application is private.</div>'; return; }
  window.addEventListener('hashchange', () => render().catch(showErr));
  await render();
}
function showErr(e) { $('avView').innerHTML = `<div class="note">${esc(e.message)}</div>`; }
function go(hash) { if (location.hash === '#' + hash) render().catch(showErr); else location.hash = hash; }
async function render() {
  clearTimeout(runsT);
  closeModal();
  const [name, id, sub] = decodeURIComponent(location.hash.slice(1)).split('/');
  const c = coll(name) || M.collections[0];
  document.querySelectorAll('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === c.name));
  if (id === 'new' && c.view !== 'files') return editView(c, null);
  if (id && c.view !== 'files') {
    const it = await call(c.name + '_get', { id: Number(id) }).catch(() => null);
    if (it) return sub === 'edit' ? editView(c, it) : sheet(c, it);
  }
  return browse(c);
}

// ---------- browsing a collection ----------
let query = '', queryT = 0;
async function browse(c) {
  const files = c.view === 'files';
  $('avView').innerHTML = `<div class="bar"><input type="search" id="q" placeholder="Search ${esc(title(c).toLowerCase())}" value="${esc(query)}"><span class="grow"></span>
      ${!may(c, 'add') ? '' : files ? `<button type="button" class="btn" id="noteBtn">✎ Write a note</button>
        <label class="btn primary">＋ Add files<input type="file" id="upl" multiple hidden></label>`
      : `<button type="button" class="btn primary" id="newBtn">＋ New ${esc(word(c))}</button>`}</div>
    <div class="err" id="bErr"></div>
    <div id="items" class="${files ? 'folder' : c.view === 'cards' ? 'cards' : 'rows'}"></div>`;
  $('q').addEventListener('input', () => { query = $('q').value.trim(); clearTimeout(queryT); queryT = setTimeout(() => fill(c).catch(showErr), 250); });
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
  const r = await call(c.name + '_list', query ? { query, limit: 200 } : { limit: 200 });
  const box = $('items');
  if (!box) return;
  if (!r.items.length) {
    box.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="big">${esc((M.look || {}).icon || '·')}</span>
      ${query ? 'Nothing found.' : c.view === 'files' ? `No ${esc(title(c).toLowerCase())} yet - add files, or drop them here.` : `No ${esc(title(c).toLowerCase())} yet.`}</div>`;
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
  const icon = esc((M.look || {}).icon || '');
  box.innerHTML = r.items.map(it => {
    const cover = c.cover && it[c.cover] && it[c.cover].file;
    return c.view === 'cards'
      ? `<a class="card" href="#${esc(c.name)}/${it.id}">${cover ? `<img src="${fileUrl(cover)}" alt="" loading="lazy">` : `<div class="ph">${icon}</div>`}
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
    if (f.type === 'choice') return `<span class="chip">${esc(v)}</span>`;
    if (f.type === 'number') return `<span class="chip">${f.unit ? `${esc(f.title || f.name)} ${esc(num(v))} ${esc(f.unit)}` : `${esc(num(v))} ${esc((f.title || f.name).toLowerCase())}`}</span>`;
    if (f.type === 'bool') return v ? `<span class="chip">${esc(f.title || f.name)}</span>` : '';
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
  return on.length ? on.map(id => `<span class="tag">${esc(names[id])}</span>`).join('') : `<span class="tag none">not used yet</span>`;
}

// ---------- files: add, write a note, look at one, tag it ----------
async function uploadInto(c, files, parentId, errEl) {
  const ff = fileField(c), tf = tagField(c);
  try {
    for (const file of files) {
      if (file.size > MAX_FILE) throw new Error(`${file.name} is larger than 9 MB`);
      const args = { [ff.name]: { name: file.name, media_type: file.type || 'application/octet-stream', data: await fileB64(file) } };
      if (parentId && tf) args[tf.name] = tf.type === 'refs' ? [parentId] : parentId;
      await call(c.name + '_add', args);
    }
  } catch (e) { if (errEl) errEl.textContent = e.message; }
}
function noteModal(c, parentId, after) {
  openModal(`<h3>Write a note</h3><p class="muted" style="margin:0 0 12px">It is kept as a text file with your ${esc(title(c).toLowerCase())}.</p>
    <label class="field"><span>Note</span><textarea id="nText" style="min-height:180px"></textarea></label><div class="err" id="mErr"></div>
    <div class="actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="nSave">Save note</button></div>`);
  $('nText').focus();
  $('nSave').addEventListener('click', async () => {
    const text = $('nText').value.trim();
    if (!text) { $('mErr').textContent = 'Write something first.'; return; }
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
  openModal(`<h3>${esc(label(c, it))}</h3><span class="muted">Added ${esc(when(it.created))}</span>
    <div class="preview" id="pv">${n && isImg(n) ? `<img src="${fileUrl(n)}" alt="">` : `<div class="big">${n ? fileIcon(n) : '📎'}</div>`}</div>
    ${tags ? `<h4>Use it for</h4><div class="checks">${opts.map(o => `<label class="check"><input type="${tf.type === 'refs' ? 'checkbox' : 'radio'}" name="tg" value="${o.id}" ${cur.includes(o.id) ? 'checked' : ''}> ${esc(label(target, o))}</label>`).join('')
      || `<span class="muted">No ${esc(title(target).toLowerCase())} yet.</span>`}</div>` : ''}
    <div class="err" id="mErr"></div>
    <div class="actions spread"><div>${may(c, 'delete') ? '<button type="button" class="btn danger" id="fDel">Delete</button>' : ''}
        ${n ? `<a class="btn" href="${fileUrl(n)}" download="${esc(shownName(n))}">Download</a>` : ''}</div>
      <div><button type="button" class="btn" data-close>Close</button>${tags ? '<button type="button" class="btn primary" id="fSave">Save</button>' : ''}</div></div>`);
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
  if ($('fDel')) armed($('fDel'), 'Really delete?', async () => { await call(c.name + '_delete', { id: it.id }); closeModal(); after(); });
}
// Choose which items of `o` (e.g. materials) belong to `parent` (a recipe); new files can be added here too.
async function pickModal(c, parent, o, f, after) {
  const all = await itemsOf(o.name);
  const has = x => ids(x[f.name]).includes(parent.id);
  const files = o.view === 'files';
  openModal(`<h3>${esc(title(o))} for “${esc(label(c, parent))}”</h3><p class="muted" style="margin:0">Tick the ones that belong here.</p>
    <div class="${files ? 'folder pick' : 'checks'}" style="margin:12px 0">${all.map(x => files
      ? `<label class="tile ${has(x) ? 'on' : ''}"><input type="checkbox" value="${x.id}" ${has(x) ? 'checked' : ''}>${thumb(o, x)}<div class="fname">${esc(label(o, x))}</div></label>`
      : `<label class="check"><input type="checkbox" value="${x.id}" ${has(x) ? 'checked' : ''}> ${esc(label(o, x))}</label>`).join('')
      || `<p class="muted">No ${esc(title(o).toLowerCase())} yet${files ? ' - add files below' : ''}.</p>`}</div>
    ${files ? `<div class="row"><label class="btn small">＋ Add new files<input type="file" id="pUpl" multiple hidden></label>
      <button type="button" class="btn small" id="pNote">✎ Write a note</button></div>` : ''}
    <div class="err" id="mErr"></div>
    <div class="actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="pSave">Done</button></div>`);
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
let factor = 1;   // scaling of the open item's amounts (collection `scale`), display only
function tableSection(c, f, v, h) {
  const cols = f.columns || [];
  const txt = cols.filter(col => !col.type || col.type === 'text'), nums = cols.filter(col => col.type === 'number'), imgs = cols.filter(col => col.type === 'image');
  const scaled = c.scale && c.scale.table === f.name;
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
    const tap = scaled && Number.isFinite(n) ? ` data-scale="${i}" title="change this amount - the others follow"` : '';
    return `<li>${pic ? `<img class="ingimg" src="${fileUrl(pic)}" alt="" loading="lazy">` : ''}${lead ? `<b${tap}>${esc(lead)}</b>` : ''}${esc(rest)}</li>`;
  }).join('')}</ul></section>`;
}
function section(c, f, v) {
  const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
  if (empty) return '';
  const h = `<h3>${esc(f.title || f.name)}</h3>`;
  switch (f.type) {
    case 'table': return tableSection(c, f, v, h);
    case 'list': return `<section>${h}<ol class="${f.numbered ? 'steps' : 'bullets'}">${v.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ol></section>`;
    case 'longtext': return `<section>${h}<p class="prose">${esc(v)}</p></section>`;
    case 'text': return `<section>${h}<p class="prose">${/^https?:\/\/\S+$/i.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v)}</p></section>`;
    case 'image': return v.file ? `<section>${h}<img class="heroimg" style="max-width:420px" src="${fileUrl(v.file)}" alt=""></section>` : '';
    case 'images': return `<section>${h}<div class="gallery">${v.map(x => `<a href="${fileUrl(x.file)}" target="_blank" rel="noopener"><img src="${fileUrl(x.file)}" alt="" loading="lazy"></a>`).join('')}</div></section>`;
    case 'file': return v.file ? `<section>${h}<a class="btn small" href="${fileUrl(v.file)}" download="${esc(shownName(v.file))}">${fileIcon(v.file)} ${esc(shownName(v.file))}</a></section>` : '';
    case 'json': return `<section>${h}<pre class="json">${esc(JSON.stringify(v, null, 2))}</pre></section>`;
    default: return '';
  }
}
// The scale control: the base value (e.g. servings) with − / +; amounts follow (display only).
function scaleBar(c, it) {
  const s = c.scale; if (!s) return '';
  const base = Number(it[s.base]); const bf = c.fields.find(f => f.name === s.base);
  if (!Number.isFinite(base) || base <= 0) return '';
  return `<div class="scale"><span class="muted">${esc((bf && bf.title) || s.base)}</span><button type="button" class="btn small" data-sc="-">−</button>
    <b id="scBase">${esc(amount(base * factor))}</b><button type="button" class="btn small" data-sc="+">＋</button>
    ${factor !== 1 ? `<button type="button" class="btn small ghost" data-sc="0">reset</button>` : ''}</div>`;
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
  const body = c.fields.filter(f => f !== lf && f.name !== coverName && !['choice', 'number', 'bool', 'ref', 'refs'].includes(f.type)).map(f => section(c, f, it[f.name])).join('');
  const kids = childrenOf(c);
  $('avView').innerHTML = `<a class="back" href="#${esc(c.name)}">← All ${esc(title(c).toLowerCase())}</a>
    <article class="sheet${c.look && it[c.look] ? ' look-' + esc(String(it[c.look]).toLowerCase().replace(/[^a-z0-9-]/g, '-')) : ''}">
      <div class="hero ${cover ? '' : 'nocover'}">${cover ? `<img class="heroimg" src="${fileUrl(cover)}" alt="">` : ''}
        <div class="hinfo"><h2>${esc(label(c, it))}</h2><div class="chips">${chips(c, it, true)}</div>${scaleBar(c, it)}
          ${refs.map(f => ids(it[f.name]).length ? `<div class="refs"><span class="muted">${esc(f.title || f.name)}:</span> ${ids(it[f.name]).map(id =>
            `<a class="chip" href="#${esc(f.ref)}/${id}">${esc(refNames[f.name][id] ?? '?')}</a>`).join(' ')}</div>` : '').join('')}
          <div class="acts">${acts.map(a => `<button type="button" class="btn primary" data-act="${esc(a.name)}">✨ ${esc(a.title || a.name)}</button>`).join('')}
            ${may(c, 'change') ? '<button type="button" class="btn" id="editBtn">Edit</button>' : ''}</div>
          <div id="runs"></div><div class="err" id="sErr"></div></div></div>
      ${body || `<p class="muted">Nothing written here yet.${acts.length ? ` Press “${esc(acts[0].title || acts[0].name)}” and the assistant fills it in.` : ''}</p>`}
      ${kids.map(({ o, f }) => `<section><div class="shead"><h3>${esc(title(o))}</h3>
          ${may(o, 'change') ? `<button type="button" class="btn small" data-pick="${esc(o.name)}|${esc(f.name)}">＋ Add ${esc(title(o).toLowerCase())}</button>` : ''}</div>
        <div id="kids_${esc(o.name)}" class="${o.view === 'files' ? 'folder mini' : 'checks'}"><span class="muted">…</span></div></section>`).join('')}
    </article>`;
  $('editBtn')?.addEventListener('click', () => go(`${c.name}/${it.id}/edit`));
  // Scaling: − / + on the base value, or a new amount for one ingredient (the others follow).
  const base = c.scale ? Number(it[c.scale.base]) : 0;
  document.querySelectorAll('[data-sc]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.sc, cur = base * factor;
    const next = k === '0' ? base : Math.max(1, k === '+' ? Math.floor(cur) + 1 : Math.ceil(cur) - 1);
    factor = next / base; sheet(c, it, true);
  }));
  document.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => {
    const f = c.fields.find(x => x.name === c.scale.table), col = (f.columns || []).find(x => x.type === 'number');
    const was = it[f.name][Number(b.dataset.scale)][col.name];
    const nameCol = (f.columns || []).filter(x => !x.type || x.type === 'text').pop();
    const what = nameCol ? it[f.name][Number(b.dataset.scale)][nameCol.name] || '' : '';
    const asked = prompt(`How much ${what}? (now ${amount(was * factor)})`, amount(was * factor));
    const n = Number(String(asked ?? '').replace(',', '.').replace('½', '.5').replace('¼', '.25').replace('¾', '.75'));
    if (asked !== null && Number.isFinite(n) && n > 0 && was > 0) { factor = n / was; sheet(c, it, true); }
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
    openModal(`<h3>${esc(a.ask.title || a.title || a.name)}</h3>${a.ask.hint ? `<p class="muted" style="margin:0 0 12px">${esc(a.ask.hint)}</p>` : ''}
      <label class="field"><span>Extra requirements (optional)</span><textarea id="aExtra" maxlength="4000" style="min-height:140px"></textarea></label>
      <div class="actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="aGo">✨ Send to the assistant</button></div>`);
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
      if (!r.items.length) { el.innerHTML = `<span class="muted">None yet.</span>`; return; }
      el.innerHTML = r.items.map(x => o.view === 'files'
        ? `<button type="button" class="tile" data-kid="${x.id}">${thumb(o, x)}<div class="fname">${esc(label(o, x))}</div></button>`
        : `<a class="chip" href="#${esc(o.name)}/${x.id}">${esc(label(o, x))}</a>`).join('');
      el.querySelectorAll('[data-kid]').forEach(b => b.addEventListener('click', () => fileModal(o, r.items.find(x => x.id === Number(b.dataset.kid)), reload)));
    }).catch(() => {});
  }
  if (acts.length) runs(c, it.id);
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
  const a = (M.actions || []).find(x => x.name === r.action), name = esc(a ? a.title || a.name : r.action);
  const waiting = r.state === 'waiting';
  // While the assistant works on it, nothing of it can change (the server refuses it too).
  document.querySelectorAll('[data-act], #editBtn, [data-pick], [data-kid]').forEach(b => { b.disabled = waiting; });
  el.innerHTML = waiting ? `<div class="run wait"><span class="spin"></span>${name}: the assistant is working on it… it can't be changed until then.
      ${M.public ? '' : '<button type="button" class="btn small ghost" id="runCancel">Cancel</button>'}</div>`
    : r.state === 'done' ? `<div class="run ok">✓ ${name} · ${esc(when(r.finished))}</div>`
    : r.state === 'cancelled' ? `<div class="run">${name} was cancelled · ${esc(when(r.finished))}</div>`
    : `<div class="run bad">${name} didn't work${r.error ? ': ' + esc(r.error) : ''}</div>`;
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
    const x = r ? r[col.name] : undefined, ph = esc(col.title || col.name);
    if (col.type === 'number') return `<input type="number" step="any" class="num" data-col="${esc(col.name)}" placeholder="${ph}" value="${x ?? ''}">`;
    if (col.type === 'image') return `<label class="cellimg" title="${ph}">${fileOf(x) ? `<img src="${fileUrl(fileOf(x))}" alt="">` : '🖼'}
      <input type="file" accept="image/*" hidden data-col="${esc(col.name)}" data-keep="${esc(fileOf(x) || '')}"></label>`;
    return `<input data-col="${esc(col.name)}" placeholder="${ph}" value="${esc(x || '')}">`;
  };
  const trow = (f, r) => `<div class="trow${f.numbered ? ' long' : ''}">${(f.columns || []).map(col => cell(col, r)).join('')}
      <button type="button" class="btn small ghost" data-delrow title="remove">×</button></div>`;
  const input = f => {
    const id = 'f_' + f.name, x = v(f), lab = `<span>${esc(f.title || f.name)}${f.required ? ' *' : ''}</span>`;
    if ((f.type === 'ref' || f.type === 'refs') && !opts[f.name]) return '';   // points to something visitors can't see
    switch (f.type) {
      case 'longtext': return `<label class="field">${lab}<textarea id="${id}">${esc(x || '')}</textarea></label>`;
      case 'json': return `<label class="field">${lab}<textarea id="${id}" class="mono" spellcheck="false">${esc(x === undefined || x === null ? '' : JSON.stringify(x, null, 2))}</textarea></label>`;
      case 'list': return `<label class="field">${lab}<textarea id="${id}" style="min-height:150px">${esc(ids(x).join('\n'))}</textarea><span class="hint">One per line.</span></label>`;
      case 'table': return `<div class="field">${lab}<div class="tbled" id="${id}">${(Array.isArray(x) && x.length ? x : [{}]).map(r => trow(f, r)).join('')}</div>
          <div><button type="button" class="btn small" data-addrow="${esc(f.name)}">＋ Add a line</button></div></div>`;
      case 'number': return `<label class="field">${lab}<input type="number" id="${id}" value="${x ?? ''}" step="any"></label>`;
      case 'bool': return `<label class="check field"><input type="checkbox" id="${id}" ${x ? 'checked' : ''}> ${esc(f.title || f.name)}</label>`;
      case 'choice': return `<label class="field">${lab}<select id="${id}"><option value=""></option>${f.choices.map(o => `<option ${o === x ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
      case 'ref': return `<label class="field">${lab}<select id="${id}"><option value=""></option>${opts[f.name].items.map(r => `<option value="${r.id}" ${r.id === x ? 'selected' : ''}>${esc(label(opts[f.name].t, r))}</option>`).join('')}</select></label>`;
      case 'refs': return `<div class="field">${lab}<div class="checks" id="${id}">${opts[f.name].items.map(r => `<label class="check"><input type="checkbox" value="${r.id}" ${ids(x).includes(r.id) ? 'checked' : ''}> ${esc(label(opts[f.name].t, r))}</label>`).join('')
          || '<span class="muted">Nothing to choose yet.</span>'}</div></div>`;
      case 'images': return `<div class="field">${lab}<div class="gallery edit" id="${id}">${ids(x).map(p => `<label class="keep"><img src="${fileUrl(p.file)}" alt="">
          <span><input type="checkbox" checked data-keep="${esc(p.file)}"> keep</span></label>`).join('')}</div><input type="file" accept="image/*" multiple id="${id}_new"></div>`;
      case 'image': case 'file': return `<label class="field">${lab}<div class="filepick">${x && x.file ? (f.type === 'image' && isImg(x.file) ? `<img src="${fileUrl(x.file)}" alt="">` : `<span>${fileIcon(x.file)} ${esc(shownName(x.file))}</span>`) : ''}
          <input type="file" id="${id}" ${f.type === 'image' ? 'accept="image/*"' : ''}></div></label>`;
      default: return `<label class="field">${lab}<input id="${id}" value="${esc(x || '')}"></label>`;
    }
  };
  $('avView').innerHTML = `<a class="back" href="#${esc(c.name)}${it ? '/' + it.id : ''}">← ${it ? 'Back' : 'All ' + esc(title(c).toLowerCase())}</a>
    <article class="sheet"><h2 style="margin:0 0 18px;font:600 26px/1.2 var(--font)">${it ? 'Edit ' + esc(label(c, it)) : 'New ' + esc(word(c))}</h2>
      ${c.fields.map(input).join('')}
      <div class="err" id="fErr"></div>
      <div class="formfoot"><div>${it && may(c, 'delete') ? `<button type="button" class="btn danger" id="fDel">Delete ${esc(word(c))}</button>` : ''}</div>
        <div><a class="btn" href="#${esc(c.name)}${it ? '/' + it.id : ''}">Cancel</a><button type="button" class="btn primary" id="fSave">${it ? 'Save' : 'Add'}</button></div></div>
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
          .map(([n, k]) => { const o = coll(n) || { name: n }; return `${k} ${esc(k === 1 ? word(o) : title(o).toLowerCase())}`; }).join(', ');
        extra = [p.also.length ? `also deletes ${count(p.also)} used only here` : '', p.kept.length ? `keeps ${count(p.kept)} also used elsewhere` : ''].filter(Boolean).join('; ');
      } catch (e) { $('fErr').textContent = e.message; return; }
      del.classList.add('armed'); del.innerHTML = `Really delete?${extra ? ` (${extra})` : ''} Click again`; return;
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
            if (file.size > MAX_FILE) throw new Error(`${file.name} is larger than 9 MB`);
            args[f.name] = { name: file.name, media_type: file.type || 'application/octet-stream', data: await fileB64(file) }; continue;
          }
          case 'refs': args[f.name] = [...el.querySelectorAll('input:checked')].map(x => Number(x.value)); continue;
          case 'images': {
            const kept = [...el.querySelectorAll('[data-keep]:checked')].map(x => ({ file: x.dataset.keep }));
            const added = [];
            for (const file of $('f_' + f.name + '_new').files) {
              if (file.size > MAX_FILE) throw new Error(`${file.name} is larger than 9 MB`);
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
                    if (file.size > MAX_FILE) throw new Error(`${file.name} is larger than 9 MB`);
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
        else if (f.type === 'json') { try { args[f.name] = JSON.parse(raw); } catch (_) { throw new Error(`${f.title || f.name}: not valid JSON`); } }
        else args[f.name] = raw;
      }
      for (const f of c.fields) if (f.required && (it ? args[f.name] === null : args[f.name] === undefined || args[f.name] === null)) throw new Error(`${f.title || f.name} is needed`);
      const saved = await call(c.name + (it ? '_update' : '_add'), args);
      go(c.name + '/' + saved.id);
    } catch (e) { $('fErr').textContent = e.message; }
  });
}

start().catch(showErr);
