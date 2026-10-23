const $ = (s, r = document) => r.querySelector(s);

/* =====================================================================
   ADMIN AREA: figures from the panel, only for the site's administrator (not the store).
   Password check, lock and session live in admin-acesso.js (also used by Configurações in the panel).
   ===================================================================== */
const IDLE_MS = 30 * 60 * 1000;
const authErr = $('#auth-error');

let lockTimer;
function showLock() {
  clearInterval(lockTimer);
  const tick = () => {
    const locked = ADMIN.lockedFor() > 0;
    $('#pw').disabled = $('#auth-submit').disabled = locked;
    if (locked) authErr.textContent = ADMIN.message();
    else { clearInterval(lockTimer); if (authErr.textContent.startsWith('Muitas')) authErr.textContent = 'Você já pode tentar de novo.'; }
  };
  tick();
  if (ADMIN.lockedFor()) lockTimer = setInterval(tick, 1000);
}
function showAuth(msg = '') {
  $('#app').hidden = true;
  $('#auth').hidden = false;
  authErr.textContent = msg;
  $('#pw').value = '';
  showLock();
  setTimeout(() => $('#pw').focus(), 50);
}
function enterApp() {
  $('#auth').hidden = true;
  $('#app').hidden = false;
  render();
  armIdle();
}
function logout(msg) {
  ADMIN.logout();
  showAuth(msg);
}

$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await ADMIN.check($('#pw').value);
  if (r.ok) return enterApp();
  authErr.textContent = ADMIN.message(r);
  if (r.locked) showLock(); else $('#pw').select();
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
} else if (ADMIN.inSession()) enterApp();
else showAuth();
