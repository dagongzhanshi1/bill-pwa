# 轻记账 (Bill PWA)

一个本地优先的轻量级移动端记账 PWA 应用。

## 功能

- 记录支出：选择类别、金额、备注、日期
- 支出类别：餐饮 / App订阅 / 日用 / 交通 / 学习 / 游戏 / 娱乐活动 / AI / 电子产品及配件 / 家庭开销 / 人情世故 / 恋爱支出 / 医疗健体
- 支付账户：微信支付 / 支付宝 / 银行卡 / 亲情卡
- 折线图：显示最近 7 天支出趋势（含零支出日）
- 数据存在手机本地（localStorage），不上传任何服务器
- 支持添加到手机主屏幕（PWA），离线可用

## 使用方式

1. 打开 https://dagongzhanshi1.github.io/bill-pwa
2. 在浏览器中记账，或添加到手机主屏幕（iOS Safari → 分享按钮 → 添加到主屏幕）
3. 所有数据保存在手机本地，换浏览器/清缓存会丢失

## 项目结构

```
bill-pwa/
├── index.html       # 主页面（全部代码都在这里面）
├── manifest.json    # PWA 配置文件（应用名、图标、主题色）
├── sw.js            # Service Worker（离线缓存）
├── icon.svg         # 应用图标
├── icon.png         # 应用图标（PNG 格式）
└── README.md        # 本文件
```

## 数据存储

所有数据存在浏览器的 `localStorage` 中：
- key: `ledger_bills` — 全部账单记录（JSON 数组）
- key: `ledger_categories` — 支出类别列表
- key: `ledger_accounts` — 支付账户列表

**注意：** 数据完全本地化，换设备、清缓存、使用隐私模式都会丢失数据。建议定期从 Obsidian 的流水记录备份。

## 技术栈

- 纯前端：HTML + CSS + JavaScript（单页应用）
- PWA：manifest.json + Service Worker（离线支持）
- 数据：localStorage（本地存储）
- 部署：GitHub Pages

## 部署

推送到 GitHub 后自动部署到 GitHub Pages：

```bash
git push origin main
```

仓库设置中已启用 GitHub Pages（Source: main branch / root）。

## 相关链接

- 在线地址：https://dagongzhanshi1.github.io/bill-pwa
- GitHub 仓库：https://github.com/dagongzhanshi1/bill-pwa
- Obsidian 账单流水：本机 Obsidian → Projects/账单/流水

## 数据备份

PWA 的本地数据可以用脚本导入/导出。备份脚本在：
`~/Projects/账单/add_bill.py`（可将记录录入 Obsidian 流水）
