// Painel: lê a lista toda e grava pedido a pedido num lugar só (Netlify Blobs).
// Protegido pela chave SYNC_KEY (variável de ambiente) — sem ela, nada entra nem sai,
// porque a lista tem dados pessoais dos clientes (nome, CPF, endereço).
import { getStore } from '@netlify/blobs';
import { normCode } from '../../compartilhado/sync-core.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const key = process.env.SYNC_KEY;
  if (!key) return json({ error: 'SYNC_KEY não configurada no Netlify.' }, 503);
  if (req.headers.get('x-sync-key') !== key) return json({ error: 'Chave inválida.' }, 401);

  const store = getStore('orders');

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const list = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
    return json(list.filter(Boolean));
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }

    if (body.op === 'clear') {
      const { blobs } = await store.list();
      await Promise.all(blobs.map(b => store.delete(b.key)));
      return json({ ok: true, cleared: blobs.length });
    }
    if (body.op === 'delete') {
      const k = normCode(body.codigo);
      if (!k) return json({ error: 'codigo ausente.' }, 400);
      await store.delete(k);
      return json({ ok: true });
    }
    if (body.op === 'upsert') {
      const k = normCode(body.order?.codigo);
      if (!k) return json({ error: 'pedido sem codigo.' }, 400);
      await store.setJSON(k, body.order);
      return json({ ok: true });
    }
    return json({ error: 'op desconhecida.' }, 400);
  }

  return json({ error: 'método não suportado.' }, 405);
};
