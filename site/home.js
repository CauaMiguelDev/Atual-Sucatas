/* Página principal: busca de peça, carrossel de marcas, cards e animações.
   main.js cuida do menu e dos reveals simples. Sem GSAP ou com movimento reduzido, tudo já aparece pronto. */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const motion = !reduce && window.gsap && window.ScrollTrigger;

  /* ---------- encontre sua peça: monta a mensagem e abre o WhatsApp ---------- */
  const finder = $('#finder'), peca = $('#f-peca');
  const val = id => $(`#${id}`).value.trim();
  const chips = $$('.quick button', finder);
  chips.forEach(b => b.addEventListener('click', () => { peca.value = b.textContent; peca.dispatchEvent(new Event('input', { bubbles: true })); }));
  peca.addEventListener('input', () => chips.forEach(b => b.classList.toggle('is-on', b.textContent === peca.value)));
  $('#f-ano').addEventListener('input', e => (e.target.value = e.target.value.replace(/\D/g, '')));
  finder.addEventListener('input', e => { const err = $('.err', e.target.closest('.fl') || finder); if (err) err.textContent = ''; });
  finder.addEventListener('submit', e => {
    e.preventDefault();
    const errs = { 'f-modelo': val('f-modelo') ? '' : 'Diga o modelo do carro.', 'f-peca': val('f-peca') ? '' : 'Diga qual peça você procura.' };
    Object.entries(errs).forEach(([id, msg]) => ($('.err', $(`#${id}`).closest('.fl')).textContent = msg));
    const bad = Object.keys(errs).find(k => errs[k]);
    if (bad) return $(`#${bad}`).focus();
    const msg = ['Olá, Atual Sucatas! Vim pelo site e procuro uma peça:', '', val('f-marca') ? `*Montadora:* ${val('f-marca')}` : null, `*Modelo:* ${val('f-modelo')}`, val('f-ano') ? `*Ano:* ${val('f-ano')}` : null, `*Peça:* ${val('f-peca')}`].filter(l => l !== null).join('\n');
    window.open(`https://wa.me/5549991041665?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  });

  /* ---------- cards: borda e luz seguem o mouse ---------- */
  const cards = $$('.pc, .cc, .hm__c');
  cards.forEach(c => c.insertAdjacentHTML('beforeend', '<span class="edge" aria-hidden="true"></span>'));
  if (fine) cards.forEach(c => c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--bx', `${e.clientX - r.left}px`);
    c.style.setProperty('--by', `${e.clientY - r.top}px`);
  }));

  /* ---------- de perto: a tira escolhida abre ---------- */
  const strips = $$('.dp');
  strips.forEach(el => ['pointerenter', 'focus'].forEach(ev => el.addEventListener(ev, () => strips.forEach(x => x.classList.toggle('is-on', x === el)))));

  if (!motion) $$('#flow li').forEach(li => li.classList.add('on'));
  if (!motion) return;
  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.style.scrollBehavior = 'auto';
  const ease = 'expo.out';

  /* ---------- rolagem suave ---------- */
  if (window.Lenis) {
    const lenis = new Lenis({ lerp: .1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length > 1 && $(id)) { e.preventDefault(); lenis.scrollTo(id, { offset: -80, duration: 1.2 }); }
    }));
  }

  /* ---------- títulos: letra por letra, cada palavra com sua máscara ---------- */
  function splitChars(el) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const word = w => `<span class="tw" aria-hidden="true">${[...w].map(c => `<span class="tc">${c}</span>`).join('')}</span>`;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const t = document.createElement('template');
        t.innerHTML = n.textContent.replace(/\S+/g, word);
        n.replaceWith(t.content);
      } else walk(n);
    });
    walk(el);
    return $$('.tc', el);
  }
  $$('[data-chars]').forEach(el => gsap.from(splitChars(el), { yPercent: 118, rotation: 7, transformOrigin: '0% 100%', duration: 1, ease, stagger: .015, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));

  /* ---------- topo ---------- */
  const hold = new Set(['intro']);
  gsap.timeline({ defaults: { ease } })
    .from('.top__line > span', { yPercent: 112, duration: 1.15, stagger: .12 }, .1)
    .from('.top__sub', { y: 18, opacity: 0, duration: .9 }, .45)
    .from('.find', { y: 26, opacity: 0, scale: .985, duration: 1, clearProps: 'transform,opacity' }, .55)
    .from('.find > *', { y: 10, opacity: 0, duration: .6, stagger: .04, clearProps: 'transform,opacity' }, .7)
    .from('.hm__c', { clipPath: 'inset(100% 0% 0% 0% round 18px)', y: 44, duration: 1.25, ease: 'expo.inOut', stagger: .09, clearProps: 'clipPath,y' }, .15)
    .from('.hm__ph img', { scale: 1.3, duration: 1.7, stagger: .09, clearProps: 'transform' }, .3)
    .add(() => { hold.delete('intro'); holdSync(); });

  /* ---------- mosaico: a barra é o relógio; quando enche, troca o carro no título e as fotos dos cards ---------- */
  const CARS = [['Civic', 'Honda Civic G8', 'civic', 'civic-lado'], ['Azera', 'Hyundai Azera 3.3 V6', 'azera', 'azera-lado'], ['Mini Cooper', 'Mini Cooper 2015', 'mini', 'mini-farol'], ['S10', 'Chevrolet S10', 's10-grade', 's10-lanterna'], ['Jetta', 'VW Jetta', 'jetta-logo', 'jetta-roda'], ['Creta', 'Hyundai Creta 2021', 'creta', 'creta-motor'], ['HB20', 'Hyundai HB20', 'hb20', 'hb20-lado']];
  const PARTS = [['w-golf-gti', 'Frente de Golf GTI'], ['volante', 'Volante multifuncional Audi'], ['audi-grade', 'Para-choque de Audi'], ['engates', 'Engates de reboque']];
  const YARD = ['patio-1', 'patio-2', 'patio-3'];
  const boxes = ['a', 'b', 'c', 'd'].map(k => $(`.hm__c--${k} .hm__ph`));
  const WIPE = ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 100%)', 'inset(0% 100% 0% 0%)', 'inset(0% 0% 100% 0%)'];
  const word = $('#top-car'), main = $('#hm-main'), carName = $('#hm-name'), partName = $('#hm-part'), stop = $('#hm-stop');
  let turn = 0;
  async function swap() {
    turn++;
    const [car, name, a, b] = CARS[turn % CARS.length], [part, partText] = PARTS[turn % PARTS.length];
    const imgs = [[a, `${name} no pátio`], [b, `Detalhe de ${name}`], [part, partText], [YARD[turn % YARD.length], 'Carros para desmonte nas prateleiras do pátio']].map(([f, alt]) => Object.assign(new Image(), { src: `../assets/ig/c/${f}.jpg`, alt }));
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
    const tl = gsap.timeline({ onComplete: () => { boxes.forEach(x => x.firstElementChild.remove()); bar.restart(); holdSync(); } });
    tl.to(word, { yPercent: -112, duration: .36, ease: 'power3.in' }, 0)
      .to('.hm__cap, #hm-part', { opacity: 0, duration: .25 }, 0)
      .add(() => { word.textContent = car; carName.textContent = name; partName.textContent = partText; main.href = `https://wa.me/5549991041665?text=${encodeURIComponent(`Olá, Atual Sucatas! Vim pelo site e tenho interesse em peças da sucata ${name}.\n\nPeça que preciso: `)}`; }, .36)
      .fromTo(word, { yPercent: 112 }, { yPercent: 0, duration: .8, ease }, .36)
      .to('.hm__cap, #hm-part', { opacity: 1, duration: .5 }, .55);
    imgs.forEach((im, i) => {
      boxes[i].append(im);
      tl.fromTo(im, { clipPath: WIPE[i], scale: 1.16 }, { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 1.15, ease: 'expo.inOut', clearProps: 'clipPath,transform' }, .1 + i * .1);
    });
  }
  const bar = gsap.fromTo('#hm-line', { scaleX: 0 }, { scaleX: 1, duration: 4.6, ease: 'none', paused: true, onComplete: swap });
  function holdSync() { bar.paused(hold.size > 0); }
  const hold1 = (why, on) => { hold[on ? 'add' : 'delete'](why); holdSync(); };
  const hm = $('#hm');
  hm.addEventListener('pointerenter', () => hold1('mouse', true));
  hm.addEventListener('pointerleave', () => hold1('mouse', false));
  hm.addEventListener('focusin', e => { if (e.target !== stop && e.target.matches(':focus-visible')) hold1('focus', true); });
  hm.addEventListener('focusout', () => hold1('focus', false));
  ScrollTrigger.create({ trigger: hm, start: 'top bottom', end: 'bottom top', onToggle: t => hold1('fora', !t.isActive) });
  stop.hidden = false;
  stop.addEventListener('click', () => {
    const off = !hold.has('botao');
    hold1('botao', off);
    stop.setAttribute('aria-label', off ? 'Continuar fotos' : 'Pausar fotos');
    $('i', stop).className = `ph ph-${off ? 'play' : 'pause'}`;
  });
  [['b', -14], ['c', -8], ['a', -4], ['d', -2], ['e', -6]].forEach(([k, v]) => gsap.to(`.hm__c--${k}`, { yPercent: v, ease: 'none', scrollTrigger: { trigger: '.top', start: 'top top', end: 'bottom top', scrub: true } }));

  /* ---------- o menu some ao descer e volta ao subir ---------- */
  const nav = $('#nav');
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => nav.classList.toggle('is-hidden', s.direction === 1 && s.scroll() > 420 && $('#menu').hidden) });

  /* ---------- marcas: só um carrossel correndo, que acelera um pouco com a rolagem ---------- */
  const track = $('#bk-track');
  [...track.children].forEach(n => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.append(c); });
  const brands = gsap.to(track, { xPercent: -50, ease: 'none', duration: 60, repeat: -1 });
  ScrollTrigger.create({
    onUpdate: s => gsap.to(brands, { timeScale: 1 + Math.min(Math.abs(s.getVelocity()) / 400, 3), duration: .2, overwrite: true, onComplete: () => gsap.to(brands, { timeScale: 1, duration: 1.2 }) }),
  });

  /* ---------- fotos: a moldura abre e a imagem desliza devagar ---------- */
  $$('.pic').forEach(ph => {
    gsap.from(ph, { clipPath: 'inset(100% 0% 0% 0% round 14px)', duration: 1.3, ease: 'expo.inOut', clearProps: 'clipPath', scrollTrigger: { trigger: ph, start: 'top 86%', once: true } });
    gsap.fromTo($('img', ph), { scale: 1.14, yPercent: -3 }, { scale: 1.02, yPercent: 3, ease: 'none', scrollTrigger: { trigger: ph, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  gsap.to('.prov2__sm', { y: -70, ease: 'none', scrollTrigger: { trigger: '.prov2', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.to('.prov2__xs', { y: 46, ease: 'none', scrollTrigger: { trigger: '.prov2', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.prov2__tag', { x: -24, opacity: 0, duration: .9, ease, scrollTrigger: { trigger: '.prov2__media', start: 'top 70%', once: true } });

  /* ---------- grade de peças: cortina, foto assentando e texto subindo ---------- */
  gsap.set('.pc', { clipPath: 'inset(22% 0% 0% 0% round 18px)', opacity: 0, y: 40 });
  ScrollTrigger.batch('.pc', {
    start: 'top 90%', once: true,
    onEnter: els => {
      gsap.to(els, { clipPath: 'inset(0% 0% 0% 0% round 18px)', opacity: 1, y: 0, duration: 1.2, ease, stagger: .08, clearProps: 'clipPath,opacity' });
      gsap.fromTo(els.map(e => $('.pc__img img', e)).filter(Boolean), { scale: 1.3 }, { scale: 1, duration: 1.6, ease, stagger: .08, clearProps: 'transform' });
      gsap.from(els.map(e => $('.pc__body', e)), { y: 24, opacity: 0, duration: .9, ease, stagger: .08, delay: .25, clearProps: 'all' });
    },
  });

  /* ---------- de perto: as tiras sobem em sequência; mural corre com a rolagem ---------- */
  gsap.from('.dp', { clipPath: 'inset(100% 0% 0% 0% round 16px)', duration: 1.1, ease: 'expo.inOut', stagger: .07, clearProps: 'clipPath', scrollTrigger: { trigger: '.dps', start: 'top 84%', once: true } });
  $$('.wall__row').forEach((row, i) => gsap.fromTo(row, { xPercent: i ? -14 : 0 }, { xPercent: i ? 0 : -14, ease: 'none', scrollTrigger: { trigger: '.wall', start: 'top bottom', end: 'bottom top', scrub: .6 } }));

  /* ---------- cards inclinam com mola ---------- */
  if (fine) cards.forEach(c => {
    gsap.set(c, { transformPerspective: 1100 });
    const rx = gsap.quickTo(c, 'rotationX', { duration: .8, ease: 'elastic.out(1, .6)' }), ry = gsap.quickTo(c, 'rotationY', { duration: .8, ease: 'elastic.out(1, .6)' });
    c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(); rx((.5 - (e.clientY - r.top) / r.height) * 7); ry(((e.clientX - r.left) / r.width - .5) * 7); });
    c.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });

  /* ---------- blocos entram em sequência ---------- */
  ['.aud', '.prov2__list > div'].forEach(sel => {
    gsap.set(sel, { y: 34, opacity: 0 });
    ScrollTrigger.batch(sel, { start: 'top 90%', once: true, onEnter: els => gsap.to(els, { y: 0, opacity: 1, duration: .9, ease, stagger: .08, clearProps: 'transform,opacity' }) });
  });

  /* ---------- pátio: no computador, a rolagem vira um passeio de lado ---------- */
  gsap.matchMedia().add('(min-width: 901px)', () => {
    const sec = $('#patio'), row = $('#fleet'), cars = $$('.cc', row), line = $('#fleet-line'), count = $('#fleet-n');
    sec.classList.add('is-pin');
    const dist = () => row.scrollWidth - innerWidth;
    const ride = gsap.to(row, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: sec, start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: .6, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: s => { line.style.transform = `scaleX(${s.progress})`; count.textContent = Math.min(cars.length, 1 + Math.floor(s.progress * cars.length)); },
      },
    });
    cars.forEach(c => gsap.from(c, { opacity: .4, ease: 'none', scrollTrigger: { trigger: c, containerAnimation: ride, start: 'left 100%', end: 'left 68%', scrub: true } }));
    return () => sec.classList.remove('is-pin');
  });

  /* ---------- como comprar: a linha enche e cada passo acende ---------- */
  const flow = $('#flow'), items = $$('li', flow);
  ScrollTrigger.create({
    trigger: flow, start: 'top 78%', end: 'bottom 62%', scrub: .5,
    onUpdate: s => {
      flow.style.setProperty('--fill', s.progress);
      items.forEach((el, i) => el.classList.toggle('on', s.progress >= i / (items.length - 1) - .04));
    },
  });

  /* ---------- dúvidas: a resposta abre com altura animada ---------- */
  $$('.faq details').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) gsap.fromTo($('p', d), { height: 0, opacity: 0, overflow: 'hidden' }, { height: 'auto', opacity: 1, duration: .45, ease, clearProps: 'all', onComplete: () => ScrollTrigger.refresh() });
  }));

  addEventListener('load', () => ScrollTrigger.refresh());
})();
