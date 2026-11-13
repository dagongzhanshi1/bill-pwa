const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const tools=require('../bill-tools.js');
const source=process.argv[2];
if(!source)throw new Error('Usage: node scripts/normalize-ledger.cjs <ledger.md> [output.md]');
const original=fs.readFileSync(source,'utf8');
const stem=source.replace(/\.md$/i,'');
const output=process.argv[3]||stem+'_名称整理版.md';
if(!/\.md$/i.test(output))throw new Error('Output must have a .md extension');
const report=process.argv[3]?output.replace(/\.md$/i,'_变更清单.md'):stem+'_名称整理清单.md';
if(fs.existsSync(output)||fs.existsSync(report))throw new Error('Output already exists; original and existing outputs were not changed');
const changes=new Map();
const cleaned=original.split('\n').map(line=>{
  if(!/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line))return line;
  const cells=line.split('|');
  if(cells.length!==9)throw new Error('Unexpected table row');
  const before=cells[2].trim(),after=tools.canonicalName(before);
  if(before===after)return line;
  const key=JSON.stringify([before,after]);changes.set(key,(changes.get(key)||0)+1);
  cells[2]=' '+after+' ';
  const note=cells[7].trim();cells[7]=' '+[note,'原名称：'+before].filter(Boolean).join('；')+' ';
  return cells.join('|');
}).join('\n');
const before=tools.parseMarkdown(original),after=tools.parseMarkdown(cleaned);
assert.ok(before.length>0);assert.equal(after.length,before.length);
const sum=rows=>rows.reduce((total,r)=>total+Math.round(r.amount*100),0);
assert.equal(sum(before),sum(after));
before.forEach((r,i)=>{
  for(const key of ['date','amount','category','account','time'])assert.equal(r[key],after[i][key]);
});
const count=[...changes.values()].reduce((a,b)=>a+b,0);
const frequent=tools.frequent(after).filter(r=>r.count>20);
let summary='# 账单名称整理清单\n\n'+
  '- 原文件保留不变：`'+path.basename(source)+'`\n'+
  '- 整理前后均为 '+before.length+' 笔；统一了 '+count+' 笔的名称，不删除、不合并任何账单。\n'+
  '- 金额、日期、时间、分类、账户均逐笔校验不变。原名称追加在该笔备注中。\n'+
  '- 同音写法统一；同商家的餐品按商家统一，不同商家不因类别相同而归并。\n'+
  '- 不要把此文件再次追加导入已有 Obsidian 流水，否则名称变化可能导致旧插件无法识别重复。\n\n'+
  '## 超过 20 次的常用项目\n\n| 名称 | 次数 |\n|---|---:|\n'+frequent.map(r=>'| '+r.name+' | '+r.count+' |').join('\n')+
  '\n\n## 名称变更明细\n\n| 原名称 | 统一名称 | 笔数 |\n|---|---|---:|\n'+
  [...changes].map(([key,n])=>{const [a,b]=JSON.parse(key);return '| '+a+' | '+b+' | '+n+' |'}).join('\n')+'\n';
fs.writeFileSync(output,cleaned,{flag:'wx'});
fs.writeFileSync(report,summary,{flag:'wx'});
console.log(JSON.stringify({source,output,report,records:before.length,renamed:count,totalCents:sum(after),frequent:frequent.map(r=>({name:r.name,count:r.count}))},null,2));
