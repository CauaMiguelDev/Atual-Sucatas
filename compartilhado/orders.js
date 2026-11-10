// Store de pedidos do site (rastreio) e do painel da loja.
// localStorage é o cache local; a fonte compartilhada entre aparelhos é a API em PHP
// da pasta api/ (Hostinger) ou as Netlify Functions, quando o site roda no Netlify.
// Sem chave de sincronização configurada, funciona só neste navegador (como antes).
// Depende de sync-core.js (normCode, mapOf, computeOps), carregado antes.
const ORDER_STATUS = ['Pedido confirmado', 'Peça separada', 'Enviado', 'Em trânsito', 'Saiu para entrega', 'Entregue'];
const ORDERS_KEY = 'atual_pedidos_v2';
const STORE_WHATS = '5549991041665';
const ON_NETLIFY = /\.netlify\.app$/.test(location.hostname);
const syncUrl = name => ON_NETLIFY ? `/.netlify/functions/${name}` : `../api/${name}.php`; // site/ e painel/ ficam um nível abaixo da raiz
const SYNC_KEY_STORE = 'atual_sync_key';
const SYNC_QUEUE = 'atual_sync_fila';

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
  pushChanges(list);
}

const orderTotal = o => o.itens.reduce((t, i) => t + i.qtd * i.valor, 0) + (Number(o.frete) || 0);
const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ===================== Sincronização entre aparelhos ===================== */
const syncKey = () => { try { return localStorage.getItem(SYNC_KEY_STORE) || ''; } catch { return ''; } };
let _synced = mapOf(loadOrders()); // último estado que o servidor conhece

// conectado | enviando | sem-rede | local: o painel mostra isso o tempo todo
let syncState = syncKey() ? 'enviando' : 'local';
function setSyncState(s) {
  if (s === syncState) return;
  syncState = s;
  dispatchEvent(new Event('sync:state'));
}

async function syncApi(name, opts) {
  const headers = { ...(opts?.headers || {}) };
  const k = syncKey();
  if (k) headers['x-sync-key'] = k;
  const r = await fetch(syncUrl(name) + (opts?.query || ''), { ...opts, headers });
  if (!r.ok) throw new Error('sync ' + r.status);
  return r.json();
}

const readQueue = () => { try { return JSON.parse(localStorage.getItem(SYNC_QUEUE)) || []; } catch { return []; } };
const writeQueue = q => { try { localStorage.setItem(SYNC_QUEUE, JSON.stringify(q)); } catch {} };

// o que mudou vai para uma fila persistida, então nenhuma gravação se perde se a rede cair
function pushChanges(list) {
  if (!syncKey()) return;
  const next = mapOf(list);
  const ops = computeOps(_synced, next);
  _synced = next;
  if (ops.length) { writeQueue(readQueue().concat(ops)); flushQueue(); }
}

let flushing = false;
async function flushQueue() {
  if (flushing || !syncKey()) return;
  flushing = true;
  if (readQueue().length) setSyncState('enviando');
  try {
    while (readQueue().length) {
      const op = readQueue()[0];
      await syncApi('orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
      const q = readQueue(); q.shift(); writeQueue(q); // ponytail: upsert/delete idempotentes, corrida entre abas é inofensiva
    }
    setSyncState('conectado');
  } catch { setSyncState('sem-rede'); } finally { flushing = false; }
}

// resumo do catálogo de notas no servidor; null enquanto o painel não estiver conectado à Hostinger
let notasInfo = null;
const avisoCatalogo = () => notasInfo ? 'As notas emitidas continuam guardadas no catálogo.' : 'Não dá para desfazer.';

async function syncFromServer() {
  if (!syncKey()) return;
  await flushQueue();
  if (readQueue().length) return; // ainda há pendência (offline): não sobrescreve o local
  let list;
  try { list = await syncApi('orders', { method: 'GET' }); } catch { setSyncState('sem-rede'); return; }
  if (!Array.isArray(list)) return;
  setSyncState('conectado');
  _synced = mapOf(list);
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list)); } catch {}
  try { notasInfo = await syncApi('catalog', { query: '?resumo=1' }); } catch {}
  dispatchEvent(new Event('orders:changed'));
}

// apaga todos os pedidos em todos os aparelhos (botão "Limpar o painel")
async function clearAllOrders() {
  try { localStorage.removeItem(ORDERS_KEY); } catch {}
  _synced = {}; writeQueue([]);
  if (syncKey()) { try { await syncApi('orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'clear' }) }); } catch {} }
}

// rastreio do cliente (site): busca UM pedido no servidor, já sem dados pessoais.
// null = não existe · undefined = erro de rede/servidor
async function trackOrder(code) {
  try {
    const r = await fetch(`${syncUrl('track')}?code=${encodeURIComponent(normCode(code))}`);
    if (r.status === 404) return null;
    if (!r.ok) return undefined;
    return await r.json();
  } catch { return undefined; }
}

// painel/admin (têm chave): sincroniza ao abrir, ao focar e a cada 20s.
// O site público não tem chave e não dispara nada disto; usa trackOrder sob demanda.
let syncStarted = false;
function startSync() {
  if (syncStarted || !syncKey()) return;
  syncStarted = true;
  syncFromServer();
  setInterval(() => { if (!document.hidden) syncFromServer(); }, 20000);
  addEventListener('focus', syncFromServer);
  addEventListener('online', syncFromServer);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncFromServer(); });
}
if (typeof window !== 'undefined') startSync();
