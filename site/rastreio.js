/* Página de rastreio do cliente: a busca do pedido e o card com as informações. Nada aqui depende da rolagem. */
(function () {
  const out = $('#resultado'), form = $('#t-form'), input = $('#code');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsapOk = !reduce && window.gsap;
  const DEMO = 'AS-EXEMPLO';
  const ICONS = ['ph-check-circle', 'ph-wrench', 'ph-package', 'ph-truck', 'ph-paper-plane-tilt', 'ph-flag-checkered'];
  const wa = text => `https://wa.me/${STORE_WHATS}?text=${encodeURIComponent(text)}`;
  const btn = (href, icon, label, cls = 'btn--primary') => `<a class="btn ${cls}" href="${href}" target="_blank" rel="noopener"><i class="ph ${icon}" aria-hidden="true"></i><span class="btn__label" data-text="${label}"><span>${label}</span></span></a>`;

  /* ---------- pedido de exemplo: datas relativas a hoje, para nunca parecer velho ---------- */
  function demoOrder() {
    const day = n => new Date(Date.now() + n * 864e5).toISOString();
    return {
      codigo: DEMO, status: 3, previsao: day(3).slice(0, 10), destino: 'Sorocaba - SP', codigoRastreio: 'ATSEXEMPLO2',
      historico: [{ status: 0, data: day(-4) }, { status: 1, data: day(-3) }, { status: 2, data: day(-2), local: 'Chapecó - SC' }, { status: 3, data: day(-1), local: 'Curitiba - PR' }],
      rastreio: { transportadora: 'Transportadora', codigo: 'QB123456789BR' }, nf: { numero: 1193, emitidaEm: day(-3) },
      itens: [{ desc: 'Farol esquerdo Hyundai i30 2014' }],
    };
  }

  /* ---------- texto embaralhando (código do pedido) ---------- */
  function scramble(el, ms = 800) {
    const final = el.textContent, abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    if (reduce) return;
    const start = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - start) / ms), n = Math.floor(final.length * p);
      el.textContent = final.slice(0, n) + [...final.slice(n)].map(c => (c === '-' ? c : abc[(Math.random() * abc.length) | 0])).join('');
      if (p < 1) requestAnimationFrame(tick); else el.textContent = final;
    })(start);
  }

  /* ---------- estados ---------- */
  function showResult() {
    scrollTo({ top: out.getBoundingClientRect().top + scrollY - 96, behavior: reduce ? 'auto' : 'smooth' });
  }
  function renderLoading() {
    out.innerHTML = `<div class="r-card" aria-busy="true"><div class="skel" style="width:38%;height:30px"></div><div class="skel" style="width:64%;margin-top:18px"></div>
      <div class="skel" style="height:6px;margin-top:48px"></div>${'<div class="skel" style="width:58%;margin-top:28px"></div>'.repeat(3)}</div>`;
  }
  function renderState(icon, title, text, actions = '') {
    out.innerHTML = `<div class="r-card r-state"><span class="ico ico--lg"><i class="ph-duotone ${icon}" aria-hidden="true"></i></span><h2>${title}</h2><p>${text}</p><div class="r-actions">${actions}</div></div>`;
    if (gsapOk) gsap.from(out.firstElementChild, { y: 40, opacity: 0, filter: 'blur(8px)', duration: .7, ease: 'expo.out', clearProps: 'all' });
    showResult();
  }

  function renderOrder(o) {
    const last = ORDER_STATUS.length - 1, done = o.status === last, pct = o.status / last;
    const when = i => o.historico.find(h => h.status === i)?.data;
    const day = ymd => ymd.split('-').reverse().join('/');
    const lastLocal = o.historico.filter(h => h.local).at(-1)?.local;
    const note = i => { const h = o.historico.filter(x => x.status === i && (x.local || x.obs)).at(-1); return h ? [h.local, h.obs].filter(Boolean).map(esc).join(' · ') : ''; };
    const meta = [
      ['Peças', o.itens.map(i => esc(i.desc)).join(', ') || 'Pedido da loja'],
      o.previsao && !done ? ['Previsão de entrega', day(o.previsao)] : null,
      o.codigoRastreio ? ['Código de rastreio', esc(o.codigoRastreio)] : null,
      lastLocal ? ['Onde está', esc(lastLocal)] : null,
      o.rastreio?.codigo ? [esc(o.rastreio.transportadora || 'Transportadora'), esc(o.rastreio.codigo)] : null,
      o.nf ? ['Nota fiscal', `Nº ${esc(o.nf.numero)}`] : null,
    ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    const steps = ORDER_STATUS.map((s, i) => `<li class="${i <= o.status ? 'ok' : ''} ${i === o.status && !done ? 'now' : ''}">
      <span class="r-dot"><i class="ph-fill ${ICONS[i]}" aria-hidden="true"></i></span><strong>${s}</strong>
      ${note(i) ? `<small class="r-note">${note(i)}</small>` : ''}
      ${when(i) ? `<time datetime="${esc(when(i))}">${fmtDate(when(i))}</time>` : '<span></span>'}</li>`).join('');

    out.innerHTML = `<article class="r-card">
      ${o.codigo === DEMO ? '<p class="r-demo"><i class="ph ph-info" aria-hidden="true"></i>Este é um pedido de exemplo, para você ver como o rastreio funciona.</p>' : ''}
      <header class="r-head">
        <div><h2 class="r-code" id="r-code">${esc(o.codigo)}</h2><span class="pill ${done ? 'pill--ok' : ''}">${esc(ORDER_STATUS[o.status])}</span></div>
        <dl class="r-meta">${meta}</dl>
      </header>
      <div class="r-route" role="img" aria-label="Etapa ${o.status + 1} de ${last + 1}: ${esc(ORDER_STATUS[o.status])}">
        <span class="r-route__line"></span><span class="r-route__fill" style="--p:${pct}"></span>
        <span class="r-pin r-pin--a"><i class="ph-fill ph-warehouse" aria-hidden="true"></i></span>
        <span class="r-pin r-pin--b"><i class="ph-fill ph-house-line" aria-hidden="true"></i></span>
        <span class="r-truck" style="--p:${pct}"><i class="ph-fill ph-truck" aria-hidden="true"></i></span>
      </div>
      <div class="r-labels"><span>Chapecó - SC</span><span>${esc(o.destino || 'Seu endereço')}</span></div>
      <ol class="r-time">${steps}</ol>
      <div class="r-actions">
        ${btn(wa(`Olá, Atual Sucatas! Quero falar sobre o meu pedido ${o.codigo}.`), 'ph-whatsapp-logo', 'Falar sobre este pedido')}
        <button class="btn btn--line" type="button" id="r-copy"><i class="ph ph-link" aria-hidden="true"></i><span class="btn__label" data-text="Copiar link"><span>Copiar link</span></span></button>
      </div>
    </article>`;

    const card = out.firstElementChild;
    scramble($('#r-code', card));
    if (gsapOk) {
      const fill = $('.r-route__fill', card), truck = $('.r-truck', card), run = { p: 0 };
      const setRoute = () => [fill, truck].forEach(el => el.style.setProperty('--p', run.p));
      setRoute();
      gsap.timeline({ defaults: { ease: 'expo.out' } })
        .from(card, { y: 50, opacity: 0, filter: 'blur(10px)', duration: .8, clearProps: 'filter,opacity,transform' })
        .to(run, { p: pct, duration: 1.7, ease: 'power2.inOut', onUpdate: setRoute }, .25)
        .from($$('.r-time li', card), { x: -26, opacity: 0, stagger: .07, duration: .6, clearProps: 'all' }, .4)
        .call(() => { if (done && window.faiscas) { const r = truck.getBoundingClientRect(); faiscas(r.left + r.width / 2, r.top); } });
    }
    showResult();
  }

  /* ---------- busca ---------- */
  async function search(raw) {
    const code = normCode(raw);
    if (!code) {
      input.focus();
      return renderState('ph-barcode', 'Digite o código', 'Ele vem na mensagem de confirmação que a loja mandou no WhatsApp.');
    }
    history.replaceState(null, '', `?pedido=${encodeURIComponent(code)}`);
    renderLoading();
    if (code === DEMO) return setTimeout(() => renderOrder(demoOrder()), 350);
    let order = await trackOrder(code);
    if (order == null) { // no computador da loja, o pedido pode existir só neste navegador
      const local = findInList(loadOrders(), code);
      if (local) order = trimForTrack(local);
    }
    if (order) return renderOrder(order);
    if (order === undefined) {
      return renderState('ph-wifi-slash', 'Não conseguimos consultar agora', 'Tente de novo em instantes ou fale com a loja no WhatsApp.',
        btn(wa(`Olá, Atual Sucatas! Não consegui ver o rastreio do pedido ${code}.`), 'ph-whatsapp-logo', 'Falar com a loja'));
    }
    renderState('ph-magnifying-glass', 'Não encontramos esse código',
      `Confira se digitou <b>${esc(code)}</b> certinho. Se o pedido é recente, pode levar um tempo para aparecer.`,
      btn(wa(`Olá, Atual Sucatas! Não encontrei meu pedido no rastreio.\n\nCódigo que tentei: ${code}`), 'ph-whatsapp-logo', 'Falar com a loja'));
  }

  form.addEventListener('submit', e => { e.preventDefault(); search(input.value); });
  $('#demo').addEventListener('click', () => { input.value = DEMO; search(DEMO); });
  out.addEventListener('click', async e => {
    const b = e.target.closest('#r-copy');
    if (!b) return;
    try { await navigator.clipboard.writeText(location.href); $('.btn__label > span', b).textContent = 'Link copiado'; } catch {}
  });

  const q = new URLSearchParams(location.search).get('pedido');
  if (q) { input.value = q; search(q); }

  /* ---------- título: palavra que troca ---------- */
  const rot = $('#t-rot');
  if (!reduce) {
    const words = ['peça?', 'compra?', 'encomenda?'];
    let n = 0;
    setInterval(() => {
      if (document.hidden) return;
      const out = rot.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-.35em)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
      out.finished.then(() => {
        rot.textContent = words[n = (n + 1) % words.length];
        out.cancel();
        rot.animate([{ opacity: 0, transform: 'translateY(.35em)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.23,1,.32,1)' });
      });
    }, 2800);
  }
})();
