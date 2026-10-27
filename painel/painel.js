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
  if (v === 'config') { showAdminLock(); $('#site-url').value = siteUrl(); $('#store-cnpj').value = storeCnpj(); $('#cfg-user').textContent = readAuth()?.user || ''; }
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
    const next = nextStep(o);
    return `<tr data-code="${esc(o.codigo)}" style="animation-delay:${i * 35}ms">
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
  openDrawer(orders.find(x => x.codigo === tr.dataset.code), 'nota');
  if (tr.dataset.act === 'pdf') openPdfPreview('nf');
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
/* administrator entry: correct password opens admin.html (check, lock and session in admin-acesso.js) */
let adminTimer;
function showAdminLock() {
  clearInterval(adminTimer);
  const tick = () => {
    const locked = ADMIN.lockedFor() > 0;
    $('#admin-pw').disabled = $('#admin-submit').disabled = locked;
    if (locked) $('#admin-error').textContent = ADMIN.message();
    else { clearInterval(adminTimer); if ($('#admin-error').textContent.startsWith('Muitas')) $('#admin-error').textContent = ''; }
  };
  tick();
  if (ADMIN.lockedFor()) adminTimer = setInterval(tick, 1000);
}
$('#admin-form').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await ADMIN.check($('#admin-pw').value);
  $('#admin-pw').value = '';
  if (r.ok) return void (location.href = 'admin.html');
  $('#admin-error').textContent = ADMIN.message(r);
  if (r.locked) showAdminLock();
});
$('#reset-demo').addEventListener('click', () => {
  const n = loadOrders().length;
  if (!n) return toast('O painel já está vazio.');
  if (!confirm(`Apagar TODOS os ${n} pedido(s) deste navegador? Isso não pode ser desfeito.`)) return;
  localStorage.removeItem(ORDERS_KEY);
  orders = loadOrders();
  renderAll();
  toast('Painel limpo. Todos os pedidos foram apagados.');
});
/* delete a single order from the drawer */
$('#d-delete').addEventListener('click', () => {
  if (isNew || !current) return;
  if (!confirm(`Apagar o pedido ${current.codigo} de ${current.cliente.nome || 'sem nome'}? Isso não pode ser desfeito.`)) return;
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
  if (!confirm(`Apagar as ${n} nota(s) fiscal(is) de todos os pedidos? Os pedidos continuam e voltam para "a emitir". Isso não pode ser desfeito.`)) return;
  orders.forEach(o => { o.nf = null; o.msgs = (o.msgs || []).filter(m => m.tpl !== 'nota'); });
  saveOrders(orders);
  if (drawer.open && current && !isNew) {
    const f = orders.find(o => o.codigo === current.codigo);
    if (f) { current.nf = null; current.msgs = f.msgs; nfStep = 0; nfChecked = false; renderHead(); renderNext(); renderNotes(); renderMsg(); }
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
}
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
form.doc.addEventListener('input', e => { e.target.value = maskDoc(e.target.value); });

const maskCep = v => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
let lastCep = '';
async function lookupCep() {
  const d = form.cep.value.replace(/\D/g, '');
  if (d.length !== 8 || d === lastCep) return;
  lastCep = d;
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
    if (j.erro) { toast('CEP não encontrado. Confira o número.'); return; }
    if (j.logradouro && !form.endereco.value.trim()) form.endereco.value = j.logradouro;
    if (j.bairro && !form.bairro.value.trim()) form.bairro.value = j.bairro;
    if (j.localidade && j.uf) form.cidade.value = `${j.localidade} - ${j.uf}`;
    renderTrackChip(); renderNext();
    toast(j.logradouro ? 'Endereço preenchido pelo CEP. Falta o número.' : 'Cidade preenchida pelo CEP.');
    if (form.endereco.value.trim() && !/\d/.test(form.endereco.value)) {
      form.endereco.focus();
      form.endereco.setSelectionRange(form.endereco.value.length, form.endereco.value.length);
    }
  } catch { toast('Não foi possível consultar o CEP agora. Preencha o endereço na mão.'); }
}
form.cep.addEventListener('input', e => { e.target.value = maskCep(e.target.value); lookupCep(); });
form.cep.addEventListener('blur', lookupCep);
function updateTotal() { readForm(); $('#d-total').textContent = brl(orderTotal(current)); }

function fillForm() {
  const c = current.cliente;
  form.nome.value = c.nome; form.whatsapp.value = c.whatsapp; form.doc.value = c.doc; form.cidade.value = c.cidade;
  form.endereco.value = c.endereco || ''; form.bairro.value = c.bairro || ''; form.cep.value = c.cep || '';
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
    endereco: form.endereco.value.trim(), bairro: form.bairro.value.trim(), cep: form.cep.value.trim(),
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
    const next = Math.max(1000, ...orders.map(o => +o.codigo.replace(/\D/g, '') || 0)) + 1;
    const now = new Date().toISOString();
    current = {
      codigo: `AS-${next}`, data: now, cliente: { nome: '', whatsapp: '', doc: '', cidade: '', endereco: '', bairro: '', cep: '' },
      itens: [{ desc: '', qtd: 1, valor: 0 }], frete: 0, pagamento: '', obs: '', status: 0, previsao: '',
      historico: [{ status: 0, data: now }], rastreio: { transportadora: '', codigo: '' }, nf: null, msgs: [],
    };
  } else current = structuredClone(order);
  current.msgs ||= [];
  nfStep = current.nf ? 3 : 0; nfChecked = !!current.nf;
  $('#d-delete').hidden = isNew;
  fillForm(); renderHead(); renderHistory(); updateTotal(); renderNext();
  setTpl('criado');
  setTab(tab);
  drawer.showModal();
}
$('#new-order').addEventListener('click', () => openDrawer(null));

function commit() {
  readForm();
  orders = loadOrders(); // start from what is saved, so another tab's changes are never overwritten
  const prev = orders.find(o => o.codigo === current.codigo);
  if (prev && prev.status !== current.status) current.historico.push({ status: current.status, data: new Date().toISOString() });
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

/* Invoice wizard: 1 check customer, 2 check parts and values, 3 generate and review the PDF, 4 send it. */
const NF_STEPS = ['Cliente', 'Peças e valores', 'Gerar e conferir', 'Enviar'];
let nfStep = 0, nfChecked = false;
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
  const o = current;
  const { cliente, badItems, okC, okP } = nfChecks(o);
  const reach = [true, okC, okC && okP, okC && okP && !!o.nf && nfChecked];
  if (!reach[nfStep]) nfStep = reach.lastIndexOf(true);
  const done = [okC, okC && okP, reach[3], reach[3] && !!o.nf.enviadaEm];
  const head = `<ol class="wiz__steps">${NF_STEPS.map((s, i) => `<li><button type="button" data-step="${i}" class="${i === nfStep ? 'is-current' : ''} ${done[i] ? 'is-done' : ''}" ${reach[i] ? '' : 'disabled'}>
    <span>${done[i] && i !== nfStep ? '<i class="ph ph-check"></i>' : i + 1}</span>${s}</button></li>`).join('')}</ol>`;
  const kicker = `<p class="wiz__kicker">Passo ${nfStep + 1} de 4</p>`;
  const back = nfStep ? btnHtml('Voltar', 'ph-arrow-left', 'btn--line', 'data-wiz="back"') : '';
  let body;

  if (nfStep === 0) body = `${kicker}<h4>Confira os dados do cliente</h4>
    <p class="wiz__hint">A nota sai no nome de quem comprou. Todos estes campos são obrigatórios na nota fiscal, então confira se estão certos.</p>
    <ul class="check">${cliente.map(([l, v]) => checkRow(l, v)).join('')}</ul>
    <div class="wiz__actions">
      ${okC ? '' : btnHtml('Preencher na aba Cliente', 'ph-pencil-simple', 'btn--line', 'data-wiz="fix-cliente"')}
      ${btnHtml('Próximo: peças e valores', 'ph-arrow-right', 'btn--primary', `data-wiz="next" ${okC ? '' : 'disabled'}`)}
    </div>`;

  if (nfStep === 1) body = `${kicker}<h4>Confira as peças e os valores</h4>
    <p class="wiz__hint">Cada peça vira uma linha da nota. Confira a descrição (peça, modelo e ano), a quantidade, o valor e a forma de pagamento.</p>
    <table class="wiz__items"><tbody>
      ${o.itens.map(i => `<tr><td>${i.qtd}x ${esc(i.desc) || '<em>Sem descrição</em>'}</td><td class="r">${i.valor > 0 ? brl(i.qtd * i.valor) : '<em>Sem valor</em>'}</td></tr>`).join('')}
      <tr class="sum"><td>Frete</td><td class="r">${brl(o.frete)}</td></tr>
      <tr class="total"><td>Total da nota</td><td class="r">${brl(orderTotal(o))}</td></tr>
    </tbody></table>
    <ul class="check">
      ${checkRow('Pagamento', o.pagamento, 'Falta escolher')}
      ${badItems ? checkRow('Peças', '', `${badItems} peça(s) sem descrição ou valor`) : checkRow('Peças', `${o.itens.length} peça(s) conferida(s)`)}
    </ul>
    <div class="wiz__actions">${back}
      ${okP ? '' : btnHtml('Corrigir na aba Peças', 'ph-pencil-simple', 'btn--line', 'data-wiz="fix-pecas"')}
      ${btnHtml('Próximo: gerar a nota', 'ph-arrow-right', 'btn--primary', `data-wiz="next" ${okP ? '' : 'disabled'}`)}
    </div>`;

  if (nfStep === 2) body = !o.nf
    ? `${kicker}<h4>Gere a nota e confira o PDF</h4>
      <p class="wiz__hint">O painel monta a nota no modelo DANFE com os dados conferidos e abre o PDF na tela. Leia com calma: nome, CPF/CNPJ, endereço, peças e valores.</p>
      <p class="wiz__note"><i class="ph ph-info"></i>Prévia sem valor fiscal. A nota oficial, com chave de acesso e protocolo da SEFAZ, sai pelo emissor fiscal da loja quando a integração for aprovada.</p>
      <div class="wiz__actions">${back}${btnHtml('Gerar nota fiscal', 'ph-file-plus', 'btn--primary', 'data-wiz="gerar"')}</div>`
    : `${kicker}<h4>Confira o PDF da nota</h4>
      <div class="nf-box__state"><i class="ph ph-seal-check"></i><div><strong>Nota nº ${o.nf.numero}, série ${o.nf.serie}</strong><small>Gerada em ${fmtDate(o.nf.emitidaEm)}. Se mudou algum dado do pedido, gere de novo: o número continua o mesmo.</small></div></div>
      <div class="wiz__actions">${btnHtml('Abrir PDF', 'ph-file-pdf', 'btn--line', 'data-wiz="ver"')}${btnHtml('Gerar de novo com os dados atuais', 'ph-arrows-clockwise', 'btn--line', 'data-wiz="gerar"')}</div>
      <label class="wiz__confirm"><input type="checkbox" id="nf-ok" ${nfChecked ? 'checked' : ''}> Conferi o PDF e está tudo certo</label>
      <div class="wiz__actions">${back}${btnHtml('Próximo: enviar ao cliente', 'ph-arrow-right', 'btn--primary', `data-wiz="next" ${nfChecked ? '' : 'disabled'}`)}</div>`;

  if (nfStep === 3) {
    const file = pdfName(o, 'nf');
    body = o.nf?.enviadaEm
      ? `${kicker}<h4>Nota enviada</h4>
        <div class="nf-box__state is-ok"><i class="ph ph-check-circle"></i><div><strong>O cliente recebeu a nota nº ${o.nf.numero}</strong><small>Enviada em ${fmtDate(o.nf.enviadaEm)}. Se ele pedir de novo, reenvie ou baixe o PDF.</small></div></div>
        <div class="wiz__actions">${back}${btnHtml('Reenviar no WhatsApp', 'ph-whatsapp-logo', 'btn--whats', 'data-wiz="enviar"')}${btnHtml('Baixar PDF', 'ph-download-simple', 'btn--line', 'data-wiz="pdf"')}</div>`
      : `${kicker}<h4>Envie a nota para o cliente</h4>
        <p class="wiz__hint">A mensagem já vai pronta, com número da nota, peças, valores e o link de rastreio.</p>
        <ol class="wiz__how">${(CAN_ATTACH
          ? ['Toque em <b>Enviar com a nota fiscal</b>.', 'Escolha o <b>WhatsApp</b> e a conversa do cliente.', 'O PDF e a mensagem vão juntos. Confira e envie.']
          : [`Clique em <b>Enviar no WhatsApp</b>. A conversa do cliente abre ${IS_MOBILE ? 'no WhatsApp' : 'no WhatsApp Web'} com a mensagem pronta.`, 'Confira e envie. O painel marca a nota como enviada.']
        ).map(t => `<li><span>${t}</span></li>`).join('')}</ol>
        ${CAN_ATTACH ? '' : `<p class="wiz__note"><i class="ph ph-paperclip"></i><span>Nada é baixado. Mandar o PDF junto é opcional: clique em <b>Baixar PDF</b> e anexe o arquivo <b>${esc(file)}</b> pelo clipe do WhatsApp.</span></p>`}
        <div class="wiz__actions">${back}${CAN_ATTACH ? btnHtml('Enviar com a nota fiscal', 'ph-paperclip', 'btn--whats', 'data-wiz="enviar"') : btnHtml('Enviar no WhatsApp', 'ph-whatsapp-logo', 'btn--whats', 'data-wiz="enviar"')}${btnHtml('Ver a mensagem', 'ph-chat-text', 'btn--line', 'data-wiz="msg"')}${CAN_ATTACH ? '' : btnHtml('Baixar PDF', 'ph-download-simple', 'btn--line', 'data-wiz="pdf"')}</div>`;
    if (CAN_ATTACH) getPdf(o, 'nf').catch(() => {}); // ready before the click, so the phone share keeps the user gesture
  }
  $('#nf-wiz').innerHTML = `${head}<div class="wiz__panel">${body}</div>`;
}

function issueNf() {
  const again = !!current.nf;
  orders = loadOrders(); // next number from what is saved, also when another tab issued one
  const number = current.nf?.numero ?? Math.max(1192, ...orders.map(o => o.nf?.numero || 0)) + 1;
  current.nf = { numero: number, serie: 1, emitidaEm: new Date().toISOString(), enviadaEm: current.nf?.enviadaEm || null };
  commit();
  toast(again ? `Nota nº ${number} gerada de novo com os dados atuais.` : `Nota nº ${number} gerada. Confira o PDF.`);
}
$('#nf-wiz').addEventListener('click', async e => {
  const step = e.target.closest('[data-step]');
  if (step) { nfStep = +step.dataset.step; return renderWizard(); }
  const b = e.target.closest('[data-wiz]');
  if (!b) return;
  const a = b.dataset.wiz;
  if (a === 'next' || a === 'back') { nfStep += a === 'next' ? 1 : -1; renderWizard(); }
  if (a === 'fix-cliente') {
    setTab('cliente');
    const empty = ['nome', 'doc', 'endereco', 'bairro', 'cep', 'cidade'].find(n => !form[n].value.trim());
    if (empty) form[empty].focus();
    toast('Preencha os campos e volte para a aba Notas.');
  }
  if (a === 'fix-pecas') { setTab('pecas'); toast('Corrija as peças e a forma de pagamento e volte para a aba Notas.'); }
  if (a === 'gerar') {
    if (!valid()) return;
    issueNf(); nfChecked = false; renderNotes();
    openPdfPreview('nf');
  }
  if (a === 'ver') openPdfPreview('nf');
  if (a === 'pdf') { try { downloadFile(await getPdf(current, 'nf')); } catch { toast('Não foi possível gerar o PDF da nota.'); } }
  if (a === 'msg') { setTab('msg'); setTpl('nota'); }
  if (a === 'enviar') CAN_ATTACH ? await sendWithPdf('nota') : sendText('nota');
});
$('#nf-wiz').addEventListener('change', e => {
  if (e.target.id !== 'nf-ok') return;
  nfChecked = e.target.checked;
  renderWizard();
});

/* =====================================================================
   WHATSAPP MESSAGES
   Emojis are written as code points so no editor or encoding can break them.
   api.whatsapp.com/send keeps 4-byte emojis intact; wa.me redirects sometimes turn them into "�".
   ===================================================================== */
const E = {
  ok: '✅', box: '\u{1F4E6}', memo: '\u{1F4DD}', pin: '\u{1F4CD}', cal: '\u{1F4C5}', link: '\u{1F517}',
  truck: '\u{1F69A}', wrench: '\u{1F527}', money: '\u{1F4B0}', receipt: '\u{1F9FE}', clip: '\u{1F4CE}',
  search: '\u{1F50E}', hands: '\u{1F91D}', card: '\u{1F4B3}', point: '\u{1F449}', wait: '⬜',
  shield: '\u{1F6E1}️', store: '\u{1F3EA}', chat: '\u{1F4AC}',
};
const SIGN = `*Atual Sucatas*\nPeças originais com garantia e nota fiscal\n${E.pin} Chapecó - SC | Enviamos para todo o Brasil`;
const tidy = lines => lines.filter(l => l !== null && l !== undefined)
  .filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
const firstName = n => String(n || '').trim().split(/\s+/)[0];
const pieces = o => o.itens.map(i => (i.qtd > 1 ? `${i.qtd}x ${i.desc}` : i.desc)).join(', ');
const isPickup = o => /retirada/i.test(o.rastreio?.transportadora || '');
const partsTotal = o => o.itens.reduce((t, i) => t + i.qtd * i.valor, 0);
const itemLines = o => o.itens.map(i => `• ${i.qtd}x ${i.desc} | ${brl(i.qtd * i.valor)}`);
const valueLines = o => [
  `${E.money} *Valores*`,
  `Peças: ${brl(partsTotal(o))}`,
  Number(o.frete) > 0 ? `Frete: ${brl(o.frete)}` : isPickup(o) ? 'Frete: retirada na loja' : null,
  `*Total: ${brl(orderTotal(o))}*`,
  o.pagamento ? `${E.card} Pagamento: ${o.pagamento}` : null,
];
// order progress as a checklist: done, now, still to come
const progressLines = o => ORDER_STATUS.map((s, i) =>
  i < o.status || (i === o.status && i === LAST) ? `${E.ok} ${s}` : i === o.status ? `${E.point} *${s}*` : `${E.wait} ${s}`);

const STATUS_LINE = [
  `Seu pedido foi confirmado ${E.ok}`,
  `Sua peça já foi separada e conferida ${E.wrench}`,
  `Seu pedido foi enviado ${E.truck}`,
  `Seu pedido está a caminho ${E.truck}`,
  `Seu pedido foi entregue ${E.ok}`,
];
// attach = the message goes out together with the PDF
const TEMPLATES = {
  criado: (o, kind) => tidy([
    `Olá, *${(o.cliente.nome || '').toUpperCase()}*! Seu pedido foi criado com sucesso ${E.ok}`,
    '',
    `${E.box} Código de rastreio: *${o.rastreio?.codigo || o.codigo}*`,
    `${E.memo} Situação: ${ORDER_STATUS[o.status]}`,
    isPickup(o) ? `${E.store} Retirada na loja, em Chapecó - SC` : `${E.pin} Destino: ${o.cliente.cidade}`,
    o.previsao ? `${E.cal} Previsão de entrega: ${fmtDay(o.previsao)}` : null,
    kind === 'nf' ? `${E.receipt} Nota fiscal nº *${o.nf.numero}* em anexo.`
      : kind === 'pedido' ? `${E.clip} Resumo do pedido em anexo (PDF).` : null,
    '',
    `${E.link} *Acompanhe seu pedido em tempo real:*`,
    trackLink(o),
    '',
    'Você receberá novas atualizações por aqui.',
    '',
    SIGN,
  ]),
  status: o => tidy([
    `Olá, *${firstName(o.cliente.nome)}*! ${STATUS_LINE[o.status]}`,
    '',
    `${E.box} *Pedido ${o.codigo}*`,
    ...progressLines(o),
    '',
    o.rastreio?.transportadora && !isPickup(o) ? `${E.truck} Transportadora: ${o.rastreio.transportadora}` : null,
    o.rastreio?.codigo ? `${E.search} Código de rastreio: *${o.rastreio.codigo}*` : null,
    o.previsao && o.status < LAST ? `${E.cal} Previsão de entrega: *${fmtDay(o.previsao)}*` : null,
    isPickup(o) ? `${E.store} Retirada na loja, em Chapecó` : `${E.pin} Destino: ${o.cliente.cidade}`,
    `${E.wrench} Peças: ${pieces(o)}`,
    '',
    `${E.link} *Acompanhe em tempo real:*`,
    trackLink(o),
    '',
    o.status === LAST ? `Obrigado pela confiança! ${E.hands} Precisando de outra peça, é só chamar.` : `${E.chat} Qualquer dúvida, é só responder esta mensagem.`,
    '',
    SIGN,
  ]),
  nota: (o, attach) => tidy([
    `Olá, *${firstName(o.cliente.nome)}*! A nota fiscal do seu pedido foi emitida ${E.receipt}`,
    '',
    `${E.box} Pedido: *${o.codigo}*`,
    `${E.receipt} Nota fiscal: nº *${o.nf?.numero}*, série ${o.nf?.serie}`,
    `${E.cal} Emissão: ${o.nf ? new Date(o.nf.emitidaEm).toLocaleDateString('pt-BR') : ''}`,
    `${E.memo} Em nome de: ${o.cliente.nome}`,
    '',
    `${E.wrench} *Peças na nota*`,
    ...itemLines(o),
    '',
    ...valueLines(o),
    attach ? '' : null,
    attach ? `${E.clip} Em anexo, o PDF da nota fiscal. Guarde este arquivo: ele é o comprovante da sua compra.` : null,
    '',
    `${E.link} *Acompanhe o pedido:*`,
    trackLink(o),
    '',
    `Obrigado pela compra! ${E.hands}`,
    '',
    SIGN,
  ]),
};
const TPL_NAMES = { criado: 'Confirmação do pedido', status: 'Atualização de entrega', nota: 'Nota fiscal' };
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
    ? `${kind === 'nf' ? 'Nota fiscal' : 'Nota do pedido'} baixada. Anexe o arquivo na conversa que abriu e envie.`
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
const pdfKey = (o, kind) => JSON.stringify([kind, o.codigo, o.data, o.nf, o.cliente, o.itens, o.frete, o.pagamento, o.obs, o.status, o.rastreio, o.previsao, o.historico, storeCnpj(), siteUrl()]);
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
  if (o.rastreio?.codigo) { font(9, true); doc.text(`Código de Rastreio: ${o.rastreio.codigo}`, L + 4, y); y += 14; }
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

  return doc.output('blob');
}

/* Order summary ("nota do pedido"): store header, customer, parts, totals, delivery and progress. Not a fiscal document.
   ponytail: single page, fits about 15 parts; add page breaks if orders ever get longer. */
async function buildOrderPdf(o) {
  if (!window.jspdf) throw new Error('jsPDF indisponível');
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const L = 40, R = 555, W = R - L;
  const ink = [22, 22, 26], gray = [112, 112, 120], body = [55, 55, 62], soft = [243, 243, 246], rule = [222, 222, 228], red = [200, 24, 30], dark = [26, 26, 30], white = [255, 255, 255];
  const font = (size, bold = false, color = ink) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  const money = n => brl(n).replace(/ /g, ' ');
  const cap = (text, x, y, align = 'left') => { font(7, true, gray); doc.text(text.toUpperCase(), x, y, { align }); };
  const c = o.cliente, t = o.rastreio || {};
  doc.setProperties({ title: `Nota do pedido ${o.codigo}`, author: 'Atual Comércio de Sucatas' });

  /* header: store | order code */
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', L, 34, 58, 58, 'logo', 'FAST');
  const hx = logo ? L + 70 : L;
  font(14, true); doc.text('Atual Comércio de Sucatas', hx, 54);
  font(8.4, false, gray);
  doc.text(['R. Horaide Prestes de Souza, 65 - Vila Real', 'Chapecó - SC, 89805-807', `WhatsApp (49) 9 9104-1665${storeCnpj() ? `  ·  CNPJ ${storeCnpj()}` : ''}`], hx, 68, { lineHeightFactor: 1.4 });
  cap('Nota do pedido', R, 48, 'right');
  font(24, true, red); doc.text(o.codigo, R, 74, { align: 'right' });
  font(8.4, false, gray); doc.text(`Pedido feito em ${new Date(o.data).toLocaleDateString('pt-BR')}`, R, 88, { align: 'right' });
  doc.setDrawColor(...red); doc.setLineWidth(2); doc.line(L, 106, R, 106);

  doc.setFillColor(...soft); doc.rect(L, 116, W, 22, 'F');
  font(8.2, false, body);
  doc.text('Resumo da compra para o cliente conferir. Documento não fiscal: a nota fiscal (NF-e) é enviada separadamente.', L + 10, 130);

  /* customer | order info */
  let y = 164;
  const x2 = L + W / 2 + 10;
  cap('Cliente', L, y); cap('Pedido', x2, y);
  y += 17;
  font(11, true); doc.text(doc.splitTextToSize(c.nome || '-', W / 2 - 10)[0], L, y);
  font(8.8, false, body);
  doc.text([c.doc ? `CPF/CNPJ: ${c.doc}` : '', c.whatsapp ? `WhatsApp: ${fmtPhone(c.whatsapp)}` : ''].filter(Boolean), L, y + 15, { lineHeightFactor: 1.5 });
  [['Situação', ORDER_STATUS[o.status]], ['Pagamento', o.pagamento || '-'], ['Nota fiscal', o.nf ? `nº ${o.nf.numero}, série ${o.nf.serie}` : 'enviada após a emissão']]
    .forEach(([k, v], i) => { font(8.8, false, gray); doc.text(`${k}:`, x2, y + i * 14); font(8.8, true); doc.text(v, x2 + 64, y + i * 14); });

  /* parts */
  y = 230;
  const col = { n: L + 10, d: L + 40, q: 372, u: 462, t: R - 10 };
  doc.setFillColor(...dark); doc.rect(L, y, W, 22, 'F');
  font(7.4, true, white);
  doc.text('ITEM', col.n, y + 14); doc.text('DESCRIÇÃO DA PEÇA', col.d, y + 14);
  doc.text('QTD', col.q, y + 14, { align: 'center' }); doc.text('VALOR UNIT.', col.u, y + 14, { align: 'right' }); doc.text('TOTAL', col.t, y + 14, { align: 'right' });
  y += 22;
  o.itens.forEach((it, k) => {
    font(9);
    const lines = doc.splitTextToSize(it.desc || '-', col.q - col.d - 30);
    const h = 12 + lines.length * 11;
    if (k % 2) { doc.setFillColor(...soft); doc.rect(L, y, W, h, 'F'); }
    font(9, false, gray); doc.text(String(k + 1).padStart(2, '0'), col.n, y + 15);
    font(9); doc.text(lines, col.d, y + 15, { lineHeightFactor: 1.22 });
    doc.text(String(it.qtd), col.q, y + 15, { align: 'center' });
    doc.text(money(it.valor), col.u, y + 15, { align: 'right' });
    font(9, true); doc.text(money(it.qtd * it.valor), col.t, y + 15, { align: 'right' });
    y += h;
  });
  doc.setDrawColor(...rule); doc.setLineWidth(.8); doc.line(L, y, R, y);

  /* delivery (left) + totals (right) */
  y += 20;
  const tw = 200, tx = R - tw;
  const row = (label, value, yy) => { font(9, false, gray); doc.text(label, tx + 12, yy); font(9, true); doc.text(value, R - 12, yy, { align: 'right' }); };
  doc.setFillColor(...soft); doc.rect(tx, y, tw, 46, 'F');
  row('Peças', money(partsTotal(o)), y + 18);
  row('Frete', Number(o.frete) > 0 ? money(o.frete) : isPickup(o) ? 'Retirada na loja' : money(0), y + 34);
  doc.setFillColor(...red); doc.rect(tx, y + 46, tw, 30, 'F');
  font(9, true, white); doc.text('TOTAL', tx + 12, y + 65);
  font(14, true, white); doc.text(money(orderTotal(o)), R - 12, y + 66, { align: 'right' });

  const dw = W - tw - 30;
  cap(isPickup(o) ? 'Retirada' : 'Entrega', L, y + 8);
  const dl = isPickup(o)
    ? ['Retirada na loja: R. Horaide Prestes de Souza, 65', 'Vila Real, Chapecó - SC', 'Seg a sex, 8h às 18h  ·  Sáb, 8h às 12h']
    : [c.endereco ? `${c.endereco}${c.bairro ? ` - ${c.bairro}` : ''}` : '', `${c.cidade}${c.cep ? `  ·  CEP ${c.cep}` : ''}`,
      t.transportadora ? `Envio por: ${t.transportadora}` : '', t.codigo ? `Código de rastreio: ${t.codigo}` : '',
      o.previsao ? `Previsão de entrega: ${fmtDay(o.previsao)}` : ''].filter(Boolean);
  font(9.2, false, body);
  doc.text(dl.flatMap(l => doc.splitTextToSize(l, dw)), L, y + 24, { lineHeightFactor: 1.5 });
  y += 104;

  /* progress */
  cap('Andamento do pedido', L, y);
  y += 26;
  const step = W / ORDER_STATUS.length;
  ORDER_STATUS.forEach((s, i) => {
    const cx = L + step * i + step / 2, done = i <= o.status;
    doc.setLineWidth(2);
    if (i) { doc.setDrawColor(...(done ? red : rule)); doc.line(cx - step + 9, y, cx - 9, y); }
    doc.setLineWidth(1.2);
    if (done) { doc.setFillColor(...red); doc.circle(cx, y, 6, 'F'); }
    else { doc.setDrawColor(...rule); doc.setFillColor(...white); doc.circle(cx, y, 6, 'FD'); }
    font(8, done, done ? ink : gray); doc.text(s, cx, y + 20, { align: 'center' });
    const h = o.historico?.find(x => x.status === i);
    if (h) { font(7, false, gray); doc.text(new Date(h.data).toLocaleDateString('pt-BR'), cx, y + 31, { align: 'center' }); }
  });
  y += 56;

  /* notes */
  if (o.obs) {
    cap('Observações', L, y);
    font(9.2, false, body);
    doc.text(doc.splitTextToSize(o.obs, W), L, y + 16, { lineHeightFactor: 1.4 });
  }

  /* footer */
  const fy = 758;
  doc.setDrawColor(...rule); doc.setLineWidth(.8); doc.line(L, fy, R, fy);
  font(8.6, true); doc.text('Acompanhe o pedido em tempo real:', L, fy + 18);
  font(8.6, false, red); doc.textWithLink(trackLink(o), L, fy + 31, { url: trackLink(o) });
  font(7.8, false, gray); doc.text(['Peças originais usadas, com garantia.', 'Enviamos para todo o Brasil.'], R, fy + 18, { align: 'right', lineHeightFactor: 1.5 });
  font(7, false, gray); doc.text('Atual Sucatas  ·  Desmanche credenciado pelo DETRAN-SC  ·  instagram.com/atual.sucatas2019', L, fy + 54);

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
