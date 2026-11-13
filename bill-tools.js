(function(root){
  'use strict';
  const aliases=new Map();
  [
    ['金小悦','金小月','金晓月'],
    ['赵一鸣','赵一铭','赵一铭零食'],
    ['兰德力自助洗','兰德里自助洗','洗衣服'],
    ['食惠鲜简餐','食惠鲜','实惠鲜'],
    ['原麦田','源麦田'],
    ['台湾卤肉饭','台湾卤肉'],
    ['iCloud','iCloud续费'],
    ['Apple Music','Apple music'],
    ['ChatGPT Plus','ChatGPT plus','GPTplus续费'],
    ['DeepSeek API 充值','DeepSeekapi充值','DeepSeek API token'],
    ['网易云音乐','网易云'],
    ['OUO 加速器','ouo','ouo network','ouo加速器'],
    ['话费充值','话费'],
    ['早餐','早饭'],
    ['午饭','午餐'],
    ['电影票','电影','看电影'],
    ['电瓶车充电','电瓶车充电1','电瓶车充电2'],
    ['网鱼网吧','网鱼电竞','网吧'],
    ['盒马','超市盒马','盒马生鲜'],
    ['打车','滴滴打车','滴滴'],
    ['纸巾','餐巾纸'],
    ['夸克会员','夸克网盘svip'],
    ['鸭腿饭','鸭腿饭➕无糖可乐','鸭腿饭➕东方树叶'],
    ['茉莉花茶','茉莉清茶','茉莉花茶无糖'],
    ['嘉兴有轨电车','有轨电车']
  ].forEach(group=>group.forEach(alias=>aliases.set(alias.toLowerCase(),group[0])));
  function canonicalName(value){
    const name=String(value||'').trim();
    if(aliases.has(name.toLowerCase()))return aliases.get(name.toLowerCase());
    for(const brand of ['麦当劳','肯德基','蜜雪冰城','瑞幸','塔斯汀','华莱士','十足']){
      if(name.startsWith(brand))return brand;
    }
    if(/^校园卡充值（.+）$/.test(name))return '校园卡充值';
    if(name==='沙县'||name==='沙县鸭腿饭')return '沙县小吃';
    if(name.startsWith('滴滴打车'))return '打车';
    if(name.startsWith('打车'))return '打车';
    if(name.startsWith('顺风车'))return '顺风车';
    return name;
  }
  const nameKey=name=>canonicalName(name).toLocaleLowerCase();
  function normalizeRecords(records){
    return records.map(r=>{
      const name=canonicalName(r.name);
      if(name===r.name)return {...r};
      const originalName=r.originalName||r.name;
      const marker='原名称：'+r.name;
      const note=String(r.note||'');
      return {...r,name,originalName,note:note.includes(marker)?note:[note,marker].filter(Boolean).join('；')};
    });
  }
  function validDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
    const [y,m,d]=value.split('-').map(Number);
    const date=new Date(y,m-1,d);
    return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
  }
  function monthlyDate(month,day){
    const [y,m]=month.split('-').map(Number);
    const last=new Date(y,m,0).getDate();
    return month+'-'+String(Math.min(day,last)).padStart(2,'0');
  }
  function nextMonth(date,day){
    const [y,m]=date.split('-').map(Number);
    const month=m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');
    return monthlyDate(month,day);
  }
  function firstDue(start,day){
    const date=monthlyDate(start.slice(0,7),day);
    return date<start?nextMonth(date,day):date;
  }
  function validRule(r){
    return r&&typeof r.id==='string'&&r.id.length>0&&typeof r.name==='string'&&r.name.trim()&&
      Number.isFinite(r.amount)&&r.amount>0&&Number.isInteger(r.day)&&r.day>=1&&r.day<=31&&
      typeof r.category==='string'&&r.category.trim()&&typeof r.account==='string'&&r.account.trim()&&
      typeof r.enabled==='boolean'&&validDate(r.startDate)&&validDate(r.nextDate)&&r.nextDate>=r.startDate&&
      r.nextDate===monthlyDate(r.nextDate.slice(0,7),r.day);
  }
  function collectDue(rules,records,date){
    const result=records.slice(), updated=rules.map(r=>({...r}));
    const occurrences=new Set(records.filter(r=>r.recurringId).map(r=>r.recurringId+'|'+(r.recurringMonth||r.date.slice(0,7))));
    // Stable monthly IDs also prevent duplicates if saving the schedule failed after saving records.
    const ids=new Set(records.map(r=>r.id));
    for(const rule of updated){
      if(!validRule(rule)||!rule.enabled)continue;
      while(rule.nextDate<=date){
        const month=rule.nextDate.slice(0,7),key=rule.id+'|'+month,id='recurring:'+key;
        const entry={id,name:canonicalName(rule.name),amount:rule.amount,category:rule.category,account:rule.account,
          date:rule.nextDate,time:'00:00',note:rule.note||'',type:'expense',recurringId:rule.id,recurringMonth:month};
        // An already imported/manual bill on the due date counts as this month's payment too.
        const matching=result.some(r=>r.date===entry.date&&nameKey(r.name)===nameKey(entry.name)&&
          Number(r.amount)===entry.amount&&r.category===entry.category&&r.account===entry.account);
        if(!occurrences.has(key)&&!ids.has(id)&&!matching){result.unshift(entry);ids.add(id);occurrences.add(key)}
        rule.nextDate=nextMonth(rule.nextDate,rule.day);
      }
    }
    return {records:result,rules:updated,added:result.length-records.length};
  }
  function frequent(records){
    const groups=new Map();
    for(const r of records){
      if(!r.name||!r.category||!Number.isFinite(Number(r.amount))||Number(r.amount)<=0||r.type==='income')continue;
      const key=nameKey(r.name), stamp=(r.date||'')+' '+(r.time||'');
      let g=groups.get(key);
      if(!g){g={name:canonicalName(r.name),category:r.category,account:r.account||'',amount:Number(r.amount),count:0,total:0,last:''};groups.set(key,g)}
      g.count++;g.total+=Number(r.amount);
      if(stamp>g.last){Object.assign(g,{name:canonicalName(r.name),category:r.category,account:r.account||'',amount:Number(r.amount),last:stamp})}
    }
    return [...groups.values()].sort((a,b)=>b.count-a.count||b.last.localeCompare(a.last));
  }
  function mergeTemplates(templates){
    const groups=new Map();
    for(const item of templates){
      const key=nameKey(item.name),previous=groups.get(key);
      if(!previous){groups.set(key,{...item,name:canonicalName(item.name)});continue}
      const latest=String(item.last)>String(previous.last)?item:previous;
      groups.set(key,{...latest,name:canonicalName(latest.name),count:previous.count+item.count,
        total:Number(previous.total||0)+Number(item.total||0)});
    }
    return [...groups.values()];
  }
  function parseMarkdown(text){
    const records=[];
    for(const line of text.split(/\r?\n/)){
      if(!/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line))continue;
      const cells=line.split('|').slice(1,-1).map(s=>s.trim());
      if(cells.length!==7||!validDate(cells[0])||!cells[1]||!cells[3]||!cells[4]||!Number.isFinite(Number(cells[2]))||Number(cells[2])<=0)continue;
      records.push({date:cells[0],name:cells[1],amount:Number(cells[2]),category:cells[3],account:cells[4],time:cells[5]});
    }
    return records;
  }
  const api={nameKey,canonicalName,normalizeRecords,mergeTemplates,validDate,monthlyDate,nextMonth,firstDue,validRule,collectDue,frequent,parseMarkdown};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BillTools=api;
})(typeof globalThis==='object'?globalThis:this);
