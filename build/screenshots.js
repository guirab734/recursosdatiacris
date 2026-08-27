const { chromium } = require('playwright');
const fs=require('fs');
const OUT=process.env.OUT_DIR || '/tmp/tiacris-shots';
const alvo = process.argv[2] || 'desk';
fs.mkdirSync(OUT,{recursive:true});
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  const cfg = alvo === 'mob'
    ? { viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true }
    : { viewport:{width:1440,height:1000} };
  const p = await b.newPage(cfg);
  p.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
  p.on('requestfailed', r => errs.push('REQFAIL: '+r.url().split('/').pop()+' :: '+(r.failure()||{}).errorText));

  await p.goto('http://localhost:8099/index.html', { waitUntil:'domcontentloaded', timeout:30000 });
  // desliga o lazy para o screenshot e força o reveal
  await p.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager');
    document.querySelectorAll('.revelar').forEach(e => e.classList.add('visivel'));
  });
  await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{});
  await p.waitForTimeout(1500);

  const quebradas = await p.evaluate(() =>
    Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0)
         .map(i => (i.currentSrc||i.src).split('/').pop()));
  console.log('IMAGENS QUEBRADAS:', quebradas.length ? quebradas : 'nenhuma');

  await p.screenshot({ path: `${OUT}/${alvo}-hero.png` });
  await p.screenshot({ path: `${OUT}/${alvo}-full.png`, fullPage:true });
  if (alvo === 'desk') {
    for (const [sel,nome] of [['#recursos','sec-catalogo'],['.habilidades','sec-habilidades'],['#sobre','sec-sobre'],['#como-funciona','sec-passos'],['#escolas','sec-escolas'],['.cta-final','sec-cta']]) {
      const el = await p.$(sel); if (el) await el.screenshot({ path: `${OUT}/${nome}.png` }).catch(()=>{});
    }
  }
  console.log('OVERFLOW:', JSON.stringify(await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))));
  console.log(errs.length ? 'ERROS:\n'+errs.join('\n') : 'sem erros');
  await b.close();
})();
