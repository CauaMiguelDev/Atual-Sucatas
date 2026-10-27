// Shared order store for the site (tracking) and the store panel.
// ponytail: localStorage only, so data lives in one browser. Swap load/save for an API when the real backend exists.
const ORDER_STATUS = ['Pedido confirmado', 'Peça separada', 'Enviado', 'Em trânsito', 'Saiu para entrega', 'Entregue'];
const ORDERS_KEY = 'atual_pedidos_v2';
const STORE_WHATS = '5549991041665';

// No examples: the panel starts empty and real orders are created by the store (kept in each browser until the backend exists).
const ORDERS_SEED = [];

function loadOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDERS_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {}
  return structuredClone(ORDERS_SEED);
}
function saveOrders(list) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list)); } catch {}
}
const normCode = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
// customers may type the order code (AS-1024) or the carrier tracking code (QB123456789BR)
const findOrder = code => {
  const c = normCode(code);
  return c ? loadOrders().find(o => normCode(o.codigo) === c || normCode(o.rastreio?.codigo) === c) : undefined;
};
const orderTotal = o => o.itens.reduce((t, i) => t + i.qtd * i.valor, 0) + (Number(o.frete) || 0);
const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
