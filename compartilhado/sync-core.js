/* Núcleo da sincronização, usado no navegador (painel/site), no servidor (Netlify
   Functions) e no teste em Node. Sem dependências, para rodar nos três lugares.
   UMD: vira window.* no navegador e module.exports no Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : globalThis, function () {
  // clientes digitam o código do pedido (AS-1024) ou o de rastreio (QB123456789BR)
  const normCode = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');

  const mapOf = list => {
    const m = {};
    (list || []).forEach(o => { const k = normCode(o.codigo); if (k) m[k] = o; });
    return m;
  };

  // o que mudou entre o último estado sincronizado e a lista atual, por pedido.
  // Exclui só o que SUMIU da lista atual (foi apagado aqui) — nunca o que outro
  // aparelho criou e ainda não chegou, então um aparelho não apaga o do outro.
  function computeOps(prevMap, nextMap) {
    const ops = [];
    for (const k in nextMap) {
      const before = prevMap[k];
      if (!before || JSON.stringify(before) !== JSON.stringify(nextMap[k])) {
        ops.push({ op: 'upsert', codigo: k, order: nextMap[k] });
      }
    }
    for (const k in prevMap) if (!(k in nextMap)) ops.push({ op: 'delete', codigo: k });
    return ops;
  }

  // só o que o rastreio público mostra. Nunca nome, CPF, endereço, valores ou mensagens.
  function trimForTrack(o) {
    if (!o) return null;
    return {
      codigo: o.codigo,
      status: o.status,
      previsao: o.previsao || null,
      historico: (o.historico || []).map(h => ({ status: h.status, data: h.data })),
      rastreio: o.rastreio?.codigo
        ? { transportadora: o.rastreio.transportadora || '', codigo: o.rastreio.codigo }
        : null,
      nf: o.nf ? { numero: o.nf.numero, emitidaEm: o.nf.emitidaEm } : null,
      itens: (o.itens || []).map(i => ({ desc: i.desc || '' })),
    };
  }

  // acha um pedido pelo código do pedido ou pelo de rastreio (usado no servidor)
  function findInList(list, code) {
    const c = normCode(code);
    return c ? (list || []).find(o => normCode(o.codigo) === c || normCode(o.rastreio?.codigo) === c) : undefined;
  }

  return { normCode, mapOf, computeOps, trimForTrack, findInList };
});
