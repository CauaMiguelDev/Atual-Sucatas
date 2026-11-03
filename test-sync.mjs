// Checagem da lógica de sincronização. Rodar: node test-sync.mjs
import assert from 'node:assert';
import core from './compartilhado/sync-core.js';
const { normCode, mapOf, computeOps, trimForTrack, findInList } = core;

// normaliza código (pedido ou rastreio)
assert.equal(normCode(' as-1024 '), 'AS-1024');
assert.equal(normCode('qb 123 br'), 'QB123BR');
assert.equal(normCode(null), '');

// trimForTrack NÃO pode vazar dado pessoal do cliente
const full = {
  codigo: 'AS-1024', status: 2, previsao: '2026-11-10',
  cliente: { nome: 'Fulano', whatsapp: '49999', doc: '12345678900', endereco: 'Rua X, 1', cep: '89000-000' },
  itens: [{ desc: 'Farol', qtd: 1, valor: 250 }], frete: 40, pagamento: 'pix', obs: 'segredo',
  historico: [{ status: 0, data: '2026-11-01', extra: 'x' }],
  rastreio: { transportadora: 'Correios', codigo: 'QB1BR' },
  nf: { numero: 1200, serie: 1, emitidaEm: '2026-11-02', enviadaEm: '2026-11-02' },
  msgs: [{ tpl: 'nota' }], tentativas: 1,
};
const t = trimForTrack(full);
const leaked = JSON.stringify(t);
['Fulano', '49999', '12345678900', 'Rua X', '89000-000', 'segredo', '250', 'pix'].forEach(s =>
  assert.ok(!leaked.includes(s), `VAZOU dado pessoal: ${s}`));
assert.deepEqual(t.itens, [{ desc: 'Farol' }]);            // só a descrição da peça, sem valor
assert.deepEqual(t.rastreio, { transportadora: 'Correios', codigo: 'QB1BR' });
assert.deepEqual(t.nf, { numero: 1200, emitidaEm: '2026-11-02' }); // sem enviadaEm/serie
assert.equal(t.historico[0].extra, undefined);
assert.equal(trimForTrack(null), null);

// computeOps: só mexe no que mudou aqui; nunca apaga o que outro aparelho criou
const A = { codigo: 'AS-1', status: 0 }, B = { codigo: 'AS-2', status: 0 };
const prev = mapOf([A, B]);

// nada mudou → nenhuma operação
assert.deepEqual(computeOps(prev, mapOf([A, B])), []);

// editei A, apaguei B → upsert de A + delete de B
const A2 = { codigo: 'AS-1', status: 3 };
const ops = computeOps(prev, mapOf([A2]));
assert.deepEqual(ops, [{ op: 'upsert', codigo: 'AS-1', order: A2 }, { op: 'delete', codigo: 'AS-2' }]);

// o OUTRO aparelho criou AS-9 (não estava no meu estado sincronizado):
// eu salvo sem ele na lista → NÃO deve gerar delete de AS-9
const minhaLista = mapOf([A, B]); // _synced tinha A,B; crio C localmente
const C = { codigo: 'AS-3', status: 0 };
const ops2 = computeOps(mapOf([A, B]), mapOf([A, B, C]));
assert.deepEqual(ops2, [{ op: 'upsert', codigo: 'AS-3', order: C }]); // só o novo, nada apagado
void minhaLista;

// findInList: acha por código do pedido OU por código de rastreio
const lista = [full];
assert.equal(findInList(lista, 'as-1024')?.codigo, 'AS-1024');
assert.equal(findInList(lista, 'qb1br')?.codigo, 'AS-1024');
assert.equal(findInList(lista, 'ZZZ'), undefined);

console.log('OK — todos os testes de sincronização passaram.');
