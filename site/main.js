const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- open / closed now (store time, America/Sao_Paulo) ---------- */
(function openStatus() {
  const el = $('#open-status');
  if (!el) return;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const t = +parts.hour + +parts.minute / 60;
  const close = day >= 1 && day <= 5 ? 18 : day === 6 ? 12 : 0;
  const open = close && t >= 8 && t < close;
  let next;
  if (open) next = `fecha às ${close}h`;
  else if (close && t < 8) next = 'abre hoje às 8h';
  else if (day >= 1 && day <= 4) next = 'abre amanhã às 8h';
  else if (day === 5) next = 'abre sábado às 8h';
  else next = 'abre segunda às 8h';
  el.classList.toggle('is-open', open);
  $('span', el).innerHTML = `<b>${open ? 'Aberto agora' : 'Fechado agora'}</b> · ${next}`;
})();

/* ---------- nav ---------- */
const nav = $('#nav');
new IntersectionObserver(([e]) => nav.classList.toggle('is-scrolled', !e.isIntersecting)).observe($('#top-sentinel'));

const links = $$('.nav__links a');
const spy = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) links.forEach(a => a.classList.toggle('is-active', a.hash === `#${e.target.id}`));
}), { rootMargin: '-45% 0px -50% 0px' });
links.forEach(a => { const s = $(a.hash); if (s) spy.observe(s); });

const burger = $('#burger');
const menu = $('#menu');
function setMenu(open) {
  burger.setAttribute('aria-expanded', open);
  burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  menu.hidden = !open;
}
burger.addEventListener('click', () => setMenu(menu.hidden));
$$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', e => e.key === 'Escape' && !menu.hidden && setMenu(false));

/* ---------- gear rings, the logo's top arc (outline drawn from tooth count) ---------- */
$$('[data-gear]').forEach(el => {
  const n = +el.dataset.gear, R = 100, r = 91, step = (Math.PI * 2) / n;
  const pt = (rad, a) => `${(Math.cos(a) * rad).toFixed(2)},${(Math.sin(a) * rad).toFixed(2)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * step;
    d += `${i ? 'L' : 'M'}${pt(r, a)} L${pt(R, a + step * .18)} L${pt(R, a + step * .5)} L${pt(r, a + step * .68)} `;
  }
  el.innerHTML = `<svg viewBox="-104 -104 208 208" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
    <path d="${d}Z"/><circle r="74"/><circle r="70" stroke-dasharray="2 6"/><circle r="30"/></svg>`;
});

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- headings: wrap words so each rises out of its own mask (keeps the <em> highlight) ---------- */
$$('.split').forEach(el => {
  el.setAttribute('aria-label', el.textContent.trim());
  const words = [];
  el.childNodes.forEach(n => {
    const em = n.nodeName === 'EM';
    n.textContent.trim().split(/\s+/).filter(Boolean).forEach(w => words.push({ w, em }));
  });
  el.innerHTML = words
    .map(({ w, em }, i) => `<span class="w" aria-hidden="true"><span class="${em ? 'em' : ''}" style="--w:${i}">${w}</span></span>`).join(' ');
});

/* ---------- reveal on scroll ---------- */
$$('.reveal').forEach(el => {
  const group = $$(':scope > .reveal', el.parentElement);
  el.style.setProperty('--i', Math.min(group.indexOf(el), 8));
});
const reveal = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('is-in');
  reveal.unobserve(e.target);
}), { rootMargin: '0px 0px -10% 0px' });
$$('.reveal, .split, .reveal-clip').forEach(el => reveal.observe(el));

/* floating WhatsApp button appears once the hero CTA is out of view */
const heroCta = $('.hero__ctas');
if (heroCta) new IntersectionObserver(([e]) => $('#fab').classList.toggle('is-on', !e.isIntersecting && e.boundingClientRect.top < 0)).observe(heroCta);

/* ---------- buttons: fill starts where the cursor enters / leaves ---------- */
$$('.btn').forEach(btn => ['pointerenter', 'pointerleave'].forEach(type => btn.addEventListener(type, e => {
  const r = btn.getBoundingClientRect();
  btn.style.setProperty('--x', `${e.clientX - r.left}px`);
  btn.style.setProperty('--y', `${e.clientY - r.top}px`);
})));

/* ---------- pointer effects: card glow, background spotlight, hero depth ---------- */
if (finePointer && !reduceMotion) {
  $$('.spot').forEach(el => el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));

  const spot = $('#spot');
  let sx = 0, sy = 0, tx = 0, ty = 0, raf = 0;
  const follow = () => {
    sx += (tx - sx) * .12; sy += (ty - sy) * .12;
    spot.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
    raf = Math.abs(tx - sx) + Math.abs(ty - sy) > .5 ? requestAnimationFrame(follow) : 0;
  };
  addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY;
    if (!spot.classList.contains('is-on')) { sx = tx; sy = ty; spot.classList.add('is-on'); }
    if (!raf) raf = requestAnimationFrame(follow);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => spot.classList.remove('is-on'));

  const stage = $('.hero__stage');
  stage?.addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    stage.style.setProperty('--rx', `${(-py * 5).toFixed(2)}deg`);
    stage.style.setProperty('--ry', `${(px * 6).toFixed(2)}deg`);
    stage.style.setProperty('--px', px.toFixed(3));
    stage.style.setProperty('--py', py.toFixed(3));
  });
  stage?.addEventListener('pointerleave', () => ['--rx', '--ry', '--px', '--py'].forEach(p => stage.style.removeProperty(p)));
}

/* ---------- photos fade in once loaded ---------- */
$$('.car img, .annot img').forEach(img => {
  if (img.complete) return;
  img.classList.add('img-fade');
  const done = () => img.classList.add('is-loaded');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
});

/* ---------- shipping card: destination city rotates ---------- */
const city = $('#route-city');
if (city && !reduceMotion) {
  const cities = ['São Paulo - SP', 'Curitiba - PR', 'Porto Alegre - RS', 'Florianópolis - SC', 'Belo Horizonte - MG', 'Rio de Janeiro - RJ',
    'Goiânia - GO', 'Brasília - DF', 'Salvador - BA', 'Recife - PE', 'Manaus - AM', 'Belém - PA'];
  let n = 0;
  setInterval(() => {
    if (document.hidden) return;
    city.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-8px)', filter: 'blur(4px)' }],
      { duration: 260, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
      city.textContent = cities[n = (n + 1) % cities.length];
      city.animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 420, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
    });
  }, 2600);
}
if (reduceMotion) $('.route__map')?.pauseAnimations?.();

/* ---------- order tracking (customer side) ---------- */
const track = $('#track');
const trackInput = $('#track-code');
const trackResult = $('#track-result');

function openTrack(code) {
  setMenu(false);
  if (!track.open) track.showModal();
  if (code) { trackInput.value = code; renderTrack(code); }
  else trackInput.focus();
}
$$('[data-open-track]').forEach(b => b.addEventListener('click', () => openTrack()));
$('[data-close]', track).addEventListener('click', () => track.close());
track.addEventListener('click', e => { // click on backdrop
  if (e.target !== track) return;
  const r = track.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) track.close();
});

function renderTrack(code) {
  const o = findOrder(code);
  if (!o) {
    trackResult.innerHTML = `<p class="track__empty">Não encontramos nenhum pedido com o código <b>${esc(normCode(code))}</b>. Confira o código do pedido ou de rastreio ou fale com a gente no <a href="https://wa.me/${STORE_WHATS}" target="_blank" rel="noopener">WhatsApp</a>.</p>`;
    return;
  }
  const when = s => o.historico.find(h => h.status === s)?.data;
  const done = o.status === ORDER_STATUS.length - 1;
  trackResult.innerHTML = `
    <div class="track__head">
      <div><div class="track__code">${esc(o.codigo)}</div><div class="track__items">${o.itens.map(i => esc(i.desc)).join(', ')}</div></div>
      <span class="pill ${done ? 'pill--ok' : ''}">${esc(ORDER_STATUS[o.status])}</span>
    </div>
    <ol class="timeline">
      ${ORDER_STATUS.map((s, i) => `<li class="${i <= o.status ? 'done' : ''} ${i === o.status ? 'current' : ''}"><strong>${s}</strong>${i <= o.status ? `<small>${fmtDate(when(i))}</small>` : ''}</li>`).join('')}
    </ol>
    ${o.previsao && !done ? `<div class="track__ship">Previsão de entrega: <b>${o.previsao.split('-').reverse().join('/')}</b></div>` : ''}
    ${o.rastreio?.codigo ? `<div class="track__ship">${esc(o.rastreio.transportadora || 'Envio')}: <b>${esc(o.rastreio.codigo)}</b></div>` : ''}
    ${o.nf ? `<div class="track__ship">Nota fiscal nº <b>${o.nf.numero}</b>, emitida em ${fmtDate(o.nf.emitidaEm)}</div>` : ''}`;
}
$('#track-form').addEventListener('submit', e => { e.preventDefault(); renderTrack(trackInput.value); });
$('#track-inline')?.addEventListener('submit', e => { e.preventDefault(); openTrack($('#track-inline-code').value); });

// links sent to customers: /?pedido=AS-1022#rastrear opens the dialog filled in
const params = new URLSearchParams(location.search);
if (location.hash === '#rastrear' || params.has('pedido')) openTrack(params.get('pedido'));

$('#year').textContent = new Date().getFullYear();
