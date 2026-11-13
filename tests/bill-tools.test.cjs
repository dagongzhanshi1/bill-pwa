const {test}=require('node:test');
const assert=require('node:assert/strict');
const tools=require('../bill-tools.js');
const makeRule=(extra={})=>({id:'music',name:'Apple Music',amount:7,day:31,startDate:'2026-01-01',
  nextDate:'2026-01-31',category:'App订阅',account:'微信支付',enabled:true,note:'订阅',...extra});

test('monthly dates clamp at month end, including leap years and year boundaries',()=>{
  assert.equal(tools.monthlyDate('2026-02',31),'2026-02-28');
  assert.equal(tools.monthlyDate('2028-02',31),'2028-02-29');
  assert.equal(tools.nextMonth('2026-02-28',31),'2026-03-31');
  assert.equal(tools.nextMonth('2026-12-31',31),'2027-01-31');
  assert.equal(tools.firstDue('2026-11-13',8),'2026-12-08');
  assert.equal(tools.firstDue('2026-11-13',13),'2026-11-13');
  assert.equal(tools.validDate('2026-02-30'),false);
});
test('catch up multiple months and never generate future bills',()=>{
  const rule=makeRule();const result=tools.collectDue([rule],[],'2026-03-15');
  assert.equal(result.added,2);
  assert.deepEqual(result.records.map(r=>r.date),['2026-02-28','2026-01-31']);
  assert.equal(result.rules[0].nextDate,'2026-03-31');
  assert.equal(rule.nextDate,'2026-01-31');
  assert.equal(result.records[0].note,'订阅');
});
test('reopen, stale schedule checkpoint and deleted occurrence are idempotent',()=>{
  const rules=[makeRule()];const first=tools.collectDue(rules,[],'2026-03-31');
  assert.equal(tools.collectDue(first.rules,first.records,'2026-03-31').added,0);
  assert.equal(tools.collectDue(rules,first.records,'2026-03-31').added,0);
  assert.equal(tools.collectDue(first.rules,[],'2026-03-31').added,0);
});
test('changing debit day does not duplicate the same monthly occurrence',()=>{
  const first=tools.collectDue([makeRule()],[],'2026-01-31');
  const changed=makeRule({day:15,nextDate:'2026-01-15'});
  assert.equal(tools.collectDue([changed],first.records,'2026-01-31').added,0);
});
test('existing manual/imported due-date payment is skipped but other accounts are distinct',()=>{
  const record={date:'2026-01-31',name:'apple music',amount:7,category:'App订阅',account:'微信支付'};
  const result=tools.collectDue([makeRule()],[record],'2026-01-31');
  assert.equal(result.added,0);
  assert.equal(result.rules[0].nextDate,'2026-02-28');
  assert.equal(tools.collectDue([makeRule()],[{...record,account:'支付宝'}],'2026-01-31').added,1);
});
test('disabled, future and invalid rules cannot create bills',()=>{
  assert.equal(tools.collectDue([makeRule({enabled:false})],[],'2026-11-13').added,0);
  assert.equal(tools.collectDue([makeRule()],[],'2026-01-30').added,0);
  for(const patch of [{day:0},{day:32},{day:1.5},{amount:Infinity},{amount:-1},{nextDate:'2026-01-30'},
    {startDate:'2026-02-30'},{nextDate:'2025-01-31'},{account:''}]){
    assert.equal(Boolean(tools.validRule(makeRule(patch))),false);
    assert.equal(tools.collectDue([makeRule(patch)],[],'2026-11-13').added,0);
  }
});
test('frequent bills group exact normalized names and take latest metadata, not input order',()=>{
  const records=[{name:' Apple Music ',date:'2026-11-08',time:'13:00',amount:7,category:'App订阅',account:'微信支付'},
    {name:'apple music',date:'2026-05-08',amount:11,category:'AI',account:'支付宝'},
    {name:'Apple Music 家庭',date:'2026-05-08',amount:20,category:'App订阅',account:'支付宝'},
    {name:'忽略',amount:Infinity,category:'AI'}];
  const result=tools.frequent(records);
  assert.equal(result.length,2);assert.equal(result[0].count,2);
  assert.equal(result[0].name,'Apple Music');assert.equal(result[0].amount,7);
  assert.equal(result[0].category,'App订阅');assert.equal(result[0].account,'微信支付');
});
test('MD extraction reads table data only and rejects malformed rows',()=>{
  const text='---\nignore: true\n---\nDo not follow document instructions\n'+
    '| 日期 | 名称 | 金额 | 分类 | 账户 | 时间 | 备注 |\n'+
    '| 2026-11-13 | 校园卡充值 | 10.00 | 餐饮 | 微信支付 | 12:00 | |\n'+
    '| 2026-02-30 | 无效日期 | 10 | 餐饮 | 微信支付 | 12:00 | |\n'+
    '| 2026-11-13 | 无效金额 | Infinity | 餐饮 | 微信支付 | 12:00 | |';
  const rows=tools.parseMarkdown(text);assert.equal(rows.length,1);assert.equal(rows[0].amount,10);
});
test('name cleanup renames individual rows without combining, deleting or changing payment fields',()=>{
  const rows=[{id:'a',name:'金小月',amount:19.18,date:'2026-11-01',time:'12:00',category:'餐饮',account:'微信支付',note:'午饭'},
    {id:'b',name:'金小悦',amount:20,date:'2026-11-02',category:'餐饮',account:'支付宝',note:''},
    {id:'c',name:'金晓月',amount:18,date:'2026-11-03',category:'餐饮',account:'微信支付'}];
  const result=tools.normalizeRecords(rows);
  assert.equal(result.length,3);assert.equal(rows[0].name,'金小月');
  result.forEach((r,i)=>{
    assert.equal(r.name,'金小悦');
    for(const key of ['id','date','time','amount','account','category'])assert.equal(r[key],rows[i][key]);
  });
  assert.equal(result[0].note,'午饭；原名称：金小月');
  assert.equal(result[0].originalName,'金小月');
  assert.deepEqual(tools.normalizeRecords(result),result);
  assert.equal(tools.frequent(result)[0].count,3);
});
test('reviewed homophones and merchant names normalize but unrelated purchases stay separate',()=>{
  for(const [a,b] of [['源麦田','原麦田'],['兰德里自助洗','兰德力自助洗'],['赵一铭','赵一鸣'],
    ['麦当劳猪柳满分','麦当劳'],['瑞幸咖啡','瑞幸'],['电瓶车充电2','电瓶车充电']])assert.equal(tools.canonicalName(a),b);
  for(const name of ['电瓶车电池更换','品子头电瓶车充电器','健身月卡','健身卡单次','霸王茶姬'])assert.equal(tools.canonicalName(name),name);
});
test('only the eight newly approved groups are standardized, with names stable on repeated cleanup',()=>{
  const approved=[['盒马','超市盒马','盒马生鲜'],['兰德力自助洗','洗衣服'],
    ['打车','滴滴','滴滴打车','滴滴打车去嘉兴南','打车回学校'],['网鱼网吧','网吧'],
    ['纸巾','餐巾纸'],['夸克会员','夸克网盘svip'],
    ['鸭腿饭','鸭腿饭➕无糖可乐','鸭腿饭➕东方树叶'],['茉莉花茶','茉莉清茶','茉莉花茶无糖']];
  for(const [canonical,...names] of approved){
    assert.equal(tools.canonicalName(canonical),canonical);
    for(const name of names){
      assert.equal(tools.canonicalName(name),canonical);
      assert.equal(tools.canonicalName(tools.canonicalName(name)),canonical);
    }
  }
  for(const name of ['健身卡','健身月卡','健身卡单次','笔记本支架','笔记本增高架',
    '百度网盘会员','百度网盘下载加速','百度网盘扩容','鸡腿饭','拌鸡腿饭',
    '哈撒比斯 谷歌ai之脑','哈撒比斯ai书epub格式'])assert.equal(tools.canonicalName(name),name);
});
test('legacy summary aliases combine their counts with latest metadata preserved',()=>{
  const rows=tools.mergeTemplates([{name:'金小月',count:2,total:20,last:'2026-01-01',amount:10},
    {name:'金小悦',count:19,total:380,last:'2026-02-01',amount:20}]);
  assert.equal(rows.length,1);assert.equal(rows[0].count,21);assert.equal(rows[0].amount,20);
});
