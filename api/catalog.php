<?php
// Catálogo de todas as notas já emitidas. ?resumo=1 devolve só os totais, para o painel
// mostrar a situação e nunca repetir um número de nota.
require __DIR__ . '/base.php';
exigir_chave();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') responder(['error' => 'método não suportado.'], 405);

$c = ler_catalogo();
$notas = array_values($c['notas']);
usort($notas, fn($a, $b) => ($a['numero'] ?? 0) <=> ($b['numero'] ?? 0));
$info = [
  'total' => count($notas),
  'removidas' => count(array_filter($notas, fn($n) => !empty($n['removidaEm']))),
  'ultimo' => $notas ? end($notas)['numero'] : 0,
  'ultimoPedido' => max([0, ...array_map(fn($n) => (int) preg_replace('/\D/', '', (string) ($n['codigo'] ?? '')), $notas)]),
  'foraDoSite' => dados_fora_do_site(),
  'atualizadoEm' => $c['atualizadoEm'] ?? null,
];
responder(isset($_GET['resumo']) ? $info : ['versao' => 1] + $info + ['notas' => $notas]);
