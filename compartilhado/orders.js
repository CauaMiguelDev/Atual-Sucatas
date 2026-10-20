// Shared order store for the site (tracking) and the store panel.
// ponytail: localStorage only, so data lives in one browser. Swap load/save for an API when the real backend exists.
const ORDER_STATUS = ['Pedido confirmado', 'Peça separada', 'Enviado', 'Em trânsito', 'Entregue'];
const ORDERS_KEY = 'atual_pedidos_v2';
const STORE_WHATS = '5549991041665';

// Example data for the demo. Customer WhatsApp = the store's own number, so test messages go to the owner.
const ORDERS_SEED = [
  {
    codigo: 'AS-1021', data: '2026-10-02T14:10:00',
    cliente: { nome: 'Rodrigo Bortolini', whatsapp: STORE_WHATS, doc: '000.000.000-00', cidade: 'Chapecó - SC' },
    itens: [{ desc: 'Farol esquerdo Hyundai i30 2014', qtd: 1, valor: 480 }],
    frete: 0, status: 4,
    historico: [
      { status: 0, data: '2026-10-02T14:10:00' }, { status: 1, data: '2026-10-02T16:40:00' },
      { status: 2, data: '2026-10-03T09:00:00' }, { status: 3, data: '2026-10-03T09:30:00' },
      { status: 4, data: '2026-10-03T15:20:00' },
    ],
    rastreio: { transportadora: 'Retirada na loja', codigo: '' },
    nf: { numero: 1187, serie: 1, emitidaEm: '2026-10-02T16:45:00', enviadaEm: '2026-10-02T16:50:00' },
  },
  {
    codigo: 'AS-1022', data: '2026-10-12T10:05:00',
    cliente: { nome: 'Juliana Kessler', whatsapp: STORE_WHATS, doc: '000.000.000-00', cidade: 'Curitiba - PR' },
    itens: [{ desc: 'Frente completa Golf GTI 7.5', qtd: 1, valor: 6900 }],
    frete: 380, status: 3, previsao: '2026-10-21',
    historico: [
      { status: 0, data: '2026-10-12T10:05:00' }, { status: 1, data: '2026-10-12T15:00:00' },
      { status: 2, data: '2026-10-13T08:30:00' }, { status: 3, data: '2026-10-14T11:00:00' },
    ],
    rastreio: { transportadora: 'Transportadora', codigo: 'EX123456789BR' },
    nf: { numero: 1192, serie: 1, emitidaEm: '2026-10-13T08:10:00', enviadaEm: null },
  },
  {
    codigo: 'AS-1023', data: '2026-10-16T09:20:00',
    cliente: { nome: 'Anderson Wolff', whatsapp: STORE_WHATS, doc: '00.000.000/0001-00', cidade: 'Porto Alegre - RS' },
    itens: [{ desc: 'Engate VW Jetta 2015', qtd: 1, valor: 650 }, { desc: 'Chicote do engate', qtd: 1, valor: 90 }],
    frete: 120, status: 1, previsao: '2026-10-24',
    historico: [{ status: 0, data: '2026-10-16T09:20:00' }, { status: 1, data: '2026-10-16T14:00:00' }],
    rastreio: { transportadora: '', codigo: '' },
    nf: null,
  },
  {
    codigo: 'AS-1024', data: '2026-10-19T10:20:00',
    cliente: { nome: 'Pablo Henrique Martins', whatsapp: STORE_WHATS, doc: '000.000.000-00', cidade: 'Florianópolis - SC', endereco: 'Rua das Palmeiras, 230', bairro: 'Trindade', cep: '88036-000' },
    itens: [
      { desc: 'Farol esquerdo Hyundai i30 2014', qtd: 1, valor: 480 },
      { desc: 'Lanterna traseira direita Hyundai i30 2014', qtd: 1, valor: 320 },
      { desc: 'Retrovisor elétrico esquerdo Hyundai i30 2014', qtd: 1, valor: 290 },
    ],
    frete: 95, status: 2, previsao: '2026-10-23',
    historico: [{ status: 0, data: '2026-10-19T10:20:00' }, { status: 1, data: '2026-10-19T14:05:00' }, { status: 2, data: '2026-10-19T16:30:00' }],
    rastreio: { transportadora: 'Correios', codigo: 'QB123456789BR' },
    nf: { numero: 1194, serie: 1, emitidaEm: '2026-10-19T15:10:00', enviadaEm: null },
  },
];

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
