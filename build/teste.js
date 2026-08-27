const { chromium } = require('playwright');
const fs = require('fs');
const AXE = require.resolve('axe-core/axe.min.js');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let falhas = 0;
  const ok = (nome, cond, extra='') => { console.log((cond?'  OK  ':'  X   ')+nome+(extra?' :: '+extra:'')); if(!cond) falhas++; };

  for (const [rot, cfg] of [['DESKTOP',{viewport:{width:1440,height:1000}}],
                            ['MOBILE',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]) {
    console.log('\n===== '+rot+' =====');
    const p = await b.newPage(cfg);
    await p.goto('http://localhost:8099/index.html',{waitUntil:'networkidle',timeout:40000});
    await p.waitForTimeout(600);

    // --- axe ---
    await p.addScriptTag({ path: AXE });
    const r = await p.evaluate(async () =>
      await window.axe.run(document, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa'] } }));
    console.log(`axe: ${r.violations.length} violações`);
    r.violations.forEach(v => {
      console.log(`   [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}x)`);
      v.nodes.slice(0,3).forEach(n => console.log(`        ${n.target} | ${(n.failureSummary||'').split('\n')[1]||''}`));
      falhas++;
    });

    // --- filtros ---
    const total = await p.$$eval('.produto', e => e.length);
    ok('todos os produtos no DOM', total > 0, 'total='+total);
    // conta esperada por categoria, tirada do próprio DOM
    const porCat = await p.$$eval('.produto', els => {
      const m = {}; els.forEach(e => m[e.dataset.categoria] = (m[e.dataset.categoria]||0)+1); return m;
    });
    const primeira = Object.keys(porCat)[0];
    await p.click(`[data-filtro="${primeira}"]`);
    await p.waitForTimeout(250);
    const vis = await p.$$eval('.produto:not([hidden])', e => e.length);
    const txt = await p.textContent('#contagem-recursos');
    ok(`filtro "${primeira}" mostra ${porCat[primeira]}`, vis === porCat[primeira], `visíveis=${vis} texto="${txt.trim()}"`);
    ok('aria-pressed correto', await p.getAttribute(`[data-filtro="${primeira}"]`,'aria-pressed') === 'true'
       && await p.getAttribute('[data-filtro="Todos"]','aria-pressed') === 'false');
    ok('URL guarda o filtro', p.url().includes('habilidade='), p.url().split('?')[1]||'sem query');

    // toda categoria tem produtos (o bug do site original)
    const cats = await p.$$eval('.filtro:not([data-filtro="Todos"])', els => els.map(e=>e.dataset.filtro));
    for (const c of cats) {
      await p.click(`[data-filtro="${c}"]`); await p.waitForTimeout(120);
      const n = await p.$$eval('.produto:not([hidden])', e=>e.length);
      ok(`categoria "${c}" tem resultados`, n > 0, n+' itens');
    }
    await p.click('[data-filtro="Todos"]'); await p.waitForTimeout(150);
    ok('"Todos" restaura todos', await p.$$eval('.produto:not([hidden])',e=>e.length) === total);

    // --- menu mobile ---
    if (rot === 'MOBILE') {
      ok('menu começa fechado', !(await p.isVisible('#menu-principal')));
      await p.click('.botao-menu'); await p.waitForTimeout(250);
      ok('menu abre', await p.isVisible('#menu-principal'));
      ok('aria-expanded=true', await p.getAttribute('.botao-menu','aria-expanded') === 'true');
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      ok('Escape fecha o menu', !(await p.isVisible('#menu-principal')));
    }

    // --- alvos de toque >=24px (WCAG 2.2) ---
    const pequenos = await p.$$eval('a,button', els => els.filter(e=>{
      const r=e.getBoundingClientRect();
      return r.width>0 && (r.width<24||r.height<24);
    }).map(e=>({t:e.tagName,c:e.className&&e.className.toString().slice(0,30),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)})));
    ok('alvos de toque >= 24px', pequenos.length===0, JSON.stringify(pequenos));

    await p.close();
  }
  console.log('\n'+(falhas? `${falhas} PROBLEMA(S)` : 'TUDO PASSOU'));
  await b.close();
  process.exit(falhas?1:0);
})();
