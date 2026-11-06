// Gera os prints da maquete com o Edge pelo playwright-core.
// Uso: NODE_PATH=<repo>/node_modules node ESPECS/maquete-v2/prints.cjs
const { chromium } = require('playwright-core');
const path = require('path');
const { pathToFileURL } = require('url');

const dir = __dirname;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const cel = ['inicio', 'agenda', 'servir', 'cultos', 'culto', ['culto-folha', 'culto', 'folha=1'], 'sugerir', 'primeiro-acesso', 'equipe'];
const jobs = [];
for (const t of cel) {
  const [nome, arq, qs] = Array.isArray(t) ? t : [t, t, ''];
  jobs.push({ nome: `cel-${nome}`, arq, qs, w: 390, h: 844 });
}
for (const t of ['inicio', 'cultos', ['culto-folha', 'culto', 'folha=1']]) {
  const [nome, arq, qs] = Array.isArray(t) ? t : [t, t, ''];
  jobs.push({ nome: `cel-${nome}-escuro`, arq, qs: [qs, 'tema=dark'].filter(Boolean).join('&'), w: 390, h: 844 });
}
for (const t of ['inicio', 'cultos']) jobs.push({ nome: `desk-${t}`, arq: t, qs: '', w: 1440, h: 900, desk: true });

(async () => {
  const b = await chromium.launch({ executablePath: edge, headless: true });
  let falhou = 0;
  for (const j of jobs) {
    const ctx = await b.newContext(j.desk
      ? { viewport: { width: j.w, height: j.h } }
      : { viewport: { width: j.w, height: j.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const url = pathToFileURL(path.join(dir, j.arq + '.html')).href + (j.qs ? '?' + j.qs : '');
    await p.goto(url);
    await p.waitForTimeout(300);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    const ok = sw <= j.w;
    if (!ok) falhou++;
    await p.screenshot({ path: path.join(dir, 'prints', j.nome + '.png') });
    console.log(`${ok ? 'ok ' : 'LARGO'} ${j.nome} scrollWidth=${sw}`);
    await ctx.close();
  }
  await b.close();
  process.exit(falhou ? 1 : 0);
})();
