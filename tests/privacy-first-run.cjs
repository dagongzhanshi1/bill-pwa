const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const url=process.argv[2];
if(!url)throw new Error('Usage: node tests/privacy-first-run.cjs <site-url>');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const first=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},reducedMotion:'reduce'});
    const second=await browser.newContext({serviceWorkers:'block'});
    const a=await first.newPage(),b=await second.newPage();
    await a.goto(url,{waitUntil:'load',timeout:60000});
    assert.deepEqual(await a.evaluate(()=>getRecords()),[]);
    assert.deepEqual(await a.evaluate(()=>commonBills()),[]);
    assert.deepEqual(await a.evaluate(()=>getRecurring()),[]);
    assert.equal(await a.evaluate(()=>localStorage.getItem('ledger_records')),null);
    await a.screenshot({path:'/tmp/bill-clean-online.png'});
    await a.evaluate(()=>{
      saveRecords([{id:'isolation-test',name:'测试支出',amount:1,category:'餐饮',account:'微信支付',date:'2026-11-18',type:'expense'}]);
    });
    await a.reload();
    assert.equal(await a.evaluate(()=>getRecords().length),1);
    await b.goto(url,{waitUntil:'load',timeout:60000});
    assert.deepEqual(await b.evaluate(()=>getRecords()),[]);
    assert.deepEqual(await b.evaluate(()=>commonBills()),[]);
    assert.equal(await b.evaluate(()=>localStorage.getItem('ledger_records')),null);
    console.log(JSON.stringify({url,freshBrowserRecords:0,freshBrowserCommonItems:0,
      firstBrowserRetainsOwnTestRecord:true,secondIndependentBrowserRecords:0,screenshot:'/tmp/bill-clean-online.png'}));
    await first.close();await second.close();
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
