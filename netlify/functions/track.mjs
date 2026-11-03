// Rastreio público: devolve UM pedido pelo código (do pedido ou de rastreio),
// já sem dados pessoais. Nunca devolve a lista toda, então nada vaza para a internet.
import { getStore } from '@netlify/blobs';
import { normCode, trimForTrack, findInList } from '../../compartilhado/sync-core.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const code = normCode(new URL(req.url).searchParams.get('code'));
  if (!code) return json({ error: 'código ausente.' }, 400);

  const store = getStore('orders');

  // caminho rápido: o código do pedido é a própria chave do blob
  let order = await store.get(code, { type: 'json' });
  if (!order) {
    // senão, procura pelo código de rastreio na lista
    const { blobs } = await store.list();
    const list = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    order = findInList(list.filter(Boolean), code);
  }

  if (!order) return json({ error: 'não encontrado.' }, 404);
  return json(trimForTrack(order));
};
