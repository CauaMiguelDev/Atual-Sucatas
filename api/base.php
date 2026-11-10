<?php
// Base da API na Hostinger. Mesmo contrato das Netlify Functions: um arquivo JSON por pedido.
// Os dados ficam FORA da pasta do site (ao lado de public_html), para que trocar ou apagar o site
// não encoste neles. Se o servidor não deixar, ficam em api/dados/, bloqueada pelo .htaccess dela.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder($dados, $status = 200) {
  http_response_code($status);
  echo json_encode($dados, JSON_UNESCAPED_UNICODE);
  exit;
}

function pasta_dados() {
  static $pasta = null;
  if ($pasta !== null) return $pasta;
  $raiz = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\') ?: dirname(__DIR__);
  $fora = dirname($raiz) . '/atual-sucatas-dados';
  $pasta = (is_dir($fora) || @mkdir($fora, 0750, true)) && is_writable($fora) ? $fora : __DIR__ . '/dados';
  if ($pasta === $fora) trazer_dados_antigos($fora);
  return $pasta;
}

function dados_fora_do_site() {
  return pasta_dados() !== __DIR__ . '/dados';
}

// instalação antiga: leva o que estava em api/dados/ para a pasta nova, sem sobrescrever nada
function trazer_dados_antigos($destino) {
  foreach (array_diff(scandir(__DIR__ . '/dados') ?: [], ['.', '..', '.htaccess']) as $nome) {
    if (!file_exists("$destino/$nome")) @rename(__DIR__ . "/dados/$nome", "$destino/$nome");
  }
}

// painel e catálogo têm dados pessoais dos clientes: só com a chave de sincronização
function exigir_chave() {
  $config = __DIR__ . '/config.php';
  $chave = is_file($config) ? (string) (require $config) : '';
  if (strlen($chave) < 16) responder(['error' => 'Chave não configurada em api/config.php.'], 503);
  if (!hash_equals($chave, (string) ($_SERVER['HTTP_X_SYNC_KEY'] ?? ''))) responder(['error' => 'Chave inválida.'], 401);
}

// clientes digitam o código do pedido (AS-1024) ou o de rastreio (QB123456789BR)
function norm_code($c) {
  return strtoupper(preg_replace('/\s+/', '', trim((string) $c)));
}

// o nome do arquivo é um hash: nenhum código digitado consegue sair da pasta dados/
function arquivo_do($codigo) {
  return pasta_dados() . '/' . sha1($codigo) . '.json';
}

function ler_pedido($arquivo) {
  if (!is_file($arquivo)) return null;
  $o = json_decode((string) file_get_contents($arquivo), true);
  return is_array($o) ? $o : null;
}

function ler_todos() {
  $lista = [];
  foreach (glob(pasta_dados() . '/*.json') ?: [] as $f) {
    $o = ler_pedido($f);
    if ($o) $lista[] = $o;
  }
  return $lista;
}

// só o que o rastreio público mostra (a cidade sim; nome, CPF, rua, valores e mensagens nunca).
function resumo_rastreio($o) {
  $r = $o['rastreio'] ?? null;
  $nf = $o['nf'] ?? null;
  return [
    'codigo' => $o['codigo'] ?? '',
    'status' => $o['status'] ?? 0,
    'previsao' => ($o['previsao'] ?? '') ?: null,
    'historico' => array_map(fn($h) => ['status' => $h['status'] ?? 0, 'data' => $h['data'] ?? null, 'local' => $h['local'] ?? '', 'obs' => $h['obs'] ?? ''], $o['historico'] ?? []),
    'destino' => $o['cliente']['cidade'] ?? '',
    'codigoRastreio' => $o['codigoRastreio'] ?? '',
    'rastreio' => !empty($r['codigo']) ? ['transportadora' => $r['transportadora'] ?? '', 'codigo' => $r['codigo']] : null,
    'nf' => $nf ? ['numero' => $nf['numero'] ?? null, 'emitidaEm' => $nf['emitidaEm'] ?? null] : null,
    'itens' => array_map(fn($i) => ['desc' => $i['desc'] ?? ''], $o['itens'] ?? []),
  ];
}

/* ---------- catálogo de notas (notas/catalog.json) ----------
   Só acumula: nota apagada no painel continua aqui, marcada com removidaEm. Cada nota guarda o pedido
   completo e, se a nota for gerada de novo com outros dados, a versão anterior fica em versoes.
   A chave leva o código do pedido para que um número repetido nunca sobrescreva outra nota. */
function arquivo_catalogo() {
  return pasta_dados() . '/notas/catalog.json';
}

function catalogo_valido($arquivo) {
  $c = is_file($arquivo) ? json_decode((string) file_get_contents($arquivo), true) : null;
  return is_array($c) && isset($c['notas']) && is_array($c['notas']) ? $c : null;
}

function ler_catalogo() {
  $f = arquivo_catalogo();
  if (!is_file($f)) return ['versao' => 1, 'notas' => []];
  $c = catalogo_valido($f);
  if ($c) return $c;
  // arquivo danificado: guarda como está e volta para a cópia boa mais recente
  $danificado = $f . '.danificado-' . gmdate('Y-m-d');
  if (!is_file($danificado)) @copy($f, $danificado);
  $copias = glob(dirname($f) . '/copias/catalog-*.json') ?: [];
  rsort($copias);
  foreach (array_merge($copias, ["$f.bak"]) as $copia) { // a cópia do dia é a mais nova; o .bak é a versão anterior
    $c = catalogo_valido($copia);
    if ($c) return $c;
  }
  return ['versao' => 1, 'notas' => []];
}

// $mudar recebe o catálogo por referência e devolve true se alterou. Devolve false se não conseguiu gravar.
function alterar_catalogo($mudar) {
  $f = arquivo_catalogo();
  $dir = dirname($f);
  if (!is_dir("$dir/copias") && !@mkdir("$dir/copias", 0750, true)) return false;
  $trava = @fopen("$dir/.trava", 'c');
  if (!$trava || !flock($trava, LOCK_EX)) return false;
  $ok = true;
  $c = ler_catalogo();
  if ($mudar($c)) {
    $c['atualizadoEm'] = gmdate('c');
    $json = json_encode($c, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $ok = $json !== false && file_put_contents("$f.novo", $json) !== false;
    if ($ok) {
      if (is_file($f)) @copy($f, "$f.bak");
      $ok = rename("$f.novo", $f);
      if ($ok) @copy($f, "$dir/copias/catalog-" . gmdate('Y-m-d') . '.json');
    }
  }
  flock($trava, LOCK_UN);
  fclose($trava);
  return $ok;
}

function chave_da_nota($o) {
  return ($o['nf']['serie'] ?? 1) . '-' . $o['nf']['numero'] . '-' . norm_code($o['codigo'] ?? '');
}

function tem_nota($o) {
  return is_array($o) && !empty($o['nf']['numero']);
}

// o que sai impresso na nota: mudou isso, a versão anterior é guardada
function dados_da_nota($o) {
  return json_encode([$o['nf'] ?? null, $o['cliente'] ?? null, $o['itens'] ?? null, $o['frete'] ?? null, $o['pagamento'] ?? null, $o['obs'] ?? null]);
}

function registrar_nota(&$c, $o) {
  if (!tem_nota($o)) return false;
  $k = chave_da_nota($o);
  $e = $c['notas'][$k] ?? null;
  if (!$e) {
    $c['notas'][$k] = ['numero' => $o['nf']['numero'], 'serie' => $o['nf']['serie'] ?? 1, 'emitidaEm' => $o['nf']['emitidaEm'] ?? null, 'codigo' => $o['codigo'] ?? '', 'codigoRastreio' => $o['codigoRastreio'] ?? '', 'registradaEm' => gmdate('c'), 'pedido' => $o, 'versoes' => []];
    return true;
  }
  if (json_encode($e['pedido']) === json_encode($o) && empty($e['removidaEm'])) return false;
  if (dados_da_nota($e['pedido']) !== dados_da_nota($o)) $e['versoes'][] = ['guardadaEm' => gmdate('c'), 'pedido' => $e['pedido']];
  $e['pedido'] = $o;
  unset($e['removidaEm']);
  $c['notas'][$k] = $e;
  return true;
}

function marcar_removida(&$c, $o) {
  if (!tem_nota($o)) return false;
  $mudou = registrar_nota($c, $o);
  $k = chave_da_nota($o);
  if (!empty($c['notas'][$k]['removidaEm'])) return $mudou;
  $c['notas'][$k]['removidaEm'] = gmdate('c');
  return true;
}
