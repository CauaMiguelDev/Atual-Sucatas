const $ = (s, r = document) => r.querySelector(s);

/* =====================================================================
   ADMIN AREA: figures from the panel, only for the site's administrator (not the store).
   Access is a password whose PBKDF2 hash is written below as 'salt:hash'. Safe in a public repo: it does not
   reveal the password. While it is empty, this page only creates the key and lets nobody in.
   ponytail: client-side gate, like the panel login; real protection and data from every device come with the server.
   ===================================================================== */
const ADMIN_KEY = '';
const SESSION_KEY = 'atual_admin_sessao';
const LOCK_KEY = 'atual_admin_bloqueio';
const MAX_TRIES = 5, LOCK_MS = 10 * 60 * 1000, IDLE_MS = 30 * 60 * 1000;
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));

async function derive(secret, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(saltHex), iterations: 210000, hash: 'SHA-256' }, key, 256));
}
const [KEY_SALT, KEY_HASH] = ADMIN_KEY.split(':');
const setup = !KEY_HASH;

const authErr = $('#auth-error');
const toast = msg => {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('is-on'), 3200);
};
const setSubmit = text => { $('#auth-submit .btn__label').dataset.text = text; $('#auth-submit .btn__label > span').textContent = text; };

/* 5 wrong passwords lock the form for 10 minutes; survives reloads, cleared on a correct login */
const readLock = () => { try { return { fails: 0, until: 0, ...JSON.parse(localStorage.getItem(LOCK_KEY)) }; } catch { return { fails: 0, until: 0 }; } };
let lockTimer;
function applyLock() {
  clearInterval(lockTimer);
  const tick = () => {
    const left = readLock().until - Date.now();
    $('#pw').disabled = $('#auth-submit').disabled = left > 0;
    if (left > 0) {
      const s = Math.ceil(left / 1000);
      authErr.textContent = `Muitas tentativas erradas. Acesso bloqueado por ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.`;
    } else {
      clearInterval(lockTimer);
      if (authErr.textContent.startsWith('Muitas')) authErr.textContent = 'Você já pode tentar de novo.';
    }
  };
  tick();
  if (readLock().until > Date.now()) lockTimer = setInterval(tick, 1000);
}
function registerFail() {
  const st = readLock();
  st.fails += 1;
  if (st.fails >= MAX_TRIES) { st.fails = 0; st.until = Date.now() + LOCK_MS; }
  localStorage.setItem(LOCK_KEY, JSON.stringify(st));
  if (st.until > Date.now()) return applyLock();
  const left = MAX_TRIES - st.fails;
  authErr.textContent = `Senha incorreta. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`} antes do bloqueio.`;
}

function showAuth(msg = '') {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  if (setup) {
    $('#auth-title').textContent = 'Criar acesso do administrador';
    $('#auth-hint').textContent = 'Escolha a senha do administrador, com pelo menos 8 caracteres. O painel gera uma chave para colocar no código.';
    $('#pw2-wrap').hidden = false;
    $('#pw2').required = true;
    $('#pw').autocomplete = 'new-password';
    setSubmit('Gerar chave');
  } else applyLock();
  if (msg) authErr.textContent = msg;
  $('#pw').value = $('#pw2').value = '';
  setTimeout(() => $('#pw').focus(), 50);
}
function enterApp() {
  localStorage.removeItem(LOCK_KEY);
  sessionStorage.setItem(SESSION_KEY, '1');
  $('#auth').hidden = true;
  $('#app').hidden = false;
  render();
  armIdle();
}
function logout(msg) {
  sessionStorage.removeItem(SESSION_KEY);
  showAuth(msg);
}

$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#pw').value;
  if (setup) {
    if (pw.length < 8) return (authErr.textContent = 'A senha precisa ter pelo menos 8 caracteres.');
    if (pw !== $('#pw2').value) return (authErr.textContent = 'As duas senhas não são iguais.');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    $('#key-out').textContent = `${salt}:${await derive(pw, salt)}`;
    $('#key-box').hidden = false;
    $('#auth-submit').hidden = true;
    document.querySelectorAll('#auth-form .field').forEach(f => (f.hidden = true));
    authErr.textContent = '';
    $('#pw').value = $('#pw2').value = '';
    return;
  }
  if (readLock().until > Date.now()) return applyLock();
  if ((await derive(pw, KEY_SALT)) !== KEY_HASH) { registerFail(); $('#pw').select(); return; }
  enterApp();
});
$('#key-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#key-out').textContent); toast('Chave copiada.'); }
  catch { toast('Não foi possível copiar. Selecione a chave e copie.'); }
});
$('[data-eye]').addEventListener('click', e => {
  const show = $('#pw').type === 'password';
  $('#pw').type = show ? 'text' : 'password';
  e.currentTarget.innerHTML = `<i class="ph ${show ? 'ph-eye-slash' : 'ph-eye'}"></i>`;
});
$('#logout').addEventListener('click', () => logout());

let idleTimer;
function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => logout('Sessão encerrada por inatividade.'), IDLE_MS);
}
['pointerdown', 'keydown'].forEach(t => addEventListener(t, () => { if (!$('#app').hidden) armIdle(); }, { passive: true }));

/* =====================================================================
   FIGURES (same orders the panel saves)
   ===================================================================== */
const monthKey = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = key => { const [y, m] = key.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
const kpi = (icon, label, value, sub = '', red = false) =>
  `<div class="kpi ${red ? 'kpi--red' : ''}"><span><i class="ph ${icon}"></i>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;

function render() {
  const orders = loadOrders();
  const LAST = ORDER_STATUS.length - 1;
  const now = monthKey(new Date().toISOString());
  const thisMonth = iso => !!iso && monthKey(iso) === now;
  const nfs = orders.filter(o => o.nf);
  const sent = nfs.filter(o => o.nf.enviadaEm);
  const msgs = orders.flatMap(o => o.msgs || []);
  const byTpl = t => msgs.filter(m => m.tpl === t);
  const monthCount = list => `${list.length} este mês`;
  const total = orders.reduce((t, o) => t + orderTotal(o), 0);

  $('#k-nf').innerHTML =
    kpi('ph-receipt', 'Notas geradas', nfs.length, monthCount(nfs.filter(o => thisMonth(o.nf.emitidaEm))), true)
    + kpi('ph-paper-plane-tilt', 'Enviadas ao cliente', sent.length, monthCount(sent.filter(o => thisMonth(o.nf.enviadaEm))))
    + kpi('ph-clock', 'Aguardando envio', nfs.length - sent.length, 'geradas e ainda não enviadas')
    + kpi('ph-file-dashed', 'Pedidos sem nota', orders.length - nfs.length, 'nota ainda não gerada');
  $('#k-msg').innerHTML =
    kpi('ph-check-circle', 'Confirmações de pedido', byTpl('criado').length, monthCount(byTpl('criado').filter(m => thisMonth(m.data))))
    + kpi('ph-truck', 'Avisos de entrega', byTpl('status').length, monthCount(byTpl('status').filter(m => thisMonth(m.data))))
    + kpi('ph-receipt', 'Mensagens de nota fiscal', byTpl('nota').length, 'conta também os reenvios')
    + kpi('ph-whatsapp-logo', 'Total de mensagens', msgs.length, monthCount(msgs.filter(m => thisMonth(m.data))));
  $('#k-ped').innerHTML =
    kpi('ph-package', 'Pedidos', orders.length, monthCount(orders.filter(o => thisMonth(o.data))))
    + kpi('ph-hourglass-medium', 'Em andamento', orders.filter(o => o.status < LAST).length)
    + kpi('ph-flag-checkered', 'Entregues', orders.filter(o => o.status === LAST).length)
    + kpi('ph-currency-circle-dollar', 'Valor total', brl(total), orders.length ? `ticket médio ${brl(total / orders.length)}` : '');

  const months = [...Array(6)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return monthKey(d.toISOString()); });
  $('#months').innerHTML = months.map(k => {
    const ped = orders.filter(o => monthKey(o.data) === k);
    return `<tr><td><strong>${monthLabel(k)}</strong></td>
      <td>${nfs.filter(o => monthKey(o.nf.emitidaEm) === k).length}</td>
      <td>${sent.filter(o => monthKey(o.nf.enviadaEm) === k).length}</td>
      <td>${ped.length}</td>
      <td>${brl(ped.reduce((t, o) => t + orderTotal(o), 0))}</td></tr>`;
  }).join('');

  const recent = [...nfs].sort((a, b) => b.nf.emitidaEm.localeCompare(a.nf.emitidaEm)).slice(0, 10);
  $('#recent').innerHTML = recent.map(o => `<tr>
    <td><span class="o-code">Nº ${o.nf.numero}</span><span class="o-sub">Série ${o.nf.serie}</span></td>
    <td><span class="o-code o-code--sm">${esc(o.codigo)}</span></td>
    <td>${esc(o.cliente.nome)}<span class="o-sub">${esc(o.cliente.cidade)}</span></td>
    <td>${fmtDate(o.nf.emitidaEm)}</td>
    <td>${o.nf.enviadaEm ? `<span class="pill pill--ok">Enviada ${fmtDate(o.nf.enviadaEm)}</span>` : '<span class="pill pill--muted">Não enviada</span>'}</td>
    <td><strong>${brl(orderTotal(o))}</strong></td></tr>`).join('');
  $('#recent-empty').hidden = recent.length > 0;
  $('#updated').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
// changes saved by the panel in another tab show up here without reloading
addEventListener('storage', e => { if (e.key === ORDERS_KEY && !$('#app').hidden) render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) render(); });

/* =====================================================================
   BOOT
   ===================================================================== */
if (!window.crypto?.subtle) {
  authErr.textContent = 'Abra esta página por um endereço seguro (https).';
  $('#auth-submit').disabled = true;
} else if (!setup && sessionStorage.getItem(SESSION_KEY) === '1') enterApp();
else showAuth();
