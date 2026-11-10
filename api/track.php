<?php
// Rastreio público: devolve UM pedido pelo código (do pedido ou de rastreio), já sem
// dados pessoais. Nunca devolve a lista toda.
require __DIR__ . '/base.php';

$code = norm_code($_GET['code'] ?? '');
if ($code === '') responder(['error' => 'código ausente.'], 400);

// caminho rápido: o código do pedido é a chave do arquivo
$pedido = ler_pedido(arquivo_do($code));
if (!$pedido) {
  // ponytail: varre a pasta inteira; serve para milhares de pedidos, troque por índice se passar disso
  foreach (ler_todos() as $o) {
    if (norm_code($o['codigoRastreio'] ?? '') === $code || norm_code($o['rastreio']['codigo'] ?? '') === $code) { $pedido = $o; break; }
  }
}
if (!$pedido) responder(['error' => 'não encontrado.'], 404);
responder(resumo_rastreio($pedido));
