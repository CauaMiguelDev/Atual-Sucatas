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
let serverAuth = null; // { configurado } quando a API de login responde
const setupMode = () => serverAuth ? !serverAuth.configurado : !readAuth();

function setSubmitLabel(text) {
  $('#auth-submit .btn__label').dataset.text = text;
  $('#auth-submit .btn__label > span').textContent = text;
}
/* duas abas no login: Cliente (a loja) e Admin (o administrador do site) */
let authTab = new URLSearchParams(location.search).get('acesso') === 'admin' ? 'admin' : 'cliente';
// sem a API só é normal no computador local e nos endereços antigos; na Hostinger isso é falha do servidor,
// e criar um acesso local ali deixaria os pedidos presos em um navegador
const NO_API_OK = /^(localhost|127\.0\.0\.1|\[::1\])?$|\.github\.io$|\.netlify\.app$/.test(location.hostname);
function showAuth(msg = '', ok = false) {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  const admin = authTab === 'admin', down = !serverAuth && !NO_API_OK, setup = !admin && !down && setupMode();
  $$('[data-auth-tab]').forEach(b => { const on = b.dataset.authTab === authTab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
  $('#auth-title').textContent = admin ? 'Administração' : setup ? 'Crie o acesso do painel' : 'Painel da loja';
  $('#auth-hint').textContent = down ? 'O painel não conseguiu falar com o servidor. Confira se o PHP da hospedagem está na versão 8 e recarregue a página.'
    : admin ? 'Acesso restrito ao administrador do site.'
    : !setup ? 'Entre com seu usuário e senha.' : serverAuth
    ? 'Primeiro acesso: cole a chave de instalação e escolha usuário e senha. Depois disso, qualquer aparelho entra só com eles.'
    : 'Primeiro acesso: escolha um usuário e uma senha com pelo menos 6 caracteres.';
  $('#key-wrap').hidden = !(setup && serverAuth);
  $('#pw2-wrap').hidden = !setup;
  $('#pw2').required = setup;
  $('#pw').autocomplete = setup ? 'new-password' : 'current-password';
  setSubmitLabel(setup ? 'Criar acesso e entrar' : 'Entrar');
  authErr.textContent = msg;
  authErr.classList.toggle('is-ok', ok);
  $('#pw').value = ''; $('#pw2').value = '';
  if (setup || admin) $('#user').value = '';
  if (!setup && !admin) applyLock();
  else { clearInterval(lockTimer); ['#user', '#pw', '#pw2'].forEach(f => ($(f).disabled = false)); }
  $('#auth-submit').disabled = down || (!setup && !admin && readLock().until > Date.now());
  setTimeout(() => ($('#user').value ? $('#pw') : $('#user')).focus(), 50);
}
$$('[data-auth-tab]').forEach(b => b.addEventListener('click', () => { authTab = b.dataset.authTab; showAuth(); }));
async function adminSubmit(user, pw) {
  authErr.classList.remove('is-ok');
  if (!serverAuth) return (authErr.textContent = 'O acesso de administrador funciona com o site publicado na Hostinger.');
  setSubmitLabel('Conectando...');
  const r = await ADMIN.check(user, pw);
  setSubmitLabel('Entrar');
  if (!r.ok) { authErr.textContent = r.error; shake($('#auth-form')); $('#pw').select(); return; }
  await setCredentials(user, pw); // abre também o painel da loja neste aparelho; quem decide o acesso é o servidor
  sessionStorage.setItem(SESSION_KEY, '1');
  location.href = 'admin.html';
}
function enterApp(fromLogin = false) {
  clearLock();
  sessionStorage.setItem(SESSION_KEY, '1');
  if (fromLogin) playGate();
  $('#auth').hidden = true;
  $('#app').hidden = false;
  autoAdvanceSchedule();
  renderAll();
  armIdle();
  setView(VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'inicio');
  if (fromLogin) setTimeout(() => enterView(currentView), 850); // a entrada acontece quando a cortina sobe
  // deep link from the admin area: painel/?pedido=AS-1027 opens that order
  const code = new URLSearchParams(location.search).get('pedido');
  if (code) { const o = orders.find(x => x.codigo === code); if (o) openDrawer(o); }
}
function logout(msg) {
  sessionStorage.removeItem(SESSION_KEY);
  ADMIN.logout();
  $$('dialog[open]').forEach(d => d.close());
  showAuth(msg);
}


authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('#user').value, pw = $('#pw').value;
  if (authTab === 'admin') return adminSubmit(user, pw);
  if (serverAuth) return serverSubmit(user, pw);
  if (readLock().until > Date.now()) return applyLock();
  if (setupMode()) {
    if (normUser(user).length < 3 || /\s/.test(user.trim())) return (authErr.textContent = 'O usuário precisa ter pelo menos 3 letras, sem espaços.');
    if (pw.length < 6) return (authErr.textContent = 'A senha precisa ter pelo menos 6 caracteres.');
    if (pw !== $('#pw2').value) return (authErr.textContent = 'As duas senhas não são iguais.');
    setSubmitLabel('Criando acesso...');
    await setCredentials(user, pw);
    return enterApp(true);
  }
  if (!(await checkLogin(user, pw))) {
    registerFail();
    shake($('#auth-form'));
    if (!$('#pw').disabled) $('#pw').select();
    return;
  }
  enterApp(true);
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
const fmtPhone = p => {
  const d = String(p || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : String(p || '');
};
const fmtDay = ymd => ymd ? ymd.split('-').reverse().join('/') : '';
const PAYMENTS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto', 'Transferência bancária', 'A combinar'];

/* what the store does next with an order, in the order a sale normally goes */
function nextStep(o) {
  const sent = (t, s) => (o.msgs || []).some(m => m.tpl === t && (s === undefined || m.status === s));
  if (!sent('criado')) return { text: 'Envie a confirmação do pedido para o cliente no WhatsApp.', short: 'Enviar confirmação', btn: 'Enviar confirmação', tab: 'msg', tpl: 'criado' };
  if (!o.nf) return { text: 'Emita a nota fiscal. O passo a passo mostra o que conferir antes.', short: 'Emitir nota fiscal', btn: 'Emitir nota', tab: 'nota' };
  if (!o.nf.enviadaEm) return { text: 'Envie o PDF da nota fiscal para o cliente no WhatsApp.', short: 'Enviar nota fiscal', btn: 'Enviar nota', tab: 'nota' };
  if (o.status < 2) return { text: 'Quando a peça sair, mude a situação para Enviado e informe a transportadora e o rastreio.', short: 'Despachar a peça', btn: 'Atualizar entrega', tab: 'entrega' };
  if (!sent('status', o.status)) return { text: `Avise o cliente que o pedido está em: ${ORDER_STATUS[o.status]}.`, short: 'Avisar o cliente', btn: 'Enviar aviso', tab: 'msg', tpl: 'status' };
  if (o.status < LAST) return { text: 'Quando o cliente receber, marque o pedido como Entregue e envie o aviso.', short: 'Aguardando entrega', btn: 'Atualizar entrega', tab: 'entrega' };
  return { done: true, text: 'Pedido concluído. O cliente recebeu a confirmação, a nota e todos os avisos.', short: 'Concluído' };
}
// código de rastreio da loja: nasce com o pedido e nunca muda, mesmo se entrar um código de transportadora
const genTrack = () => 'ATS' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
const trackCodeOf = o => o.codigoRastreio || o.rastreio?.codigo || o.codigo;
const SITE_KEY = 'atual_site_url';
const siteUrl = () => localStorage.getItem(SITE_KEY) || new URL('../site/', location.href).href;
// the saved address can be the domain root or the site/ folder; the tracking page lives in site/
const trackPage = code => {
  const base = siteUrl().replace(/[?#].*$/, '').replace(/index\.html$/, '').replace(/\/?$/, '/');
  return `${base}${/\/site\/$/.test(base) ? '' : 'site/'}rastreio.html?pedido=${encodeURIComponent(code)}`;
};
const trackLink = o => trackPage(o.codigo);

/* =====================================================================
   VIEWS
   ===================================================================== */
const VIEWS = {
  inicio: ['Início', ''],
  pedidos: ['Pedidos', 'Cada venda, da primeira mensagem no WhatsApp até a entrega na porta do cliente.'],
  notas: ['Notas fiscais', 'Toda peça sai daqui com nota. Emita, confira e envie sem sair do painel.'],
  entregas: ['Entregas', 'De Chapecó para todo o Brasil. Veja cada pedido na estrada e avise o cliente em um clique.'],
  clientes: ['Clientes', 'Quem já comprou da loja, com o histórico montado sozinho a partir dos pedidos.'],
  mensagens: ['Mensagens', 'Todos os avisos de WhatsApp num lugar só. Escolha o pedido, confira o texto e envie.'],
  rastreio: ['Testar rastreio', 'Veja exatamente o que o cliente vê ao abrir o link.'],
  ajuda: ['Como usar', 'O dia a dia do painel, em poucos passos.'],
  config: ['Configurações', 'Senha do painel, dados da loja e backup.'],
};
let currentView = 'inicio';
function setView(v) {
  $$('[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
  $$('[data-view-panel]').forEach(p => (p.hidden = p.dataset.viewPanel !== v));
  [$('#view-title').textContent, $('#view-sub').textContent] = VIEWS[v];
  currentView = v;
  $('#main-head').hidden = v === 'inicio';
  $('#new-order').hidden = !['pedidos', 'notas', 'entregas'].includes(v);
  history.replaceState(null, '', `${location.search}#${v}`);
  scrollTo(0, 0);
  enterView(v);
  if (v === 'rastreio') renderTester();
  if (v === 'config') { $('#site-url').value = siteUrl(); $('#store-cnpj').value = storeCnpj(); $('#cfg-user').textContent = readAuth()?.user || ''; $('#sync-key').value = syncKey(); renderSyncStatus(); }
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
    <div class="kpi"><span><i class="ph ph-truck"></i>Em andamento</span><strong data-num="${open}">${open}</strong></div>
    <button class="kpi kpi--red" type="button" data-go="issued"><span><i class="ph ph-receipt"></i>Notas emitidas em ${monthLabel(thisMonth()).split(' ')[0].toLowerCase()}</span><strong data-num="${month}">${month}</strong></button>
    <button class="kpi" type="button" data-go="unsent"><span><i class="ph ph-whatsapp-logo"></i>Notas a enviar</span><strong data-num="${nfUnsent}">${nfUnsent}</strong></button>
    <div class="kpi"><span><i class="ph ph-currency-circle-dollar"></i>Total em pedidos</span><strong data-num="${total}" data-money>${brl(total)}</strong></div>`;
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
    const next = nextStep(o);
    return `<tr data-code="${esc(o.codigo)}" style="--i:${Math.min(i, 12)}">
      <td><span class="o-code">${esc(o.codigo)}</span><span class="o-sub">${fmtDate(o.data)}</span></td>
      <td>${esc(o.cliente.nome || 'Sem nome')}<span class="o-sub">${esc(o.cliente.cidade)}</span></td>
      <td><div class="o-items">${o.itens.map(i => esc(i.desc)).join(', ') || '<span class="o-sub">Sem peças</span>'}</div></td>
      <td><strong>${brl(orderTotal(o))}</strong></td>
      <td>${statusPill(o)}<span class="o-next ${next.done ? 'is-done' : ''}"><i class="ph ${next.done ? 'ph-check' : 'ph-arrow-bend-down-right'}"></i>${next.short}</span></td>
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
// the how-to guide stays closed once the store closes it
const guide = $('#guide');
try { if (localStorage.getItem('atual_painel_guia') === 'fechado') guide.open = false; } catch {}
guide.addEventListener('toggle', () => { try { localStorage.setItem('atual_painel_guia', guide.open ? 'aberto' : 'fechado'); } catch {} });
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
    <div class="kpi kpi--red"><span><i class="ph ph-receipt"></i>Notas emitidas</span><strong data-num="${issued.length}">${issued.length}</strong></div>
    <div class="kpi"><span><i class="ph ph-currency-circle-dollar"></i>Valor das notas</span><strong data-num="${sum}" data-money>${brl(sum)}</strong></div>
    <div class="kpi"><span><i class="ph ph-checks"></i>Enviadas ao cliente</span><strong data-num="${sent}">${sent}</strong></div>
    <div class="kpi"><span><i class="ph ph-clock"></i>Aguardando envio</span><strong data-num="${issued.length - sent}">${issued.length - sent}</strong></div>`;

  const pending = nfFilter === 'pending';
  const list = (pending
    ? orders.filter(o => !o.nf)
    : issued.filter(o => nfFilter === 'issued' || (nfFilter === 'unsent' ? !o.nf.enviadaEm : !!o.nf.enviadaEm)))
    .sort((a, b) => (b.nf?.emitidaEm || b.data).localeCompare(a.nf?.emitidaEm || a.data));

  $('#nf-rows').innerHTML = list.map((o, i) => {
    const act = !o.nf ? ['Emitir nota', 'ph-file-plus', 'nota'] : !o.nf.enviadaEm ? ['Enviar', 'ph-whatsapp-logo', 'msg'] : ['Ver PDF', 'ph-file-pdf', 'pdf'];
    return `<tr data-code="${esc(o.codigo)}" data-act="${act[2]}" style="--i:${Math.min(i, 12)}">
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
  openDrawer(orders.find(x => x.codigo === tr.dataset.code), 'nota');
  if (tr.dataset.act === 'pdf') openPdfPreview('nf');
});

const renderAll = () => { renderKpis(); renderRows(); renderNfRows(); renderNfQueue(); renderHome(); renderShips(); renderClients(); renderMc(); };

/* config */
$('#pw-form').addEventListener('submit', async e => {
  e.preventDefault();
  const a = readAuth();
  if (!serverAuth && !(await checkLogin(a.user, $('#pw-old').value))) return toast('A senha atual está incorreta.');
  const newUser = $('#user-new').value.trim() || a.user;
  if (normUser(newUser).length < 3 || /\s/.test(newUser)) return toast('O usuário precisa ter pelo menos 3 letras, sem espaços.');
  if ($('#pw-new').value.length < 6) return toast('A nova senha precisa ter pelo menos 6 caracteres.');
  if ($('#pw-new').value !== $('#pw-new2').value) return toast('As duas senhas novas não são iguais.');
  if (serverAuth) {
    const r = await fetch(syncUrl('login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'trocar', usuario: a.user, senha: $('#pw-old').value, novoUsuario: newUser, novaSenha: $('#pw-new').value }) }).catch(() => null);
    if (!r?.ok) return toast(r ? 'A senha atual está incorreta.' : 'Sem conexão com o servidor.');
  }
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
/* sync key: same value in every device links them to the shared store */
function renderSyncStatus() {
  $('#sync-status').textContent = serverAuth ? 'Conectado sozinho pelo login. Não precisa colar nada aqui.' : syncKey()
    ? 'Sincronização ligada. Os pedidos aparecem em todos os aparelhos com esta chave.'
    : 'Sincronização desligada. Os pedidos ficam só neste navegador.';
}
$('#sync-form').addEventListener('submit', e => {
  e.preventDefault();
  const k = $('#sync-key').value.trim();
  if (k) localStorage.setItem(SYNC_KEY_STORE, k); else localStorage.removeItem(SYNC_KEY_STORE);
  localStorage.removeItem(SYNC_QUEUE); // começa a fila limpa com a nova chave
  toast(k ? 'Chave salva. Buscando os pedidos…' : 'Sincronização desligada.');
  setTimeout(() => location.reload(), 600); // recarrega para (re)iniciar a sincronização
});
$('#reset-demo').addEventListener('click', async () => {
  const n = loadOrders().length;
  if (!n) return toast('O painel já está vazio.');
  const aviso = syncKey() ? 'de TODOS os aparelhos' : 'deste navegador';
  if (!confirm(`Apagar TODOS os ${n} pedido(s) ${aviso}? Pedidos sem nota não voltam. ${avisoCatalogo()}`)) return;
  await clearAllOrders();
  orders = loadOrders();
  renderAll();
  toast('Painel limpo. Todos os pedidos foram apagados.');
});
/* delete a single order from the drawer */
$('#d-delete').addEventListener('click', () => {
  if (isNew || !current) return;
  if (!confirm(`Apagar o pedido ${current.codigo} de ${current.cliente.nome || 'sem nome'}? ${avisoCatalogo()}`)) return;
  orders = loadOrders().filter(o => o.codigo !== current.codigo);
  saveOrders(orders);
  drawer.close();
  renderAll();
  toast(`Pedido ${current.codigo} apagado.`);
});
/* remove the invoice from every order (keeps the orders); also drops the "nota enviada" messages so the counts zero out */
$('#clear-nf').addEventListener('click', () => {
  orders = loadOrders();
  const n = orders.filter(o => o.nf).length;
  if (!n) return toast('Não há notas para apagar.');
  if (!confirm(`Apagar as ${n} nota(s) fiscal(is) de todos os pedidos? Os pedidos continuam e voltam para "a emitir". ${avisoCatalogo()}`)) return;
  orders.forEach(o => { o.nf = null; o.msgs = (o.msgs || []).filter(m => m.tpl !== 'nota'); });
  saveOrders(orders);
  if (drawer.open && current && !isNew) {
    const f = orders.find(o => o.codigo === current.codigo);
    if (f) { current.nf = null; current.msgs = f.msgs; renderHead(); renderNext(); renderNotes(); renderMsg(); }
  }
  renderAll();
  toast(`${n} nota(s) apagada(s).`);
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
  if (t === 'nota') renderNotes();
  if (t === 'entrega') { readForm(); renderNotify(); }
}

/* Entrega tab: one-click customer notifications + the delivery schedule built from the previsão. */
const NOTIFY_ICON = ['ph-check-circle', 'ph-wrench', 'ph-package', 'ph-truck', 'ph-paper-plane-tilt', 'ph-flag-checkered'];
// planned fraction of the order→previsão window for stages 0..4 (Entregue is always confirmed by hand)
const SCHED_FRAC = [0, 0.15, 0.35, 0.6, 1];
const schedEnds = o => { const start = new Date(o.data).setHours(0, 0, 0, 0); const end = new Date(`${o.previsao}T00:00:00`).getTime(); return { start, end }; };
const plannedDate = (o, i) => { const { start, end } = schedEnds(o); return new Date(start + SCHED_FRAC[i] * (end - start)); };
function plannedStage(o) {
  if (!o.previsao) return null;
  const { start, end } = schedEnds(o);
  if (!(end > start)) return null;
  const today = new Date().setHours(0, 0, 0, 0);
  let stage = 0;
  SCHED_FRAC.forEach((f, i) => { if (today >= start + f * (end - start)) stage = i; });
  return stage; // 0..4
}
// move each order forward to the stage its previsão plans for today (never past "Saiu para entrega", never backwards).
// Runs when the panel opens — there is no server to advance it in the background, and the customer message is still sent by hand.
function autoAdvanceSchedule() {
  let changed = false;
  orders.forEach(o => {
    const sug = plannedStage(o);
    if (sug == null || o.status >= sug || o.status >= 4) return;
    for (let s = o.status + 1; s <= sug; s++) o.historico.push({ status: s, data: new Date().toISOString(), auto: true });
    o.status = sug;
    changed = true;
  });
  if (changed) saveOrders(orders);
}
function renderNotify() {
  if (!current) return;
  const sug = plannedStage(current);
  const steps = ORDER_STATUS.map((s, i) =>
    `<button type="button" class="notify__btn ${i === current.status ? 'is-current' : ''} ${i < current.status ? 'is-done' : ''} ${i === sug ? 'is-suggested' : ''}" data-notify="${i}"><i class="ph ${NOTIFY_ICON[i]}"></i>${s}${i === sug ? '<span class="notify__today">hoje</span>' : ''}</button>`).join('');
  const t = current.tentativas || 0;
  $('#notify').innerHTML = steps +
    `<button type="button" class="notify__btn notify__btn--warn" data-notify="attempt"><i class="ph ph-house-line"></i>Não consegui entregar${t ? ` (${t}/3)` : ''}</button>`;

  const box = $('#sched');
  if (!current.previsao) {
    box.innerHTML = '<i class="ph ph-info"></i> Defina a <b>previsão de entrega</b> acima para montar a agenda e destacar a etapa de cada dia.';
    return;
  }
  if (sug == null) { box.innerHTML = '<i class="ph ph-warning"></i> A previsão precisa ser depois da data do pedido.'; return; }
  const ag = [1, 2, 3, 4].map(i => `${ORDER_STATUS[i]}: <b>${plannedDate(current, i).toLocaleDateString('pt-BR')}</b>`).join(' · ');
  const tail = current.status < sug
    ? ' — clique no botão em destaque para avançar e avisar o cliente.'
    : ' Clique nessa etapa para avisar o cliente, se ainda não avisou.';
  box.innerHTML = `<i class="ph ph-calendar-check"></i> Pela previsão de <b>${fmtDay(current.previsao)}</b>, hoje o pedido deveria estar em <b>${ORDER_STATUS[sug]}</b>.${tail}<div class="sched__plan">Agenda prevista — ${ag}</div>`;
}
form.previsao.addEventListener('change', () => { if (current && !$('[data-tab-panel="entrega"]').hidden) { readForm(); renderNotify(); } });
$('#notify').addEventListener('click', e => {
  const b = e.target.closest('[data-notify]');
  if (!b || !current) return;
  readForm();
  if (!valid()) return; // needs a valid customer WhatsApp
  const v = b.dataset.notify;
  let text;
  if (v === 'attempt') {
    current.tentativas = Math.min((current.tentativas || 0) + 1, 3);
    text = attemptMsg(current);
    current.msgs.push({ tpl: 'tentativa', data: new Date().toISOString(), status: current.status });
  } else {
    const stage = +v;
    if (stage === LAST && current.status !== LAST) celebrate(b);
    current.status = stage;
    form.status.value = stage;
    text = deliveryMsg(current, stage);
    current.msgs.push({ tpl: 'status', data: new Date().toISOString(), status: stage });
  }
  commit(); // saves status change + history
  openChat(text);
  fillForm(); renderHead(); renderHistory(); renderNext(); renderNotify();
  toast(`Aviso aberto ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'}. Confira e envie.`);
});
$('#d-pay').innerHTML = `<option value="">Escolha</option>${PAYMENTS.map(p => `<option>${p}</option>`).join('')}`;
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
// peça description starts with a capital letter
$('#items').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.k !== 'desc' || !el.value) return;
  const cap = el.value.charAt(0).toUpperCase() + el.value.slice(1);
  if (cap !== el.value) { const { selectionStart: a, selectionEnd: b } = el; el.value = cap; el.setSelectionRange(a, b); }
});
form.addEventListener('input', () => { updateTotal(); renderTrackChip(); renderNext(); });

/* customer form: title-case the name, mask CPF/CNPJ, fill the address from the CEP (ViaCEP) */
const NAME_LOWER = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du']);
const titleName = s => s.replace(/\S+/g, (w, i) => {
  const lw = w.toLowerCase();
  return i && NAME_LOWER.has(lw) ? lw : lw.charAt(0).toUpperCase() + lw.slice(1);
});
form.nome.addEventListener('input', e => {
  const { selectionStart: a, selectionEnd: b } = e.target;
  e.target.value = titleName(e.target.value); // same length, caret stays valid
  e.target.setSelectionRange(a, b);
});

function maskDoc(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
    return d;
  }
  const out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}`;
  return d.length > 12 ? `${out}-${d.slice(12)}` : out;
}
// CPF/CNPJ check-digit validation: confirms the number is mathematically valid (catches typos/fakes),
// NOT that it is registered at the Receita Federal (that needs an official/paid API + server).
function validCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = n => { let s = 0; for (let i = 0; i < n; i++) s += +cpf[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dig(9) === +cpf[9] && dig(10) === +cpf[10];
}
function validCNPJ(cnpj) {
  cnpj = cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dig = len => { let s = 0, p = len - 7; for (let i = 0; i < len; i++) { s += +cnpj[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dig(12) === +cnpj[12] && dig(13) === +cnpj[13];
}
function checkDoc(v) {
  const d = v.replace(/\D/g, '');
  if (!d) return { state: 'empty' };
  const type = d.length <= 11 ? 'CPF' : 'CNPJ', full = type === 'CPF' ? 11 : 14;
  if (d.length < full) return { state: 'incomplete', type };
  return { state: (type === 'CPF' ? validCPF(d) : validCNPJ(d)) ? 'ok' : 'bad', type };
}
function showDocErr() {
  const r = checkDoc(form.doc.value), el = $('#doc-err');
  el.className = 'field-err' + (r.state === 'ok' ? ' is-ok' : r.state === 'bad' ? ' is-bad' : '');
  el.textContent = r.state === 'bad' ? `${r.type} inválido — confira os números.` : r.state === 'ok' ? `${r.type} válido ✓` : '';
}
form.doc.addEventListener('input', e => { e.target.value = maskDoc(e.target.value); showDocErr(); });

const maskCep = v => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const cepErr = (msg, cls = '') => { const el = $('#cep-err'); el.className = 'field-err' + (cls ? ` ${cls}` : ''); el.textContent = msg; };
let lastCep = '';
// CEP checked against the real Correios base (ViaCEP): if it does not exist, it is flagged in the box.
async function lookupCep() {
  const d = form.cep.value.replace(/\D/g, '');
  if (d.length < 8) { cepErr(''); lastCep = ''; return; }
  if (d === lastCep) return;
  lastCep = d;
  cepErr('Consultando o CEP…');
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
    if (j.erro) return cepErr('CEP não encontrado. Confira o número.', 'is-bad');
    if (j.logradouro && !form.endereco.value.trim()) form.endereco.value = j.logradouro;
    if (j.bairro && !form.bairro.value.trim()) form.bairro.value = j.bairro;
    if (j.localidade && j.uf) form.cidade.value = `${j.localidade} - ${j.uf}`;
    cepErr(`${j.localidade} - ${j.uf}${j.bairro ? `, ${j.bairro}` : ''} ✓`, 'is-ok');
    renderTrackChip(); renderNext();
    if (form.endereco.value.trim() && !form.numero.value.trim()) form.numero.focus();
  } catch { cepErr('Não consegui consultar o CEP agora. Preencha na mão.'); }
}
form.cep.addEventListener('input', e => { e.target.value = maskCep(e.target.value); lookupCep(); });
form.cep.addEventListener('blur', lookupCep);
function updateTotal() { readForm(); $('#d-total').textContent = brl(orderTotal(current)); }

function fillForm() {
  const c = current.cliente;
  form.nome.value = c.nome; form.whatsapp.value = c.whatsapp; form.doc.value = c.doc; form.cidade.value = c.cidade;
  const [, rua = c.endereco || '', num = ''] = String(c.endereco || '').match(/^(.*?),\s*(\S+)$/) || [];
  form.endereco.value = rua; form.numero.value = num; form.bairro.value = c.bairro || ''; form.cep.value = c.cep || '';
  form.frete.value = current.frete || 0;
  form.pagamento.value = current.pagamento || '';
  form.obs.value = current.obs || '';
  form.status.value = current.status;
  form.previsao.value = current.previsao || '';
  form.transportadora.value = current.rastreio?.transportadora || '';
  form.rastreio.value = current.rastreio?.codigo || '';
  renderItems();
}
function readForm() {
  current.cliente = {
    nome: form.nome.value.trim(), whatsapp: form.whatsapp.value.trim(), doc: form.doc.value.trim(), cidade: form.cidade.value.trim(),
    endereco: [form.endereco.value.trim(), form.numero.value.trim()].filter(Boolean).join(', '), bairro: form.bairro.value.trim(), cep: form.cep.value.trim(),
  };
  current.itens = $$('#items .item').map(row => ({
    desc: row.querySelector('[data-k=desc]').value.trim(),
    qtd: Math.max(1, +row.querySelector('[data-k=qtd]').value || 1),
    valor: Math.max(0, +row.querySelector('[data-k=valor]').value || 0),
  }));
  current.frete = Math.max(0, +form.frete.value || 0);
  current.pagamento = form.pagamento.value;
  current.obs = form.obs.value.trim();
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
  const code = current.codigoRastreio || current.rastreio?.codigo;
  const chip = $('#d-track');
  chip.classList.toggle('is-empty', !code);
  chip.title = code ? 'Copiar código de rastreio' : 'Adicionar código de rastreio';
  chip.innerHTML = code
    ? `<i class="ph ph-package"></i><span>Rastreio</span><b>${esc(code)}</b><i class="ph ph-copy"></i>`
    : '<i class="ph ph-package"></i><span>Sem código de rastreio</span>';
}
$('#d-track').addEventListener('click', async () => {
  const code = current?.codigoRastreio || current?.rastreio?.codigo;
  if (!code) { setTab('entrega'); form.rastreio.focus(); return; }
  try { await navigator.clipboard.writeText(code); toast(`Código ${code} copiado.`); }
  catch { toast('Não foi possível copiar o código.'); }
});
/* "Próximo passo" bar under the tabs: tells the store what to do with this customer now */
function renderNext() {
  const box = $('#d-next');
  if (isNew) {
    box.className = 'next';
    box.innerHTML = '<i class="ph ph-info"></i><p><small>Novo pedido</small>Preencha cliente e peças e clique em <b>Salvar pedido</b>. Depois o painel mostra o próximo passo.</p>';
    return;
  }
  const s = nextStep(current);
  box.className = `next ${s.done ? 'is-done' : ''}`;
  box.innerHTML = `<i class="ph ${s.done ? 'ph-check-circle' : 'ph-arrow-circle-right'}"></i><p><small>${s.done ? 'Tudo certo' : 'Próximo passo'}</small>${esc(s.text)}</p>`
    + (s.btn ? `<button type="button" class="btn btn--primary btn--sm" data-next><span class="btn__label" data-text="${s.btn}"><span>${s.btn}</span></span></button>` : '');
}
$('#d-next').addEventListener('click', e => {
  if (!e.target.closest('[data-next]')) return;
  const s = nextStep(current);
  setTab(s.tab);
  if (s.tpl) setTpl(s.tpl);
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
    // o catálogo lembra dos pedidos apagados: um código com nota nunca passa para outro cliente
    const next = Math.max(1000, notasInfo?.ultimoPedido || 0, ...orders.map(o => +o.codigo.replace(/\D/g, '') || 0)) + 1;
    const now = new Date().toISOString();
    // a pedido da loja: pedido confirmado já entra como Enviado, com as etapas anteriores no histórico
    current = {
      codigo: `AS-${next}`, data: now, cliente: { nome: '', whatsapp: '', doc: '', cidade: '', endereco: '', bairro: '', cep: '' },
      itens: [{ desc: '', qtd: 1, valor: 0 }], frete: 0, pagamento: '', obs: '', status: 2, previsao: '',
      historico: [0, 1, 2].map(status => ({ status, data: now })), rastreio: { transportadora: '', codigo: '' }, nf: null, msgs: [], codigoRastreio: genTrack(),
    };
  } else current = structuredClone(order);
  current.msgs ||= [];
  current.tentativas ||= 0;
  $('#d-delete').hidden = isNew;
  fillForm(); renderHead(); renderHistory(); updateTotal(); renderNext();
  lastCep = ''; lastCnpj = ''; showDocErr(); cepErr(''); $('#wa-err').textContent = ''; $('#cli-hit').hidden = true; // refresh field feedback for this order
  renderCliLeft();
  setTpl('criado');
  setTab(tab);
  drawer.showModal();
  if (isNew) form.whatsapp.focus();
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-new]')) openDrawer(null);
  const go = e.target.closest('[data-go-view]');
  if (go) setView(go.dataset.goView);
});

function commit() {
  readForm();
  current.codigoRastreio ||= genTrack();
  orders = loadOrders(); // start from what is saved, so another tab's changes are never overwritten
  const prev = orders.find(o => o.codigo === current.codigo);
  if (prev && prev.status !== current.status) current.historico.push({ status: current.status, data: new Date().toISOString() });
  if (!prev) { // retirada na loja não é enviada: o pedido novo para em Peça separada
    if (isPickup(current)) form.status.value = current.status = Math.min(current.status, 1);
    current.historico = current.historico.filter(h => h.status <= current.status);
  }
  if (prev) orders[orders.indexOf(prev)] = structuredClone(current);
  else orders.push(structuredClone(current));
  isNew = false;
  saveOrders(orders);
  renderAll(); renderHead(); renderHistory(); renderNext();
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

/* =====================================================================
   NOTAS TAB: order summary (non-fiscal) + invoice wizard
   ===================================================================== */
const btnHtml = (label, icon, cls, attrs = '') =>
  `<button class="btn ${cls}" type="button" ${attrs}>${icon ? `<i class="ph ${icon}"></i>` : ''}<span class="btn__label" data-text="${label}"><span>${label}</span></span></button>`;

function renderNotes() { readForm(); renderOrderDoc(); renderWizard(); }

function renderOrderDoc() {
  const sent = current.msgs.filter(m => m.tpl === 'criado').at(-1);
  $('#order-doc').innerHTML = `
    <span class="ico"><i class="ph-duotone ph-clipboard-text"></i></span>
    <div><strong>Resumo da compra em PDF</strong><small>Resumo com peças, valores, pagamento e entrega para o cliente conferir a compra. Não é nota fiscal: pode ir junto com a confirmação do pedido.${sent ? ` Enviada em ${fmtDate(sent.data)}.` : ''}</small></div>
    <div class="doc-card__actions">
      ${btnHtml('Ver PDF', 'ph-file-pdf', 'btn--line btn--sm', 'data-doc="ver"')}
      ${btnHtml(sent ? 'Reenviar ao cliente' : 'Enviar ao cliente', 'ph-whatsapp-logo', 'btn--whats btn--sm', 'data-doc="enviar"')}
    </div>`;
}
$('#order-doc').addEventListener('click', e => {
  const b = e.target.closest('[data-doc]');
  if (!b) return;
  if (b.dataset.doc === 'ver') { readForm(); openPdfPreview('pedido'); }
  else { setTab('msg'); setTpl('criado'); }
});

/* Nota fiscal numa tela só: a faixa de cima diz o que fazer agora, os blocos abaixo mostram o que vai na nota. */
const NF_STEPS = ['Conferir os dados', 'Gerar a nota', 'Enviar ao cliente'];
function nfChecks(o) {
  const c = o.cliente;
  const cliente = [['Nome completo', c.nome], ['CPF ou CNPJ', c.doc], ['Endereço', c.endereco], ['Bairro', c.bairro], ['CEP', c.cep], ['Cidade - UF', c.cidade]];
  const badItems = o.itens.filter(i => !i.desc || !(i.valor > 0)).length;
  const okC = cliente.every(([, v]) => v);
  const okP = o.itens.length > 0 && !badItems && !!o.pagamento;
  return { cliente, badItems, okC, okP };
}
const checkRow = (label, value, missing = 'Falta preencher') =>
  `<li class="${value ? '' : 'miss'}"><i class="ph ${value ? 'ph-check-circle' : 'ph-warning-circle'}"></i><span>${label}</span><b>${value ? esc(value) : missing}</b></li>`;

function renderWizard() {
  const o = current, { cliente, badItems, okC, okP } = nfChecks(o);
  const sent = !!o.nf?.enviadaEm, stage = !(okC && okP) ? 0 : !o.nf ? 1 : !sent ? 2 : 3;
  const miss = [...cliente.filter(([, v]) => !v).map(([l]) => l), ...(o.itens.length ? [] : ['Peças']), ...(badItems ? [`${badItems} peça(s) sem descrição ou valor`] : []), ...(o.pagamento ? [] : ['Forma de pagamento'])];
  const code = o.codigoRastreio || o.rastreio?.codigo;
  const sendBtn = label => btnHtml(label, CAN_ATTACH ? 'ph-paperclip' : 'ph-whatsapp-logo', 'btn--whats', 'data-wiz="enviar"');
  const now = [
    { cls: 'is-warn', icon: 'ph-warning-circle', title: `Falta ${miss.length === 1 ? '1 informação' : `${miss.length} informações`} para emitir`, text: miss.join(', '),
      acts: (okC ? '' : btnHtml('Preencher o cliente', 'ph-pencil-simple', 'btn--primary', 'data-wiz="fix-cliente"')) + (okP ? '' : btnHtml('Corrigir peças e pagamento', 'ph-pencil-simple', okC ? 'btn--primary' : 'btn--line', 'data-wiz="fix-pecas"')) },
    { cls: 'is-go', icon: 'ph-seal-check', title: 'Tudo certo. Pode gerar a nota.', text: 'Confira o resumo abaixo. O PDF abre na tela logo depois, e o código de rastreio já vai junto.',
      acts: btnHtml('Gerar nota fiscal', 'ph-file-plus', 'btn--primary btn--lg', 'data-wiz="gerar"') },
    { cls: 'is-go', icon: 'ph-paper-plane-tilt', title: `Nota nº ${o.nf?.numero} pronta. Agora envie ao cliente.`, text: `Gerada em ${fmtDate(o.nf?.emitidaEm)}. A mensagem já vai com a nota, as peças, os valores e o link de rastreio.`,
      acts: sendBtn(CAN_ATTACH ? 'Enviar com a nota fiscal' : 'Enviar no WhatsApp') + btnHtml('Ver PDF', 'ph-file-pdf', 'btn--line', 'data-wiz="ver"') + (CAN_ATTACH ? '' : btnHtml('Baixar PDF', 'ph-download-simple', 'btn--line', 'data-wiz="pdf"')) },
    { cls: 'is-ok', icon: 'ph-check-circle', title: `Nota nº ${o.nf?.numero} enviada`, text: `O cliente recebeu em ${fmtDate(o.nf?.enviadaEm)}. Se ele pedir de novo, é só reenviar.`,
      acts: sendBtn('Reenviar') + btnHtml('Ver PDF', 'ph-file-pdf', 'btn--line', 'data-wiz="ver"') + btnHtml('Baixar PDF', 'ph-download-simple', 'btn--line', 'data-wiz="pdf"') },
  ][stage];

  $('#nf-wiz').innerHTML = `
    <ol class="nfw__steps">${NF_STEPS.map((s, i) => `<li class="${i < stage ? 'is-done' : i === stage ? 'is-now' : ''}"><span>${i < stage ? '<i class="ph ph-check"></i>' : i + 1}</span>${s}</li>`).join('')}</ol>
    <div class="nfw__now ${now.cls}"><i class="ph ${now.icon}" aria-hidden="true"></i><div><strong>${now.title}</strong><p>${esc(now.text)}</p></div><div class="nfw__acts">${now.acts}</div></div>
    <div class="nfw__grid">
      <section class="nfw__blk"><h4>Para quem é a nota</h4><ul class="check">${cliente.map(([l, v]) => checkRow(l, v)).join('')}</ul></section>
      <section class="nfw__blk"><h4>O que vai na nota</h4>
        <table class="wiz__items"><tbody>
          ${o.itens.map(i => `<tr><td>${i.qtd}x ${esc(i.desc) || '<em>Sem descrição</em>'}</td><td class="r">${i.valor > 0 ? brl(i.qtd * i.valor) : '<em>Sem valor</em>'}</td></tr>`).join('')}
          <tr class="sum"><td>Frete</td><td class="r">${brl(o.frete)}</td></tr>
          <tr class="total"><td>Total da nota</td><td class="r">${brl(orderTotal(o))}</td></tr>
        </tbody></table>
        <ul class="check">${checkRow('Pagamento', o.pagamento, 'Falta escolher')}${checkRow('Rastreio', code || 'Criado ao salvar')}</ul>
      </section>
    </div>
    ${stage === 2 || stage === 3 ? `<div class="wiz__actions">${btnHtml('Gerar de novo com os dados atuais', 'ph-arrows-clockwise', 'btn--line btn--sm', 'data-wiz="gerar"')}</div>` : ''}
    <p class="wiz__note"><i class="ph ph-info"></i>Prévia sem valor fiscal. A nota oficial, com chave de acesso e protocolo da SEFAZ, sai pelo emissor fiscal da loja quando a integração for aprovada.</p>`;
  if (CAN_ATTACH && o.nf) getPdf(o, 'nf').catch(() => {}); // ready before the click, so the phone share keeps the user gesture
}

function issueNf() {
  const again = !!current.nf;
  orders = loadOrders(); // next number from what is saved, also when another tab issued one
  const number = current.nf?.numero ?? Math.max(1192, notasInfo?.ultimo || 0, ...orders.map(o => o.nf?.numero || 0)) + 1; // o catálogo lembra das notas apagadas: número nunca se repete
  current.nf = { numero: number, serie: 1, emitidaEm: new Date().toISOString(), enviadaEm: current.nf?.enviadaEm || null };
  commit();
  toast(again ? `Nota nº ${number} gerada de novo com os dados atuais.` : `Nota nº ${number} gerada. Rastreio ${trackCodeOf(current)} já funciona no site.`);
}
$('#nf-wiz').addEventListener('click', async e => {
  const b = e.target.closest('[data-wiz]');
  if (!b) return;
  const a = b.dataset.wiz;
  if (a === 'fix-cliente') {
    setTab('cliente');
    const empty = ['nome', 'doc', 'cep', 'endereco', 'bairro', 'cidade'].find(n => !form[n].value.trim());
    if (empty) form[empty].focus();
  }
  if (a === 'fix-pecas') setTab('pecas');
  if (a === 'gerar') {
    if (!valid()) return;
    if (!current.nf) celebrate(b);
    issueNf(); renderNotes();
    openPdfPreview('nf');
  }
  if (a === 'ver') openPdfPreview('nf');
  if (a === 'pdf') { try { downloadFile(await getPdf(current, 'nf')); } catch { toast('Não foi possível gerar o PDF da nota.'); } }
  if (a === 'enviar') CAN_ATTACH ? await sendWithPdf('nota') : sendText('nota');
});

/* =====================================================================
   WHATSAPP: os textos ficam em mensagens.js; aqui só o envio
   ===================================================================== */
// which PDF accompanies each message: the invoice travels with the order once it exists, else the order summary
const attachKind = t => t === 'nota' ? (current?.nf ? 'nf' : null) : t === 'criado' ? (current?.nf ? 'nf' : 'pedido') : null;
const ATTACH_LABEL = { pedido: 'Enviar com a nota do pedido', nf: 'Enviar com a nota fiscal' };

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
  const fileKind = noNf ? null : attachKind(tpl); // which PDF belongs to this message (nf or pedido)
  const canShare = CAN_ATTACH && !!fileKind;      // phone: the share sheet sends the file + text together
  const text = noNf ? '' : TEMPLATES[tpl](current, fileKind); // text references the PDF whenever there is one
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const doc = fileKind ? `<div class="wa__doc"><i class="ph ph-file-pdf"></i><div><b>${esc(pdfName(current, fileKind))}</b><span>1 página · PDF</span></div></div>` : '';
  $('#wa-preview').innerHTML = noNf
    ? '<span class="wa__empty">Emita a nota fiscal na aba Notas para liberar esta mensagem.</span>'
    : `${doc}${waHtml(text)}<span class="wa__time">${now} <i class="ph ph-checks"></i></span>`;

  const pdfLabel = fileKind === 'nf' ? 'a nota fiscal' : 'a nota do pedido';
  const share = $('#wa-share');
  share.hidden = !canShare;
  $('#wa-pdf').hidden = !fileKind;
  if (canShare) { $('.btn__label', share).dataset.text = ATTACH_LABEL[fileKind]; $('.btn__label > span', share).textContent = ATTACH_LABEL[fileKind]; }
  const send = $('#wa-send');
  const label = canShare ? 'Enviar só o texto' : fileKind ? 'Enviar com o PDF' : 'Enviar no WhatsApp';
  send.className = canShare ? 'btn btn--line' : 'btn btn--whats';
  $('.btn__label', send).dataset.text = label;
  $('.btn__label > span', send).textContent = label;
  send.disabled = $('#wa-copy').disabled = noNf;
  if (fileKind) getPdf(current, fileKind).catch(() => {}); // prepare the file before the click

  const sent = current.msgs.filter(m => m.tpl === tpl).at(-1);
  $('#wa-note').innerHTML = [
    canShare
      ? `<i class="ph ph-paperclip"></i> <b>${ATTACH_LABEL[fileKind]}</b> abre o compartilhamento do celular com o PDF e a mensagem juntos: escolha o WhatsApp e a conversa do cliente.`
      : fileKind
        ? `<i class="ph ph-paperclip"></i> Ao clicar em <b>${label}</b>, ${pdfLabel} é baixada e a conversa abre ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'}. Anexe o arquivo na conversa (clipe ou arraste) e envie — o WhatsApp Web não deixa o site anexar sozinho.`
        : `<i class="ph ph-info"></i> A conversa abre ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'} com o texto pronto. Confira e envie.`,
    sent ? `<br><i class="ph ph-check"></i> Última vez enviada em ${fmtDate(sent.data)}.` : '',
  ].join('');
}

/* Phones open the WhatsApp app (keeps emojis). On computers the WhatsApp Desktop app turns 4-byte emojis into "�"
   and drops line breaks when it receives text from a link or from the Windows share sheet, so desktops go to
   WhatsApp Web, which keeps the message exactly as written. */
const IS_MOBILE = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// Phones hand the PDF and the text to WhatsApp together (share sheet, nothing is downloaded). A link can't carry a
// file, so on computers the message goes alone and downloading the PDF is optional.
const CAN_ATTACH = IS_MOBILE && !!navigator.canShare?.({ files: [new File(['%PDF'], 'nota.pdf', { type: 'application/pdf' })] });
function openChat(text) {
  const host = IS_MOBILE ? 'https://api.whatsapp.com/send' : 'https://web.whatsapp.com/send';
  window.open(`${host}?phone=${phoneDigits(current.cliente.whatsapp)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
function markSent(t) {
  current.msgs.push({ tpl: t, data: new Date().toISOString(), status: current.status });
  if (t === 'nota' && current.nf) current.nf.enviadaEm = new Date().toISOString();
  commit(); renderNotes(); renderMsg();
}
function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Phones: PDF + message together through the share sheet. If sharing fails, the message goes alone.
async function sendWithPdf(t) {
  const kind = attachKind(t);
  if (!valid() || !kind) return;
  try {
    await navigator.share({ files: [await getPdf(current, kind)], text: TEMPLATES[t](current, kind) });
    markSent(t);
    toast('PDF e mensagem enviados para o compartilhamento.');
  } catch (err) {
    if (err.name !== 'AbortError') sendText(t); // AbortError: share sheet closed
  }
}
function sendText(t) { // text only (mobile "só o texto")
  if (!valid()) return;
  openChat(TEMPLATES[t](current, null));
  markSent(t);
  toast(`${TPL_NAMES[t]}: conversa aberta ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'}.`);
}
// web/desktop: download the PDF (so it can be attached) and open the chat with the text
async function sendWithDownload(t) {
  if (!valid()) return;
  const kind = attachKind(t);
  if (kind) { try { downloadFile(await getPdf(current, kind)); } catch { return toast('Não foi possível gerar o PDF.'); } }
  openChat(TEMPLATES[t](current, kind));
  markSent(t);
  toast(kind
    ? `${kind === 'nf' ? 'Nota fiscal e nota do pedido baixadas (um PDF só)' : 'Nota do pedido baixada'}. Anexe o arquivo na conversa que abriu e envie.`
    : `${TPL_NAMES[t]}: conversa aberta no WhatsApp Web.`);
}
$('#wa-share').addEventListener('click', () => sendWithPdf(tpl));
$('#wa-send').addEventListener('click', () => (CAN_ATTACH && attachKind(tpl)) ? sendText(tpl) : sendWithDownload(tpl));
$('#wa-pdf').addEventListener('click', async () => {
  const kind = attachKind(tpl);
  if (!kind) return;
  try { downloadFile(await getPdf(current, kind)); } catch { toast('Não foi possível gerar o PDF.'); }
});
$('#wa-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(TEMPLATES[tpl](current, attachKind(tpl)));
    toast('Texto copiado. Cole na conversa do cliente.');
  } catch { toast('Não foi possível copiar. Selecione o texto da prévia.'); }
});

/* =====================================================================
   NF PDF (real file built with jsPDF; helvetica covers Portuguese accents)
   ===================================================================== */
const pdfName = (o, kind) => kind === 'nf' ? `nota-fiscal-${o.codigo}-${o.nf?.numero || 'previa'}.pdf` : `nota-do-pedido-${o.codigo}.pdf`;
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
const pdfKey = (o, kind) => JSON.stringify([kind, o.codigo, o.data, o.nf, o.cliente, o.itens, o.frete, o.pagamento, o.obs, o.status, o.rastreio, o.codigoRastreio, o.previsao, o.historico, storeCnpj(), siteUrl()]);
function getPdf(o, kind = 'nf') {
  const k = pdfKey(o, kind);
  if (!pdfCache.has(k)) {
    const snap = structuredClone(o);
    const p = (kind === 'nf' ? buildNfPdf : buildOrderPdf)(snap).then(blob => new File([blob], pdfName(snap, kind), { type: 'application/pdf' }));
    p.catch(() => pdfCache.delete(k));
    pdfCache.set(k, p);
  }
  return pdfCache.get(k);
}

/* DANFE-style layout following the owner's model (A4 in points, same grid as the model).
   Fiscal-only data (chave de acesso, protocolo, ICMS) is never invented. The page stays clearly marked
   as a preview without fiscal value until the NF-e integration exists. */
async function drawNfPdf(doc, o) {
  const L = 25, R = 570, W = R - L;
  const ink = [20, 20, 22], gray = [110, 110, 116], line = [60, 60, 64], band = [217, 217, 217], red = [196, 22, 28];
  const up = v => String(v ?? '').toUpperCase();
  const num = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfNum = `Nº ${String(o.nf.numero).padStart(9, '0').replace(/^(\d{3})/, '$1.')}`;
  const emit = new Date(o.nf.emitidaEm);
  const dateBR = d => d ? new Date(d).toLocaleDateString('pt-BR') : '';
  const saida = o.historico?.find(h => h.status === 2)?.data;
  const [municipio, uf] = (() => { const m = String(o.cliente.cidade || '').split(/\s*[-/]\s*/); return [m[0] || '', m.length > 1 ? m.at(-1) : ''] })();

  doc.setProperties({ title: `Nota fiscal ${o.nf.numero} - ${o.codigo}`, author: 'ATUAL COMÉRCIO DE SUCATAS LTDA' });
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
  font(5.8); doc.text('RECEBEMOS DE ATUAL COMÉRCIO DE SUCATAS LTDA OS PRODUTOS/SERVIÇOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO', L + 4, 37);
  doc.setDrawColor(...line); doc.line(L, 45, 490, 45); doc.line(145, 45, 145, 80);
  font(5.2, false, gray); doc.text('DATA DE RECEBIMENTO', L + 4, 53); doc.text('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', 149, 53);
  box(490, 25, 80, 55);
  font(10, true); doc.text('NF-e', 530, 40, { align: 'center' });
  font(7.5); doc.text(nfNum, 497, 54); doc.text(`SÉRIE: ${o.nf.serie}`, 497, 66);
  doc.setLineDashPattern([3, 2], 0); doc.line(L, 85, R, 85); doc.setLineDashPattern([], 0);

  /* header: emitente | DANFE | chave de acesso (same 3-block grid as the owner's model) */
  const top = 90, hh = 95, dxD = 275, dxC = 367, cxD = (dxD + dxC) / 2;
  box(L, top, dxD - L, hh);
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', L + 8, top + 10, 40, 40, 'logo', 'FAST');
  const tx = logo ? L + 54 : L + 8;
  font(8, true); doc.text('ATUAL COMÉRCIO DE SUCATAS LTDA', tx, top + 16);
  font(6.2, false, [60, 60, 64]);
  doc.text(['Rua Horaide Prestes de Souza, 65, Letra D', 'Apt 606, Bloco H - Vila Real', 'Chapecó - SC  ·  CEP 89805-807', '(49) 9 9104-1665'], tx, top + 28, { lineHeightFactor: 1.4 });
  if (storeCnpj()) { font(6.6, true, ink); doc.text(`CNPJ: ${storeCnpj()}`, L + 8, top + hh - 8); }

  box(dxD, top, dxC - dxD, hh);
  font(12, true); doc.text('DANFE', cxD, top + 14, { align: 'center' });
  font(4.8); doc.text(['DOCUMENTO AUXILIAR DA', 'NOTA FISCAL ELETRÔNICA'], cxD, top + 23, { align: 'center', lineHeightFactor: 1.3 });
  doc.line(dxD, top + 40, dxC, top + 40);
  font(5.6); doc.text(['0 - Entrada', '1 - Saída'], dxD + 5, top + 50, { lineHeightFactor: 1.5 });
  box(dxC - 24, top + 44, 18, 16); font(11, true); doc.text('1', dxC - 15, top + 56, { align: 'center' });
  doc.line(dxD, top + 64, dxC, top + 64);
  font(7, true); doc.text(nfNum, cxD, top + 76, { align: 'center' });
  font(5.6, false, gray); doc.text(`Série ${o.nf.serie}`, cxD, top + 87, { align: 'center' });

  box(dxC, top, R - dxC, hh);
  font(5, false, gray); doc.text('CHAVE DE ACESSO', dxC + 5, top + 8);
  box(dxC + 5, top + 11, R - dxC - 10, 20);
  font(6, false, gray); doc.text('Gerada na emissão oficial da NF-e', (dxC + R) / 2, top + 24, { align: 'center' });
  font(4.6, false, gray); doc.text('Consulta de autenticidade em www.nfe.fazenda.gov.br/portal', dxC + 5, top + 42);
  doc.line(dxC, top + 50, R, top + 50);
  font(5, false, gray); doc.text('PROTOCOLO DE AUTORIZAÇÃO DE USO', dxC + 5, top + 60);
  font(6.4, false, gray); doc.text('Emitido na autorização da SEFAZ', dxC + 5, top + 74);
  font(4.6, false, gray); doc.text('Prévia gerada pelo painel da loja', dxC + 5, top + 88);

  /* natureza + inscrição estadual (values the owner's fiscal system fills) */
  let y = top + hh + 3;
  cell(L, y, 360, 22, 'Natureza da operação', 'VENDA', { bold: true });
  cell(385, y, 185, 22, 'Data da emissão', dateBR(emit));
  y += 22;
  cell(L, y, 220, 22, 'Inscrição estadual', '-');
  cell(245, y, 160, 22, 'Insc. est. subst. trib.', '-');
  cell(405, y, 165, 22, 'CNPJ', storeCnpj() || '-', { bold: true });
  y += 26;

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
  cell(312, y, 120, 24, 'Fone/WhatsApp', fmtPhone(o.cliente.whatsapp));
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
  font(9, true); doc.text(`Código de Rastreio: ${trackCodeOf(o)}`, L + 4, y); y += 14;
  if (o.previsao) { font(8.4); doc.text(`Previsão de Entrega: ${fmtDay(o.previsao)}`, L + 4, y); y += 14; }
  if (o.pagamento) { font(8.4); doc.text(`Forma de Pagamento: ${o.pagamento}`, L + 4, y); y += 14; }
  if (o.obs) { font(8.4); const ls = doc.splitTextToSize(`Observações: ${o.obs}`, W - 8); doc.text(ls, L + 4, y, { lineHeightFactor: 1.3 }); y += ls.length * 11 + 3; }
  y += 4; font(7.4, false, [60, 60, 64]);
  doc.text(doc.splitTextToSize('Peças usadas originais, provenientes de veículo desmontado por empresa credenciada no DETRAN-SC, conforme a Lei 12.977/2014. Garantia da loja em todas as peças.', W - 8), L + 4, y, { lineHeightFactor: 1.35 });
  font(6, false, gray);
  doc.text(doc.splitTextToSize('A nota fiscal oficial (NF-e), com chave de acesso e protocolo de autorização da SEFAZ, é emitida pelo sistema fiscal da loja. Esta é uma prévia do layout para aprovação.', W - 8), L + 4, addBottom - 14, { lineHeightFactor: 1.3 });

  /* faint watermark, kept light (as requested) so the preview is not mistaken for an official NF-e */
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.035 }));
  font(34, true, red);
  doc.text('SEM VALOR FISCAL', 297, 520, { align: 'center', angle: 32 });
  doc.restoreGraphicsState();

}

/* Nota do pedido: documento comercial com a mesma grade de campos da nota fiscal, sem nada que imite a NF-e.
   Fica sempre marcada como não fiscal. Pedidos longos continuam em novas folhas, com o cabeçalho da tabela repetido. */
async function drawOrderPdf(doc, o, first = 1) {
  const L = 30, R = 565, W = R - L, TOP = 30, BOTTOM = 792;
  const ink = [22, 22, 26], gray = [100, 100, 108], line = [170, 170, 178], band = [236, 236, 240], red = [190, 20, 26], white = [255, 255, 255];
  const up = v => String(v ?? '').toUpperCase();
  const font = (size, bold = false, color = ink) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  const money = n => brl(n).replace(/ /g, ' ');
  const dateBR = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
  const c = o.cliente, t = o.rastreio || {}, pickup = isPickup(o);
  const [municipio, uf] = (() => { const m = String(c.cidade || '').split(/\s*[-/]\s*/); return [m[0] || '', m.length > 1 ? m.at(-1) : ''] })();
  if (first === 1) doc.setProperties({ title: `Nota do pedido ${o.codigo}`, author: 'ATUAL COMÉRCIO DE SUCATAS LTDA' });
  doc.setLineWidth(.5);

  let y = TOP;
  const box = (x, yy, w, h) => { doc.setDrawColor(...line); doc.rect(x, yy, w, h); };
  // nenhum dado é cortado: o texto diminui um pouco e, se ainda não couber, a linha cresce (rowH) e ele usa duas
  const shrink = (text, size, bold, color, maxW) => {
    let s = size;
    font(s, bold, color);
    while (s > 7.6 && doc.getTextWidth(text) > maxW) font(s -= .2, bold, color);
    return doc.getTextWidth(text) <= maxW;
  };
  const rowH = (...cells) => cells.some(([text, w, bold]) => !shrink(String(text || '-'), 9, bold, ink, w - 10)) ? 37 : 26;
  const cell = (x, yy, w, h, label, value, { bold = false, size = 9, align = 'left', color = ink } = {}) => {
    box(x, yy, w, h);
    font(5.6, true, gray); doc.text(up(label), x + 5, yy + 8);
    const v = String(value || '-');
    if (shrink(v, size, bold, color, w - 10)) doc.text(v, align === 'right' ? x + w - 5 : x + 5, yy + h - 7, { align });
    else doc.text(doc.splitTextToSize(v, w - 10).slice(0, 2), x + 5, yy + 18, { lineHeightFactor: 1.2 });
  };
  const newPage = () => {
    doc.addPage();
    font(8, true); doc.text('ATUAL COMÉRCIO DE SUCATAS LTDA', L, TOP + 8);
    font(8, false, gray); doc.text(`Nota do pedido ${o.codigo} (continuação)`, R, TOP + 8, { align: 'right' });
    y = TOP + 18;
  };
  const need = h => { if (y + h > BOTTOM) newPage(); };
  const bar = (title, after = 0) => {
    y += 7;
    need(13 + after);
    doc.setFillColor(...band); doc.setDrawColor(...line); doc.rect(L, y, W, 13, 'FD');
    font(7, true); doc.text(up(title), L + 5, y + 9);
    y += 13;
  };

  /* cabeçalho: quem vende | qual documento */
  const hh = 86, sw = 355, dx = L + sw, cx = (dx + R) / 2;
  box(L, y, sw, hh);
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', L + 10, y + 13, 60, 60, 'logo', 'FAST');
  const tx = logo ? L + 82 : L + 10;
  font(11, true); doc.text('ATUAL COMÉRCIO DE SUCATAS LTDA', tx, y + 24);
  font(8, false, [62, 62, 68]);
  doc.text(['R. Horaide Prestes de Souza, 65 - Vila Real', 'Chapecó - SC  ·  CEP 89805-807', `WhatsApp (49) 9 9104-1665${storeCnpj() ? `  ·  CNPJ ${storeCnpj()}` : ''}`, 'Desmanche credenciado pelo DETRAN-SC'], tx, y + 37, { lineHeightFactor: 1.35 });
  box(dx, y, R - dx, hh);
  font(8, true, gray); doc.text('NOTA DO PEDIDO', cx, y + 15, { align: 'center' });
  font(22, true, red); doc.text(o.codigo, cx, y + 39, { align: 'center' });
  const half = (R - dx) / 2;
  cell(dx, y + 50, half, hh - 50, 'Data do pedido', dateBR(o.data), { bold: true });
  cell(dx + half, y + 50, half, hh - 50, 'Nota fiscal', o.nf ? `Nº ${o.nf.numero}, série ${o.nf.serie}` : 'A emitir', { bold: true });
  y += hh;
  doc.setFillColor(...band); doc.setDrawColor(...line); doc.rect(L, y, W, 15, 'FD');
  font(7.4, true); doc.text('DOCUMENTO NÃO FISCAL', L + 5, y + 10.5);
  font(7.4, false, [62, 62, 68]); doc.text('Resumo da compra para conferência. A nota fiscal eletrônica (NF-e) é enviada separadamente.', R - 5, y + 10.5, { align: 'right' });
  y += 15;

  /* cliente */
  bar('Dados do cliente', 100);
  const h1 = rowH([up(c.nome), 295, true]), h2 = rowH([up(c.endereco), 295], [up(c.bairro), 130]);
  cell(L, y, 295, h1, 'Nome / Razão social', up(c.nome), { bold: true, size: 9.5 });
  cell(L + 295, y, 130, h1, 'CPF / CNPJ', c.doc);
  cell(L + 425, y, 110, h1, 'WhatsApp', fmtPhone(c.whatsapp));
  y += h1;
  cell(L, y, 295, h2, 'Endereço', up(c.endereco));
  cell(L + 295, y, 130, h2, 'Bairro', up(c.bairro));
  cell(L + 425, y, 110, h2, 'CEP', c.cep);
  y += h2;
  cell(L, y, 245, 26, 'Município', up(municipio));
  cell(L + 245, y, 50, 26, 'UF', up(uf), { bold: true });
  cell(L + 295, y, 130, 26, 'Forma de pagamento', o.pagamento, { bold: true });
  cell(L + 425, y, 110, 26, 'Situação', ORDER_STATUS[o.status], { bold: true });
  y += 26;

  /* peças */
  const cols = [['Item', L, 34, 'center'], ['Descrição da peça', L + 34, 263, 'left'], ['Un', L + 297, 30, 'center'], ['Qtd', L + 327, 36, 'center'], ['Valor unitário', L + 363, 84, 'right'], ['Valor total', L + 447, 88, 'right']];
  const at = ([, x, w, a]) => a === 'center' ? x + w / 2 : a === 'right' ? x + w - 5 : x + 5;
  const head = () => {
    cols.forEach(k => { box(k[1], y, k[2], 15); font(5.8, true, gray); doc.text(up(k[0]), at(k), y + 10, { align: k[3] }); });
    y += 15;
  };
  bar('Peças', 15 + 20);
  head();
  o.itens.forEach((it, i) => {
    font(8.6);
    const lines = doc.splitTextToSize(it.desc || '-', cols[1][2] - 10);
    const h = Math.max(20, 9 + lines.length * 10.5);
    if (y + h > BOTTOM) { newPage(); head(); }
    cols.forEach(k => box(k[1], y, k[2], h));
    const by = y + 13;
    font(8.6, false, gray); doc.text(String(i + 1).padStart(2, '0'), at(cols[0]), by, { align: 'center' });
    font(8.6); doc.text(lines, at(cols[1]), by, { lineHeightFactor: 1.22 });
    doc.text('UN', at(cols[2]), by, { align: 'center' });
    doc.text(String(it.qtd), at(cols[3]), by, { align: 'center' });
    doc.text(money(it.valor), at(cols[4]), by, { align: 'right' });
    font(8.6, true); doc.text(money(it.qtd * it.valor), at(cols[5]), by, { align: 'right' });
    y += h;
  });

  /* totais */
  y += 7;
  need(30);
  const frete = Number(o.frete) > 0 ? money(o.frete) : pickup ? 'Retirada' : money(0);
  cell(L, y, 150, 30, 'Total das peças', money(partsTotal(o)), { size: 10, align: 'right' });
  cell(L + 150, y, 150, 30, 'Frete', frete, { size: 10, align: 'right' });
  doc.setFillColor(...red); doc.rect(L + 300, y, 235, 30, 'F');
  font(5.8, true, white); doc.text('VALOR TOTAL DO PEDIDO', L + 305, y + 9);
  font(15, true, white); doc.text(money(orderTotal(o)), R - 6, y + 24, { align: 'right' });
  y += 30;

  /* entrega ou retirada */
  bar(pickup ? 'Retirada na loja' : 'Entrega', 52);
  if (pickup) {
    cell(L, y, 335, 26, 'Local de retirada', 'R. Horaide Prestes de Souza, 65 - Vila Real, Chapecó - SC');
    cell(L + 335, y, 200, 26, 'Horário', 'Seg a sex, 8h às 18h  ·  Sáb, 8h às 12h');
  } else {
    cell(L, y, 175, 26, 'Transportadora', up(t.transportadora));
    cell(L + 175, y, 130, 26, 'Código da transportadora', t.codigo);
    cell(L + 305, y, 120, 26, 'Código de rastreio', trackCodeOf(o), { bold: true });
    cell(L + 425, y, 110, 26, 'Previsão de entrega', o.previsao ? fmtDay(o.previsao) : '-');
  }
  y += 26;
  cell(L, y, W, 26, 'Acompanhe o pedido', trackLink(o), { color: red, size: 8.6 });
  doc.link(L, y, W, 26, { url: trackLink(o) });
  y += 26;

  /* andamento */
  bar('Andamento do pedido', 30);
  const sw6 = W / ORDER_STATUS.length;
  ORDER_STATUS.forEach((st, i) => {
    const x = L + sw6 * i, done = i <= o.status, h = o.historico?.find(e => e.status === i);
    if (i === o.status) { doc.setFillColor(...band); doc.rect(x, y, sw6, 30, 'F'); }
    box(x, y, sw6, 30);
    if (done) { doc.setFillColor(...red); doc.rect(x, y, sw6, 2.5, 'F'); }
    font(7.2, done, done ? ink : gray); doc.text(st, x + sw6 / 2, y + 14, { align: 'center' });
    font(6.8, false, gray); doc.text(done && h ? dateBR(h.data) : done ? 'Concluído' : 'Pendente', x + sw6 / 2, y + 24, { align: 'center' });
  });
  y += 30;

  /* dados adicionais vão até o canhoto, que fica sempre no pé da última folha (como na nota fiscal) */
  const stub = 50, sy = BOTTOM - stub, end = sy - 16;
  const LEGAL = 'Peças usadas originais, provenientes de veículo desmontado por empresa credenciada no DETRAN-SC, conforme a Lei 12.977/2014. Garantia da loja em todas as peças.';
  font(8.6);
  const obs = o.obs ? doc.splitTextToSize(`Observações: ${o.obs}`, W - 10) : [];
  font(7.4);
  const legal = doc.splitTextToSize(LEGAL, W - 10);
  const textH = obs.length * 11 + legal.length * 9.5 + 26;
  if (y + 20 + textH > end) newPage();
  bar('Dados adicionais');
  box(L, y, W, end - y);
  let ay = y + 14;
  if (obs.length) { font(8.6); doc.text(obs, L + 5, ay, { lineHeightFactor: 1.25 }); ay += obs.length * 11 + 6; }
  font(7.4, false, [62, 62, 68]); doc.text(legal, L + 5, ay, { lineHeightFactor: 1.3 });

  doc.setDrawColor(...line); doc.setLineDashPattern([3, 2], 0); doc.line(L, sy - 8, R, sy - 8); doc.setLineDashPattern([], 0);
  box(L, sy, W, stub);
  font(7, true); doc.text('RECEBI AS PEÇAS RELACIONADAS NESTA NOTA DO PEDIDO', L + 5, sy + 11);
  cell(L, sy + 16, 115, stub - 16, 'Data de recebimento', ' ');
  cell(L + 115, sy + 16, 320, stub - 16, 'Nome e assinatura de quem recebeu', ' ');
  cell(L + 435, sy + 16, 100, stub - 16, 'Pedido', o.codigo, { bold: true });

  // a numeração conta só as folhas da nota do pedido, mesmo quando ela vem depois da nota fiscal
  const pages = doc.getNumberOfPages();
  for (let i = first; i <= pages; i++) {
    doc.setPage(i);
    font(6.8, false, gray);
    doc.text('Atual Sucatas  ·  Documento não fiscal', L, 810);
    doc.text(`Folha ${i - first + 1} de ${pages - first + 1}`, R, 810, { align: 'right' });
  }
}

const newPdf = () => {
  if (!window.jspdf) throw new Error('jsPDF indisponível');
  return new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
};
// para o cliente vai um arquivo só: a nota fiscal na folha 1 e a nota do pedido a partir da folha 2
async function buildNfPdf(o) {
  const doc = newPdf();
  await drawNfPdf(doc, o);
  doc.addPage();
  await drawOrderPdf(doc, o, doc.getNumberOfPages());
  return doc.output('blob');
}
async function buildOrderPdf(o) {
  const doc = newPdf();
  await drawOrderPdf(doc, o);
  return doc.output('blob');
}

/* =====================================================================
   PDF PREVIEW (nota fiscal or nota do pedido)
   ===================================================================== */
const nfDialog = $('#nf-dialog');
let nfUrl, previewKind = 'nf';
async function openPdfPreview(kind = 'nf') {
  previewKind = kind;
  let file;
  try { file = await getPdf(current, kind); } catch { return toast('Não foi possível gerar o PDF.'); }
  if (nfUrl) URL.revokeObjectURL(nfUrl);
  nfUrl = URL.createObjectURL(file);
  $('#nf-frame').src = `${nfUrl}#toolbar=0&view=FitH`;
  if (!nfDialog.open) nfDialog.showModal();
}
$('#nf-download').addEventListener('click', async () => {
  try { downloadFile(await getPdf(current, previewKind)); } catch { toast('Não foi possível gerar o PDF.'); }
});

/* Orders saved in another tab (or while this tab was in the background) show up here without reloading.
   In an open order, only what is not typed in the form is refreshed: notes and messages sent. */
function syncOrders() {
  orders = loadOrders();
  renderAll();
  if (!drawer.open || isNew) return;
  const fresh = orders.find(o => o.codigo === current.codigo);
  if (!fresh) return;
  current.nf = fresh.nf; current.msgs = fresh.msgs || []; current.historico = fresh.historico;
  renderHead(); renderHistory(); renderNext(); renderNotes(); renderMsg();
}
addEventListener('storage', e => { if (e.key === ORDERS_KEY && !$('#app').hidden) syncOrders(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) syncOrders(); });
// pedidos trazidos de outro aparelho pela sincronização
addEventListener('orders:changed', () => { if (!$('#app').hidden) syncOrders(); });

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
   INÍCIO: resumo do dia, números do mês, gráfico e pátio
   ===================================================================== */
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const lastUpdate = o => o.historico?.at(-1)?.data || o.data;
const shortBrl = v => v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`;
const niceCeil = v => { if (v <= 0) return 1000; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const emptyBox = (icon, text) => `<p class="empty"><i class="ph ${icon}" aria-hidden="true"></i>${text}</p>`;

// conta só quando o valor muda: a sincronização redesenha a tela a cada 20 s e isso não pode piscar
function setCount(el, value, fmt = v => Math.round(v)) {
  const from = +(el.dataset.val ?? 0);
  el.dataset.val = value;
  if (REDUCE || !window.gsap || from === value) { el.textContent = fmt(value); return; }
  const o = { v: from };
  gsap.to(o, { v: value, duration: 1, ease: 'power3.out', overwrite: true, onUpdate: () => (el.textContent = fmt(o.v)) });
}

function monthsBack(n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const key = monthKey(d.toISOString()), list = orders.filter(o => monthKey(o.data) === key);
    return { key, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), total: list.reduce((t, o) => t + orderTotal(o), 0), count: list.length };
  });
}

function renderChart(rev) {
  const top = niceCeil(Math.max(...rev.map(r => r.total)));
  const plural = n => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;
  $('#chart').innerHTML = `
    <div class="chart__y" aria-hidden="true">${[1, .5, 0].map(f => `<span style="--f:${f}">${shortBrl(top * f)}</span>`).join('')}</div>
    <div class="chart__plot">
      ${[1, .5, 0].map(f => `<span class="chart__grid" style="--f:${f}"></span>`).join('')}
      ${rev.map((r, i) => `<button type="button" class="bar ${i === rev.length - 1 ? 'is-now' : ''}" style="--i:${i}" aria-label="${r.label}: ${brl(r.total)}, ${plural(r.count)}">
        <span class="bar__tip"><b>${brl(r.total)}</b>${plural(r.count)} em ${r.label}</span>
        <span class="bar__fill" style="height:${(r.total / top) * 100}%"></span><span class="bar__label">${r.label}</span></button>`).join('')}
      ${rev.every(r => !r.total) ? '<p class="chart__none">As vendas aparecem aqui depois do primeiro pedido.</p>' : ''}
    </div>
    <table class="sr-only"><caption>Vendas por mês</caption><tr><th>Mês</th><th>Total</th><th>Pedidos</th></tr>${rev.map(r => `<tr><td>${r.label}</td><td>${brl(r.total)}</td><td>${r.count}</td></tr>`).join('')}</table>`;
}

const TODO_ICON = { msg: 'ph-whatsapp-logo', nota: 'ph-receipt', entrega: 'ph-truck' };
function renderHome() {
  const h = new Date().getHours();
  $('#greet').textContent = h < 12 ? 'Bom dia!' : h < 18 ? 'Boa tarde!' : 'Boa noite!';
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#today').textContent = today[0].toUpperCase() + today.slice(1);

  const stale = orders.filter(o => o.status < LAST && Date.now() - new Date(lastUpdate(o)) > 2 * 864e5).sort((a, b) => lastUpdate(a).localeCompare(lastUpdate(b)));
  const open = orders.filter(o => o.status < LAST).length;
  $('#brief').textContent = !orders.length ? 'O painel está pronto. Cadastre o primeiro pedido para começar.'
    : stale.length ? `${stale.length === 1 ? '1 pedido precisa' : `${stale.length} pedidos precisam`} da sua atenção hoje.`
    : open ? `${open === 1 ? '1 pedido em andamento' : `${open} pedidos em andamento`}, tudo em dia.` : 'Todos os pedidos foram entregues.';

  const todo = orders.filter(o => !nextStep(o).done).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 6);
  $('#todo').innerHTML = todo.length ? todo.map(o => {
    const n = nextStep(o);
    return `<div class="line"><span class="line__ico"><i class="ph ${TODO_ICON[n.tab]}" aria-hidden="true"></i></span>
      <div class="line__txt"><b>${esc(n.short)}</b><small>${esc(o.codigo)} · ${esc(o.cliente.nome || 'Sem nome')}</small></div>
      ${btnHtml(n.btn, '', 'btn--line btn--sm', `data-todo="${esc(o.codigo)}"`)}</div>`;
  }).join('') : emptyBox('ph-check-circle', orders.length ? 'Nada pendente. Todos os pedidos estão em dia.' : 'Cadastre o primeiro pedido para começar.');

  const rev = monthsBack(6), cur = rev[5], prev = rev[4];
  setCount($('#k-fat'), cur.total, brl);
  $('#k-delta').textContent = prev.total > 0 ? `${cur.total >= prev.total ? '+' : ''}${Math.round(((cur.total - prev.total) / prev.total) * 100)}% em relação ao mês passado`
    : cur.total > 0 ? 'Primeiro mês com vendas no painel' : 'Nenhuma venda neste mês ainda';
  setCount($('#k-ped'), cur.count);
  setCount($('#k-way'), orders.filter(o => o.status >= 2 && o.status < LAST).length);
  setCount($('#k-done'), orders.filter(o => o.status === LAST).length);

  const counts = ORDER_STATUS.map((_, i) => orders.filter(o => o.status === i).length);
  $('#pipe').innerHTML = ORDER_STATUS.map((s, i) => `<li class="${counts[i] ? 'has' : ''}" style="--i:${i}"><span class="pipe__dot"><i class="ph ${NOTIFY_ICON[i]}" aria-hidden="true"></i></span><strong>${counts[i]}</strong><span>${s}</span></li>`).join('');

  renderChart(rev);

  $('#attention').innerHTML = stale.length ? stale.slice(0, 5).map(o => `<div class="line"><span class="line__ico"><i class="ph ph-hourglass-medium" aria-hidden="true"></i></span>
    <div class="line__txt"><b>${esc(o.cliente.nome || 'Sem nome')}</b><small>${esc(o.codigo)} · parado há ${Math.floor((Date.now() - new Date(lastUpdate(o))) / 864e5)} dias em "${esc(ORDER_STATUS[o.status])}"</small></div>
    ${btnHtml('Abrir', '', 'btn--line btn--sm', `data-open="${esc(o.codigo)}"`)}</div>`).join('')
    : emptyBox('ph-check-circle', 'Tudo em dia. Nenhum pedido parado.');

  const recent = [...orders].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  $('#recent').innerHTML = recent.length ? recent.map(o => `<button type="button" class="line line--btn" data-open="${esc(o.codigo)}"><span class="line__ico"><i class="ph ph-package" aria-hidden="true"></i></span>
    <span class="line__txt"><b>${esc(o.cliente.nome || 'Sem nome')}</b><small>${esc(o.codigo)} · ${esc(ORDER_STATUS[o.status])}</small></span><span class="line__val">${brl(orderTotal(o))}</span></button>`).join('')
    : emptyBox('ph-package', 'Nenhum pedido ainda.');

  const parts = {};
  orders.forEach(o => o.itens.forEach(i => { const k = i.desc.trim(); if (k) { (parts[k] ||= { qtd: 0, total: 0 }).qtd += i.qtd; parts[k].total += i.qtd * i.valor; } }));
  const best = Object.entries(parts).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 5), max = best[0]?.[1].qtd || 1;
  $('#top-parts').innerHTML = best.length ? best.map(([desc, p], i) => `<div class="part" style="--i:${i}"><div class="part__txt"><b>${esc(desc)}</b><span class="part__bar"><span style="--w:${p.qtd / max}"></span></span></div><span class="line__val">${p.qtd} un.<small>${brl(p.total)}</small></span></div>`).join('')
    : emptyBox('ph-wrench', 'As peças mais vendidas aparecem aqui.');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-open]');
  if (b) openDrawer(orders.find(o => o.codigo === b.dataset.open));
  const t = e.target.closest('[data-todo]');
  if (!t) return;
  const o = orders.find(x => x.codigo === t.dataset.todo), n = nextStep(o);
  if (n.tab === 'entrega') return openRoute(o);
  openDrawer(o, n.tab);
  if (n.tpl) setTpl(n.tpl);
});

/* =====================================================================
   ENTREGAS
   ===================================================================== */
let shipFilter = 'open';
const lastStop = o => (o.historico || []).filter(h => h.local).at(-1)?.local || '';
function renderShips() {
  const c = { open: orders.filter(o => o.status < LAST).length, done: orders.filter(o => o.status === LAST).length, all: orders.length };
  $$('#ship-chips button').forEach(b => { b.innerHTML = `${b.textContent.replace(/\s*\d+$/, '')} <b>${c[b.dataset.shipF]}</b>`; b.classList.toggle('is-active', b.dataset.shipF === shipFilter); });
  const list = orders.filter(o => shipFilter === 'all' || (shipFilter === 'done') === (o.status === LAST)).sort((a, b) => lastUpdate(b).localeCompare(lastUpdate(a)));
  $('#ships').innerHTML = list.length ? list.map((o, n) => `<article class="dlv" style="--i:${Math.min(n, 10)}">
    <div class="ship__top"><div><span class="o-code">${esc(o.codigo)}</span><p>${esc(o.cliente.nome || 'Sem nome')} · ${esc(o.cliente.cidade)}</p><small>${o.itens.map(i => esc(i.desc)).join(', ')}</small></div>${statusPill(o)}</div>
    <div class="ship__bar" role="img" aria-label="Etapa ${o.status + 1} de ${LAST + 1}">${ORDER_STATUS.map((_, i) => `<span class="${i <= o.status ? 'on' : ''}"></span>`).join('')}</div>
    <small class="ship__when">${lastStop(o) ? `Em ${esc(lastStop(o))} · ` : ''}Atualizado em ${fmtDate(lastUpdate(o))}${o.previsao ? ` · previsão ${fmtDay(o.previsao)}` : ''}</small>
    <div class="ship__acts">
      ${btnHtml('Mudar rota', 'ph-path', 'btn--primary btn--sm', `data-ship="rota" data-code="${esc(o.codigo)}"`)}
      ${o.status < LAST ? btnHtml(`Avançar: ${ORDER_STATUS[o.status + 1]}`, 'ph-skip-forward', 'btn--line btn--sm', `data-ship="next" data-code="${esc(o.codigo)}"`) : ''}
      <button class="icon" type="button" data-ship="msg" data-code="${esc(o.codigo)}" aria-label="Avisar no WhatsApp" title="Avisar no WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>
      <button class="icon" type="button" data-ship="link" data-code="${esc(o.codigo)}" aria-label="Copiar link de rastreio" title="Copiar link de rastreio"><i class="ph ph-link"></i></button>
      <button class="icon" type="button" data-ship="test" data-code="${esc(o.codigo)}" aria-label="Ver como o cliente" title="Ver como o cliente"><i class="ph ph-device-mobile"></i></button>
    </div></article>`).join('')
    : `<div class="card">${emptyBox('ph-truck', shipFilter === 'done' ? 'Nenhum pedido entregue ainda.' : 'Nenhum pedido a caminho.')}</div>`;
}
$('#ship-chips').addEventListener('click', e => { const b = e.target.closest('[data-ship-f]'); if (b) { shipFilter = b.dataset.shipF; renderShips(); } });
$('#ships').addEventListener('click', async e => {
  const b = e.target.closest('[data-ship]');
  if (!b) return;
  const o = orders.find(x => x.codigo === b.dataset.code), a = b.dataset.ship;
  if (a === 'rota') openRoute(o);
  if (a === 'next') {
    orders = loadOrders();
    const x = orders.find(y => y.codigo === o.codigo);
    x.status += 1;
    x.historico.push({ status: x.status, data: new Date().toISOString() });
    saveOrders(orders);
    renderAll();
    toast(`${x.codigo}: ${ORDER_STATUS[x.status]}. O cliente já vê no rastreio.`);
  }
  if (a === 'msg') { openDrawer(o, 'msg'); setTpl('status'); }
  if (a === 'test') { setView('rastreio'); $('#t-sel').value = o.codigo; runTester(o.codigo); }
  if (a === 'link') {
    try { await navigator.clipboard.writeText(trackLink(o)); toast('Link de rastreio copiado.'); }
    catch { toast('Não foi possível copiar o link.'); }
  }
});

/* =====================================================================
   CLIENTES (montado a partir dos pedidos)
   ===================================================================== */
function renderClients() {
  const map = new Map();
  orders.forEach(o => {
    const k = String(o.cliente.doc || '').replace(/\D/g, '') || phoneDigits(o.cliente.whatsapp) || o.cliente.nome;
    if (!k) return;
    const c = map.get(k) || { pedidos: 0, total: 0, ultima: '' };
    c.pedidos++; c.total += orderTotal(o);
    if (o.data >= c.ultima) Object.assign(c, { ultima: o.data, nome: o.cliente.nome, doc: o.cliente.doc, cidade: o.cliente.cidade, fone: o.cliente.whatsapp });
    map.set(k, c);
  });
  const q = $('#q-cli').value.trim().toLowerCase();
  const list = [...map.values()].filter(c => !q || [c.nome, c.cidade, c.doc].join(' ').toLowerCase().includes(q)).sort((a, b) => b.ultima.localeCompare(a.ultima));
  $('#cli-rows').innerHTML = list.map((c, i) => `<tr class="is-plain" style="--i:${Math.min(i, 12)}">
    <td><b>${esc(c.nome)}</b></td><td>${esc(c.doc || '-')}</td><td>${esc(c.cidade)}</td><td>${c.pedidos}</td><td><strong>${brl(c.total)}</strong></td><td>${new Date(c.ultima).toLocaleDateString('pt-BR')}</td>
    <td><a class="icon" href="https://api.whatsapp.com/send?phone=${phoneDigits(c.fone)}" target="_blank" rel="noopener" aria-label="Abrir conversa com ${esc(c.nome)}"><i class="ph ph-whatsapp-logo"></i></a></td></tr>`).join('');
  $('#cli-empty').hidden = list.length > 0;
  $('#cli-empty-text').textContent = q ? 'Nenhum cliente encontrado.' : 'Os clientes aparecem aqui depois do primeiro pedido.';
}
$('#q-cli').addEventListener('input', renderClients);

/* =====================================================================
   TESTAR RASTREIO
   ===================================================================== */
const DEMO_CODE = 'AS-EXEMPLO';
const frame = $('#t-frame'), phone = $('#phone');
let testing = '';
function renderTester() {
  const sel = $('#t-sel'), keep = sel.value;
  sel.innerHTML = [...orders].sort((a, b) => b.data.localeCompare(a.data)).map(o => `<option value="${esc(o.codigo)}">${esc(o.codigo)} · ${esc(o.cliente.nome)}</option>`).join('') + `<option value="${DEMO_CODE}">Pedido de exemplo</option>`;
  if (keep) sel.value = keep;
  $('#ph-clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (!testing) runTester(sel.value);
}
function runTester(code) {
  testing = code;
  const o = orders.find(x => x.codigo === code);
  const shown = o ? trackLink(o) : trackPage(code);
  const url = new URL(`../site/rastreio.html?pedido=${encodeURIComponent(code)}`, location.href).href;
  $('#t-url').textContent = shown;
  $('#ph-url').textContent = shown.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  $('#t-open').href = url;
  const wa = $('#t-wa');
  wa.hidden = !o;
  if (o) wa.href = `https://api.whatsapp.com/send?phone=${phoneDigits(o.cliente.whatsapp)}&text=${encodeURIComponent(`Acompanhe seu pedido ${o.codigo}: ${shown}`)}`;
  phone.classList.add('is-loading');
  if (!REDUCE && window.gsap) gsap.fromTo(phone, { y: 0, scale: 1 }, { y: -10, scale: 1.015, duration: .28, ease: 'power2.out', yoyo: true, repeat: 1 });
  frame.src = url;
}
// a tela só aparece quando a página do cliente terminou de abrir
frame.addEventListener('load', () => { if (frame.getAttribute('src') !== 'about:blank') setTimeout(() => phone.classList.remove('is-loading'), 450); });
$('#t-go').addEventListener('click', () => runTester($('#t-code').value.trim() || $('#t-sel').value));
$('#t-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#t-go').click(); });
$('#t-sel').addEventListener('change', e => { $('#t-code').value = ''; runTester(e.target.value); });
$('#t-reload').addEventListener('click', () => runTester(testing));
$('#t-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#t-url').textContent); toast('Link copiado.'); }
  catch { toast('Não foi possível copiar o link.'); }
});
// o aparelho acompanha o mouse, como um celular na mão
if (FINE && !REDUCE && window.gsap) {
  const stage = $('#phone-stage');
  gsap.set(phone, { transformPerspective: 1200 });
  const rx = gsap.quickTo(phone, 'rotationX', { duration: .9, ease: 'power3.out' }), ry = gsap.quickTo(phone, 'rotationY', { duration: .9, ease: 'power3.out' });
  stage.addEventListener('pointermove', e => { const r = stage.getBoundingClientRect(); rx((.5 - (e.clientY - r.top) / r.height) * 8); ry(((e.clientX - r.left) / r.width - .5) * 12); });
  stage.addEventListener('pointerleave', () => { rx(0); ry(0); });
}

/* =====================================================================
   MENSAGENS: todos os modelos num lugar só, com prévia e envio
   ===================================================================== */
const MC_GROUPS = [
  ['Pedido', [['criado', 'Confirmação do pedido', 'ph-check-circle'], ['dados', 'Pedir dados para a nota', 'ph-identification-card'], ['retirada', 'Pronto para retirada', 'ph-storefront']]],
  ['Entrega', [...ORDER_STATUS.slice(1).map((s, i) => [`st${i + 1}`, s, NOTIFY_ICON[i + 1]]), ['tentativa', 'Não consegui entregar', 'ph-house-line']]],
  ['Nota fiscal', [['nota', 'Nota fiscal', 'ph-receipt']]],
];
// pedido de exemplo: a prévia funciona mesmo antes do primeiro pedido
const MC_SAMPLE = {
  codigo: 'AS-1024', codigoRastreio: 'ATSEXEMPLO2', data: new Date().toISOString(), status: 3, previsao: '', frete: 80, pagamento: 'Pix', obs: '', msgs: [], tentativas: 1,
  cliente: { nome: 'Cliente de Exemplo', whatsapp: '', doc: '', cidade: 'Sorocaba - SP', endereco: 'Rua das Flores, 100', bairro: 'Centro', cep: '' },
  itens: [{ desc: 'Farol esquerdo Hyundai i30 2014', qtd: 1, valor: 650 }], rastreio: { transportadora: 'Correios', codigo: '' },
  historico: [{ status: 3, data: new Date().toISOString(), local: 'Curitiba - PR', obs: '' }], nf: { numero: 1193, serie: 1, emitidaEm: new Date().toISOString(), enviadaEm: null },
};
let mcModel = 'criado';
const mcOrder = () => orders.find(o => o.codigo === $('#mc-order').value);
function mcText(id, o) {
  if (id.startsWith('st')) return deliveryMsg(o, +id.slice(2));
  if (id === 'tentativa') return attemptMsg({ ...o, tentativas: (o.tentativas || 0) + 1 });
  if (id === 'nota' && !o.nf) return '';
  return TEMPLATES[id](o, null);
}
function renderMc() {
  const sel = $('#mc-order'), keep = sel.value;
  sel.innerHTML = [...orders].sort((a, b) => b.data.localeCompare(a.data)).map(o => `<option value="${esc(o.codigo)}">${esc(o.codigo)} · ${esc(o.cliente.nome)}</option>`).join('') || '<option value="">Exemplo (nenhum pedido ainda)</option>';
  if (keep && [...sel.options].some(x => x.value === keep)) sel.value = keep;
  $('#mc-list').innerHTML = MC_GROUPS.map(([g, items]) => `<p class="mc__g">${g}</p>${items.map(([id, name, ico]) => `<button type="button" data-mc="${id}" class="${id === mcModel ? 'is-on' : ''}"><i class="ph ${ico}" aria-hidden="true"></i>${esc(name)}</button>`).join('')}`).join('');

  const o = mcOrder() || MC_SAMPLE, text = mcText(mcModel, o);
  $('#mc-bubble').innerHTML = text ? waHtml(text) : '<span class="wa__empty">Este pedido ainda não tem nota fiscal. Emita a nota para liberar esta mensagem.</span>';
  $('#mc-send').disabled = !mcOrder() || !text;
  $('#mc-copy').disabled = !text;
  $('#mc-open').disabled = !mcOrder();

  const log = orders.flatMap(x => (x.msgs || []).map(m => ({ o: x, m }))).sort((a, b) => b.m.data.localeCompare(a.m.data)).slice(0, 8);
  $('#mc-log').innerHTML = log.length ? log.map(({ o: x, m }) => `<div class="line"><span class="line__ico"><i class="ph ph-whatsapp-logo" aria-hidden="true"></i></span>
    <div class="line__txt"><b>${esc(m.tpl === 'status' ? ORDER_STATUS[m.status] : TPL_NAMES[m.tpl] || 'Mensagem')}</b><small>${esc(x.codigo)} · ${esc(x.cliente.nome)}</small></div><span class="line__val"><small>${fmtDate(m.data)}</small></span></div>`).join('')
    : emptyBox('ph-chat-circle-text', 'As mensagens enviadas aparecem aqui.');
}
$('#mc-site').innerHTML = SITE_MSGS.map(([t, m]) => `<div class="mc__in"><b>${t}</b><p>${waHtml(m)}</p></div>`).join('');
$('#mc-list').addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (b) { mcModel = b.dataset.mc; renderMc(); } });
$('#mc-order').addEventListener('change', renderMc);
$('#mc-open').addEventListener('click', () => { const o = mcOrder(); if (o) openDrawer(o, 'msg'); });
$('#mc-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(mcText(mcModel, mcOrder() || MC_SAMPLE)); toast('Mensagem copiada.'); }
  catch { toast('Não foi possível copiar.'); }
});
$('#mc-send').addEventListener('click', () => {
  orders = loadOrders();
  const o = orders.find(x => x.codigo === $('#mc-order').value);
  if (!o) return;
  if (mcModel === 'tentativa') o.tentativas = Math.min((o.tentativas || 0) + 1, 3);
  current = structuredClone(o);
  openChat(mcModel === 'tentativa' ? attemptMsg(o) : mcText(mcModel, o));
  const stage = mcModel.startsWith('st') ? +mcModel.slice(2) : o.status;
  (o.msgs ||= []).push({ tpl: mcModel.startsWith('st') ? 'status' : mcModel, data: new Date().toISOString(), status: stage });
  if (mcModel === 'nota' && o.nf) o.nf.enviadaEm = new Date().toISOString();
  saveOrders(orders);
  renderAll();
  toast(`Conversa aberta ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'}. Confira e envie.`);
});

/* =====================================================================
   BACKUP
   ===================================================================== */
function renderCatalog() {
  const c = notasInfo;
  $('#nf-cat-status').textContent = !c ? 'O catálogo fica no servidor e aparece aqui quando o painel estiver conectado à Hostinger.'
    : `${c.total} nota(s) guardada(s)${c.removidas ? `, ${c.removidas} removida(s) do painel` : ''}. ` + (c.foraDoSite ? 'Estão fora da pasta do site: trocar ou apagar o site não mexe nelas.' : 'Atenção: o servidor não deixou guardar fora da pasta do site. Não apague a pasta api/dados.');
}
addEventListener('orders:changed', renderCatalog);
renderCatalog();
const fetchCatalog = async () => {
  if (!notasInfo) { toast('Conecte o painel à Hostinger para usar o catálogo.'); return null; }
  try { return await syncApi('catalog'); } catch { toast('Não consegui falar com o servidor. Tente de novo.'); return null; }
};
$('#nf-cat-dl').addEventListener('click', async () => {
  const c = await fetchCatalog();
  if (!c) return;
  downloadFile(new File([JSON.stringify(c, null, 2)], 'catalog.json', { type: 'application/json' }));
  toast('catalog.json baixado. Guarde uma cópia fora do servidor também.');
});
// recoloca no painel as notas que saíram dele; a mais recente de cada pedido vence
$('#nf-cat-back').addEventListener('click', async () => {
  const c = await fetchCatalog();
  if (!c) return;
  orders = loadOrders();
  const tem = new Set(orders.filter(o => o.nf).map(o => o.codigo));
  const volta = [...c.notas].reverse().filter(n => !tem.has(n.codigo) && tem.add(n.codigo));
  if (!volta.length) return toast('Nenhuma nota para recuperar: estão todas no painel.');
  if (!confirm(`Recuperar ${volta.length} nota(s) no painel? Os pedidos que foram apagados voltam junto.`)) return;
  volta.forEach(n => {
    const i = orders.findIndex(o => o.codigo === n.codigo);
    if (i < 0) orders.push(n.pedido); else orders[i].nf = n.pedido.nf;
  });
  saveOrders(orders);
  renderAll();
  toast(`${volta.length} nota(s) recuperada(s).`);
});
$('#backup-dl').addEventListener('click', () => {
  const day = new Date().toISOString().slice(0, 10);
  downloadFile(new File([JSON.stringify({ versao: 1, pedidos: loadOrders() })], `backup-atual-sucatas-${day}.json`, { type: 'application/json' }));
  toast('Backup baixado. Guarde o arquivo em um lugar seguro.');
});
$('#backup-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let list;
  try { list = JSON.parse(await file.text()).pedidos; } catch {}
  if (!Array.isArray(list) || list.some(o => !o?.codigo || !o.cliente || !Array.isArray(o.itens))) return toast('Esse arquivo não é um backup do painel.');
  if (!confirm(`Restaurar ${list.length} pedido(s)? Pedidos com o mesmo código serão substituídos pelos do backup. Os outros continuam.`)) return;
  const byCode = new Map(loadOrders().map(o => [o.codigo, o]));
  list.forEach(o => byCode.set(o.codigo, o));
  orders = [...byCode.values()];
  saveOrders(orders);
  renderAll();
  toast(`${list.length} pedido(s) restaurado(s).`);
});

/* =====================================================================
   MOVIMENTO
   Toda tela entra com palavras subindo, cartões em cascata e números contando.
   Tudo é opcional: sem GSAP ou com movimento reduzido, a tela já está pronta.
   ===================================================================== */
let enterTimer;

function moveIndicator() {
  const a = $('.side__nav button.is-active'), ind = $('#side-ind');
  if (!a) return;
  ind.style.transform = `translateY(${a.offsetTop}px)`;
  ind.style.height = `${a.offsetHeight}px`;
  ind.style.opacity = 1;
}
addEventListener('resize', moveIndicator);
document.fonts?.ready.then(moveIndicator);

function riseWords(el) {
  if (!el || REDUCE) return;
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = text.split(' ').map((w, i) => `<span class="t-w" aria-hidden="true"><span style="--w:${i}">${esc(w)}</span></span>`).join(' ');
}

const revealer = 'IntersectionObserver' in window && new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('is-in');
  revealer.unobserve(e.target);
}), { rootMargin: '0px 0px -8% 0px' });

// os números sobem do zero sempre que a tela abre
function countIn(panel) {
  if (REDUCE || !window.gsap) return;
  $$('[data-val]', panel).forEach(el => (el.dataset.val = 0));
  if (panel.dataset.viewPanel === 'inicio') renderHome();
  $$('[data-num]', panel).forEach(el => {
    const o = { v: 0 }, money = 'money' in el.dataset;
    gsap.to(o, { v: +el.dataset.num, duration: .9, ease: 'power3.out', onUpdate: () => (el.textContent = money ? brl(o.v) : Math.round(o.v)) });
  });
}

function enterView(v) {
  moveIndicator();
  const panel = $(`[data-view-panel="${v}"]`), head = $('#main-head');
  // a classe liga as entradas em CSS; sai logo depois para os redesenhos da sincronização não repetirem nada
  [...$$('[data-view-panel]'), head].forEach(el => el.classList.remove('is-entering'));
  void panel.offsetWidth;
  [panel, head].forEach(el => el.classList.add('is-entering'));
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => [panel, head].forEach(el => el.classList.remove('is-entering')), 1400);
  riseWords(v === 'inicio' ? $('#greet') : $('#view-title'));

  $$('.rv', panel).forEach((el, i) => {
    if (REDUCE || !revealer) return el.classList.add('is-in');
    el.classList.remove('is-in');
    el.style.setProperty('--i', i % 2);
    revealer.observe(el);
  });
  countIn(panel);
  scrollMotion();
  if (window.ScrollTrigger) ScrollTrigger.refresh();
}

/* a engrenagem do logo gira com a rolagem */
let scrollReady = false;
function scrollMotion() {
  if (scrollReady || REDUCE || !window.gsap || !window.ScrollTrigger) return;
  scrollReady = true;
  gsap.registerPlugin(ScrollTrigger);
  gsap.to('.side__brand .logo-ring__g', { rotation: 360, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .6 } });
}

function playGate() {
  if (REDUCE) return;
  const g = $('#gate');
  g.hidden = false;
  setTimeout(() => (g.hidden = true), 1300);
}
function shake(el) {
  if (!REDUCE) el.animate([0, -8, 7, -5, 3, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 340, easing: 'ease-out' });
}
function celebrate(el) {
  const r = el.getBoundingClientRect();
  window.faiscas?.(r.left + r.width / 2, r.top);
}

/* cartões dos números: a luz segue o mouse e o cartão inclina com mola */
if (FINE && !REDUCE && window.gsap) $$('.tilt').forEach(c => {
  gsap.set(c, { transformPerspective: 900 });
  const rx = gsap.quickTo(c, 'rotationX', { duration: .7, ease: 'elastic.out(1, .6)' });
  const ry = gsap.quickTo(c, 'rotationY', { duration: .7, ease: 'elastic.out(1, .6)' });
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    c.style.setProperty('--mx', `${px * 100}%`); c.style.setProperty('--my', `${py * 100}%`);
    rx((.5 - py) * 7); ry((px - .5) * 7);
  });
  c.addEventListener('pointerleave', () => { rx(0); ry(0); });
});

/* botões principais puxam o mouse, com aperto no clique */
if (FINE && !REDUCE && window.gsap) $$('#new-order, .home-head .btn, #t-go').forEach(b => {
  const x = gsap.quickTo(b, 'x', { duration: .6, ease: 'elastic.out(1, .45)' }), y = gsap.quickTo(b, 'y', { duration: .6, ease: 'elastic.out(1, .45)' });
  b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); x((e.clientX - r.left - r.width / 2) * .2); y((e.clientY - r.top - r.height / 2) * .3); });
  b.addEventListener('pointerleave', () => { x(0); y(0); });
});

/* engrenagem em volta do logo */
$$('[data-ring]').forEach(el => el.insertAdjacentHTML('afterbegin', `<span class="logo-ring__g" aria-hidden="true">${window.gearSvg?.(30) || ''}</span>`));

/* =====================================================================
   NOTAS: o que precisa ser feito, um pedido por linha
   ===================================================================== */
function renderNfQueue() {
  const list = orders.filter(o => !o.nf || !o.nf.enviadaEm).sort((a, b) => a.data.localeCompare(b.data));
  $('#q-count').textContent = list.length ? `${list.length} ${list.length === 1 ? 'pedido' : 'pedidos'}` : '';
  $('#nf-queue').innerHTML = list.length ? list.map(o => {
    const { cliente, badItems, okC, okP } = nfChecks(o);
    const miss = [...cliente.filter(([, v]) => !v).map(([l]) => l), ...(o.pagamento ? [] : ['Pagamento']), ...(badItems ? ['Peças'] : [])];
    const st = o.nf ? { cls: 'is-go', txt: `Nota nº ${o.nf.numero} gerada`, btn: 'Enviar ao cliente', ico: 'ph-whatsapp-logo', kind: 'btn--whats' }
      : okC && okP ? { cls: 'is-ok', txt: 'Pronto para emitir', btn: 'Emitir nota', ico: 'ph-file-plus', kind: 'btn--primary' }
      : { cls: 'is-warn', txt: `Falta: ${miss.join(', ')}`, btn: 'Completar dados', ico: 'ph-pencil-simple', kind: 'btn--line' };
    return `<div class="q-row"><div class="q-row__who"><b>${esc(o.cliente.nome || 'Sem nome')}</b><small>${esc(o.codigo)} · ${brl(orderTotal(o))}</small></div>
      <span class="q-tag ${st.cls}">${esc(st.txt)}</span>${btnHtml(st.btn, st.ico, `${st.kind} btn--sm`, `data-nf-open="${esc(o.codigo)}"`)}</div>`;
  }).join('') : emptyBox('ph-check-circle', 'Todas as notas foram emitidas e enviadas.');
}
$('#nf-queue').addEventListener('click', e => {
  const b = e.target.closest('[data-nf-open]');
  if (b) openDrawer(orders.find(o => o.codigo === b.dataset.nfOpen), 'nota');
});

/* =====================================================================
   MUDAR ROTA: etapa, cidade, transportadora, código e previsão num lugar só
   ===================================================================== */
const routeDlg = $('#route-dlg');
let routeOrder = null, routeStage = 0, routeHist = [];

function renderRoute() {
  $('#rt-steps').innerHTML = ORDER_STATUS.map((s, i) => `<button type="button" data-rt="${i}" class="${i === routeStage ? 'is-on' : ''} ${i < routeStage ? 'is-past' : ''}"><i class="ph ${NOTIFY_ICON[i]}" aria-hidden="true"></i>${s}</button>`).join('');
  const stops = routeHist.map((h, i) => ({ ...h, i })).filter(h => h.local);
  $('#rt-path').innerHTML = `<span class="rt-stop rt-stop--fix"><i class="ph ph-warehouse" aria-hidden="true"></i>Chapecó - SC</span>`
    + stops.map(h => `<i class="ph ph-caret-right rt-sep" aria-hidden="true"></i><span class="rt-stop">${esc(h.local)}<button type="button" data-rt-del="${h.i}" aria-label="Tirar ${esc(h.local)} da rota"><i class="ph ph-x"></i></button></span>`).join('')
    + `<i class="ph ph-caret-right rt-sep" aria-hidden="true"></i><span class="rt-stop rt-stop--fix"><i class="ph ph-house-line" aria-hidden="true"></i>${esc(routeOrder.cliente.cidade || 'Cliente')}</span>`;
  const t = $('#rt-transp').value.trim().toLowerCase();
  $$('#rt-carriers button').forEach(b => b.classList.toggle('is-on', b.textContent.trim().toLowerCase() === t));
}
function openRoute(o) {
  routeOrder = o;
  routeStage = o.status;
  routeHist = structuredClone(o.historico || []);
  $('#rt-title').textContent = `Mudar rota do ${o.codigo}`;
  $('#rt-sub').textContent = `${o.cliente.nome || 'Sem nome'} · ${o.cliente.cidade || 'sem cidade'}`;
  $('#rt-local').value = ''; $('#rt-obs').value = '';
  $('#rt-prev').value = o.previsao || '';
  $('#rt-transp').value = o.rastreio?.transportadora || '';
  $('#rt-code').value = o.rastreio?.codigo || '';
  $('#rt-avisar').checked = true;
  renderRoute();
  routeDlg.showModal();
  $('#rt-local').focus();
}
$('#rt-steps').addEventListener('click', e => { const b = e.target.closest('[data-rt]'); if (b) { routeStage = +b.dataset.rt; renderRoute(); } });
$('#rt-path').addEventListener('click', e => { const b = e.target.closest('[data-rt-del]'); if (b) { routeHist[+b.dataset.rtDel].local = ''; renderRoute(); } });
$('#rt-carriers').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { $('#rt-transp').value = b.textContent.trim(); renderRoute(); } });
$('#rt-transp').addEventListener('input', renderRoute);
$('#route-form').addEventListener('submit', e => {
  e.preventDefault();
  orders = loadOrders();
  const o = orders.find(x => x.codigo === routeOrder.codigo);
  if (!o) return routeDlg.close();
  const local = $('#rt-local').value.trim(), obs = $('#rt-obs').value.trim();
  o.historico = routeHist.filter(h => h.status <= routeStage); // voltar de etapa apaga o que estava à frente
  if (routeStage !== o.status || local || obs) o.historico.push({ status: routeStage, data: new Date().toISOString(), local, obs });
  o.status = routeStage;
  o.previsao = $('#rt-prev').value;
  o.rastreio = { transportadora: $('#rt-transp').value.trim(), codigo: $('#rt-code').value.trim() };
  o.codigoRastreio ||= genTrack();
  const notify = $('#rt-avisar').checked;
  if (notify) (o.msgs ||= []).push({ tpl: 'status', data: new Date().toISOString(), status: routeStage });
  saveOrders(orders);
  routeDlg.close();
  renderAll();
  if (drawer.open && current?.codigo === o.codigo) { current = structuredClone(o); fillForm(); renderHead(); renderHistory(); renderNext(); renderNotify(); }
  if (routeStage === LAST) celebrate($('#sync-pill'));
  if (notify) { current = structuredClone(o); openChat(deliveryMsg(o, routeStage)); }
  toast(`Rota do ${o.codigo} atualizada. O cliente já vê no rastreio.`);
});
$('#d-route').addEventListener('click', () => {
  const o = orders.find(x => x.codigo === current?.codigo);
  if (!o) return toast('Salve o pedido antes de mudar a rota.');
  openRoute(o);
});

/* =====================================================================
   FORMULÁRIO DO CLIENTE
   ===================================================================== */
const maskPhone = v => {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length < 3) return d;
  const ddd = `(${d.slice(0, 2)}) `, rest = d.slice(2);
  if (rest[0] === '9') return ddd + `9 ${rest.slice(1, 5)}${rest.length > 5 ? `-${rest.slice(5)}` : ''}`.trim(); // celular
  return ddd + rest.slice(0, 4) + (rest.length > 4 ? `-${rest.slice(4)}` : '');
};
form.whatsapp.addEventListener('input', e => {
  e.target.value = maskPhone(e.target.value);
  const n = e.target.value.replace(/\D/g, '').length, el = $('#wa-err');
  el.className = `field-err${n >= 10 ? ' is-ok' : ''}`;
  el.textContent = n >= 10 ? 'WhatsApp completo ✓' : '';
  suggestClient();
});
form.nome.addEventListener('input', suggestClient);

// cliente que já comprou: um clique preenche tudo
function suggestClient() {
  const box = $('#cli-hit');
  box.hidden = true;
  if (!isNew) return;
  const phone = form.whatsapp.value.replace(/\D/g, ''), name = form.nome.value.trim().toLowerCase(), doc = form.doc.value.replace(/\D/g, '');
  if (phone.length < 8 && name.length < 4 && doc.length < 11) return;
  const hit = [...orders].sort((a, b) => b.data.localeCompare(a.data)).find(o =>
    (doc.length >= 11 && o.cliente.doc.replace(/\D/g, '') === doc) || (phone.length >= 8 && o.cliente.whatsapp.replace(/\D/g, '').includes(phone)) || (name.length >= 4 && o.cliente.nome.toLowerCase().includes(name)));
  if (!hit || hit.cliente.nome.toLowerCase() === name) return;
  box.hidden = false;
  box.dataset.code = hit.codigo;
  box.innerHTML = `<i class="ph ph-user-check" aria-hidden="true"></i><span><b>${esc(hit.cliente.nome)}</b> já comprou aqui · ${esc(hit.cliente.cidade)}</span><button type="button" class="link-btn">Usar estes dados</button>`;
}
$('#cli-hit').addEventListener('click', e => {
  if (!e.target.closest('button')) return;
  const o = orders.find(x => x.codigo === $('#cli-hit').dataset.code);
  readForm();
  current.cliente = structuredClone(o.cliente);
  fillForm(); showDocErr(); renderCliLeft(); renderTrackChip(); renderNext();
  $('#cli-hit').hidden = true;
  toast('Dados do cliente preenchidos.');
});

// CNPJ completo busca a empresa na base pública; só preenche o que está vazio
let lastCnpj = '';
async function lookupCnpj() {
  const d = form.doc.value.replace(/\D/g, '');
  if (d.length !== 14 || !validCNPJ(d) || d === lastCnpj) return;
  lastCnpj = d;
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
    if (!r.ok) return;
    const j = await r.json(), fill = (el, v) => { if (v && !el.value.trim()) el.value = v; };
    fill(form.nome, titleName(j.razao_social || ''));
    fill(form.cep, maskCep(String(j.cep || '')));
    fill(form.endereco, titleName(j.logradouro || ''));
    fill(form.numero, j.numero);
    fill(form.bairro, titleName(j.bairro || ''));
    if (j.municipio && j.uf) fill(form.cidade, `${titleName(j.municipio)} - ${j.uf}`);
    renderCliLeft();
  } catch {}
}
form.doc.addEventListener('input', lookupCnpj);
form.doc.addEventListener('input', suggestClient);

function renderCliLeft() {
  if (!current) return;
  const c = { nome: form.nome.value, whatsapp: form.whatsapp.value, cidade: form.cidade.value };
  const need = [['WhatsApp', c.whatsapp.replace(/\D/g, '').length >= 10], ['Nome', c.nome.trim()], ['Cidade', c.cidade.trim()]].filter(([, ok]) => !ok).map(([l]) => l);
  const forNf = [['CPF ou CNPJ', form.doc.value], ['CEP', form.cep.value], ['Rua', form.endereco.value], ['Número', form.numero.value], ['Bairro', form.bairro.value]].filter(([, v]) => !v.trim()).map(([l]) => l);
  const box = $('#cli-left');
  box.className = `cli-left ${need.length ? 'is-need' : forNf.length ? 'is-nf' : 'is-ok'}`;
  box.innerHTML = need.length ? `<i class="ph ph-warning-circle" aria-hidden="true"></i><span>Para salvar, falta: <b>${need.join(', ')}</b></span>`
    : forNf.length ? `<i class="ph ph-info" aria-hidden="true"></i><span>Já dá para salvar. Para a nota fiscal, falta: <b>${forNf.join(', ')}</b></span>`
    : '<i class="ph ph-check-circle" aria-hidden="true"></i><span>Cliente completo. A nota fiscal pode sair com estes dados.</span>';
  $('.tabs [data-tab="cliente"]').classList.toggle('is-ok', !need.length && !forNf.length);
}
form.addEventListener('input', renderCliLeft);
$('#order-form').addEventListener('click', e => { const b = e.target.closest('[data-tab-go]'); if (b) setTab(b.dataset.tabGo); });

/* =====================================================================
   CONEXÃO COM O SERVIDOR
   ===================================================================== */
const SYNC_LABEL = { conectado: ['Conectado ao site', 'is-ok'], enviando: ['Enviando...', 'is-wait'], 'sem-rede': ['Sem conexão, salvo aqui', 'is-bad'], local: ['Só neste navegador', 'is-off'] };
function renderSyncPill() {
  const [text, cls] = SYNC_LABEL[syncState];
  const el = $('#sync-pill');
  el.className = `sync-pill ${cls}`;
  $('span', el).textContent = text;
}
addEventListener('sync:state', renderSyncPill);
renderSyncPill();

async function probeServer() {
  try {
    const r = await fetch(syncUrl('login'), { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    if (typeof j?.configurado === 'boolean') serverAuth = j;
  } catch {} // sem API (GitHub Pages, computador local): o login fica neste navegador
}
async function serverSubmit(user, pw) {
  const setup = setupMode(), label = setup ? 'Criar acesso e entrar' : 'Entrar';
  authErr.classList.remove('is-ok');
  if (setup && pw !== $('#pw2').value) return (authErr.textContent = 'As duas senhas não são iguais.');
  setSubmitLabel('Conectando...');
  let r, j;
  try {
    r = await fetch(syncUrl('login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: setup ? 'criar' : 'entrar', usuario: user, senha: pw, chave: $('#inst-key').value }) });
    j = await r.json();
  } catch {
    setSubmitLabel(label);
    return (authErr.textContent = 'Sem conexão com o servidor. Tente de novo.');
  }
  setSubmitLabel(label);
  if (!r.ok) { authErr.textContent = j.error || 'Não foi possível entrar.'; shake($('#auth-form')); return; }
  localStorage.setItem(SYNC_KEY_STORE, j.chave);
  serverAuth.configurado = true;
  await setCredentials(user, pw); // guarda a sessão deste aparelho; quem decide o acesso é o servidor
  startSync();
  await syncFromServer();
  orders = loadOrders();
  enterApp(true);
}

/* =====================================================================
   BOOT
   ===================================================================== */
(async () => {
  await probeServer();
  if (!window.crypto?.subtle) {
    $('#auth-hint').textContent = 'Abra o painel por um endereço seguro (https) para usar o login.';
    $('#auth-submit').disabled = true;
  } else if (sessionStorage.getItem(SESSION_KEY) === '1' && readAuth()) enterApp();
  else showAuth();
})();
