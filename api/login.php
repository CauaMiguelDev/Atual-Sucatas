<?php
// Login do painel no servidor: quem entra com usuário e senha recebe a chave de sincronização,
// então qualquer aparelho fica conectado sem colar nada. A loja já vem com um acesso padrão
// (loja-acesso.php, só o hash, fora do Git); trocar a senha em Configurações grava acesso.dat, que passa a valer.
require __DIR__ . '/base.php';

$config = __DIR__ . '/config.php';
$chave = is_file($config) ? (string) (require $config) : '';
if (strlen($chave) < 16) responder(['error' => 'Chave não configurada em api/config.php.'], 503);

// .dat de propósito: os pedidos são os *.json desta pasta
$acesso = pasta_dados() . '/acesso.dat';
$tentativas = pasta_dados() . '/tentativas.dat';

$salvo = is_file($acesso) ? (json_decode((string) file_get_contents($acesso), true) ?: null) : null;
if (!$salvo && is_file(__DIR__ . '/loja-acesso.php')) $salvo = require __DIR__ . '/loja-acesso.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') responder(['configurado' => !empty($salvo['hash'])]);

$ip = sha1((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
$fila = is_file($tentativas) ? (json_decode((string) file_get_contents($tentativas), true) ?: []) : [];
$minha = $fila[$ip] ?? ['n' => 0, 'ate' => 0];
if ($minha['ate'] > time()) responder(['error' => 'Muitas tentativas erradas. Tente de novo em alguns minutos.'], 429);

function falhou($mensagem) {
  global $fila, $ip, $minha, $tentativas;
  $minha['n']++;
  if ($minha['n'] >= 5) $minha = ['n' => 0, 'ate' => time() + 300];
  $fila[$ip] = $minha;
  file_put_contents($tentativas, json_encode($fila), LOCK_EX);
  responder(['error' => $mensagem], 401);
}
function acertou($dados) {
  global $fila, $ip, $tentativas;
  unset($fila[$ip]);
  file_put_contents($tentativas, json_encode($fila), LOCK_EX);
  responder($dados);
}
function novo_acesso($usuario, $senha, $arquivo) {
  $usuario = strtolower(trim((string) $usuario));
  if (strlen($usuario) < 3 || preg_match('/\s/', $usuario)) responder(['error' => 'O usuário precisa ter pelo menos 3 letras, sem espaços.'], 400);
  if (strlen((string) $senha) < 6) responder(['error' => 'A senha precisa ter pelo menos 6 caracteres.'], 400);
  $dados = json_encode(['usuario' => $usuario, 'hash' => password_hash((string) $senha, PASSWORD_DEFAULT)]);
  if (file_put_contents($arquivo, $dados, LOCK_EX) === false) responder(['error' => 'Não foi possível salvar o acesso.'], 500);
}

$corpo = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($corpo)) responder(['error' => 'JSON inválido.'], 400);
$acao = $corpo['acao'] ?? '';

// administrador do site: usuário fixo; a senha existe só como hash em admin-senha.php, que não vai para o Git
if ($acao === 'admin') {
  $arquivo = __DIR__ . '/admin-senha.php';
  $hash = is_file($arquivo) ? (string) (require $arquivo) : '';
  $certo = strtolower(trim((string) ($corpo['usuario'] ?? ''))) === 'admin' && $hash !== '' && password_verify((string) ($corpo['senha'] ?? ''), $hash);
  if (!$certo) falhou('Usuário ou senha incorretos.');
  acertou(['chave' => $chave]);
}

if (empty($salvo['hash'])) responder(['error' => 'O acesso da loja não está configurado no servidor.'], 409);
$certo = strtolower(trim((string) ($corpo['usuario'] ?? ''))) === ($salvo['usuario'] ?? null)
  && password_verify((string) ($corpo['senha'] ?? ''), (string) ($salvo['hash'] ?? ''));
if (!$certo) falhou('Usuário ou senha incorretos.');

if ($acao === 'entrar') acertou(['chave' => $chave]);
if ($acao === 'trocar') {
  novo_acesso($corpo['novoUsuario'] ?? '', $corpo['novaSenha'] ?? '', $acesso);
  acertou(['ok' => true]);
}
responder(['error' => 'ação desconhecida.'], 400);
