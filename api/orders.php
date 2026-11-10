<?php
// Painel: lê a lista toda e grava pedido a pedido. Protegido pela chave de sincronização,
// porque a lista tem dados pessoais dos clientes (nome, CPF, endereço).
// Toda nota passa pelo catálogo ANTES de o pedido mudar: se o catálogo não gravar, o painel recebe
// erro, mantém a alteração na fila e tenta de novo. Assim nenhuma nota fica sem registro.
require __DIR__ . '/base.php';
exigir_chave();

$metodo = $_SERVER['REQUEST_METHOD'] ?? '';
if ($metodo === 'GET') {
  $lista = ler_todos();
  // ponytail: confere a lista inteira a cada leitura; serve para milhares de pedidos, troque por índice se passar disso
  alterar_catalogo(function (&$c) use ($lista) {
    $mudou = false;
    foreach ($lista as $o) $mudou = registrar_nota($c, $o) || $mudou;
    return $mudou;
  });
  responder($lista);
}
if ($metodo !== 'POST') responder(['error' => 'método não suportado.'], 405);

$corpo = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($corpo)) responder(['error' => 'JSON inválido.'], 400);
$op = $corpo['op'] ?? '';
$sem_catalogo = fn() => responder(['error' => 'não foi possível gravar o catálogo de notas.'], 500);

if ($op === 'clear') {
  $lista = ler_todos();
  $ok = alterar_catalogo(function (&$c) use ($lista) {
    $mudou = false;
    foreach ($lista as $o) $mudou = marcar_removida($c, $o) || $mudou;
    return $mudou;
  });
  if (!$ok) $sem_catalogo();
  $arquivos = glob(pasta_dados() . '/*.json') ?: [];
  array_map('unlink', $arquivos);
  responder(['ok' => true, 'cleared' => count($arquivos)]);
}
if ($op === 'delete') {
  $k = norm_code($corpo['codigo'] ?? '');
  if ($k === '') responder(['error' => 'codigo ausente.'], 400);
  $antigo = ler_pedido(arquivo_do($k));
  if (!alterar_catalogo(fn(&$c) => marcar_removida($c, $antigo))) $sem_catalogo();
  if (is_file(arquivo_do($k))) unlink(arquivo_do($k));
  responder(['ok' => true]);
}
if ($op === 'upsert') {
  $novo = $corpo['order'] ?? null;
  $k = norm_code($novo['codigo'] ?? '');
  if ($k === '') responder(['error' => 'pedido sem codigo.'], 400);
  $antigo = ler_pedido(arquivo_do($k));
  $ok = alterar_catalogo(function (&$c) use ($antigo, $novo) {
    $trocou = tem_nota($antigo) && (!tem_nota($novo) || chave_da_nota($antigo) !== chave_da_nota($novo));
    $mudou = $trocou && marcar_removida($c, $antigo);
    return registrar_nota($c, $novo) || $mudou;
  });
  if (!$ok) $sem_catalogo();
  $json = json_encode($novo, JSON_UNESCAPED_UNICODE);
  if ($json === false || file_put_contents(arquivo_do($k), $json, LOCK_EX) === false) responder(['error' => 'não foi possível salvar.'], 500);
  responder(['ok' => true]);
}
responder(['error' => 'op desconhecida.'], 400);
