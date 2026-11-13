const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const fixture=process.env.BILL_TEST_MD;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return}
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':'text/html');res.end(data);
  });
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.clock.install({time:new Date('2026-11-13T12:00:00+08:00')});
    await page.addInitScript(()=>{
      if(localStorage.getItem('test-initialized'))return;
      localStorage.setItem('test-initialized','1');
      localStorage.setItem('ledger_categories',JSON.stringify(['餐饮','App订阅','自定义分类']));
      localStorage.setItem('ledger_accounts',JSON.stringify(['微信支付','自定义账户']));
      localStorage.setItem('ledger_records',JSON.stringify([
        {id:'old1',name:'校园卡充值',date:'2026-11-09',time:'12:00',amount:10,category:'餐饮',account:'微信支付',type:'expense'},
        {id:'old2',name:'校园卡充值',date:'2026-11-10',time:'12:00',amount:20,category:'餐饮',account:'自定义账户',type:'expense'}
      ]));
    });
    const url='http://127.0.0.1:'+server.address().port+'/';
    await page.goto(url);
    const records=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ledger_records')));
    assert.equal((await records()).length,2);
    assert.ok(await page.locator('#inpCategory').textContent().then(s=>s.includes('自定义分类')));
    await page.evaluate(()=>{
      localStorage.setItem('ledger_frequent_templates',JSON.stringify([{name:'校园卡充值',count:20,amount:10,category:'餐饮',account:'微信支付',last:'2026-11-01'}]));
      renderFrequentHome();
    });
    assert.equal(await page.locator('#frequentSection').isVisible(),true);
    await page.evaluate(()=>{
      const templates=getFrequentTemplates();templates[0].count=21;
      templates.push({name:'只记一次',count:1,amount:5,category:'餐饮',account:'微信支付',last:'2026-11-02'});
      localStorage.setItem('ledger_frequent_templates',JSON.stringify(templates));renderFrequentHome();
    });
    assert.equal(await page.locator('#frequentSection').isVisible(),true);
    assert.deepEqual(await page.evaluate(()=>commonBills().map(r=>r.count)),[21,1]);
    assert.equal(await page.locator('#frequentHomeList button').count(),2);
    await page.locator('#frequentHomeList button').first().click();
    assert.equal(await page.locator('#inpName').inputValue(),'校园卡充值');
    assert.equal(await page.locator('#inpAmount').inputValue(),'20.00');
    assert.equal(await page.locator('#inpAccount').inputValue(),'自定义账户');
    assert.equal((await records()).length,2);
    await page.locator('#inpAmount').fill('15');
    await page.locator('#page-home .btn-primary').click();
    assert.equal((await records()).length,3);
    assert.equal((await records())[0].amount,15);
    await page.evaluate(()=>switchTab('home'));
    await page.locator('#inpName').fill('校园卡充值');
    assert.equal(await page.locator('#inpCategory').inputValue(),'餐饮');
    assert.equal(await page.locator('#inpAccount').inputValue(),'自定义账户');

    await page.evaluate(()=>showFrequentManager());
    const input=page.locator('#frequentImportFile');
    const file=fixture||{name:'test.md',mimeType:'text/markdown',buffer:Buffer.from(
      '| 2026-11-01 | 洗澡充值 | 10 | 日用 | 微信支付 | 12:00 | |\n'+
      '| 2026-11-02 | 洗澡充值 | 20 | 日用 | 微信支付 | 12:00 | |')};
    await input.setInputFiles(file);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ledger_frequent_templates')||'[]').length>0);
    const summary=await page.evaluate(()=>localStorage.getItem('ledger_frequent_templates'));
    await input.setInputFiles(file);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>localStorage.getItem('ledger_frequent_templates')),summary);
    assert.equal((await records()).length,3);
    await page.screenshot({path:'/tmp/bill-frequent-mobile.png',fullPage:true});
    await page.evaluate(()=>closeFrequentModal());

    await page.evaluate(()=>showRecurringManager());
    await page.locator('#recurringName').fill('iCloud 续费');
    await page.locator('#recurringAmount').fill('6');
    await page.locator('#recurringDay').fill('13');
    await page.locator('#recurringStart').fill('2026-10-01');
    await page.locator('#recurringCategory').selectOption('App订阅');
    await page.locator('#recurringAccount').selectOption('微信支付');
    await page.locator('#recurringSave').click();
    assert.equal((await records()).length,3);
    await page.locator('#confirmDialog .btn-danger').click();
    assert.equal((await records()).length,5);
    let rules=await page.evaluate(()=>getRecurring());assert.equal(rules[0].nextDate,'2026-12-13');
    await page.evaluate(()=>checkRecurring());assert.equal((await records()).length,5);
    await page.screenshot({path:'/tmp/bill-recurring-mobile.png',fullPage:true});
    const ruleId=rules[0].id;
    await page.evaluate(id=>editRecurring(id),ruleId);
    await page.locator('#recurringAmount').fill('8');
    await page.locator('#recurringSave').click();
    assert.equal((await records()).length,5);
    assert.ok((await records()).filter(r=>r.recurringId).every(r=>r.amount===6));
    await page.evaluate(id=>toggleRecurring(id,false),ruleId);
    await page.clock.setSystemTime(new Date('2026-12-15T12:00:00+08:00'));
    await page.evaluate(()=>checkRecurring());assert.equal((await records()).length,5);
    await page.evaluate(id=>toggleRecurring(id,true),ruleId);
    rules=await page.evaluate(()=>getRecurring());assert.equal(rules[0].nextDate,'2027-01-13');
    await page.evaluate(()=>closeRecurringModal());
    await page.reload();assert.equal((await records()).length,5);

    const beforeCleanup=await records();
    await page.evaluate(()=>{
      const rows=getRecords();rows[0].name='金小月';saveRecords(rows);normalizeHistoricalNames();
    });
    await page.locator('#confirmDialog .btn-danger').click();
    const afterCleanup=await records();
    assert.equal(afterCleanup.length,5);assert.equal(afterCleanup[0].name,'金小悦');
    assert.equal(afterCleanup[0].originalName,'金小月');
    assert.equal(afterCleanup.reduce((s,r)=>s+r.amount,0),beforeCleanup.reduce((s,r)=>s+r.amount,0));
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ledger_before_name_cleanup')).records[0].name),'金小月');
    await page.evaluate(()=>{populateCategorySelects();editRecord(getRecords()[0].id);saveEdit()});
    assert.ok((await records())[0].note.includes('原名称：金小月'));
    const snapshot=await page.evaluate(()=>localStorage.getItem('ledger_before_name_cleanup'));
    await page.evaluate(()=>normalizeHistoricalNames());
    assert.equal(await page.evaluate(()=>localStorage.getItem('ledger_before_name_cleanup')),snapshot);

    const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>exportBackupJSON());
    const download=await downloadPromise;
    const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(backup.version,2);assert.equal(backup.recurring.length,1);assert.ok(backup.frequentTemplates.length);
    await page.evaluate(()=>{saveRecurring([]);localStorage.setItem('ledger_frequent_templates','[]');saveRecords([])});
    const restore=page.locator('#backupRestoreFile');
    await restore.setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.locator('#confirmDialog .btn-danger').click();
    assert.deepEqual(await records(),backup.records);
    assert.deepEqual(await page.evaluate(()=>getRecurring()),backup.recurring);
    assert.equal(await page.evaluate(()=>document.getElementById('backupStatus').classList.contains('warning')),false);
    const broken={...backup,recurring:[{...backup.recurring[0],day:32}]};
    await restore.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(broken))});
    assert.deepEqual(await records(),backup.records);
    await page.evaluate(()=>saveRecurring(getRecurring().map(r=>({...r,amount:9}))));
    await page.evaluate(()=>renderBackupStatus());
    assert.equal(await page.evaluate(()=>document.getElementById('backupStatus').classList.contains('warning')),true);

    for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1440,height:900}]){
      await page.setViewportSize(viewport);await page.evaluate(()=>switchTab('home'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:'/tmp/bill-home-'+viewport.width+'.png',fullPage:true});
    }
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload();
    assert.ok(await page.evaluate(()=>navigator.serviceWorker.controller));
    await context.setOffline(true);await page.reload();
    assert.equal(await page.title(),'轻记账');
    assert.equal(await page.evaluate(()=>typeof BillTools.collectDue),'function');
    assert.equal((await records()).length,5);
    await context.setOffline(false);
    const legacy={version:1,records:backup.records,categories:backup.categories,accounts:backup.accounts,shortcuts:[]};
    await restore.setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
    await page.locator('#confirmDialog .btn-danger').click();
    assert.deepEqual(await page.evaluate(()=>getRecurring()),[]);
    assert.deepEqual(await page.evaluate(()=>getFrequentTemplates()),[]);
    assert.deepEqual(errors,[]);
    console.log('PASS: preserved records/settings, all items sorted by frequency including single-use items, common fill/name recognition, MD idempotence, name cleanup with original names and pre-change backup, recurring catch-up/edit/pause/resume/reopen, JSON v1/v2/invalid restore, backup change detection, 320/390/1440 layouts, offline reopen.');
    await context.close();
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
