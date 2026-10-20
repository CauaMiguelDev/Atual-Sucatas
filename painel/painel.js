const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* =====================================================================
   AUTH: usuário + senha
   ponytail: client-side lock (PBKDF2 hashes in localStorage, session in sessionStorage).
   Stops casual access on this computer; real auth needs the server the owner has not approved yet.
   ===================================================================== */
const AUTH_KEY = 'atual_painel_auth_v2';
const SESSION_KEY = 'atual_painel_sessao';
const LOCK_KEY = 'atual_painel_bloqueio';
const IDLE_MS = 30 * 60 * 1000;
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
const randHex = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const normUser = u => String(u || '').trim().toLowerCase();

async function derive(secret, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: 210000, hash: 'SHA-256' }, key, 256));
}
const readAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; } };
const writeAuth = a => localStorage.setItem(AUTH_KEY, JSON.stringify(a));

async function setCredentials(user, pw) {
  const salt = randHex();
  writeAuth({ user: normUser(user), salt, hash: await derive(pw, salt) });
}
async function checkLogin(user, pw) {
  const a = readAuth();
  return !!a && normUser(user) === a.user && (await derive(pw, a.salt)) === a.hash;
}

/* attempt limit: 5 wrong logins lock the form; each new lock lasts longer (1, 5, 15, 30 min).
   Kept in localStorage so reloading or opening another tab does not reset it; cleared on a correct login. */
const MAX_TRIES = 5;
const LOCK_STEPS = [1, 5, 15, 30].map(min => min * 60 * 1000);
const readLock = () => { try { return { fails: 0, until: 0, rounds: 0, ...JSON.parse(localStorage.getItem(LOCK_KEY)) }; } catch { return { fails: 0, until: 0, rounds: 0 }; } };
const writeLock = st => localStorage.setItem(LOCK_KEY, JSON.stringify(st));
const clearLock = () => localStorage.removeItem(LOCK_KEY);
const fmtWait = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function registerFail() {
  const st = readLock();
  st.fails += 1;
  if (st.fails >= MAX_TRIES) {
    st.until = Date.now() + LOCK_STEPS[Math.min(st.rounds, LOCK_STEPS.length - 1)];
    st.rounds += 1;
    st.fails = 0;
    writeLock(st);
    applyLock();
    return;
  }
  writeLock(st);
  const left = MAX_TRIES - st.fails;
  authErr.textContent = `Usuário ou senha incorretos. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`} antes do bloqueio.`;
}

let lockTimer;
function applyLock() {
  clearInterval(lockTimer);
  const fields = [$('#user'), $('#pw'), $('#pw2'), $('#auth-submit')];
  const tick = () => {
    const left = readLock().until - Date.now();
    const locked = left > 0;
    fields.forEach(f => (f.disabled = locked));
    if (locked) {
      authErr.classList.remove('is-ok');
      authErr.textContent = `Muitas tentativas erradas. Acesso bloqueado por ${fmtWait(left)}.`;
    } else {
      clearInterval(lockTimer);
      if (authErr.textContent.startsWith('Muitas tentativas')) authErr.textContent = 'Você já pode tentar de novo.';
    }
  };
  tick();
  if (readLock().until > Date.now()) lockTimer = setInterval(tick, 1000);
}

const authForm = $('#auth-form');
const authErr = $('#auth-error');
const setupMode = () => !readAuth();

function setSubmitLabel(text) {
  $('#auth-submit .btn__label').dataset.text = text;
  $('#auth-submit .btn__label > span').textContent = text;
}
function showAuth(msg = '', ok = false) {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  const setup = setupMode();
  $('#auth-title').textContent = setup ? 'Crie o acesso do painel' : 'Painel da loja';
  $('#auth-hint').textContent = setup ? 'Primeiro acesso: escolha um usuário e uma senha com pelo menos 6 caracteres.' : 'Entre com seu usuário e senha.';
  $('#pw2-wrap').hidden = !setup;
  $('#pw2').required = setup;
  $('#pw').autocomplete = setup ? 'new-password' : 'current-password';
  setSubmitLabel(setup ? 'Criar acesso e entrar' : 'Entrar');
  authErr.textContent = msg;
  authErr.classList.toggle('is-ok', ok);
  $('#pw').value = ''; $('#pw2').value = '';
  if (setup) $('#user').value = '';
  if (!setup) applyLock();
  setTimeout(() => ($('#user').value ? $('#pw') : $('#user')).focus(), 50);
}
function enterApp() {
  clearLock();
  sessionStorage.setItem(SESSION_KEY, '1');
  $('#auth').hidden = true;
  $('#app').hidden = false;
  renderAll();
  armIdle();
}
function logout(msg) {
  sessionStorage.removeItem(SESSION_KEY);
  $$('dialog[open]').forEach(d => d.close());
  showAuth(msg);
}


authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('#user').value, pw = $('#pw').value;
  if (readLock().until > Date.now()) return applyLock();
  if (setupMode()) {
    if (normUser(user).length < 3 || /\s/.test(user.trim())) return (authErr.textContent = 'O usuário precisa ter pelo menos 3 letras, sem espaços.');
    if (pw.length < 6) return (authErr.textContent = 'A senha precisa ter pelo menos 6 caracteres.');
    if (pw !== $('#pw2').value) return (authErr.textContent = 'As duas senhas não são iguais.');
    setSubmitLabel('Criando acesso...');
    await setCredentials(user, pw);
    return enterApp();
  }
  if (!(await checkLogin(user, pw))) {
    registerFail();
    if (!$('#pw').disabled) $('#pw').select();
    return;
  }
  enterApp();
});


$$('[data-eye]').forEach(b => b.addEventListener('click', () => {
  const input = $(`#${b.dataset.eye}`);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.innerHTML = `<i class="ph ${show ? 'ph-eye-slash' : 'ph-eye'}"></i>`;
  b.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
}));
$('#logout').addEventListener('click', () => logout());

let idleTimer;
function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => logout('Sessão encerrada por inatividade.'), IDLE_MS);
}
['pointerdown', 'keydown'].forEach(t => addEventListener(t, () => { if (!$('#app').hidden) armIdle(); }, { passive: true }));

/* =====================================================================
   DATA + HELPERS
   ===================================================================== */
let orders = loadOrders();
let current = null;
let isNew = false;
const LAST = ORDER_STATUS.length - 1;

const toastEl = $('#toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 3200);
}
const nfState = o => !o.nf ? { label: 'A emitir', cls: '' }
  : !o.nf.enviadaEm ? { label: `Nº ${o.nf.numero} · não enviada`, cls: 'pill--muted' }
  : { label: `Nº ${o.nf.numero} · enviada`, cls: 'pill--ok' };
const statusPill = o => `<span class="pill ${o.status === LAST ? 'pill--ok' : ''}">${esc(ORDER_STATUS[o.status])}</span>`;
const phoneDigits = p => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
};
const fmtDay = ymd => ymd ? ymd.split('-').reverse().join('/') : '';
const SITE_KEY = 'atual_site_url';
const siteUrl = () => localStorage.getItem(SITE_KEY) || new URL('../site/', location.href).href;
const trackLink = o => `${siteUrl().replace(/[?#].*$/, '')}?pedido=${encodeURIComponent(o.codigo)}#rastrear`;

/* =====================================================================
   VIEWS
   ===================================================================== */
const VIEWS = {
  pedidos: ['Pedidos', 'Acompanhe pedidos, entregas e notas fiscais.'],
  notas: ['Notas fiscais', 'Emita, confira e envie as notas para os clientes.'],
  config: ['Configurações', 'Senha do painel e endereço do site.'],
};
function setView(v) {
  $$('[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
  $$('[data-view-panel]').forEach(p => (p.hidden = p.dataset.viewPanel !== v));
  [$('#view-title').textContent, $('#view-sub').textContent] = VIEWS[v];
  $('#new-order').hidden = v === 'config';
  if (v === 'config') { $('#site-url').value = siteUrl(); $('#store-cnpj').value = storeCnpj(); $('#cfg-user').textContent = readAuth()?.user || ''; }
}
$$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* month helpers (local time) */
const monthKey = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const thisMonth = () => monthKey(new Date().toISOString());
const monthLabel = key => { const [y, m] = key.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
const issuedIn = key => orders.filter(o => o.nf && (key === 'all' || monthKey(o.nf.emitidaEm) === key));

/* pedidos */
let filter = 'all';
function renderKpis() {
  const open = orders.filter(o => o.status < LAST).length;
  const nfPending = orders.filter(o => !o.nf).length;
  const nfUnsent = orders.filter(o => o.nf && !o.nf.enviadaEm).length;
  const month = issuedIn(thisMonth()).length;
  const total = orders.reduce((t, o) => t + orderTotal(o), 0);
  $('#kpis').innerHTML = `
    <div class="kpi"><span><i class="ph ph-truck"></i>Em andamento</span><strong>${open}</strong></div>
    <button class="kpi kpi--red" type="button" data-go="issued"><span><i class="ph ph-receipt"></i>Notas emitidas em ${monthLabel(thisMonth()).split(' ')[0].toLowerCase()}</span><strong>${month}</strong></button>
    <button class="kpi" type="button" data-go="unsent"><span><i class="ph ph-whatsapp-logo"></i>Notas a enviar</span><strong>${nfUnsent}</strong></button>
    <div class="kpi"><span><i class="ph ph-currency-circle-dollar"></i>Total em pedidos</span><strong>${brl(total)}</strong></div>`;
  $('#nf-count').textContent = nfPending + nfUnsent || '';
}
$('#kpis').addEventListener('click', e => {
  const k = e.target.closest('[data-go]');
  if (!k) return;
  $('#nf-month').value = thisMonth();
  setNfFilter(k.dataset.go);
  setView('notas');
});

function renderRows() {
  const q = $('#q').value.trim().toLowerCase();
  const list = orders
    .filter(o => !q || [o.codigo, o.cliente.nome, o.cliente.cidade, ...o.itens.map(i => i.desc)].join(' ').toLowerCase().includes(q))
    .filter(o => filter === 'all' || (filter === 'open' && o.status < LAST) || (filter === 'done' && o.status === LAST))
    .sort((a, b) => b.data.localeCompare(a.data));
  $('#rows').innerHTML = list.map((o, i) => {
    const nf = nfState(o);
    return `<tr data-code="${esc(o.codigo)}" style="animation-delay:${i * 35}ms">
      <td><span class="o-code">${esc(o.codigo)}</span><span class="o-sub">${fmtDate(o.data)}</span></td>
      <td>${esc(o.cliente.nome || 'Sem nome')}<span class="o-sub">${esc(o.cliente.cidade)}</span></td>
      <td><div class="o-items">${o.itens.map(i => esc(i.desc)).join(', ') || '<span class="o-sub">Sem peças</span>'}</div></td>
      <td><strong>${brl(orderTotal(o))}</strong></td>
      <td>${statusPill(o)}</td>
      <td><span class="pill ${nf.cls}">${esc(nf.label)}</span></td>
      <td><button class="o-open" type="button" aria-label="Abrir pedido ${esc(o.codigo)}"><i class="ph ph-arrow-right"></i></button></td>
    </tr>`;
  }).join('');
  $('#empty').hidden = list.length > 0;
}
$('#rows').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-code]');
  if (tr) openDrawer(orders.find(o => o.codigo === tr.dataset.code));
});
$('#q').addEventListener('input', renderRows);
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  filter = b.dataset.f;
  $$('#chips button').forEach(x => x.classList.toggle('is-active', x === b));
  renderRows();
});

/* notas: monthly control */
let nfFilter = 'issued';
function fillMonths() {
  const sel = $('#nf-month');
  const prev = sel.value || thisMonth();
  const keys = [...new Set([thisMonth(), ...orders.filter(o => o.nf).map(o => monthKey(o.nf.emitidaEm))])].sort().reverse();
  sel.innerHTML = keys.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join('') + '<option value="all">Todos os meses</option>';
  sel.value = [...sel.options].some(o => o.value === prev) ? prev : thisMonth();
}
function setNfFilter(f) {
  nfFilter = f;
  $$('#nf-chips button').forEach(x => x.classList.toggle('is-active', x.dataset.nfF === f));
  renderNfRows();
}
function renderNfRows() {
  fillMonths();
  const key = $('#nf-month').value;
  const label = key === 'all' ? 'em todos os meses' : `em ${monthLabel(key).toLowerCase()}`;
  const issued = issuedIn(key);
  const sum = issued.reduce((t, o) => t + orderTotal(o), 0);
  const sent = issued.filter(o => o.nf.enviadaEm).length;
  $('#nf-kpis').innerHTML = `
    <div class="kpi kpi--red"><span><i class="ph ph-receipt"></i>Notas emitidas</span><strong>${issued.length}</strong></div>
    <div class="kpi"><span><i class="ph ph-currency-circle-dollar"></i>Valor das notas</span><strong>${brl(sum)}</strong></div>
    <div class="kpi"><span><i class="ph ph-checks"></i>Enviadas ao cliente</span><strong>${sent}</strong></div>
    <div class="kpi"><span><i class="ph ph-clock"></i>Aguardando envio</span><strong>${issued.length - sent}</strong></div>`;

  const pending = nfFilter === 'pending';
  const list = (pending
    ? orders.filter(o => !o.nf)
    : issued.filter(o => nfFilter === 'issued' || (nfFilter === 'unsent' ? !o.nf.enviadaEm : !!o.nf.enviadaEm)))
    .sort((a, b) => (b.nf?.emitidaEm || b.data).localeCompare(a.nf?.emitidaEm || a.data));

  $('#nf-rows').innerHTML = list.map((o, i) => {
    const act = !o.nf ? ['Emitir nota', 'ph-file-plus', 'nota'] : !o.nf.enviadaEm ? ['Enviar', 'ph-whatsapp-logo', 'msg'] : ['Ver PDF', 'ph-file-pdf', 'pdf'];
    return `<tr data-code="${esc(o.codigo)}" data-act="${act[2]}" style="animation-delay:${i * 35}ms">
      <td>${o.nf ? `<span class="o-code">Nº ${o.nf.numero}</span><span class="o-sub">Série ${o.nf.serie}</span>` : '<span class="pill">Sem nota</span>'}</td>
      <td><span class="o-code o-code--sm">${esc(o.codigo)}</span></td>
      <td>${esc(o.cliente.nome)}<span class="o-sub">${esc(o.cliente.doc || 'CPF/CNPJ não informado')}</span></td>
      <td>${o.nf ? new Date(o.nf.emitidaEm).toLocaleDateString('pt-BR') : '<span class="o-sub">-</span>'}</td>
      <td><strong>${brl(orderTotal(o))}</strong></td>
      <td>${!o.nf ? '' : o.nf.enviadaEm ? `<span class="pill pill--ok">Enviada ${new Date(o.nf.enviadaEm).toLocaleDateString('pt-BR')}</span>` : '<span class="pill pill--muted">Não enviada</span>'}</td>
      <td class="r"><button class="btn btn--line btn--sm" type="button"><i class="ph ${act[1]}"></i><span class="btn__label" data-text="${act[0]}"><span>${act[0]}</span></span></button></td>
    </tr>`;
  }).join('');
  $('#nf-empty').hidden = list.length > 0;
  $('#nf-empty-text').textContent = pending ? 'Todos os pedidos já têm nota.' : `Nenhuma nota ${nfFilter === 'issued' ? 'emitida' : nfFilter === 'sent' ? 'enviada' : 'aguardando envio'} ${label}.`;
}
$('#nf-chips').addEventListener('click', e => { const b = e.target.closest('[data-nf-f]'); if (b) setNfFilter(b.dataset.nfF); });
$('#nf-month').addEventListener('change', renderNfRows);
$('#nf-rows').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-code]');
  if (!tr) return;
  const o = orders.find(x => x.codigo === tr.dataset.code);
  const act = tr.dataset.act;
  openDrawer(o, act === 'pdf' ? 'nota' : act);
  if (act === 'msg') setTpl('nota');
  if (act === 'pdf') openNfPreview();
});

const renderAll = () => { renderKpis(); renderRows(); renderNfRows(); };

/* config */
$('#pw-form').addEventListener('submit', async e => {
  e.preventDefault();
  const a = readAuth();
  if (!(await checkLogin(a.user, $('#pw-old').value))) return toast('A senha atual está incorreta.');
  const newUser = $('#user-new').value.trim() || a.user;
  if (normUser(newUser).length < 3 || /\s/.test(newUser)) return toast('O usuário precisa ter pelo menos 3 letras, sem espaços.');
  if ($('#pw-new').value.length < 6) return toast('A nova senha precisa ter pelo menos 6 caracteres.');
  if ($('#pw-new').value !== $('#pw-new2').value) return toast('As duas senhas novas não são iguais.');
  await setCredentials(newUser, $('#pw-new').value);
  e.target.reset();
  $('#cfg-user').textContent = readAuth().user;
  toast('Acesso atualizado.');
});
const CNPJ_KEY = 'atual_loja_cnpj';
const STORE_CNPJ = '35.445.257/0001-31'; // confirmed by the owner (2026-10-19)
const storeCnpj = () => localStorage.getItem(CNPJ_KEY) ?? STORE_CNPJ; // '' = removed on purpose in Configurações
$('#store-form').addEventListener('submit', e => {
  e.preventDefault();
  const d = $('#store-cnpj').value.replace(/\D/g, '');
  if (d && d.length !== 14) return toast('O CNPJ precisa ter 14 números.');
  if (d) localStorage.setItem(CNPJ_KEY, d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'));
  else localStorage.setItem(CNPJ_KEY, '');
  $('#store-cnpj').value = storeCnpj();
  toast(d ? 'CNPJ salvo. Ele já aparece nas próximas notas.' : 'CNPJ removido das notas.');
});
$('#site-form').addEventListener('submit', e => {
  e.preventDefault();
  let url = $('#site-url').value.trim();
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  localStorage.setItem(SITE_KEY, url);
  toast('Endereço do site salvo.');
});
$('#reset-demo').addEventListener('click', () => {
  if (!confirm('Restaurar os pedidos de exemplo? As alterações feitas neste navegador serão apagadas.')) return;
  localStorage.removeItem(ORDERS_KEY);
  orders = loadOrders();
  renderAll();
  toast('Pedidos de exemplo restaurados.');
});

/* =====================================================================
   DRAWER
   ===================================================================== */
const drawer = $('#drawer');
const form = $('#order-form');
$('#d-status').innerHTML = ORDER_STATUS.map((s, i) => `<option value="${i}">${s}</option>`).join('');

function setTab(t) {
  $$('.tabs [data-tab]').forEach(b => { b.classList.toggle('is-active', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
  $$('[data-tab-panel]').forEach(p => (p.hidden = p.dataset.tabPanel !== t));
  if (t === 'msg') { readForm(); renderMsg(); }
}
$$('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

function itemRow(it = { desc: '', qtd: 1, valor: 0 }) {
  return `<div class="item">
    <input class="input" data-k="desc" value="${esc(it.desc)}" placeholder="Ex.: Farol esquerdo i30 2014" aria-label="Peça">
    <input class="input" data-k="qtd" type="number" min="1" step="1" value="${it.qtd}" aria-label="Quantidade">
    <input class="input" data-k="valor" type="number" min="0" step="0.01" value="${it.valor}" aria-label="Valor unitário">
    <button class="item__rm" type="button" aria-label="Remover peça"><i class="ph ph-trash"></i></button>
  </div>`;
}
function renderItems() {
  $('#items').innerHTML = `<div class="items__head"><span>Peça</span><span>Qtd</span><span>Valor (R$)</span><span></span></div>` + current.itens.map(itemRow).join('');
}
$('#add-item').addEventListener('click', () => {
  readForm();
  current.itens.push({ desc: '', qtd: 1, valor: 0 });
  renderItems();
  $$('#items .item').at(-1).querySelector('input').focus();
});
$('#items').addEventListener('click', e => {
  const rm = e.target.closest('.item__rm');
  if (!rm) return;
  readForm();
  current.itens.splice($$('#items .item').indexOf(rm.closest('.item')), 1);
  renderItems(); updateTotal();
});
form.addEventListener('input', () => { updateTotal(); renderTrackChip(); });
function updateTotal() { readForm(); $('#d-total').textContent = brl(orderTotal(current)); }

function fillForm() {
  const c = current.cliente;
  form.nome.value = c.nome; form.whatsapp.value = c.whatsapp; form.doc.value = c.doc; form.cidade.value = c.cidade;
  form.endereco.value = c.endereco || ''; form.bairro.value = c.bairro || ''; form.cep.value = c.cep || '';
  form.frete.value = current.frete || 0;
  form.status.value = current.status;
  form.previsao.value = current.previsao || '';
  form.transportadora.value = current.rastreio?.transportadora || '';
  form.rastreio.value = current.rastreio?.codigo || '';
  renderItems();
}
function readForm() {
  current.cliente = {
    nome: form.nome.value.trim(), whatsapp: form.whatsapp.value.trim(), doc: form.doc.value.trim(), cidade: form.cidade.value.trim(),
    endereco: form.endereco.value.trim(), bairro: form.bairro.value.trim(), cep: form.cep.value.trim(),
  };
  current.itens = $$('#items .item').map(row => ({
    desc: row.querySelector('[data-k=desc]').value.trim(),
    qtd: Math.max(1, +row.querySelector('[data-k=qtd]').value || 1),
    valor: Math.max(0, +row.querySelector('[data-k=valor]').value || 0),
  }));
  current.frete = Math.max(0, +form.frete.value || 0);
  current.status = +form.status.value;
  current.previsao = form.previsao.value;
  current.rastreio = { transportadora: form.transportadora.value.trim(), codigo: form.rastreio.value.trim() };
}

function renderHead() {
  $('#d-title').textContent = isNew ? `Novo pedido ${current.codigo}` : `Pedido ${current.codigo}`;
  $('#d-date').textContent = `Criado em ${fmtDate(current.data)}`;
  $('#d-status-pill').innerHTML = statusPill(current);
  renderTrackChip();
}
/* tracking code in the header: click copies it, or jumps to the field when missing */
function renderTrackChip() {
  const code = current.rastreio?.codigo;
  const chip = $('#d-track');
  chip.classList.toggle('is-empty', !code);
  chip.title = code ? 'Copiar código de rastreio' : 'Adicionar código de rastreio';
  chip.innerHTML = code
    ? `<i class="ph ph-package"></i><span>Rastreio</span><b>${esc(code)}</b><i class="ph ph-copy"></i>`
    : '<i class="ph ph-package"></i><span>Sem código de rastreio</span>';
}
$('#d-track').addEventListener('click', async () => {
  const code = current?.rastreio?.codigo;
  if (!code) { setTab('entrega'); form.rastreio.focus(); return; }
  try { await navigator.clipboard.writeText(code); toast(`Código ${code} copiado.`); }
  catch { toast('Não foi possível copiar o código.'); }
});
function renderHistory() {
  $('#d-history').innerHTML = ORDER_STATUS.map((s, i) => {
    const h = current.historico.find(x => x.status === i);
    return `<li class="${i <= current.status ? 'done' : ''} ${i === current.status ? 'current' : ''}"><strong>${s}</strong>${h ? `<small>${fmtDate(h.data)}</small>` : ''}</li>`;
  }).join('');
}

function openDrawer(order, tab = 'cliente') {
  isNew = !order;
  if (isNew) {
    const next = Math.max(1000, ...orders.map(o => +o.codigo.replace(/\D/g, '') || 0)) + 1;
    const now = new Date().toISOString();
    current = {
      codigo: `AS-${next}`, data: now, cliente: { nome: '', whatsapp: '', doc: '', cidade: '', endereco: '', bairro: '', cep: '' },
      itens: [{ desc: '', qtd: 1, valor: 0 }], frete: 0, status: 0, previsao: '',
      historico: [{ status: 0, data: now }], rastreio: { transportadora: '', codigo: '' }, nf: null, msgs: [],
    };
  } else current = structuredClone(order);
  current.msgs ||= [];
  fillForm(); renderHead(); renderHistory(); renderNf(); updateTotal();
  setTpl('criado');
  setTab(tab);
  drawer.showModal();
}
$('#new-order').addEventListener('click', () => openDrawer(null));

function commit() {
  readForm();
  const prev = orders.find(o => o.codigo === current.codigo);
  if (prev && prev.status !== current.status) current.historico.push({ status: current.status, data: new Date().toISOString() });
  if (prev) orders[orders.indexOf(prev)] = structuredClone(current);
  else orders.push(structuredClone(current));
  isNew = false;
  saveOrders(orders);
  renderAll(); renderHead(); renderHistory();
}

/* custom validation: hidden tabs cannot show the browser bubble, so jump to the field */
function valid() {
  readForm();
  const need = [['nome', 'cliente', 'Preencha o nome do cliente.'], ['whatsapp', 'cliente', 'Preencha o WhatsApp do cliente.'], ['cidade', 'cliente', 'Preencha a cidade de destino.']];
  for (const [name, tab, msg] of need) {
    if (!form[name].value.trim()) { setTab(tab); form[name].focus(); toast(msg); return false; }
  }
  if (phoneDigits(current.cliente.whatsapp).length < 12) { setTab('cliente'); form.whatsapp.focus(); toast('WhatsApp inválido. Use DDD + número.'); return false; }
  if (!current.itens.length || current.itens.some(i => !i.desc)) { setTab('pecas'); toast('Descreva todas as peças do pedido.'); return false; }
  return true;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!valid()) return;
  commit();
  drawer.close();
  toast(`Pedido ${current.codigo} salvo.`);
});

/* nota fiscal tab */
function renderNf() {
  const nf = current.nf;
  const box = $('#nf-box');
  if (!nf) {
    box.innerHTML = `
      <div class="nf-box__state"><i class="ph ph-receipt"></i><div><strong>Nota ainda não emitida</strong><small>Confira o cliente (CPF ou CNPJ) e as peças antes de gerar.</small></div></div>
      <div class="nf-box__actions"><button class="btn btn--primary" type="button" data-nf="gerar"><i class="ph ph-file-plus"></i><span class="btn__label" data-text="Gerar nota fiscal"><span>Gerar nota fiscal</span></span></button></div>`;
    return;
  }
  box.innerHTML = `
    <div class="nf-box__state"><i class="ph ph-seal-check"></i><div>
      <strong>Nota nº ${nf.numero}, série ${nf.serie}</strong>
      <small>Emitida em ${fmtDate(nf.emitidaEm)}. ${nf.enviadaEm ? `Enviada ao cliente em ${fmtDate(nf.enviadaEm)}.` : 'Ainda não enviada ao cliente.'}</small>
    </div></div>
    <div class="nf-box__actions">
      <button class="btn btn--whats" type="button" data-nf="enviar"><i class="ph ph-whatsapp-logo"></i><span class="btn__label" data-text="Enviar ao cliente"><span>Enviar ao cliente</span></span></button>
      <button class="btn btn--line" type="button" data-nf="ver"><i class="ph ph-file-pdf"></i><span class="btn__label" data-text="Ver / baixar PDF"><span>Ver / baixar PDF</span></span></button>
      <button class="btn btn--line" type="button" data-nf="atualizar"><i class="ph ph-arrows-clockwise"></i><span class="btn__label" data-text="Atualizar com os dados editados"><span>Atualizar com os dados editados</span></span></button>
    </div>`;
}
$('#nf-box').addEventListener('click', e => {
  const btn = e.target.closest('[data-nf]');
  if (!btn) return;
  const action = btn.dataset.nf;
  if (action === 'gerar' || action === 'atualizar') {
    if (!valid()) return;
    const number = current.nf?.numero ?? Math.max(1192, ...orders.map(o => o.nf?.numero || 0)) + 1;
    current.nf = { numero: number, serie: 1, emitidaEm: new Date().toISOString(), enviadaEm: current.nf?.enviadaEm || null };
    commit(); renderNf(); openNfPreview();
    toast(action === 'gerar' ? `Nota nº ${number} gerada.` : `Nota nº ${number} atualizada.`);
  }
  if (action === 'ver') { readForm(); openNfPreview(); }
  if (action === 'enviar') { setTab('msg'); setTpl('nota'); }
});

/* =====================================================================
   WHATSAPP MESSAGES
   Emojis are written as code points so no editor or encoding can break them.
   api.whatsapp.com/send keeps 4-byte emojis intact; wa.me redirects sometimes turn them into "�".
   ===================================================================== */
const E = {
  ok: '✅', box: '\u{1F4E6}', memo: '\u{1F4DD}', pin: '\u{1F4CD}', cal: '\u{1F4C5}', link: '\u{1F517}',
  truck: '\u{1F69A}', wrench: '\u{1F527}', money: '\u{1F4B0}', receipt: '\u{1F9FE}', clip: '\u{1F4CE}',
  search: '\u{1F50E}', hands: '\u{1F91D}', bell: '\u{1F514}',
};
const SIGN = `*Atual Sucatas* | Peças com garantia e nota fiscal`;
const tidy = lines => lines.filter(l => l !== null && l !== undefined)
  .filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
const pieces = o => o.itens.map(i => (i.qtd > 1 ? `${i.qtd}x ${i.desc}` : i.desc)).join(', ');

const STATUS_LINE = [
  `seu pedido foi confirmado ${E.ok}`,
  `sua peça já foi separada e está sendo preparada ${E.wrench}`,
  `seu pedido foi enviado ${E.truck}`,
  `seu pedido está a caminho ${E.truck}`,
  `seu pedido foi entregue ${E.ok}`,
];
const TEMPLATES = {
  criado: o => tidy([
    `Olá, *${o.cliente.nome}*! Seu pedido na Atual Sucatas foi registrado com sucesso ${E.ok}`,
    '',
    `${E.box} Pedido: *${o.codigo}*`,
    `${E.wrench} Peças: ${pieces(o)}`,
    `${E.memo} Situação: ${ORDER_STATUS[o.status]}`,
    `${E.pin} Destino: ${o.cliente.cidade}`,
    o.previsao ? `${E.cal} Previsão de entrega: ${fmtDay(o.previsao)}` : null,
    `${E.money} Valor total: *${brl(orderTotal(o))}*`,
    '',
    `${E.link} Acompanhe seu pedido em tempo real:`,
    trackLink(o),
    '',
    'Você receberá novas atualizações por aqui.',
    SIGN,
  ]),
  status: o => tidy([
    `Olá, *${o.cliente.nome}*! ${o.status === LAST ? 'Boa notícia:' : 'Temos uma atualização:'} ${STATUS_LINE[o.status]}`,
    '',
    `${E.box} Pedido: *${o.codigo}*`,
    `${E.memo} Situação: *${ORDER_STATUS[o.status]}*`,
    o.rastreio.transportadora ? `${E.truck} Transportadora: ${o.rastreio.transportadora}` : null,
    o.rastreio.codigo ? `${E.search} Código de rastreio: *${o.rastreio.codigo}*` : null,
    o.previsao && o.status < LAST ? `${E.cal} Previsão de entrega: ${fmtDay(o.previsao)}` : null,
    '',
    `${E.link} Acompanhe em tempo real:`,
    trackLink(o),
    '',
    o.status === LAST ? `Obrigado pela confiança! ${E.hands}` : 'Qualquer dúvida, é só responder esta mensagem.',
    SIGN,
  ]),
  nota: o => tidy([
    `Olá, *${o.cliente.nome}*! A nota fiscal do seu pedido foi emitida ${E.receipt}`,
    '',
    `${E.box} Pedido: *${o.codigo}*`,
    `${E.receipt} Nota fiscal: nº *${o.nf?.numero}*, série ${o.nf?.serie}`,
    `${E.cal} Emissão: ${o.nf ? new Date(o.nf.emitidaEm).toLocaleDateString('pt-BR') : ''}`,
    `${E.money} Valor total: *${brl(orderTotal(o))}*`,
    '',
    `${E.clip} Segue em anexo o PDF da sua nota fiscal.`,
    '',
    `${E.link} Acompanhe seu pedido:`,
    trackLink(o),
    '',
    `Obrigado pela compra! ${E.hands}`,
    SIGN,
  ]),
};
const TPL_NAMES = { criado: 'Pedido registrado', status: 'Atualização de entrega', nota: 'Nota fiscal' };

let tpl = 'criado';
function setTpl(t) {
  tpl = t;
  $$('#tpl [data-tpl]').forEach(b => b.classList.toggle('is-active', b.dataset.tpl === t));
  renderMsg();
}
$('#tpl').addEventListener('click', e => { const b = e.target.closest('[data-tpl]'); if (b) { readForm(); setTpl(b.dataset.tpl); } });

// WhatsApp-like preview: *bold*, line breaks, links
const waHtml = text => esc(text)
  .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
  .replace(/\n/g, '<br>');

function renderMsg() {
  if (!current) return;
  const noNf = tpl === 'nota' && !current.nf;
  const withPdf = tpl === 'nota' && !noNf;
  const text = noNf ? '' : TEMPLATES[tpl](current);
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const doc = withPdf ? `<div class="wa__doc"><i class="ph ph-file-pdf"></i><div><b>${esc(nfFileName(current))}</b><span>1 página · PDF</span></div></div>` : '';
  $('#wa-preview').innerHTML = noNf
    ? '<span class="wa__empty">Gere a nota fiscal na aba Nota fiscal para liberar esta mensagem.</span>'
    : `${doc}${waHtml(text)}<span class="wa__time">${now} <i class="ph ph-checks"></i></span>`;

  $('#wa-share').hidden = $('#wa-pdf').hidden = !withPdf;
  const send = $('#wa-send');
  const label = withPdf ? 'Enviar só o texto' : 'Enviar no WhatsApp';
  send.className = withPdf ? 'btn btn--line' : 'btn btn--whats';
  $('.btn__label', send).dataset.text = label;
  $('.btn__label > span', send).textContent = label;
  send.disabled = $('#wa-copy').disabled = noNf;
  if (withPdf) getPdf(current).catch(() => {}); // prepare the file before the click, so sharing keeps the user gesture

  const sent = current.msgs.filter(m => m.tpl === tpl).at(-1);
  $('#wa-note').innerHTML = [
    withPdf
      ? (IS_MOBILE
        ? '<i class="ph ph-paperclip"></i> <b>Enviar com o PDF</b> abre o compartilhamento do celular com a nota e a mensagem juntas: escolha o WhatsApp e a conversa do cliente.'
        : '<i class="ph ph-paperclip"></i> <b>Enviar com o PDF</b> baixa o PDF e abre a conversa do cliente no WhatsApp Web com a mensagem pronta. Clique no clipe, anexe o arquivo baixado e envie.')
      : `<i class="ph ph-info"></i> A conversa abre ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'} com o texto pronto. Confira e envie.`,
    sent ? `<br><i class="ph ph-check"></i> Última vez enviada em ${fmtDate(sent.data)}.` : '',
  ].join('');
}

/* Phones open the WhatsApp app (keeps emojis). On computers the WhatsApp Desktop app turns 4-byte emojis into "�"
   and drops line breaks when it receives text from a link or from the Windows share sheet, so desktops go to
   WhatsApp Web, which keeps the message exactly as written. */
const IS_MOBILE = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
function openChat(text) {
  const host = IS_MOBILE ? 'https://api.whatsapp.com/send' : 'https://web.whatsapp.com/send';
  window.open(`${host}?phone=${phoneDigits(current.cliente.whatsapp)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
function markSent(t) {
  current.msgs.push({ tpl: t, data: new Date().toISOString() });
  if (t === 'nota' && current.nf) current.nf.enviadaEm = new Date().toISOString();
  commit(); renderNf(); renderMsg();
}
function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('#wa-send').addEventListener('click', () => {
  if (!valid()) return;
  openChat(TEMPLATES[tpl](current));
  markSent(tpl);
  toast(`${TPL_NAMES[tpl]}: conversa aberta ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'}.`);
});

// Phones: PDF + message together through the share sheet. Computers: download the PDF and open WhatsApp Web
// (the Windows share sheet garbles the message text, see openChat).
$('#wa-share').addEventListener('click', async () => {
  if (!valid() || !current.nf) return;
  const text = TEMPLATES.nota(current);
  let file;
  try { file = await getPdf(current); } catch { return toast('Não foi possível gerar o PDF da nota.'); }
  if (IS_MOBILE && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      markSent('nota');
      toast('Nota e mensagem enviadas para o compartilhamento.');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // share sheet closed
    }
  }
  downloadFile(file);
  try { await navigator.clipboard.writeText(text); } catch {} // backup: the message can also be pasted
  openChat(text);
  markSent('nota');
  toast(`PDF baixado (${file.name}). No WhatsApp Web, clique no clipe, anexe o arquivo e envie.`);
});
$('#wa-pdf').addEventListener('click', async () => {
  try { downloadFile(await getPdf(current)); } catch { toast('Não foi possível gerar o PDF da nota.'); }
});
$('#wa-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(TEMPLATES[tpl](current));
    toast('Texto copiado. Cole na conversa do cliente.');
  } catch { toast('Não foi possível copiar. Selecione o texto da prévia.'); }
});

/* =====================================================================
   NF PDF (real file built with jsPDF; helvetica covers Portuguese accents)
   ===================================================================== */
const nfFileName = o => `nota-fiscal-${o.codigo}-${o.nf?.numero || 'previa'}.pdf`;
let logoData;
async function logoDataUrl() {
  if (logoData !== undefined) return logoData;
  try {
    const blob = await (await fetch('../assets/logo.png')).blob();
    logoData = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  } catch { logoData = null; }
  return logoData;
}
const pdfCache = new Map();
const pdfKey = o => JSON.stringify([o.codigo, o.nf, o.cliente, o.itens, o.frete, o.status, o.rastreio, o.previsao, o.historico, storeCnpj()]);
function getPdf(o) {
  const k = pdfKey(o);
  if (!pdfCache.has(k)) {
    const snap = structuredClone(o);
    const p = buildNfPdf(snap).then(blob => new File([blob], nfFileName(snap), { type: 'application/pdf' }));
    p.catch(() => pdfCache.delete(k));
    pdfCache.set(k, p);
  }
  return pdfCache.get(k);
}

/* DANFE-style layout following the owner's model (A4 in points, same grid as the model).
   Fiscal-only data (chave de acesso, protocolo, ICMS) is never invented: those fields say they come from the
   official emitter, and the page carries a "sem valor fiscal" watermark until the NF-e integration exists. */
async function buildNfPdf(o) {
  if (!window.jspdf) throw new Error('jsPDF indisponível');
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const L = 25, R = 570, W = R - L;
  const ink = [20, 20, 22], gray = [110, 110, 116], line = [60, 60, 64], band = [217, 217, 217], red = [196, 22, 28];
  const up = v => String(v ?? '').toUpperCase();
  const num = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfNum = `Nº ${String(o.nf.numero).padStart(9, '0').replace(/^(\d{3})/, '$1.')}`;
  const emit = new Date(o.nf.emitidaEm);
  const dateBR = d => d ? new Date(d).toLocaleDateString('pt-BR') : '';
  const saida = o.historico?.find(h => h.status === 2)?.data;
  const [municipio, uf] = (() => { const m = String(o.cliente.cidade || '').split(/\s*[-/]\s*/); return [m[0] || '', m.length > 1 ? m.at(-1) : ''] })();

  doc.setProperties({ title: `Nota fiscal ${o.nf.numero} - ${o.codigo}`, author: 'Atual Comércio de Sucatas' });
  doc.setLineWidth(0.6);

  const font = (size, bold = false, color = ink) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  const box = (x, y, w, h) => { doc.setDrawColor(...line); doc.rect(x, y, w, h); };
  // a labelled cell: tiny gray caption on top, value below
  const cell = (x, y, w, h, label, value = '', { bold = false, size = 8, align = 'left' } = {}) => {
    box(x, y, w, h);
    font(5.2, false, gray); doc.text(up(label), x + 4, y + 7);
    font(size, bold);
    const tx = align === 'right' ? x + w - 4 : x + 4;
    const fit = doc.splitTextToSize(String(value ?? ''), w - 8)[0] || '';
    doc.text(fit, tx, y + h - 5, { align });
  };
  const bar = (y, title) => {
    doc.setFillColor(...band); doc.setDrawColor(...line); doc.rect(L, y, W, 11, 'FD');
    font(6.8, true); doc.text(up(title), L + 4, y + 8);
    return y + 11;
  };

  /* canhoto (receipt stub) */
  box(L, 25, 465, 55);
  font(5.8); doc.text('RECEBEMOS DE ATUAL COMÉRCIO DE SUCATAS OS PRODUTOS/SERVIÇOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO', L + 4, 37);
  doc.setDrawColor(...line); doc.line(L, 45, 490, 45); doc.line(145, 45, 145, 80);
  font(5.2, false, gray); doc.text('DATA DE RECEBIMENTO', L + 4, 53); doc.text('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', 149, 53);
  box(490, 25, 80, 55);
  font(10, true); doc.text('NF-e', 530, 40, { align: 'center' });
  font(7.5); doc.text(nfNum, 497, 54); doc.text(`SÉRIE: ${o.nf.serie}`, 497, 66);
  doc.setLineDashPattern([3, 2], 0); doc.line(L, 85, R, 85); doc.setLineDashPattern([], 0);

  /* header: our store block | DANFE | chave/protocolo */
  const top = 90, hh = 95;
  box(L, top, 180, hh);
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', L + 8, top + 10, 40, 40, 'logo', 'FAST');
  const tx = logo ? L + 54 : L + 8;
  font(8.4, true); doc.text('Atual Comércio de Sucatas', tx, top + 20);
  font(6.6, false, [60, 60, 64]);
  doc.text(['R. Horaide Prestes de Souza, 65', 'Vila Real, Chapecó - SC', '89805-807', '(49) 9 9104-1665'], tx, top + 30, { lineHeightFactor: 1.35 });
  if (storeCnpj()) { font(6.8, true); doc.text(`CNPJ: ${storeCnpj()}`, L + 8, top + hh - 10); }

  box(205, top, 132, hh);
  font(13, true); doc.text('DANFE', 271, top + 16, { align: 'center' });
  font(5.8); doc.text(['DOCUMENTO AUXILIAR', 'DA NOTA FISCAL', 'ELETRÔNICA'], 271, top + 26, { align: 'center', lineHeightFactor: 1.3 });
  doc.line(205, top + 52, 337, top + 52); doc.line(205, top + 78, 337, top + 78);
  font(6.4); doc.text(['0 - Entrada', '1 - Saída'], 213, top + 62, { lineHeightFactor: 1.5 });
  box(290, top + 56, 22, 19); font(12, true); doc.text('1', 301, top + 70, { align: 'center' });
  font(7.5, true); doc.text(nfNum, 271, top + 89, { align: 'center' });

  box(337, top, 233, hh);
  font(5.2, false, gray); doc.text('CHAVE DE ACESSO', 343, top + 8);
  box(343, top + 13, 221, 28);
  font(6.4, false, gray); doc.text('Gerada pelo emissor fiscal na emissão da NF-e', 453, top + 29.5, { align: 'center' });
  font(5.2, false, gray); doc.text(['Consulta de autenticidade disponível após a autorização', 'da NF-e em www.nfe.fazenda.gov.br/portal'], 343, top + 51, { lineHeightFactor: 1.35 });
  doc.line(337, top + 66, R, top + 66);
  font(5.2, false, gray); doc.text('PROTOCOLO DE AUTORIZAÇÃO DE USO', 343, top + 74);
  font(7, true, gray); doc.text('Aguardando autorização da SEFAZ', 343, top + 87);

  /* natureza */
  let y = top + hh + 3;
  cell(L, y, 450, 24, 'Natureza da operação', 'VENDA DE MERCADORIA', { bold: true });
  cell(475, y, 95, 24, 'Data da emissão', dateBR(emit));
  y += 28;

  /* destinatário */
  y = bar(y, 'Destinatário/Remetente');
  cell(L, y, 250, 24, 'Nome/Razão social', up(o.cliente.nome), { bold: true, size: 8.6 });
  cell(275, y, 150, 24, 'CNPJ/CPF', o.cliente.doc || '');
  cell(425, y, 145, 24, 'Data da emissão', dateBR(emit));
  y += 24;
  cell(L, y, 227, 24, 'Endereço', up(o.cliente.endereco));
  cell(252, y, 100, 24, 'Bairro/Distrito', up(o.cliente.bairro));
  cell(352, y, 80, 24, 'CEP', o.cliente.cep || '');
  cell(432, y, 138, 24, 'Data de saída/entrada', dateBR(saida));
  y += 24;
  cell(L, y, 227, 24, 'Município', up(municipio), { size: 8.4 });
  cell(252, y, 60, 24, 'UF', up(uf), { bold: true, size: 8.4 });
  cell(312, y, 120, 24, 'Fone/WhatsApp', o.cliente.whatsapp || '');
  cell(432, y, 138, 24, 'Hora de saída', saida ? new Date(saida).toLocaleTimeString('pt-BR') : '');
  y += 28;

  /* cálculo do imposto (tax values come only from the official emitter) */
  const produtos = o.itens.reduce((t, i) => t + i.qtd * i.valor, 0);
  y = bar(y, 'Cálculo do imposto');
  const c5 = [[L, 78], [103, 78], [181, 78], [259, 94], [353, 217]];
  [['Base de cálc. do ICMS', '-'], ['Valor do ICMS', '-'], ['Base de cálc. ICMS ST', '-'], ['Valor do ICMS ST', '-'], ['Valor total produtos', num(produtos)]]
    .forEach(([lb, v], k) => cell(c5[k][0], y, c5[k][1], 22, lb, v, { bold: k === 4, size: k === 4 ? 9 : 8 }));
  y += 22;
  [['Valor do frete', num(o.frete)], ['Valor do seguro', num(0)], ['Desconto', num(0)], ['Outras despesas', num(0)], ['Valor total da nota', num(orderTotal(o))]]
    .forEach(([lb, v], k) => cell(c5[k][0], y, c5[k][1], 22, lb, v, { bold: k === 4, size: k === 4 ? 10 : 8 }));
  y += 26;

  /* transportador */
  const transp = o.rastreio?.transportadora || '';
  const porConta = Number(o.frete) > 0 ? '1 - Dest.' : (!transp || /retirada/i.test(transp) ? '9 - Sem frete' : '0 - Emit.');
  const volumes = o.itens.reduce((t, i) => t + i.qtd, 0);
  y = bar(y, 'Transportador/Volumes transportados');
  cell(L, y, 307, 20, 'Razão social', up(transp));
  cell(332, y, 238, 20, 'Frete por conta', porConta);
  y += 20;
  cell(L, y, 80, 20, 'Quantidade', String(volumes).padStart(2, '0'), { bold: true });
  cell(105, y, 342, 20, 'Espécie', 'VOL');
  cell(447, y, 61, 20, 'Peso bruto', '');
  cell(508, y, 62, 20, 'Peso líquido', '');
  y += 24;

  /* produtos */
  y = bar(y, 'Dados dos produtos/serviços');
  const cols = { cod: L + 4, desc: L + 46, un: 307, q: 352, vu: 425, vt: 505 };
  const rowsTop = y;
  font(5.2, false, gray);
  doc.text('CÓDIGO', cols.cod, y + 9); doc.text('DESCRIÇÃO DO PRODUTO/SERVIÇO', cols.desc, y + 9);
  doc.text('UN', cols.un, y + 9, { align: 'center' }); doc.text('QUANT', cols.q, y + 9, { align: 'center' });
  doc.text('VALOR UNIT', cols.vu, y + 9, { align: 'right' }); doc.text('VALOR TOTAL', cols.vt, y + 9, { align: 'right' });
  y += 14; doc.line(L, y, R, y);
  o.itens.forEach((it, k) => {
    const lines = doc.splitTextToSize(up(it.desc), cols.un - cols.desc - 20);
    font(7.2);
    doc.text(String(k + 1).padStart(3, '0'), cols.cod, y + 11);
    doc.text(lines, cols.desc, y + 11, { lineHeightFactor: 1.3 });
    doc.text('UN', cols.un, y + 11, { align: 'center' });
    doc.text(String(it.qtd), cols.q, y + 11, { align: 'center' });
    doc.text(num(it.valor), cols.vu, y + 11, { align: 'right' });
    font(7.2, true); doc.text(num(it.qtd * it.valor), cols.vt, y + 11, { align: 'right' });
    y += 8 + lines.length * 9.4;
  });
  y += 4;
  box(L, rowsTop, W, y - rowsTop);
  y += 4;

  /* dados adicionais */
  y = bar(y, 'Dados adicionais');
  const addTop = y, addBottom = 790;
  box(L, addTop, W, addBottom - addTop);
  font(5.2, false, gray); doc.text('INFORMAÇÕES COMPLEMENTARES', L + 4, y + 9);
  y += 24;
  font(9, true); doc.text(`Pedido: ${o.codigo}`, L + 4, y); y += 14;
  if (o.rastreio?.codigo) { font(9, true); doc.text(`Código de Rastreio: ${o.rastreio.codigo}`, L + 4, y); y += 14; }
  if (o.previsao) { font(8.4); doc.text(`Previsão de Entrega: ${fmtDay(o.previsao)}`, L + 4, y); y += 14; }
  font(6.4, false, gray);
  doc.text(doc.splitTextToSize('Documento gerado pelo painel da Atual Sucatas, sem valor fiscal. A NF-e oficial, com chave de acesso e protocolo de autorização, é emitida pelo emissor fiscal da loja.', W - 8), L + 4, addBottom - 14);

  /* watermark */
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.1 }));
  font(46, true, red);
  doc.text('SEM VALOR FISCAL', 297, 520, { align: 'center', angle: 32 });
  doc.restoreGraphicsState();

  return doc.output('blob');
}

/* =====================================================================
   NF PREVIEW
   ===================================================================== */
const nfDialog = $('#nf-dialog');
let nfUrl;
async function openNfPreview() {
  let file;
  try { file = await getPdf(current); } catch { return toast('Não foi possível gerar o PDF da nota.'); }
  if (nfUrl) URL.revokeObjectURL(nfUrl);
  nfUrl = URL.createObjectURL(file);
  $('#nf-frame').src = `${nfUrl}#toolbar=0&view=FitH`;
  nfDialog.showModal();
}
$('#nf-download').addEventListener('click', async () => {
  try { downloadFile(await getPdf(current)); } catch { toast('Não foi possível gerar o PDF da nota.'); }
});

/* dialogs: close buttons + backdrop click */
$$('dialog').forEach(d => {
  $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });
});

/* button fill direction (same as site) */
document.addEventListener('pointerover', e => {
  const btn = e.target.closest('.btn');
  if (!btn || btn.contains(e.relatedTarget)) return;
  const r = btn.getBoundingClientRect();
  btn.style.setProperty('--x', `${e.clientX - r.left}px`);
  btn.style.setProperty('--y', `${e.clientY - r.top}px`);
});

/* =====================================================================
   BOOT
   ===================================================================== */
if (!window.crypto?.subtle) {
  $('#auth-hint').textContent = 'Abra o painel por um endereço seguro (https) para usar o login.';
  $('#auth-submit').disabled = true;
} else if (sessionStorage.getItem(SESSION_KEY) === '1' && readAuth()) enterApp();
else showAuth();
