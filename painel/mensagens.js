/* Todas as mensagens de WhatsApp que a loja manda para o cliente ficam neste arquivo.
   Para mudar um texto, é só mexer aqui: vale para o pedido, para a tela Mensagens e para as rotas.
   Emojis ficam como código para nenhum editor quebrar. api.whatsapp.com/send mantém esses emojis;
   wa.me às vezes troca por "�". Depende de painel.js (trackLink, trackCodeOf, nfChecks, openChat). */
const E = {
  ok: '✅', box: '\u{1F4E6}', memo: '\u{1F4DD}', pin: '\u{1F4CD}', cal: '\u{1F4C5}', link: '\u{1F517}',
  truck: '\u{1F69A}', wrench: '\u{1F527}', money: '\u{1F4B0}', receipt: '\u{1F9FE}', clip: '\u{1F4CE}',
  hands: '\u{1F91D}', card: '\u{1F4B3}', store: '\u{1F3EA}', chat: '\u{1F4AC}', clock: '\u{1F552}', map: '\u{1F5FA}️',
};
const SIGN = `*Atual Sucatas*\nPeças originais com garantia e nota fiscal\n${E.pin} Chapecó - SC | Enviamos para todo o Brasil`;
const HELP = `${E.chat} Qualquer dúvida, é só responder esta mensagem.`;
const STORE_MAP = 'https://www.google.com/maps/search/?api=1&query=R.%20Horaide%20Prestes%20de%20Souza%2C%2065%2C%20Chapec%C3%B3%20-%20SC';

// tira linhas vazias repetidas e os campos que não existem naquele pedido
const tidy = lines => lines.filter(l => l !== null && l !== undefined && l !== false)
  .filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();

const firstName = n => { const w = String(n || '').trim().split(/\s+/)[0]; return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; };
const isCompany = o => String(o.cliente.doc || '').replace(/\D/g, '').length === 14;
const hello = o => `Olá, *${(isCompany(o) ? o.cliente.nome : firstName(o.cliente.nome)) || 'tudo bem'}*!`;
const isPickup = o => /retirada/i.test(o.rastreio?.transportadora || '');
const partsTotal = o => o.itens.reduce((t, i) => t + i.qtd * i.valor, 0);
const itemLines = o => o.itens.map(i => `• ${i.qtd}x ${i.desc} | ${brl(i.qtd * i.valor)}`);
const destLine = o => isPickup(o) ? `${E.store} Retirada na loja, em Chapecó - SC` : o.cliente.cidade ? `${E.pin} Entrega em: ${o.cliente.cidade}` : null;
const valueLines = o => [
  Number(o.frete) > 0 ? `Peças: ${brl(partsTotal(o))}` : null,
  Number(o.frete) > 0 ? `Frete: ${brl(o.frete)}` : null,
  `${E.money} *Total: ${brl(orderTotal(o))}*`,
  o.pagamento ? `${E.card} Pagamento: ${o.pagamento}` : null,
];
const trackLines = o => [`${E.link} *Acompanhe seu pedido:*`, trackLink(o), `${E.box} Código de rastreio: *${trackCodeOf(o)}*`];
const stageEvent = (o, s) => (o.historico || []).filter(h => h.status === s).at(-1);

// o que muda em cada etapa da entrega: a abertura e o que o cliente precisa saber naquele momento
const STAGE_TEXT = [
  { open: `Seu pedido foi confirmado ${E.ok}`, note: () => 'Agora vamos separar e conferir a sua peça. Você recebe um aviso a cada etapa.' },
  { open: `Sua peça foi separada e conferida ${E.wrench}`, note: o => isPickup(o) ? 'Em breve ela fica disponível para retirada. Avisamos por aqui.' : 'O próximo passo é o envio. Avisamos assim que ela sair da loja.' },
  { open: `Seu pedido saiu da nossa loja ${E.truck}`, note: () => 'Sua peça viaja com nota fiscal e garantia. Agora é só acompanhar pelo link abaixo.' },
  { open: `Seu pedido está a caminho ${E.truck}`, note: () => 'Está tudo certo com a entrega. Você pode acompanhar cada etapa pelo link abaixo.' },
  { open: `Seu pedido saiu para entrega ${E.truck}`, note: () => '*Deixe alguém no endereço para receber.* Se não encontrarem ninguém, a entrega é tentada de novo.' },
  { open: `Seu pedido foi entregue ${E.ok}`, note: () => 'Guarde a nota fiscal: ela é o comprovante da sua compra e da garantia.' },
];

function deliveryMsg(o, stage) {
  const done = stage === STAGE_TEXT.length - 1, ev = stageEvent(o, stage), t = STAGE_TEXT[stage];
  return tidy([
    `${hello(o)} ${t.open}`,
    '',
    t.note(o),
    '',
    `${E.memo} Situação: *${ORDER_STATUS[stage]}*`,
    ev?.local && !done ? `${E.pin} Onde está: ${ev.local}` : null,
    o.rastreio?.transportadora && !isPickup(o) ? `${E.truck} Transportadora: ${o.rastreio.transportadora}` : null,
    o.rastreio?.codigo ? `${E.box} Código da transportadora: *${o.rastreio.codigo}*` : null,
    o.previsao && !done ? `${E.cal} Previsão de entrega: ${fmtDay(o.previsao)}` : null,
    !done ? destLine(o) : null,
    ev?.obs ? `${E.chat} Recado da loja: ${ev.obs}` : null,
    '',
    ...(done ? [`Obrigado pela confiança! ${E.hands}`, 'Precisando de outra peça, é só chamar.'] : [...trackLines(o), '', HELP]),
    '',
    SIGN,
  ]);
}

// entrega sem sucesso: são até 3 tentativas, depois o pedido volta para a loja
function attemptMsg(o) {
  const n = Math.min(o.tentativas || 1, 3), left = 3 - n;
  return tidy([
    `${hello(o)} Tentamos entregar seu pedido, mas não encontramos ninguém no endereço ${E.box}`,
    '',
    `${E.memo} Tentativa *${n} de 3*`,
    o.cliente.endereco ? `${E.pin} Endereço: ${o.cliente.endereco}${o.cliente.bairro ? `, ${o.cliente.bairro}` : ''} - ${o.cliente.cidade}` : destLine(o),
    '',
    left
      ? `Ainda ${left === 1 ? 'resta *1 tentativa*' : `restam *${left} tentativas*`}. Se puder, deixe alguém no local para receber ou responda aqui para combinarmos.`
      : 'Esta foi a *última tentativa*, e o pedido vai voltar para a nossa loja. Responda aqui para combinarmos um novo envio ou a retirada em Chapecó - SC.',
    '',
    ...trackLines(o),
    '',
    HELP,
    '',
    SIGN,
  ]);
}

// kind = qual PDF vai junto com a mensagem ('nf', 'pedido' ou nada)
const TEMPLATES = {
  criado: (o, kind) => tidy([
    `${hello(o)} Recebemos o seu pedido ${E.ok}`,
    '',
    `${E.box} *Pedido ${o.codigo}*`,
    ...itemLines(o),
    '',
    ...valueLines(o),
    destLine(o),
    o.previsao ? `${E.cal} Previsão de entrega: ${fmtDay(o.previsao)}` : null,
    kind === 'nf' ? `${E.receipt} Nota fiscal nº *${o.nf.numero}* e nota do pedido em anexo, no mesmo PDF.` : kind === 'pedido' ? `${E.clip} Resumo do pedido em anexo (PDF).` : null,
    '',
    ...trackLines(o),
    '',
    'Você recebe um aviso por aqui a cada etapa.',
    HELP,
    '',
    SIGN,
  ]),
  status: o => deliveryMsg(o, o.status),
  nota: (o, attach) => tidy([
    `${hello(o)} A nota fiscal do seu pedido foi emitida ${E.receipt}`,
    '',
    `${E.receipt} Nota fiscal nº *${o.nf?.numero}*, série ${o.nf?.serie}`,
    `${E.cal} Emissão: ${o.nf ? new Date(o.nf.emitidaEm).toLocaleDateString('pt-BR') : ''}`,
    `${E.memo} Em nome de: ${o.cliente.nome}`,
    '',
    `${E.wrench} *Peças*`,
    ...itemLines(o),
    '',
    ...valueLines(o),
    attach ? '' : null,
    attach ? `${E.clip} Em anexo vai um PDF só, com a nota fiscal e a nota do pedido. Guarde o arquivo: ele é o comprovante da compra e da garantia.` : null,
    '',
    ...trackLines(o),
    '',
    `Obrigado pela compra! ${E.hands}`,
    '',
    SIGN,
  ]),
  retirada: o => tidy([
    `${hello(o)} Seu pedido está pronto para retirada ${E.ok}`,
    '',
    `${E.box} *Pedido ${o.codigo}*`,
    ...itemLines(o),
    '',
    `${E.store} R. Horaide Prestes de Souza, 65 - Vila Real, Chapecó - SC`,
    `${E.clock} Seg a sex, 8h às 18h · Sáb, 8h às 12h`,
    `${E.map} Como chegar: ${STORE_MAP}`,
    '',
    'Ao chegar, é só informar o código do pedido.',
    HELP,
    '',
    SIGN,
  ]),
  dados: o => {
    const miss = nfChecks(o).cliente.filter(([, v]) => !v).map(([l]) => l);
    return tidy([
      `${hello(o)} Estamos preparando a nota fiscal do pedido *${o.codigo}* ${E.receipt}`,
      '',
      miss.length ? 'Para emitir, precisamos destes dados:' : 'Pode confirmar se estes dados estão certos?',
      ...(miss.length ? miss.map(m => `• ${m}`) : [`• ${o.cliente.nome}`, `• ${o.cliente.doc}`, `• ${o.cliente.endereco}, ${o.cliente.bairro} - ${o.cliente.cidade}`, `• CEP ${o.cliente.cep}`]),
      '',
      'É só responder esta mensagem.',
      '',
      SIGN,
    ]);
  },
};
const TPL_NAMES = { criado: 'Confirmação do pedido', status: 'Atualização de entrega', nota: 'Nota fiscal', retirada: 'Pronto para retirada', dados: 'Pedir dados para a nota', tentativa: 'Não consegui entregar' };

// o que chega no WhatsApp da loja quando o cliente toca nos botões do site (só para consulta na tela Mensagens)
const SITE_MSGS = [
  ['Pedido de orçamento', 'Olá, Atual Sucatas! Vim pelo site e quero um orçamento.\n\nMeu carro (modelo e ano):\nPeça que preciso:'],
  ['Encontre sua peça', 'Olá, Atual Sucatas! Vim pelo site e procuro uma peça:\n\n*Marca:* Honda\n*Modelo:* Civic\n*Ano:* 2011\n*Peça:* Farol'],
  ['Carro do pátio', 'Olá, Atual Sucatas! Vim pelo site e tenho interesse em peças da sucata Honda Civic G8.\n\nPeça que preciso:'],
  ['Rastreio', 'Olá, Atual Sucatas! Quero falar sobre o meu pedido AS-1024.'],
];
