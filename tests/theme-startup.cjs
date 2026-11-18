const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!['index.html','bill-tools.js','manifest.json','icon.svg','icon.png'].includes(name)){res.writeHead(404).end();return}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.json')?'application/json':'text/html');
  res.end(fs.readFileSync(path.join(root,name)));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.argv[2]||'http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const palettes={berry:['#8A4963','#D38AA8'],ocean:['#356E88','#78AFC5'],ink:['#4C5D73','#9AA7B8'],forest:['#3F7A58','#3F7A58']};
    for(const [theme,colors] of Object.entries(palettes))for(const [index,colorScheme] of ['light','dark'].entries()){
      const context=await browser.newContext({colorScheme,serviceWorkers:'block',viewport:{width:390,height:844},reducedMotion:'reduce'});
      await context.addInitScript(theme=>{
        if(localStorage.getItem('ledger_theme')===null)localStorage.setItem('ledger_theme',theme);
        if(localStorage.getItem('ledger_records')===null)localStorage.setItem('ledger_records','[{"id":"preserved","name":"午饭","amount":20,"category":"餐饮","account":"微信支付","date":"2026-11-18","type":"expense"}]');
      },theme);
      const page=await context.newPage();let release,requested;
      const blocked=new Promise(resolve=>{requested=resolve});
      const gate=new Promise(resolve=>{release=resolve});
      await page.route('**/bill-tools.js',async route=>{requested();await gate;await route.continue()});
      try{
        await page.goto(url,{waitUntil:'commit'});
        await blocked;
        const before=await page.evaluate(()=>({primary:getComputedStyle(document.body).getPropertyValue('--primary').trim().toUpperCase(),
          theme:document.documentElement.dataset.theme,records:localStorage.getItem('ledger_records')}));
        assert.equal(before.primary,colors[index],theme+' '+colorScheme+' before app JS finishes');
        assert.equal(before.theme,theme);
        if(theme==='berry'&&colorScheme==='light')await page.screenshot({path:'/tmp/bill-theme-before-app.png'});
        release();await page.waitForLoadState('load');
        assert.equal(await page.evaluate(()=>document.body.dataset.theme),theme);
        assert.equal(await page.evaluate(()=>localStorage.getItem('ledger_records')),before.records);
        await page.evaluate(()=>applyTheme('ocean'));
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'ocean');
        assert.equal(await page.evaluate(()=>localStorage.getItem('ledger_theme')),'ocean');
        await page.reload();
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'ocean');
      }finally{release();await context.close()}
    }
    for(const saved of [null,'invalid-theme']){
      const context=await browser.newContext({serviceWorkers:'block'});
      if(saved)await context.addInitScript(value=>localStorage.setItem('ledger_theme',value),saved);
      const page=await context.newPage();await page.goto(url);
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'forest');await context.close();
    }
    console.log('PASS: all 4 themes x light/dark before delayed app script; theme switching/reload; existing records unchanged; missing/invalid theme fallback.');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1}).finally(()=>server.close());
