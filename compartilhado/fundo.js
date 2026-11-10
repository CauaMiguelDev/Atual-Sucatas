/* Efeitos compartilhados do painel e do site. No site, o fundo é uma estrada 3D em WebGL (fim deste arquivo).
   gearSvg desenha a engrenagem do logo; faiscas(x, y) solta um estouro de faíscas nos
   momentos raros, como nota emitida ou pedido entregue. O canvas só trabalha durante o estouro. */
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.gearSvg = n => {
    const R = 100, r = 91, step = (Math.PI * 2) / n;
    const pt = (rad, a) => `${(Math.cos(a) * rad).toFixed(2)},${(Math.sin(a) * rad).toFixed(2)}`;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = i * step;
      d += `${i ? 'L' : 'M'}${pt(r, a)} L${pt(R, a + step * .18)} L${pt(R, a + step * .5)} L${pt(r, a + step * .68)} `;
    }
    return `<svg viewBox="-104 -104 208 208" fill="none" stroke="currentColor" stroke-width=".7" aria-hidden="true"><path d="${d}Z"/><circle r="74"/><circle r="70" stroke-dasharray="2 6"/><circle r="30"/></svg>`;
  };

  let ctx, w, h, burst = [], running = false;
  function canvas() {
    if (ctx) return;
    const layer = document.createElement('div');
    layer.className = 'fundo';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<canvas></canvas>';
    document.body.append(layer);
    const c = layer.firstChild;
    ctx = c.getContext('2d');
    const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    addEventListener('resize', size);
    size();
  }
  function frame() {
    ctx.clearRect(0, 0, w, h);
    burst = burst.filter(p => p.life > 0);
    for (const p of burst) {
      p.vy += .16; p.x += p.vx; p.y += p.vy; p.life -= .018;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = '#ff6a5a';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.29); ctx.fill();
    }
    if (burst.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, w, h); }
  }
  window.faiscas = (x, y, n = 34) => {
    if (reduce) return;
    canvas();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 3 + Math.random() * 7;
      burst.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1 + Math.random() * 2, life: .7 + Math.random() * .3 });
    }
    if (!running) { running = true; requestAnimationFrame(frame); }
  };

  /* ---------- fundo do site: estrada à noite em 3D ----------
     Dois desenhos por quadro: as luzes (faixas instanciadas) e os morros (pontos). Toda a animação roda
     na placa de vídeo; o JS só passa o tempo, o mouse e a rolagem. Se o aparelho não aguentar, a qualidade
     cai sozinha e, no limite, a cena congela. Sem WebGL ou com movimento reduzido, fica o fundo em CSS. */
  const box = document.querySelector('.amb');
  const gl = box && !reduce && document.createElement('canvas').getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return;
  const cv = gl.canvas, glow = document.createElement('b'), coarse = matchMedia('(pointer: coarse)').matches;
  box.append(glow, cv);

  const COMMON = `#version 300 es
    precision highp float;
    uniform float uT, uAsp, uLift, uHz, uGain, uPx;
    uniform vec2 uCam;
    const float ZF = 240.;
    vec2 curve(float z) { return vec2(sin(z * .017) * 11. + sin(z * .0063 + 1.3) * 19., sin(z * .012) * 1.4); }
    vec2 proj(float x, float y, float z) {
      vec2 c = curve(z + uT) - curve(uT + 6.);
      return vec2((x + c.x - uCam.x) / uAsp, y + c.y - uCam.y - 1.6 - uLift) / z * 1.7 + vec2(0., uHz);
    }
    float fog(float z) { return smoothstep(ZF, ZF * .3, z) * smoothstep(1.5, 7., z); }`;
  const LIGHTS_V = COMMON + `
    in vec2 aS; in vec4 aI; in vec4 aC;
    out vec3 vC; out float vY;
    void main() {
      float s = aS.x, z = mod(aI.y + uT * aI.z, ZF) + aI.w * s * s + 1.5;
      vec2 a = proj(aI.x, 0., z), d = (proj(aI.x, 0., z + 1. + z * .02) - a) * vec2(uAsp, 1.);
      vec2 n = normalize(vec2(-d.y, d.x)) / vec2(uAsp, 1.);
      gl_Position = vec4(a + n * max(aC.a * 1.7 / z, uPx) * aS.y, 0., 1.);
      vC = aC.rgb * fog(z) * smoothstep(5., 24., z) * (aI.w > 100. ? 1. : pow(1. - s, 1.3)) * uGain;
      vY = aS.y;
    }`;
  const LIGHTS_F = `#version 300 es
    precision mediump float;
    in vec3 vC; in float vY; out vec4 o;
    void main() { vec3 c = vC * exp(-vY * vY * 2.6); o = vec4(c, max(c.r, c.g) * .6); }`;
  const HILLS_V = COMMON + `
    in vec2 aG;
    out vec3 vC;
    void main() {
      float z = mod(aG.y * ZF - uT, ZF) + 2., x = sign(aG.x) * (9. + aG.x * aG.x * 74.), w = z + uT;
      float k = (sin(x * .11 + w * .045) + .6 * sin(x * .23 - w * .09) + .35 * sin(x * .5 + w * .17) + 1.);
      float h = k * smoothstep(9., 42., abs(x)) * 9.5;
      gl_Position = vec4(proj(x, h, z), 0., 1.);
      gl_PointSize = clamp(uPx * 1500. / z, 1.2, 3.6);
      vC = mix(vec3(.5, .54, .62), vec3(1., .22, .24), smoothstep(6., 18., h)) * fog(z) * smoothstep(2., 12., z) * 1.15 * uGain;
    }`;
  const HILLS_F = `#version 300 es
    precision mediump float;
    in vec3 vC; out vec4 o;
    void main() { o = vec4(vC, max(vC.r, vC.g) * .6); }`;

  const program = (v, f) => {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, v], [gl.FRAGMENT_SHADER, f]].forEach(([t, src]) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(p, sh); });
    gl.linkProgram(p);
    return p;
  };
  const attrib = (p, name, data, size, div = 0, stride = 0, offset = 0) => {
    const at = gl.getAttribLocation(p, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(at, div);
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const inst = [], cols = [];
  const add = (x, phase, rate, len, c, w) => { inst.push(x, phase, rate, len); cols.push(...c, w); };
  const RED = [1, .1, .13], WARM = [1, .92, .8], STEEL = [.36, .39, .46];
  for (let i = 0; i < 46; i++) {
    const lane = i % 2 ? 1.9 : 4.9, phase = rnd(0, 240), rate = rnd(.2, .42), len = rnd(5, 15);
    add(lane - .42, phase, rate, len, RED, .09); add(lane + .42, phase, rate, len, RED, .09);
  }
  for (let i = 0; i < 40; i++) {
    const lane = i % 2 ? -1.9 : -4.9, phase = rnd(0, 240), rate = -rnd(1.5, 1.95), len = rnd(7, 18);
    add(lane - .42, phase, rate, len, WARM, .1); add(lane + .42, phase, rate, len, WARM, .1);
  }
  for (let i = 0; i < 30; i++) add(0, i * 8, -1, 3, STEEL, .05);
  add(-7, 0, 0, 240, STEEL, .07); add(7, 0, 0, 240, STEEL, .07);

  const lights = program(LIGHTS_V, LIGHTS_F), lightsVao = gl.createVertexArray();
  const SEG = 20, strip = [];
  for (let i = 0; i <= SEG; i++) strip.push(i / SEG, -1, i / SEG, 1);
  gl.bindVertexArray(lightsVao);
  attrib(lights, 'aS', new Float32Array(strip), 2);
  attrib(lights, 'aI', new Float32Array(inst), 4, 1);
  attrib(lights, 'aC', new Float32Array(cols), 4, 1);

  const COLS = coarse ? 70 : 120, ROWS = coarse ? 60 : 88, grid = [];
  for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) grid.push(((x + .5) / COLS) * 2 - 1, z / ROWS);
  const hills = program(HILLS_V, HILLS_F), hillsVao = gl.createVertexArray();
  gl.bindVertexArray(hillsVao);
  attrib(hills, 'aG', new Float32Array(grid), 2);

  const names = ['uT', 'uAsp', 'uLift', 'uHz', 'uGain', 'uPx', 'uCam'];
  const U = new Map([lights, hills].map(p => [p, Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]))]));
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(0, 0, 0, 0);

  let scale = coarse ? .8 : 1, minGap = coarse ? 30 : 15, level = 0, px = 0;
  const size = () => {
    const r = Math.min(devicePixelRatio || 1, 1.25) * scale;
    cv.width = innerWidth * r; cv.height = innerHeight * r;
    gl.viewport(0, 0, cv.width, cv.height);
    px = 1.4 / cv.height;
  };
  addEventListener('resize', size);
  size();

  let T = 0, last = 0, lastY = scrollY, boost = 0, lift = 0, hz = .1, gain = 1, mx = 0, my = 0, cx = 0, cy = 0, frames = 0, since = 0, raf = 0;
  if (!coarse) addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });
  document.addEventListener('visibilitychange', () => { frames = 0; last = 0; });
  cv.addEventListener('webglcontextlost', () => { cancelAnimationFrame(raf); cv.remove(); });

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (now - last < minGap) return;
    const gap = now - last, dt = last ? Math.min(gap / 1000, .05) : .016;
    last = now;
    /* a cena sobe e acelera com a rolagem; depois do topo, as luzes ficam mais baixas para o texto respirar */
    const y = scrollY, p = Math.min(y / (innerHeight * 3), 1);
    boost += (Math.min(Math.abs(y - lastY) * .05, 3) - boost) * .08;
    lastY = y;
    T += dt * 15 * (1 + boost);
    lift += (p * 3.4 - lift) * .06;
    hz += (.1 + p * .58 - hz) * .06;
    gain += (1 - Math.min(y / innerHeight, 1) * .36 - gain) * .06;
    cx += (mx * 3 - cx) * .05;
    cy += (-my * .9 - cy) * .05;
    glow.style.transform = `translate3d(0, ${(-hz * innerHeight / 2).toFixed(1)}px, 0)`;

    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const [prog, vao, run] of [[hills, hillsVao, () => gl.drawArrays(gl.POINTS, 0, COLS * ROWS)], [lights, lightsVao, () => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2, inst.length / 4)]]) {
      const u = U.get(prog);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform1f(u.uT, T); gl.uniform1f(u.uAsp, Math.max(innerWidth / innerHeight, .9)); gl.uniform1f(u.uLift, lift);
      gl.uniform1f(u.uHz, hz); gl.uniform1f(u.uGain, gain); gl.uniform1f(u.uPx, px); gl.uniform2f(u.uCam, cx, cy);
      run();
    }
    if (!frames) cv.classList.add('on');

    /* guarda de desempenho: a cada 60 quadros mede o ritmo real; primeiro baixa a resolução, depois congela.
       Intervalos enormes não contam: é o navegador segurando uma janela encoberta, não um aparelho lento. */
    if (gap > 500) frames = 0;
    if (!(frames++ % 60)) since = now;
    else if (frames % 60 === 59) {
      const avg = (now - since) / 58;
      if (level === 0 && avg > 30) { level = 1; scale *= .7; minGap = 30; size(); }
      else if (level === 1 && avg > 50) cancelAnimationFrame(raf);
    }
  }
  raf = requestAnimationFrame(draw);
})();
