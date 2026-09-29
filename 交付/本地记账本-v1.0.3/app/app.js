'use strict';

/* ================= 工具 ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
function pad2(n) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthKeyOf(dateStr) {
  const s = String(dateStr || '');
  const m = s.match(/^(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${pad2(Number(m[2]))}` : s.slice(0, 7);
}
function currentMonth() { return todayStr().slice(0, 7); }
function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number);
  return `${y}年${mo}月`;
}
function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function daysInMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
}
function dailyBudgetAvailable(m, remain) {
  if (remain == null) return null;
  const dim = Math.max(daysInMonth(m), 1);
  // 只有当前月才按“今天起剩余的天数”计算，其它月份按整月天数。
  if (m === currentMonth()) {
    return remain / Math.max(dim - Number(todayStr().slice(8, 10)) + 1, 1);
  }
  return remain / dim;
}
function isSameDay(a, b) { return a === b; }

function fmtMoney(n, opts = {}) {
  if (!Number.isFinite(n)) n = 0;
  const cur = state.data.settings.currency || '¥';
  const abs = Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let sign = '';
  if (n < 0) sign = '-';
  else if (opts.sign && n > 0) sign = '+';
  return `${sign}${cur}${abs}`;
}
function compactMoney(n) {
  if (!Number.isFinite(n)) n = 0;
  const cur = state.data.settings.currency || '¥';
  const neg = n < 0;
  const abs = Math.abs(n);
  let out;
  if (abs >= 100000000) out = (abs / 100000000).toFixed(1) + '亿';
  else if (abs >= 10000) out = (abs / 10000).toFixed(1) + '万';
  else out = Math.round(abs).toLocaleString('zh-CN');
  return (neg ? '-' : '') + cur + out;
}
function pct(a, b) { return b > 0 ? (a / b) * 100 : 0; }
function round2(n) { return Math.round(n * 100) / 100; }

function icon(name) {
  return `<svg class="ic" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}
function copyText(text) {
  return new Promise((resolve, reject) => {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        ok ? resolve(true) : reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => resolve(true)).catch(fallback);
    } else {
      fallback();
    }
  });
}

/* ================= 默认数据 ================= */
const EXPENSE_ICONS = ['coffee', 'car', 'bag', 'home', 'ticket', 'med', 'cap', 'gift', 'phone', 'laptop', 'paw', 'plane', 'dumbbell', 'box', 'dots'];
const INCOME_ICONS = ['banknote', 'star', 'trend', 'briefcase', 'envelope', 'refund', 'dots'];
const ACCOUNT_ICONS = ['cash', 'chat', 'wallet', 'card', 'credit', 'banknote'];
const PALETTE = ['#f97316', '#0ea5e9', '#ec4899', '#8b5cf6', '#f43f5e', '#ef4444', '#6366f1', '#f59e0b', '#06b6d4', '#3b82f6', '#a855f7', '#14b8a6', '#22c55e', '#10b981', '#64748b', '#94a3b8'];
const REIMBURSE_STATUSES = [
  { key: 'unreimbursed', label: '未报销' },
  { key: 'reimbursed', label: '已报销' },
  { key: 'invoiced', label: '已开票' }
];
function reimburseMeta(key) {
  return REIMBURSE_STATUSES.find((s) => s.key === key) || REIMBURSE_STATUSES[0];
}
function reimburseCls(key) {
  return key === 'reimbursed' ? 'badge-ok' : key === 'invoiced' ? 'badge-warn' : 'badge-neutral';
}
function nextReimburse(key) {
  const idx = REIMBURSE_STATUSES.findIndex((s) => s.key === key);
  return REIMBURSE_STATUSES[(idx + 1) % REIMBURSE_STATUSES.length].key;
}

function defaultCategories() {
  const defs = [
    ['餐饮', 'coffee', '#f97316', 'expense'], ['交通', 'car', '#0ea5e9', 'expense'],
    ['购物', 'bag', '#ec4899', 'expense'], ['居住', 'home', '#8b5cf6', 'expense'],
    ['娱乐', 'ticket', '#f43f5e', 'expense'], ['医疗', 'med', '#ef4444', 'expense'],
    ['教育', 'cap', '#6366f1', 'expense'], ['人情', 'gift', '#f59e0b', 'expense'],
    ['通讯', 'phone', '#06b6d4', 'expense'], ['数码', 'laptop', '#3b82f6', 'expense'],
    ['宠物', 'paw', '#a855f7', 'expense'], ['旅行', 'plane', '#14b8a6', 'expense'],
    ['运动', 'dumbbell', '#22c55e', 'expense'], ['日用', 'box', '#64748b', 'expense'],
    ['其他', 'dots', '#94a3b8', 'expense'],
    ['工资', 'banknote', '#10b981', 'income'], ['奖金', 'star', '#f59e0b', 'income'],
    ['理财', 'trend', '#0ea5e9', 'income'], ['兼职', 'briefcase', '#14b8a6', 'income'],
    ['红包', 'envelope', '#ef4444', 'income'], ['退款', 'refund', '#3b82f6', 'income'],
    ['其他收入', 'dots', '#64748b', 'income']
  ];
  return defs.map(([name, ic, color, type]) => ({
    id: uid(), name, icon: ic, color, type, budget: null, builtin: true
  }));
}
function defaultAccounts() {
  const defs = [
    ['现金', 'cash', '#10b981'], ['微信', 'chat', '#07c160'], ['支付宝', 'wallet', '#1677ff'],
    ['银行卡', 'card', '#6366f1'], ['信用卡', 'credit', '#f59e0b']
  ];
  return defs.map(([name, ic, color]) => ({
    id: uid(), name, icon: ic, color, initial: 0, builtin: true
  }));
}
function seedData() {
  return {
    version: 1,
    settings: { theme: 'auto', currency: '¥' },
    accounts: defaultAccounts(),
    categories: defaultCategories(),
    budgets: {},
    transactions: []
  };
}
function normalizeData(d) {
  d.version = d.version || 1;
  d.settings = Object.assign({ theme: 'auto', currency: '¥' }, d.settings || {});
  d.accounts = Array.isArray(d.accounts) ? d.accounts : [];
  d.categories = Array.isArray(d.categories) ? d.categories : [];
  d.budgets = d.budgets && typeof d.budgets === 'object' && !Array.isArray(d.budgets) ? d.budgets : {};
  d.transactions = Array.isArray(d.transactions) ? d.transactions : [];
  if (!d.accounts.length || !d.categories.length) {
    d.accounts = d.accounts.length ? d.accounts : defaultAccounts();
    d.categories = d.categories.length ? d.categories : defaultCategories();
  }

  // 清洗月度预算：丢弃非法值/负数，并把月份键统一为 YYYY-MM。
  const cleanBudgets = {};
  Object.entries(d.budgets).forEach(([k, v]) => {
    if (!k) return;
    const n = Number(v);
    if (!isFinite(n) || n < 0) return;
    cleanBudgets[monthKeyOf(k)] = round2(n);
  });
  d.budgets = cleanBudgets;

  // id 只保留安全字符（字母/数字/下划线/连字符），否则重新生成，
  // 避免非法 id 破坏 HTML 属性或导致编辑/删除定位错误。
  const cleanId = (v) => {
    const s = String(v == null ? '' : v);
    return /^[\w-]{1,80}$/.test(s) ? s : uid();
  };
  const cleanIcon = (v) => (typeof v === 'string' && /^[a-z0-9-]+$/i.test(v) ? v : 'dots');
  const cleanColor = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#64748b');

  const accIdMap = new Map();
  const catIdMap = new Map();
  d.accounts.forEach((a) => {
    if (!a || typeof a !== 'object') return;
    const newId = cleanId(a.id);
    if (a.id != null && a.id !== '') accIdMap.set(String(a.id), newId);
    a.id = newId;
    a.name = typeof a.name === 'string' ? a.name : '';
    a.icon = cleanIcon(a.icon);
    a.color = cleanColor(a.color);
    a.initial = Number(a.initial) || 0;
  });
  d.categories.forEach((c) => {
    if (!c || typeof c !== 'object') return;
    const newId = cleanId(c.id);
    if (c.id != null && c.id !== '') catIdMap.set(String(c.id), newId);
    c.id = newId;
    c.name = typeof c.name === 'string' ? c.name : '';
    c.icon = cleanIcon(c.icon);
    c.color = cleanColor(c.color);
    c.type = c.type === 'income' ? 'income' : 'expense';
    c.budget = c.budget == null ? null : Math.max(0, Number(c.budget) || 0);
  });
  d.transactions.forEach((t) => {
    if (!t || typeof t !== 'object') return;
    t.id = cleanId(t.id);
    t.amount = Number(t.amount) || 0;
    if (typeof t.date === 'string') {
      const m = t.date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      t.date = m ? `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}` : todayStr();
    } else {
      t.date = todayStr();
    }
    if (t.accountId != null && t.accountId !== '') t.accountId = accIdMap.get(String(t.accountId)) || t.accountId;
    if (t.categoryId != null && t.categoryId !== '') t.categoryId = catIdMap.get(String(t.categoryId)) || t.categoryId;
    if (t.type === 'transfer' && t.toAccountId != null && t.toAccountId !== '') t.toAccountId = accIdMap.get(String(t.toAccountId)) || t.toAccountId;
    if (['expense', 'income', 'transfer'].indexOf(t.type) < 0) t.type = 'expense';
    if (t.type === 'transfer') {
      t.categoryId = null;
      if (t.toAccountId == null) t.toAccountId = '';
      t.reimburse = null;
    } else {
      t.toAccountId = null;
      if (!t.categoryId) {
        const fallback = d.categories.find((c) => c.type === t.type) || d.categories[0];
        t.categoryId = fallback ? fallback.id : '';
      }
      t.reimburse = t.type === 'expense'
        ? (REIMBURSE_STATUSES.some((s) => s.key === t.reimburse) ? t.reimburse : 'unreimbursed')
        : null;
    }
  });
  return d;
}

/* ================= 存储 ================= */
const isElectron = !!(window.api && typeof window.api.loadData === 'function');

const idb = {
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('jizhang-local', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const rq = tx.objectStore('kv').get(key);
      rq.onsuccess = () => resolve(rq.result ?? null);
      rq.onerror = () => reject(rq.error);
    });
  },
  async set(key, val) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
};

async function loadData() {
  if (isElectron) return await window.api.loadData();
  try { return await idb.get('data'); } catch (e) { console.error(e); return null; }
}
async function saveData(data) {
  if (isElectron) return await window.api.saveData(data);
  await idb.set('data', data);
  return true;
}

async function exportDataFile() {
  if (isElectron) {
    const r = await window.api.exportData(state.data);
    if (r.canceled) return;
    if (r.ok) toast('备份已导出：' + r.path, 'success');
    else toast(r.error || '导出失败', 'error');
    return;
  }
  const stamp = todayStr().replace(/-/g, '');
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `记账备份-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('已开始下载备份文件', 'success');
}

function importDataFile() {
  if (isElectron) {
    window.api.importData().then((r) => {
      if (r.canceled) return;
      if (!r.ok) { toast(r.error || '导入失败', 'error'); return; }
      confirmModal({
        title: '合并导入',
        message: `备份中有 <b>${r.data.accounts?.length || 0}</b> 个账户、<b>${r.data.categories?.length || 0}</b> 个分类、<b>${r.data.transactions?.length || 0}</b> 笔记录。<br>将与现有数据合并（按编号去重、不覆盖已有数据，自动补齐缺失的月度预算）。`,
        okText: '合并导入', icon: 'upload'
      }).then((yes) => { if (yes) mergeImport(r.data); });
    });
    return;
  }
  const input = $('#file-input');
  input.onchange = () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data.transactions)) throw new Error('bad');
        confirmModal({
          title: '合并导入',
          message: `备份中有 <b>${data.transactions.length}</b> 笔记录，将与现有数据合并（按编号去重、不覆盖已有数据，自动补齐缺失的月度预算）。`,
          okText: '合并导入', icon: 'upload'
        }).then((yes) => { if (yes) mergeImport(data); });
      } catch {
        toast('文件格式不正确，无法导入', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function mergeImport(incoming) {
  const data = state.data;
  const seen = (arr) => new Set(arr.map((x) => x && x.id).filter((id) => id != null && id !== ''));
  const accSeen = seen(data.accounts);
  const catSeen = seen(data.categories);
  const txSeen = seen(data.transactions);

  // 记录缺失 id 时现场补一个，保证去重和后续编辑/删除能精确定位。
  const takeId = (obj) => {
    if (obj && (obj.id == null || obj.id === '')) obj.id = uid();
    return obj && obj.id;
  };

  let addedAccounts = 0;
  let addedCategories = 0;
  let addedTx = 0;
  (incoming.accounts || []).forEach((a) => {
    if (!a || typeof a !== 'object') return;
    const id = takeId(a);
    if (accSeen.has(id)) return;
    accSeen.add(id);
    data.accounts.push(a);
    addedAccounts++;
  });
  (incoming.categories || []).forEach((c) => {
    if (!c || typeof c !== 'object') return;
    const id = takeId(c);
    if (catSeen.has(id)) return;
    catSeen.add(id);
    data.categories.push(c);
    addedCategories++;
  });
  (incoming.transactions || []).forEach((t) => {
    if (!t || typeof t !== 'object') return;
    const id = takeId(t);
    if (txSeen.has(id)) return;
    txSeen.add(id);
    data.transactions.push(t);
    addedTx++;
  });

  // 月度预算：只补缺失的月份，不覆盖本机已有的预算。
  if (incoming.budgets && typeof incoming.budgets === 'object' && !Array.isArray(incoming.budgets)) {
    Object.entries(incoming.budgets).forEach(([m, v]) => {
      if (data.budgets[m] == null && v != null && v !== '') {
        data.budgets[m] = Math.max(0, Number(v) || 0);
      }
    });
  }
  // 设置：仅当本机仍是默认设置时恢复主题和货币，避免覆盖用户已改的偏好。
  if (incoming.settings && typeof incoming.settings === 'object') {
    const cur = data.settings;
    if (cur.theme === 'auto' && cur.currency === '¥') {
      if (['light', 'dark', 'auto'].includes(incoming.settings.theme)) cur.theme = incoming.settings.theme;
      if (typeof incoming.settings.currency === 'string' && incoming.settings.currency) cur.currency = incoming.settings.currency;
    }
  }

  normalizeData(data);
  persist().then(() => {
    render();
    applyTheme();
    const parts = [`新增 ${addedTx} 笔记录`];
    if (addedAccounts) parts.push(`${addedAccounts} 个账户`);
    if (addedCategories) parts.push(`${addedCategories} 个分类`);
    toast(`导入完成，${parts.join('、')}`, 'success');
  });
}

/* ================= 状态 ================= */
const state = {
  data: null,
  month: currentMonth(),
  view: 'school',
  lastView: null,
  filters: { type: 'all', category: 'all', account: 'all', q: '' },
  catTab: 'expense'
};

/* ================= 数据查询 ================= */
const catById = (id) => state.data.categories.find((c) => c.id === id);
const accById = (id) => state.data.accounts.find((a) => a.id === id);
const catsOfType = (type) => state.data.categories.filter((c) => c.type === type);

function txnsInMonth(m) {
  return state.data.transactions.filter((t) => monthKeyOf(t.date) === m);
}
function expenseOfMonth(m) {
  return round2(txnsInMonth(m).filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
}
function incomeOfMonth(m) {
  return round2(txnsInMonth(m).filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0));
}
function reimburseTotals() {
  const totals = { unreimbursed: 0, reimbursed: 0, invoiced: 0 };
  state.data.transactions.forEach((t) => {
    if (t.type !== 'expense') return;
    const key = REIMBURSE_STATUSES.some((s) => s.key === t.reimburse) ? t.reimburse : 'unreimbursed';
    totals[key] += t.amount;
  });
  Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });
  return totals;
}
function monthBudget(m) {
  const v = state.data.budgets[m];
  return v == null || v === '' ? null : Number(v);
}
function spendByCategory(m) {
  const map = {};
  txnsInMonth(m).forEach((t) => {
    if (t.type === 'expense') map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
  });
  return map;
}
function accountBalance(accId) {
  let bal = 0;
  const acc = accById(accId);
  if (!acc) return 0;
  bal += acc.initial || 0;
  state.data.transactions.forEach((t) => {
    if (t.type === 'transfer') {
      if (t.accountId === accId) bal -= t.amount;
      if (t.toAccountId === accId) bal += t.amount;
    } else if (t.accountId === accId) {
      bal += t.type === 'income' ? t.amount : -t.amount;
    }
  });
  return round2(bal);
}
function accountMonthFlow(accId, m) {
  let inFlow = 0, outFlow = 0;
  txnsInMonth(m).forEach((t) => {
    if (t.type === 'transfer') {
      if (t.toAccountId === accId) inFlow += t.amount;
      if (t.accountId === accId) outFlow += t.amount;
    } else if (t.accountId === accId) {
      if (t.type === 'income') inFlow += t.amount; else outFlow += t.amount;
    }
  });
  return { inFlow: round2(inFlow), outFlow: round2(outFlow) };
}
function totalAssets() {
  return round2(state.data.accounts.reduce((s, a) => s + accountBalance(a.id), 0));
}
function sortTx(a, b) {
  return a.date === b.date ? String(b.createdAt || '').localeCompare(String(a.createdAt || '')) : a.date < b.date ? 1 : -1;
}

/* ================= 图表 ================= */
function donutSVG(segments, size = 200, thickness = 27) {
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let circles = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--track)" stroke-width="${thickness}"/>`;
  if (total > 0) {
    let off = 0;
    segments.forEach((seg) => {
      if (seg.value <= 0) return;
      const len = (C * seg.value) / total;
      const dash = Math.max(len - 2.5, 0.5);
      circles += `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${seg.color}"
        stroke-width="${thickness}" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-off}" stroke-linecap="butt"/>`;
      off += len;
    });
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${circles}</svg>`;
}

function trendChartHTML(m) {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(m, -i));
  const data = months.map((mm) => ({ m: mm, label: monthLabel(mm), income: incomeOfMonth(mm), expense: expenseOfMonth(mm) }));
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const has = data.some((d) => d.income || d.expense);
  if (!has) return `<div class="chart-empty">暂无数据，记几笔后这里会出现趋势图</div>`;
    const groups = data.map((d) => `
    <div class="trend-group" title="${d.label}：收入 ${fmtMoney(d.income)} · 支出 ${fmtMoney(d.expense)}">
      <div class="trend-bars">
        <div class="tb income" style="height:${Math.max((d.income / max) * 100, 2)}%"><span class="tb-val">${d.income ? compactMoney(d.income) : ''}</span></div>
        <div class="tb expense" style="height:${Math.max((d.expense / max) * 100, 2)}%"><span class="tb-val">${d.expense ? compactMoney(d.expense) : ''}</span></div>
      </div>
      <div class="trend-label">${d.m.slice(2, 4)}/${d.m.slice(5, 7)}</div>
    </div>`).join('');
  return `<div class="trend-chart">${groups}</div>`;
}

function dailyChartHTML(m) {
  const dim = daysInMonth(m);
  const byDay = {};
  txnsInMonth(m).forEach((t) => {
    if (t.type !== 'expense') return;
    const day = Number(t.date.slice(8, 10));
    byDay[day] = (byDay[day] || 0) + t.amount;
  });
  const max = Math.max(1, ...Object.values(byDay));
  const cols = [];
  for (let d = 1; d <= dim; d++) {
    const v = byDay[d] || 0;
    const showLabel = d === 1 || d % 7 === 0 || d === dim;
    cols.push(`
      <div class="daily-col" title="${d}日：${fmtMoney(v)}">
        <div class="daily-bar-wrap">
          <div class="daily-bar ${v ? '' : 'zero'}" style="height:${Math.max((v / max) * 100, 3)}%"></div>
        </div>
        <div class="daily-label">${showLabel ? d : ''}</div>
      </div>`);
  }
  return `<div class="daily-chart">${cols.join('')}</div>`;
}

function catIconChip(cat, cls = '') {
  return `<span class="icon-chip ${cls}" style="background:${cat.color || '#94a3b8'}">${icon(cat.icon || 'dots')}</span>`;
}

function progressFill(p, color) {
  const clamped = Math.max(0, Math.min(100, p));
  return `<div class="bar-track"><div class="bar-fill" style="width:${clamped}%;background:${color}"></div></div>`;
}

/* ================= 总览 ================= */
function renderDashboard() {
  const m = state.month;
  const budget = monthBudget(m);
  const spent = expenseOfMonth(m);
  const income = incomeOfMonth(m);
  const prevSpent = expenseOfMonth(shiftMonth(m, -1));
  const remain = budget == null ? null : round2(budget - spent);
  const usage = budget ? pct(spent, budget) : 0;
  const balance = totalAssets();
  const daily = dailyBudgetAvailable(m, remain);

  let deltaHtml = '';
  if (prevSpent > 0) {
    const diff = pct(spent - prevSpent, prevSpent);
    const up = diff > 0.5;
    deltaHtml = `<span class="chip-tag ${up ? 'badge-warn' : 'badge-ok'}">${up ? '▲' : '▼'} ${Math.abs(diff).toFixed(0)}% 较上月</span>`;
  }

  let budgetHint = '';
  let budgetStatus = '';
  if (budget == null) {
    budgetHint = `<button class="text-btn" data-action="goto-budget">设置本月预算 →</button>`;
  } else if (usage >= 100) {
    budgetStatus = `<span class="chip-tag badge-over">已超支 ${fmtMoney(Math.abs(remain))}</span>`;
  } else if (usage >= 80) {
    budgetStatus = `<span class="chip-tag badge-warn">仅剩 ${fmtMoney(remain)}</span>`;
  } else if (daily != null) {
    budgetStatus = `<span>日均可用 ${fmtMoney(daily)}</span>`;
  }

  const remainTone = remain == null ? 'tone-neutral' : remain >= 0 ? 'tone-remain' : 'tone-danger';
  const remainValue = remain == null ? '未设置预算' : fmtMoney(remain);
  const remainHint = remain == null ? '设置预算后自动计算' : remain >= 0 ? '本月可用余额' : '超出预算，注意控制';

  const stats = `
    <div class="stats-row">
      <div class="stat-card tone-primary clickable" data-action="goto-budget">
        <div class="stat-top"><span class="stat-label">${icon('target')} 本月预算</span><span class="stat-chip" style="background:var(--primary-soft);color:var(--primary)">${icon('target')}</span></div>
        <div class="stat-value num">${budget == null ? '<span class="muted" style="font-size:18px">未设置</span>' : '<span class="cur">' + esc(state.data.settings.currency) + '</span>' + esc(Math.round(budget).toLocaleString('zh-CN'))}</div>
        ${budget != null ? `<div class="stat-bar">${progressFill(usage, usage >= 100 ? 'var(--danger)' : usage >= 80 ? 'var(--warn)' : 'linear-gradient(90deg,var(--primary),var(--primary-2))')}<div class="stat-bar-labels"><span>已用 ${Math.round(usage)}%</span><span>${esc(compactMoney(spent))}</span></div></div>${budgetStatus ? `<div class="stat-extra">${budgetStatus}</div>` : ''}` : `<div class="stat-extra">${budgetHint}</div>`}
      </div>
      <div class="stat-card tone-expense clickable" data-action="goto-tx">
        <div class="stat-top"><span class="stat-label">${icon('bag')} 已花费</span><span class="stat-chip" style="background:var(--expense-soft);color:var(--expense)">${icon('bag')}</span></div>
        <div class="stat-value num"><span class="cur">${esc(state.data.settings.currency)}</span>${esc(spent.toLocaleString('zh-CN', { minimumFractionDigits: 2 }))}</div>
        <div class="stat-extra">${deltaHtml || '本月累计支出'}</div>
      </div>
      <div class="stat-card ${remainTone} clickable" data-action="goto-budget">
        <div class="stat-top"><span class="stat-label">${icon('wallet')} 剩余</span><span class="stat-chip" style="background:${remain == null ? 'var(--track)' : remain >= 0 ? 'var(--income-soft)' : 'var(--danger-soft)'};color:${remain == null ? 'var(--faint)' : remain >= 0 ? 'var(--income)' : 'var(--danger)'}">${icon('wallet')}</span></div>
        <div class="stat-value num">${remain == null ? '<span class="muted" style="font-size:18px">—</span>' : '<span class="cur">' + esc(state.data.settings.currency) + '</span>' + (remain < 0 ? '-' : '') + esc(Math.abs(remain).toLocaleString('zh-CN', { minimumFractionDigits: 2 }))}</div>
        <div class="stat-extra">${remainHint}</div>
      </div>
      <div class="stat-card tone-income clickable" data-action="goto-tx">
        <div class="stat-top"><span class="stat-label">${icon('banknote')} 本月收入</span><span class="stat-chip" style="background:var(--income-soft);color:var(--income)">${icon('banknote')}</span></div>
        <div class="stat-value num"><span class="cur">${esc(state.data.settings.currency)}</span>${esc(income.toLocaleString('zh-CN', { minimumFractionDigits: 2 }))}</div>
        <div class="stat-extra"><span>结余 ${fmtMoney(round2(income - spent))}</span><span>·</span><span>总资产 ${compactMoney(balance)}</span></div>
      </div>
    </div>`;

  const byCat = spendByCategory(m);
  let segs = Object.entries(byCat)
    .map(([cid, v]) => ({ cat: catById(cid), value: v }))
    .filter((x) => x.cat && x.value > 0)
    .sort((a, b) => b.value - a.value);
  let others = null;
  if (segs.length > 7) {
    others = { cat: { name: '其他分类', color: '#94a3b8', icon: 'dots' }, value: round2(segs.slice(6).reduce((s, x) => s + x.value, 0)) };
    segs = segs.slice(0, 6).concat([others]);
  }
  const donutSegs = segs.map((x) => ({ value: x.value, color: x.cat.color }));
  const legend = segs.map((x) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${x.cat.color}"></span>
      <span class="legend-name">${esc(x.cat.name)}</span>
      <span class="legend-val num">${esc(compactMoney(x.value))}</span>
      <span class="faint" style="font-size:11.5px">${Math.round(pct(x.value, spent))}%</span>
    </div>`).join('');

  const topCats = Object.entries(byCat)
    .map(([cid, v]) => ({ cat: catById(cid), value: round2(v) }))
    .filter((x) => x.cat)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const catRows = topCats.length
    ? topCats.map((x) => {
        const lim = x.cat.budget;
        const over = lim != null && x.value > lim;
        return `
        <div class="cat-row">
          ${catIconChip(x.cat, 'sm')}
          <div class="cat-main">
            <div class="cat-row-top">
              <span class="cat-name">${esc(x.cat.name)}${over ? '<span class="chip-tag badge-over">超支</span>' : ''}</span>
              <span class="cat-amount num">${esc(fmtMoney(x.value))}<span class="cat-pct">${Math.round(pct(x.value, spent))}%</span></span>
            </div>
            ${progressFill(pct(x.value, spent), x.cat.color)}
            ${lim != null ? `<div class="cat-extra num">预算 ${compactMoney(lim)} · ${x.value > lim ? '超出 ' + fmtMoney(round2(x.value - lim)) : '剩余 ' + fmtMoney(round2(lim - x.value))}</div>` : ''}
          </div>
        </div>`;
      }).join('')
    : `<div class="empty"><span>${icon('coffee')}</span><div class="empty-title">本月还没有支出</div><div class="empty-sub">点击左下角「记一笔」开始记录</div></div>`;

  const recent = [...state.data.transactions].sort(sortTx).slice(0, 8);

  $('#view-root').innerHTML = `
    ${stats}
    <div class="dashboard-grid">
      <div class="dashboard-col">
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">${icon('chart')} 钱花在了哪里</div>
            <span class="panel-hint">${monthLabel(m)} · 支出 ${esc(fmtMoney(spent))}</span>
          </div>
          <div class="panel-body">
            <div class="donut-row">
              <div class="donut-wrap">
                ${donutSVG(donutSegs)}
                <div class="donut-center"><span class="dc-label">本月支出</span><span class="dc-value num">${esc(compactMoney(spent))}</span></div>
              </div>
              <div class="donut-legend">${legend || '<span class="faint" style="padding:4px 2px">暂无支出</span>'}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="dashboard-col">
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">${icon('list')} 最近交易</div>
            <button class="text-btn" data-action="goto-tx">查看全部</button>
          </div>
          <div class="tx-list">${recent.length ? recent.map(txItemHTML).join('') : `<div class="empty"><span>${icon('list')}</span><div class="empty-title">还没有任何记录</div><div class="empty-sub">记下第一笔吧</div></div>`}</div>
        </div>
        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">${icon('target')} 分类预算进度</div>
            <button class="text-btn" data-action="goto-budget">管理预算</button>
          </div>
          <div class="panel-body">${budgetListHTML(m)}</div>
        </div>
      </div>
    </div>`;
}

function budgetListHTML(m) {
  const byCat = spendByCategory(m);
  const withBudget = catsOfType('expense').filter((c) => c.budget != null && c.budget > 0);
  if (!withBudget.length) {
    return `<div class="empty" style="padding:24px"><span>${icon('target')}</span><div class="empty-title">还没有设置分类预算</div><div class="empty-sub">在「预算」页可为每个分类设置每月限额</div></div>`;
  }
  return withBudget
    .map((c) => {
      const spent = round2(byCat[c.id] || 0);
      const over = spent > c.budget;
      const p = pct(spent, c.budget);
      return `
      <div class="cat-row" style="padding-left:0;padding-right:0">
        ${catIconChip(c, 'sm')}
        <div class="cat-main">
          <div class="cat-row-top">
            <span class="cat-name">${esc(c.name)}${over ? '<span class="chip-tag badge-over">超支</span>' : p >= 80 ? '<span class="chip-tag badge-warn">接近上限</span>' : ''}</span>
            <span class="cat-amount num">${esc(compactMoney(spent))} <span class="cat-pct">/ ${esc(compactMoney(c.budget))}</span></span>
          </div>
          ${progressFill(p, over ? 'var(--danger)' : p >= 80 ? 'var(--warn)' : c.color)}
        </div>
      </div>`;
    }).join('');
}

function txItemHTML(t) {
  let chip, title, sub, amount, amountCls, badge = '';
  if (t.type === 'transfer') {
    const from = accById(t.accountId), to = accById(t.toAccountId);
    chip = `<span class="icon-chip sm" style="background:#818cf8">${icon('swap')}</span>`;
    title = `${esc(from ? from.name : '账户')} → ${esc(to ? to.name : '账户')}`;
    sub = `${esc(t.note || '转账')}`;
    amount = fmtMoney(t.amount);
    amountCls = 'transfer';
  } else {
    const cat = catById(t.categoryId);
    chip = catIconChip(cat || { name: '未分类', color: '#94a3b8', icon: 'dots' }, 'sm');
    title = esc(cat ? cat.name : '未分类') + (t.note ? ` · ${esc(t.note)}` : '');
    if (t.type === 'expense' && t.reimburse && t.reimburse !== 'unreimbursed') {
      const rb = reimburseMeta(t.reimburse);
      badge = `<button class="chip-tag reimb-badge ${reimburseCls(t.reimburse)}" data-action="cycle-reimburse" data-id="${t.id}" title="报销状态，点击切换">${esc(rb.label)}</button>`;
    }
    const acc = accById(t.accountId);
    sub = `${esc(acc ? acc.name : '账户')}`;
    amount = fmtMoney(t.amount, { sign: t.type === 'income' });
    amountCls = t.type;
  }
  return `
    <div class="tx-item clickable-row" data-action="edit-tx" data-id="${t.id}">
      ${chip}
      <div class="tx-main">
        <div class="tx-title">${title}${badge}</div>
        <div class="tx-sub">${esc(t.date)}${sub ? ' · ' + sub : ''}</div>
      </div>
      <div class="tx-amount ${amountCls} num">${amount}</div>
      <button class="tx-del" data-action="del-tx" data-id="${t.id}" title="删除">${icon('trash')}</button>
    </div>`;
}

/* ================= 明细 ================= */
function renderTransactions() {
  const m = state.month;
  const f = state.filters;

  const catOptions = () => {
    let cats;
    if (f.type === 'expense') cats = catsOfType('expense');
    else if (f.type === 'income') cats = catsOfType('income');
    else cats = state.data.categories;
    return cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  };

  $('#view-root').innerHTML = `
    <div class="filters">
      <div class="seg seg-expense" id="f-type">
        <button data-val="all" class="${f.type === 'all' ? 'active' : ''}">全部</button>
        <button data-val="expense" class="${f.type === 'expense' ? 'active' : ''}">支出</button>
        <button data-val="income" class="${f.type === 'income' ? 'active' : ''}">收入</button>
        <button data-val="transfer" class="${f.type === 'transfer' ? 'active' : ''}">转账</button>
      </div>
      ${f.type === 'transfer' ? '' : `<select id="f-category"><option value="all">全部分类</option>${catOptions()}</select>`}
      <select id="f-account"><option value="all">全部账户</option>${state.data.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
      <div class="search-box">
        ${icon('search')}
        <input id="f-q" placeholder="搜索备注 / 分类 / 金额…" value="${esc(f.q)}" />
      </div>
      <span class="spacer"></span>
      <button class="btn-ghost" data-action="add-tx">${icon('plus')} 记一笔</button>
    </div>
    <div class="summary-line" id="tx-summary"></div>
    <div id="tx-results"></div>
  `;

  $('#f-type').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.filters.type = btn.dataset.val;
    if (state.filters.type !== 'expense' && state.filters.type !== 'income') state.filters.category = 'all';
    renderTransactions();
  });
  $('#f-category') && $('#f-category').addEventListener('change', (e) => { state.filters.category = e.target.value; renderTransactions(); });
  $('#f-account').addEventListener('change', (e) => { state.filters.account = e.target.value; renderTransactions(); });
  $('#f-q').addEventListener('input', (e) => { state.filters.q = e.target.value; refreshTxResults(); });
  if (f.category !== 'all') {
    const sel = $('#f-category');
    if (sel) {
      const exists = Array.from(sel.options).some((o) => o.value === f.category);
      if (!exists) state.filters.category = 'all';
      else sel.value = f.category;
    }
  }
  if (f.account !== 'all') {
    const sel = $('#f-account');
    if (sel) {
      const exists = Array.from(sel.options).some((o) => o.value === f.account);
      if (!exists) state.filters.account = 'all';
      else sel.value = f.account;
    }
  }
  refreshTxResults();
}

function filteredTxList() {
  const f = state.filters;
  let list = txnsInMonth(state.month).sort(sortTx);
  if (f.type !== 'all') list = list.filter((t) => t.type === f.type);
  if (f.category !== 'all') list = list.filter((t) => t.categoryId === f.category);
  if (f.account !== 'all') list = list.filter((t) => t.accountId === f.account || t.toAccountId === f.account);
  if (f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    list = list.filter((t) => {
      const cat = catById(t.categoryId);
      const acc = accById(t.accountId);
      const to = accById(t.toAccountId);
      return [t.note, t.date, cat && cat.name, acc && acc.name, to && to.name, String(t.amount)]
        .some((s) => s && s.toLowerCase().includes(q));
    });
  }
  return list;
}

function refreshTxResults() {
  const list = filteredTxList();
  const expenseTotal = round2(list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  const incomeTotal = round2(list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0));
  const summary = $('#tx-summary');
  const results = $('#tx-results');
  if (!summary || !results) return;
  summary.innerHTML = `
    <span>共 <b>${list.length}</b> 笔</span>
    <span>支出 <b class="num" style="color:var(--expense)">${esc(fmtMoney(expenseTotal))}</b></span>
    <span>收入 <b class="num" style="color:var(--income)">${esc(fmtMoney(incomeTotal))}</b></span>`;
  results.innerHTML = list.length
    ? groupByDateHTML(list)
    : `<div class="panel"><div class="empty"><span>${icon('list')}</span><div class="empty-title">没有符合条件的记录</div><div class="empty-sub">换个筛选条件，或点击「记一笔」</div></div></div>`;
}

function groupByDateHTML(list) {
  const groups = new Map();
  list.forEach((t) => {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  });
  const today = todayStr();
  const yest = new Date(Date.now() - 86400000);
  const yestStr = `${yest.getFullYear()}-${pad2(yest.getMonth() + 1)}-${pad2(yest.getDate())}`;
  return Array.from(groups.entries()).map(([date, items]) => {
    const exp = round2(items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    const inc = round2(items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    const label = date === today ? '今天' : date === yestStr ? '昨天' : `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
    const cls = date === today ? ' tx-date-today' : '';
    return `
      <div class="tx-group">
        <div class="tx-group-head">
          <span class="tx-date${cls}">${label}</span>
          <span class="tx-day-sum num">${inc ? `收入 ${fmtMoney(inc)}` : ''}${inc && exp ? ' · ' : ''}${exp ? `支出 ${fmtMoney(exp)}` : ''}</span>
        </div>
        ${items.map(txItemHTML).join('')}
      </div>`;
  }).join('');
}

/* ================= 学校收支 ================= */
function schoolRowHTML(t) {
  const cat = catById(t.categoryId);
  const chip = catIconChip(cat || { name: '未分类', color: '#94a3b8', icon: 'dots' }, 'sm');
  const title = esc(cat ? cat.name : '未分类') + (t.note ? ` · ${esc(t.note)}` : '');
  const badge = t.type === 'expense'
    ? `<button class="chip-tag reimb-badge ${reimburseCls(t.reimburse)}" data-action="cycle-reimburse" data-id="${t.id}" title="点击切换报销状态">${esc(reimburseMeta(t.reimburse).label)}</button>`
    : '';
  return `
    <div class="tx-item clickable-row school-row" data-action="edit-tx" data-id="${t.id}">
      ${chip}
      <div class="tx-main">
        <div class="tx-title">${title}</div>
        <div class="tx-sub">${esc(t.date)}</div>
      </div>
      ${badge}
      <div class="tx-amount ${t.type} num">${fmtMoney(t.amount, { sign: t.type === 'income' })}</div>
    </div>`;
}

function renderSchool() {
  const list = state.data.transactions.filter((t) => t.type !== 'transfer').sort(sortTx);
  const incomeList = list.filter((t) => t.type === 'income');
  const expenseList = list.filter((t) => t.type === 'expense');
  const income = round2(incomeList.reduce((s, t) => s + t.amount, 0));
  const expense = round2(expenseList.reduce((s, t) => s + t.amount, 0));
  const balance = round2(income - expense);
  const totals = reimburseTotals();
  const pending = round2(expense - totals.reimbursed);

  const statusDot = (s) => `background:${s.key === 'reimbursed' ? 'var(--income)' : s.key === 'invoiced' ? 'var(--warn)' : 'var(--faint)'}`;
  const statusChips = REIMBURSE_STATUSES.map((s) => {
    const count = expenseList.filter((t) => (t.reimburse || 'unreimbursed') === s.key).length;
    return `
      <div class="reimb-chip">
        <span class="rc-label"><span class="legend-dot" style="${statusDot(s)}"></span>${esc(s.label)} · ${count} 笔</span>
        <span class="rc-val num">${esc(fmtMoney(totals[s.key]))}</span>
      </div>`;
  }).join('');

  const groups = REIMBURSE_STATUSES.map((s) => {
    const items = expenseList.filter((t) => (t.reimburse || 'unreimbursed') === s.key);
    if (!items.length) return '';
    return `
      <div class="school-group">
        <div class="school-group-head">
          <span class="sg-name"><span class="legend-dot" style="${statusDot(s)}"></span>${esc(s.label)}</span>
          <span class="num">${items.length} 笔 · ${esc(fmtMoney(totals[s.key]))}</span>
        </div>
        ${items.map(schoolRowHTML).join('')}
      </div>`;
  }).join('');

  $('#view-root').innerHTML = `
    <div class="stats-row">
      <div class="stat-card tone-income">
        <div class="stat-top"><span class="stat-label">${icon('banknote')} 收入合计</span></div>
        <div class="stat-value num"><span class="cur">${esc(state.data.settings.currency)}</span>${esc(income.toLocaleString('zh-CN', { minimumFractionDigits: 2 }))}</div>
        <div class="stat-extra">共 ${incomeList.length} 笔收入</div>
      </div>
      <div class="stat-card tone-expense">
        <div class="stat-top"><span class="stat-label">${icon('bag')} 支出合计</span></div>
        <div class="stat-value num"><span class="cur">${esc(state.data.settings.currency)}</span>${esc(expense.toLocaleString('zh-CN', { minimumFractionDigits: 2 }))}</div>
        <div class="stat-extra">共 ${expenseList.length} 笔支出</div>
      </div>
      <div class="stat-card ${balance >= 0 ? 'tone-remain' : 'tone-danger'}">
        <div class="stat-top"><span class="stat-label">${icon('wallet')} 结余</span></div>
        <div class="stat-value num">${esc(fmtMoney(balance))}</div>
        <div class="stat-extra">收入 − 支出</div>
      </div>
      <div class="stat-card tone-primary">
        <div class="stat-top"><span class="stat-label">${icon('alert')} 待报销</span></div>
        <div class="stat-value num">${esc(fmtMoney(pending))}</div>
        <div class="stat-extra">未报销 ${esc(fmtMoney(totals.unreimbursed))} + 已开票 ${esc(fmtMoney(totals.invoiced))}</div>
      </div>
    </div>
    <div class="reimb-strip">${statusChips}</div>
    <div class="panel school-section">
      <div class="panel-head">
        <div class="panel-title">${icon('banknote')} 收入明细</div>
        <span class="panel-hint">共 ${incomeList.length} 笔 · ${esc(fmtMoney(income))}</span>
        <button class="btn-ghost btn-sm" data-action="add-income">${icon('plus')} 记收入</button>
      </div>
      <div class="tx-list">${incomeList.length ? incomeList.map(schoolRowHTML).join('') : `<div class="empty"><span>${icon('banknote')}</span><div class="empty-title">还没有收入记录</div><div class="empty-sub">点击「记收入」添加第一笔</div></div>`}</div>
    </div>
    <div class="panel school-section">
      <div class="panel-head">
        <div class="panel-title">${icon('bag')} 支出明细</div>
        <span class="panel-hint">共 ${expenseList.length} 笔 · ${esc(fmtMoney(expense))}</span>
        <button class="btn-ghost btn-sm" data-action="add-expense">${icon('plus')} 记支出</button>
      </div>
      ${expenseList.length ? groups : `<div class="empty"><span>${icon('bag')}</span><div class="empty-title">还没有支出记录</div><div class="empty-sub">点击「记支出」添加第一笔</div></div>`}
      <div class="panel-body school-tip"><span class="faint" style="font-size:12px">${icon('info')} 点击记录可编辑；点击「未报销 / 已报销 / 已开票」标签可直接切换状态。</span></div>
    </div>`;
}

/* ================= 统计 ================= */
function renderStats() {
  const m = state.month;
  const income = incomeOfMonth(m);
  const expense = expenseOfMonth(m);
  const net = round2(income - expense);
  const count = txnsInMonth(m).length;

  const byCat = spendByCategory(m);
  const rank = Object.entries(byCat)
    .map(([cid, v]) => ({ cat: catById(cid), value: round2(v) }))
    .filter((x) => x.cat && x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const maxRank = rank.length ? rank[0].value : 1;

  $('#view-root').innerHTML = `
    <div class="stats-cards">
      <div class="panel mini-card"><div class="m-label">本月收入</div><div class="m-value num" style="color:var(--income)">${esc(fmtMoney(income))}</div></div>
      <div class="panel mini-card"><div class="m-label">本月支出</div><div class="m-value num" style="color:var(--expense)">${esc(fmtMoney(expense))}</div></div>
      <div class="panel mini-card"><div class="m-label">本月结余</div><div class="m-value num" style="color:${net >= 0 ? 'var(--income)' : 'var(--danger)'}">${esc(fmtMoney(net))}</div></div>
      <div class="panel mini-card"><div class="m-label">记账笔数</div><div class="m-value num">${count}</div></div>
    </div>
    <div class="stats-grid">
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('chart')} 近 6 个月收支</div>
          <div class="chart-legend">
            <span class="lg"><span class="legend-sq" style="background:#10b981"></span>收入</span>
            <span class="lg"><span class="legend-sq" style="background:#f97316"></span>支出</span>
          </div>
        </div>
        <div class="panel-body">${trendChartHTML(m)}</div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('calendar')} 每日支出</div>
          <span class="panel-hint">${monthLabel(m)}</span>
        </div>
        <div class="panel-body">${dailyChartHTML(m)}</div>
      </div>
    </div>
    <div class="stats-grid-2">
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('tags')} 支出分类排行</div>
          <span class="panel-hint">本月</span>
        </div>
        <div class="panel-body" style="padding-top:8px">
          ${rank.length ? rank.map((x, i) => `
            <div class="rank-row">
              <span class="rank-num">${i + 1}</span>
              ${catIconChip(x.cat, 'sm')}
              <div class="rank-main">
                <div class="rank-top"><span class="rank-name">${esc(x.cat.name)}</span><span class="rank-val num">${esc(fmtMoney(x.value))}</span></div>
                ${progressFill(pct(x.value, maxRank), x.cat.color)}
              </div>
            </div>`).join('') : `<div class="empty"><span>${icon('tags')}</span><div class="empty-title">本月暂无支出</div></div>`}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('info')} 本月概览</div>
        </div>
        <div class="panel-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="row-between"><span class="muted">总收入</span><b class="num" style="color:var(--income)">${esc(fmtMoney(income))}</b></div>
          <div class="row-between"><span class="muted">总支出</span><b class="num" style="color:var(--expense)">${esc(fmtMoney(expense))}</b></div>
          <div class="row-between"><span class="muted">结余</span><b class="num">${esc(fmtMoney(net))}</b></div>
          <div class="row-between"><span class="muted">日均支出</span><b class="num">${esc(fmtMoney(count ? round2(expense / Math.max(daysInMonth(m), 1)) : 0))}</b></div>
          <div class="row-between"><span class="muted">本月预算</span><b class="num">${monthBudget(m) == null ? '未设置' : esc(fmtMoney(monthBudget(m)))}</b></div>
          <div class="row-between"><span class="muted">总资产（全部账户）</span><b class="num">${esc(fmtMoney(totalAssets()))}</b></div>
        </div>
      </div>
    </div>`;
}

/* ================= 预算 ================= */
function renderBudget() {
  const m = state.month;
  const budget = monthBudget(m);
  const spent = expenseOfMonth(m);
  const income = incomeOfMonth(m);
  const remain = budget == null ? null : round2(budget - spent);
  const usage = budget ? pct(spent, budget) : 0;
  const daily = dailyBudgetAvailable(m, remain);

  const catRows = catsOfType('expense').map((c) => {
    const cSpent = round2(spendByCategory(m)[c.id] || 0);
    const lim = c.budget;
    const p = lim ? pct(cSpent, lim) : 0;
    const over = lim != null && cSpent > lim;
    return `
      <div class="budget-cat-row">
        ${catIconChip(c, 'sm')}
        <div class="cat-main">
          <div class="cat-row-top">
            <span class="cat-name">${esc(c.name)}${over ? '<span class="chip-tag badge-over">超支</span>' : p >= 80 ? '<span class="chip-tag badge-warn">接近上限</span>' : ''}</span>
            <span class="cat-amount num">${esc(compactMoney(cSpent))} <span class="cat-pct">${lim ? '/ ' + esc(compactMoney(lim)) : '· 未设预算'}</span></span>
          </div>
          ${lim ? progressFill(p, over ? 'var(--danger)' : p >= 80 ? 'var(--warn)' : c.color) : `<div class="bar-track" style="opacity:0.35"><div class="bar-fill" style="width:0%"></div></div>`}
        </div>
        <div class="field" style="margin:0">
          <input class="budget-input num" type="number" min="0" step="1" placeholder="每月限额"
            value="${lim == null ? '' : lim}" data-cat="${c.id}" />
        </div>
      </div>`;
  }).join('');

  $('#view-root').innerHTML = `
    <div class="budget-hero">
      <div class="bh-item"><div class="bh-label">本月预算</div><div class="bh-value num">${budget == null ? '未设置' : esc(fmtMoney(budget))}</div></div>
      <div class="bh-item"><div class="bh-label">已花费</div><div class="bh-value num">${esc(fmtMoney(spent))}</div></div>
      <div class="bh-item"><div class="bh-label">剩余</div><div class="bh-value num">${remain == null ? '—' : esc(fmtMoney(remain))}</div></div>
      <div class="bh-item"><div class="bh-label">日均可用</div><div class="bh-value num">${daily == null ? '—' : esc(fmtMoney(daily))}</div></div>
      <div class="bh-input">
        <input id="budget-amount" class="num" type="number" min="0" step="100" placeholder="输入预算金额" />
        <button class="btn-white" data-action="save-budget">保存</button>
        ${budget != null ? `<button class="btn-clear-budget" data-action="clear-budget">清除</button>` : ''}
      </div>
      <div class="bh-bar">
        ${budget != null ? progressFill(usage, '#fff') : ''}
        <div class="bh-bar-labels"><span>${budget != null ? '已使用 ' + Math.round(usage) + '%' : '设置预算后自动计算使用进度'}</span><span>本月收入 ${esc(fmtMoney(income))}</span></div>
      </div>
    </div>
    <div class="budget-layout">
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">${icon('target')} 分类预算</div>
          <span class="panel-hint">每月自动生效 · 留空表示不限制</span>
        </div>
        <div class="panel-body" style="padding-top:6px">${catRows}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">${icon('info')} 预算说明</div></div>
        <div class="panel-body" style="display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--muted);line-height:1.7">
          <p><b style="color:var(--text)">总预算</b>：按月设置，输入金额并点击保存。总览页会同步显示「预算 / 已花费 / 剩余」。</p>
          <p><b style="color:var(--text)">分类预算</b>：为某个分类设置每月限额后，它会<b>在每个月自动重复生效</b>，方便控制如餐饮、购物等开支。</p>
          <p><b style="color:var(--text)">超支提醒</b>：当月支出超过限额时，总览、预算页都会出现红色「超支」标记。</p>
          <p class="faint">提示：预算金额修改后立即自动保存，无需手动确认。</p>
        </div>
      </div>
    </div>`;

  $$('.budget-input', $('#view-root')).forEach((input) => {
    input.addEventListener('change', () => {
      const cat = catById(input.dataset.cat);
      const v = input.value.trim();
      cat.budget = v === '' ? null : Math.max(0, Number(v) || 0);
      persist().then(() => { renderBudget(); toast('分类预算已保存', 'success'); });
    });
  });
}

/* ================= 账户 ================= */
function renderAccounts() {
  const m = state.month;
  const cards = state.data.accounts.map((a) => {
    const bal = accountBalance(a.id);
    const flow = accountMonthFlow(a.id, m);
    const txCount = state.data.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
    return `
      <div class="panel account-card">
        <div class="acc-top">
          <span class="icon-chip" style="background:${a.color}">${icon(a.icon)}</span>
          <div>
            <div class="acc-name">${esc(a.name)}</div>
            <div class="acc-sub">共 ${txCount} 笔记录</div>
          </div>
          <div class="acc-actions">
            <button class="tx-del" data-action="edit-account" data-id="${a.id}" title="编辑" style="opacity:1">${icon('edit')}</button>
          </div>
        </div>
        <div class="acc-balance num">${esc(fmtMoney(bal))}</div>
        <div class="acc-stats"><span>本月</span><span class="in">收 ${esc(compactMoney(flow.inFlow))}</span><span class="out">支 ${esc(compactMoney(flow.outFlow))}</span></div>
      </div>`;
  }).join('');

  $('#view-root').innerHTML = `
    <div class="net-card">
      <div>
        <div class="net-label">净资产（全部账户余额合计）</div>
        <div class="net-value num">${esc(fmtMoney(totalAssets()))}</div>
      </div>
      <button class="btn-white" data-action="add-account" style="background:#fff;color:#0ea5e9;font-weight:700;padding:10px 16px;border-radius:11px">${icon('plus')} 新增账户</button>
    </div>
    <div class="accounts-grid">${cards}</div>`;
}

/* ================= 分类 ================= */
function renderCategories() {
  const tab = state.catTab;
  const chips = catsOfType(tab).map((c) => `
    <button class="cat-chip" data-action="edit-cat" data-id="${c.id}">
      ${catIconChip(c, 'sm')}
      <span style="min-width:0">
        <div class="cc-name">${esc(c.name)}</div>
        <div class="cc-meta">${tab === 'income' ? '收入分类' : (c.budget != null && c.budget > 0 ? '每月预算 ' + esc(compactMoney(c.budget)) : '未设预算')}</div>
      </span>
    </button>`).join('');

  $('#view-root').innerHTML = `
    <div class="filters">
      <div class="seg" id="cat-tab">
        <button data-val="expense" class="${tab === 'expense' ? 'active' : ''}">支出分类</button>
        <button data-val="income" class="${tab === 'income' ? 'active' : ''}">收入分类</button>
      </div>
      <span class="spacer"></span>
      <button class="btn-ghost" data-action="add-cat">${icon('plus')} 新增分类</button>
    </div>
    <div class="panel">
      <div class="cat-grid">
        ${chips}
        <button class="cat-chip add" data-action="add-cat">${icon('plus')} 新增分类</button>
      </div>
      <div class="panel-body" style="padding-top:0;border-top:1px solid var(--border);margin:0 20px;padding-left:0;padding-right:0">
        <span class="faint" style="font-size:12px">${icon('info')} 点击分类可修改名称、图标、颜色和每月预算；有交易记录的分类不能删除。</span>
      </div>
    </div>`;

  $('#cat-tab').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.catTab = btn.dataset.val;
    renderCategories();
  });
}

/* ================= 设置 ================= */
function renderSettings() {
  const s = state.data.settings;
  const infoHtml = isElectron
    ? `<div class="setting-info"><div class="setting-name">数据存储位置</div><div class="setting-desc mono" id="data-path">读取中…</div></div>`
    : `<div class="setting-info"><div class="setting-name">数据存储方式</div><div class="setting-desc">当前为网页备用版，数据保存在本机浏览器内置数据库中（不会上传网络）。建议定期使用「导出备份」。</div></div>`;

  $('#view-root').innerHTML = `
    <div class="settings-wrap">
      <div class="panel panel-pad">
        <div class="panel-title">${icon('sun')} 外观</div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">界面主题</div><div class="setting-desc">跟随系统会在昼夜切换时自动换肤</div></div>
          <div class="setting-control">
            <div class="seg" id="theme-seg">
              <button data-val="light" class="${s.theme === 'light' ? 'active' : ''}">浅色</button>
              <button data-val="dark" class="${s.theme === 'dark' ? 'active' : ''}">深色</button>
              <button data-val="auto" class="${s.theme === 'auto' ? 'active' : ''}">跟随系统</button>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">货币符号</div><div class="setting-desc">所有金额前显示的符号</div></div>
          <div class="setting-control">
            <select id="currency-select" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:7px 10px;outline:none">
              ${['¥', '$', '€', '£', 'HK$', 'NT$', '₩'].map((c) => `<option value="${c}" ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="panel panel-pad">
        <div class="panel-title">${icon('download')} 数据与备份</div>
        <div class="setting-row">
          ${infoHtml}
          <div class="setting-control"><button class="btn-ghost btn-sm" data-action="copy-path">复制路径</button></div>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">导出备份</div><div class="setting-desc">把全部数据保存为一个 JSON 文件，可用来迁移到新电脑</div></div>
          <div class="setting-control"><button class="btn-ghost" data-action="export-data">${icon('download')} 导出</button></div>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">导入 / 合并数据</div><div class="setting-desc">从备份文件恢复，按记录编号去重，不覆盖现有数据</div></div>
          <div class="setting-control"><button class="btn-ghost" data-action="import-data">${icon('upload')} 导入</button></div>
        </div>
        ${isElectron ? `<div class="setting-row"><div class="setting-info"><div class="setting-name">自动备份</div><div class="setting-desc">每次保存都会在本机备份目录保留最近 30 份历史副本，数据损坏时可找回</div></div><span class="chip-tag badge-ok">已开启</span></div>` : ''}
      </div>

      <div class="panel panel-pad danger-zone">
        <div class="panel-title">${icon('alert')} 危险操作</div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">清空所有数据</div><div class="setting-desc">删除全部账户、分类和交易记录，且无法撤销（建议先导出备份）</div></div>
          <div class="setting-control"><button class="btn-danger-soft" data-action="clear-data">${icon('trash')} 清空数据</button></div>
        </div>
      </div>

      <div class="panel panel-pad">
        <div class="panel-title">${icon('lock')} 关于</div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">本地记账本</div><div class="setting-desc" id="version-text">版本 1.0.0</div></div>
        </div>
        <div class="setting-row">
          <div class="setting-info"><div class="setting-name">隐私与离线</div><div class="setting-desc">软件完全离线运行，不联网、不注册、不上传任何数据。所有内容只保存在你自己的电脑上。</div></div>
        </div>
      </div>
    </div>`;

  $('#theme-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    s.theme = btn.dataset.val;
    applyTheme();
    persist();
    renderSettings();
  });
  $('#currency-select').addEventListener('change', (e) => {
    s.currency = e.target.value;
    persist().then(() => { renderSettings(); toast('货币符号已更新', 'success'); });
  });
  $('#data-path') && (window.api.getInfo().then((info) => {
    const el = $('#data-path');
    if (el) el.textContent = info.dataPath;
    el && (el.dataset.full = info.dataPath);
    const v = $('#version-text');
    if (v) v.textContent = '版本 ' + info.version;
  }));
}

/* ================= 弹窗 ================= */
let modalOpen = false;
let confirmResolver = null;
function openModal(html, cls = '') {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal-card ${cls}">${html}</div></div>`;
  modalOpen = true;
  const backdrop = $('.modal-backdrop', root);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeModal(); });
  $('.modal-close', root) && $('.modal-close', root).addEventListener('click', closeModal);
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  modalOpen = false;
}
function confirmModal({ title, message, okText = '确定', icon = 'info', danger = false }) {
  return new Promise((resolve) => {
    // 确认框作为独立叠加层，不再销毁底下的编辑弹窗；
    // 取消或点击遮罩时只移除确认框本身。
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop confirm-overlay';
    overlay.innerHTML = `
      <div class="modal-card narrow">
        <div class="modal-head"><div class="modal-title">${esc(title)}</div><button class="modal-close">${windowIcon('close')}</button></div>
        <div class="modal-body">
          <div class="confirm-icon ${danger ? 'danger' : 'info'}">${windowIcon(icon)}</div>
          <div class="confirm-text">${message}</div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" data-cancel>取消</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>
        </div>
      </div>`;
    $('#modal-root').appendChild(overlay);

    let finished = false;
    const done = (v) => {
      if (finished) return;
      finished = true;
      overlay.remove();
      confirmResolver = null;
      resolve(v);
    };
    confirmResolver = () => done(false);

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(false); });
    $('.modal-close', overlay).addEventListener('click', () => done(false));
    $('[data-ok]', overlay).addEventListener('click', () => done(true));
    $('[data-cancel]', overlay).addEventListener('click', () => done(false));
  });
}
function windowIcon(name) { return icon(name); }

function toast(msg, type = 'success', ms = 2400) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info')}<span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ================= 记账弹窗 ================= */
function txModal(existing, preset = null) {
  const editing = !!existing;
  const initialType = preset && ['expense', 'income', 'transfer'].includes(preset.type) ? preset.type : 'expense';
  const t = existing || {
    type: initialType,
    amount: '',
    categoryId: catsOfType(initialType === 'income' ? 'income' : 'expense')[0]?.id || '',
    accountId: state.data.accounts[0]?.id || '',
    toAccountId: state.data.accounts[1]?.id || state.data.accounts[0]?.id || '',
    date: todayStr(),
    note: '',
    reimburse: 'unreimbursed'
  };
  let form = { ...t };

  const accOptions = (selected) => state.data.accounts.map((a) =>
    `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}</option>`).join('');

  function draw() {
    const type = form.type;
    const cats = catsOfType(type === 'expense' ? 'expense' : 'income');
    const catGrid = type === 'transfer' ? '' : `
      <div class="field">
        <label>选择分类</label>
        <div class="cat-pick-grid">
          ${cats.map((c) => `
            <button type="button" class="cat-pick ${form.categoryId === c.id ? 'selected' : ''}" data-cat="${c.id}">
              ${catIconChip(c, 'sm')}
              <span class="cp-name">${esc(c.name)}</span>
            </button>`).join('')}
        </div>
      </div>`;
    const accountFields = type === 'transfer' ? `
      <div class="transfer-row">
        <div class="field"><label>转出账户</label><select id="tx-account">${accOptions(form.accountId)}</select></div>
        <button type="button" class="swap-btn" id="tx-swap" title="对调账户">${icon('swap')}</button>
        <div class="field"><label>转入账户</label><select id="tx-to-account">${accOptions(form.toAccountId)}</select></div>
      </div>` : `
      <div class="field">
        <label>${type === 'expense' ? '支出账户' : '收入账户'}</label>
        <select id="tx-account">${accOptions(form.accountId)}</select>
      </div>`;
    const reimburseField = type === 'expense' ? `
      <div class="field">
        <label>报销状态</label>
        <div class="type-seg" id="tx-reimburse">
          ${REIMBURSE_STATUSES.map((s) => `<button type="button" data-val="${s.key}" class="${(form.reimburse || 'unreimbursed') === s.key ? 'active' : ''}">${esc(s.label)}</button>`).join('')}
        </div>
      </div>` : '';

    openModal(`
      <div class="modal-head">
        <div class="modal-title">${editing ? '编辑记录' : '记一笔'}</div>
        <button class="modal-close">${icon('close')}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="type-seg" id="tx-type">
            <button data-val="expense" class="${type === 'expense' ? 'active expense' : ''}">支出</button>
            <button data-val="income" class="${type === 'income' ? 'active income' : ''}">收入</button>
            <button data-val="transfer" class="${type === 'transfer' ? 'active transfer' : ''}" ${state.data.accounts.length < 2 ? 'disabled title="转账需要至少两个账户"' : ''}>转账</button>
          </div>
          <div class="amount-box">
            <span class="cur">${esc(state.data.settings.currency)}</span>
            <input id="tx-amount" class="num" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" value="${form.amount}" />
          </div>
          <div class="field-error" id="tx-amount-err" style="text-align:center;min-height:16px"></div>
          ${catGrid}
          ${accountFields}
          ${reimburseField}
          <div class="field-row">
            <div class="field"><label>日期</label><input id="tx-date" type="date" value="${esc(form.date)}" /></div>
            <div class="field"><label>备注（选填）</label><input id="tx-note" maxlength="60" placeholder="如：午餐、地铁…" value="${esc(form.note)}" /></div>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        ${editing ? '<div class="left"><button class="btn-danger-soft" id="tx-delete">' + icon('trash') + ' 删除</button></div>' : ''}
        <button class="btn-ghost" id="tx-cancel">取消</button>
        <button class="btn-primary" id="tx-save">保存</button>
      </div>`);

    $('#tx-cancel').addEventListener('click', closeModal);
    $('#tx-save').addEventListener('click', save);
    $('#tx-type').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      form.type = b.dataset.val;
      if (form.type === 'expense') {
        const cats = catsOfType('expense');
        if (!cats.some((c) => c.id === form.categoryId)) form.categoryId = cats[0]?.id || '';
      } else if (form.type === 'income') {
        const cats = catsOfType('income');
        if (!cats.some((c) => c.id === form.categoryId)) form.categoryId = cats[0]?.id || '';
      } else {
        form.categoryId = '';
        if (form.toAccountId === form.accountId) form.toAccountId = state.data.accounts.find((a) => a.id !== form.accountId)?.id || '';
      }
      draw();
      const amt = $('#tx-amount'); if (amt) { amt.focus(); amt.select(); }
    });
    const pickGrid = $('.cat-pick-grid');
    pickGrid && pickGrid.addEventListener('click', (e) => {
      const b = e.target.closest('.cat-pick');
      if (!b) return;
      form.categoryId = b.dataset.cat;
      draw();
    });
    $('#tx-account').addEventListener('change', (e) => { form.accountId = e.target.value; });
    const toSel = $('#tx-to-account');
    toSel && toSel.addEventListener('change', (e) => { form.toAccountId = e.target.value; });
    const reimburseSeg = $('#tx-reimburse');
    if (reimburseSeg) reimburseSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      form.reimburse = b.dataset.val;
      $$('#tx-reimburse button').forEach((x) => x.classList.toggle('active', x.dataset.val === form.reimburse));
    });
    const swapBtn = $('#tx-swap');
    swapBtn && swapBtn.addEventListener('click', () => {
      const tmp = form.accountId;
      form.accountId = form.toAccountId;
      form.toAccountId = tmp;
      draw();
    });
    $('#tx-date').addEventListener('change', (e) => { form.date = e.target.value; });
    $('#tx-note').addEventListener('input', (e) => { form.note = e.target.value; });
    const amountEl = $('#tx-amount');
    amountEl.addEventListener('input', () => {
      form.amount = amountEl.value;
      const v = parseFloat(amountEl.value);
      $('#tx-amount-err').textContent = !amountEl.value ? '' : (!isFinite(v) || v <= 0 ? '金额需大于 0' : '');
    });
    if (editing) {
      $('#tx-delete').addEventListener('click', async () => {
        const yes = await confirmModal({ title: '删除这笔记录', message: '删除后无法恢复，确定删除吗？', okText: '删除', icon: 'trash', danger: true });
        if (!yes) return;
        deleteTransaction(existing.id);
      });
    }
    setTimeout(() => { amountEl.focus(); amountEl.select(); }, 60);
  }

  function save() {
    const amount = parseFloat($('#tx-amount').value);
    const errEl = $('#tx-amount-err');
    if (!isFinite(amount) || amount <= 0) { errEl.textContent = '请输入大于 0 的金额'; $('#tx-amount').focus(); return; }
    if (amount > 99999999) { errEl.textContent = '金额过大，请检查'; return; }
    if (form.type !== 'transfer' && !form.categoryId) { toast('请选择一个分类', 'error'); return; }
    if (form.type === 'transfer' && form.accountId === form.toAccountId) { toast('转出和转入账户不能相同', 'error'); return; }
    const date = $('#tx-date').value || todayStr();
    const note = $('#tx-note').value.trim();
    const payload = {
      type: form.type,
      amount: round2(amount),
      categoryId: form.type === 'transfer' ? null : form.categoryId,
      accountId: form.accountId,
      toAccountId: form.type === 'transfer' ? form.toAccountId : null,
      reimburse: form.type === 'expense' ? (form.reimburse || 'unreimbursed') : null,
      date,
      note,
      updatedAt: new Date().toISOString()
    };
    if (editing) {
      Object.assign(existing, payload);
    } else {
      payload.id = uid();
      payload.createdAt = new Date().toISOString();
      state.data.transactions.push(payload);
    }
    persist().then(() => {
      closeModal();
      if (monthKeyOf(date) !== state.month) state.month = monthKeyOf(date);
      render();
      toast(editing ? '记录已更新' : '已记下一笔', 'success');
    });
  }

  draw();
}

/* ================= 分类弹窗 ================= */
function categoryModal(existing) {
  const type = existing ? existing.type : state.catTab;
  const icons = type === 'expense' ? EXPENSE_ICONS : INCOME_ICONS;
  let form = existing
    ? { name: existing.name, icon: existing.icon, color: existing.color, budget: existing.budget }
    : { name: '', icon: icons[0], color: PALETTE[Math.floor(Math.random() * 12)], budget: null };

  function draw() {
    openModal(`
      <div class="modal-head"><div class="modal-title">${existing ? '编辑分类' : '新增分类'}</div><button class="modal-close">${icon('close')}</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field">
            <label>分类名称</label>
            <input id="cat-name" maxlength="8" placeholder="如：餐饮" value="${esc(form.name)}" />
          </div>
          <div class="field">
            <label>图标</label>
            <div class="icon-pick-grid">
              ${icons.map((ic) => `<button type="button" class="icon-pick ${form.icon === ic ? 'selected' : ''}" data-ic="${ic}">${icon(ic)}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>颜色</label>
            <div class="color-row">
              ${PALETTE.map((c) => `<button type="button" class="color-swatch ${form.color === c ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
            </div>
          </div>
          ${type === 'expense' ? `
            <div class="field">
              <label>每月预算（选填，每月自动生效）</label>
              <input id="cat-budget" class="num" type="number" min="0" step="1" placeholder="留空表示不限制" value="${form.budget == null ? '' : form.budget}" />
            </div>` : ''}
          <div class="field-hint">${existing ? '分类类型（' + (type === 'expense' ? '支出' : '收入') + '）创建后不可更改。' : '新分类将添加为「' + (type === 'expense' ? '支出' : '收入') + '」分类。'}</div>
        </div>
      </div>
      <div class="modal-foot">
        ${existing ? '<div class="left"><button class="btn-danger-soft" id="cat-delete">' + icon('trash') + ' 删除</button></div>' : ''}
        <button class="btn-ghost" id="cat-cancel">取消</button>
        <button class="btn-primary" id="cat-save">保存</button>
      </div>`);

    $('#cat-cancel').addEventListener('click', closeModal);
    $('#cat-save').addEventListener('click', () => {
      const name = $('#cat-name').value.trim();
      if (!name) { toast('请输入分类名称', 'error'); return; }
      if (state.data.categories.some((c) => c.name === name && c.id !== existing?.id && c.type === type)) { toast('已存在同名分类', 'error'); return; }
      const budgetRaw = $('#cat-budget') ? $('#cat-budget').value.trim() : '';
      const budget = budgetRaw === '' ? null : Math.max(0, Number(budgetRaw) || 0);
      if (existing) {
        Object.assign(existing, { name, icon: form.icon, color: form.color, budget });
      } else {
        state.data.categories.push({ id: uid(), name, icon: form.icon, color: form.color, type, budget, builtin: false });
      }
      persist().then(() => { closeModal(); render(); toast(existing ? '分类已更新' : '分类已创建', 'success'); });
    });
    $('#cat-name').addEventListener('input', (e) => { form.name = e.target.value; });
    const budgetEl = $('#cat-budget');
    budgetEl && budgetEl.addEventListener('input', (e) => { form.budget = e.target.value === '' ? null : e.target.value; });
    $('.icon-pick-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.icon-pick');
      if (!b) return;
      form.icon = b.dataset.ic;
      draw();
    });
    $('.color-row').addEventListener('click', (e) => {
      const b = e.target.closest('.color-swatch');
      if (!b) return;
      form.color = b.dataset.color;
      draw();
    });
    if (existing) {
      $('#cat-delete').addEventListener('click', async () => {
        const used = state.data.transactions.some((t) => t.categoryId === existing.id);
        if (used) { toast('该分类下还有交易记录，不能删除', 'error'); return; }
        const yes = await confirmModal({ title: '删除分类', message: `确定删除「${esc(existing.name)}」吗？`, okText: '删除', icon: 'trash', danger: true });
        if (!yes) return;
        state.data.categories = state.data.categories.filter((c) => c.id !== existing.id);
        persist().then(() => { closeModal(); render(); toast('分类已删除', 'success'); });
      });
    }
    setTimeout(() => $('#cat-name').focus(), 60);
  }
  draw();
}

/* ================= 账户弹窗 ================= */
function accountModal(existing) {
  let form = existing
    ? { name: existing.name, icon: existing.icon, color: existing.color, initial: existing.initial }
    : { name: '', icon: ACCOUNT_ICONS[0], color: PALETTE[5], initial: '' };

  function draw() {
    openModal(`
      <div class="modal-head"><div class="modal-title">${existing ? '编辑账户' : '新增账户'}</div><button class="modal-close">${icon('close')}</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field"><label>账户名称</label><input id="acc-name" maxlength="10" placeholder="如：工资卡" value="${esc(form.name)}" /></div>
          <div class="field">
            <label>图标</label>
            <div class="icon-pick-grid" style="grid-template-columns:repeat(6,1fr)">
              ${ACCOUNT_ICONS.map((ic) => `<button type="button" class="icon-pick ${form.icon === ic ? 'selected' : ''}" data-ic="${ic}">${icon(ic)}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>颜色</label>
            <div class="color-row">
              ${PALETTE.map((c) => `<button type="button" class="color-swatch ${form.color === c ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>初始余额（选填）</label>
            <input id="acc-initial" class="num" type="number" step="0.01" placeholder="账户里已有的金额" value="${form.initial}" />
            <span class="field-hint">只影响余额的起点，之后由每笔收支自动计算。</span>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        ${existing ? '<div class="left"><button class="btn-danger-soft" id="acc-delete">' + icon('trash') + ' 删除</button></div>' : ''}
        <button class="btn-ghost" id="acc-cancel">取消</button>
        <button class="btn-primary" id="acc-save">保存</button>
      </div>`);

    $('#acc-cancel').addEventListener('click', closeModal);
    $('#acc-save').addEventListener('click', () => {
      const name = $('#acc-name').value.trim();
      if (!name) { toast('请输入账户名称', 'error'); return; }
      if (state.data.accounts.some((a) => a.name === name && a.id !== existing?.id)) { toast('已存在同名账户', 'error'); return; }
      const initial = $('#acc-initial').value.trim() === '' ? 0 : round2(Number($('#acc-initial').value) || 0);
      if (existing) {
        Object.assign(existing, { name, icon: form.icon, color: form.color, initial });
      } else {
        state.data.accounts.push({ id: uid(), name, icon: form.icon, color: form.color, initial, builtin: false });
      }
      persist().then(() => { closeModal(); render(); toast(existing ? '账户已更新' : '账户已创建', 'success'); });
    });
    $('#acc-name').addEventListener('input', (e) => { form.name = e.target.value; });
    $('#acc-initial').addEventListener('input', (e) => { form.initial = e.target.value; });
    $('.icon-pick-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.icon-pick');
      if (!b) return;
      form.icon = b.dataset.ic;
      draw();
    });
    $('.color-row').addEventListener('click', (e) => {
      const b = e.target.closest('.color-swatch');
      if (!b) return;
      form.color = b.dataset.color;
      draw();
    });
    if (existing) {
      $('#acc-delete').addEventListener('click', async () => {
        const used = state.data.transactions.some((t) => t.accountId === existing.id || t.toAccountId === existing.id);
        if (used) { toast('该账户下还有交易记录，不能删除', 'error'); return; }
        if (state.data.accounts.length <= 1) { toast('至少保留一个账户', 'error'); return; }
        const yes = await confirmModal({ title: '删除账户', message: `确定删除账户「${esc(existing.name)}」吗？`, okText: '删除', icon: 'trash', danger: true });
        if (!yes) return;
        state.data.accounts = state.data.accounts.filter((a) => a.id !== existing.id);
        persist().then(() => { closeModal(); render(); toast('账户已删除', 'success'); });
      });
    }
    setTimeout(() => $('#acc-name').focus(), 60);
  }
  draw();
}

/* ================= 操作 ================= */
async function persist() {
  try {
    await saveData(state.data);
  } catch (e) {
    console.error(e);
    toast('保存失败：' + (e.message || e), 'error');
  }
}
function deleteTransaction(id) {
  state.data.transactions = state.data.transactions.filter((t) => t.id !== id);
  persist().then(() => { render(); toast('记录已删除', 'success'); });
}

/* ================= 全局渲染 ================= */
const VIEW_META = {
  school: { title: '学校收支', sub: '收入 · 支出 · 报销情况，一屏掌握', icon: 'cap' },
  dashboard: { title: '总览', sub: '预算 · 花费 · 剩余 · 去向，一屏掌握', icon: 'grid' },
  transactions: { title: '明细', sub: '所有收支与转账记录', icon: 'list' },
  stats: { title: '统计', sub: '趋势与分类分析', icon: 'chart' },
  budget: { title: '预算', sub: '设置每月总预算与分类限额', icon: 'target' },
  accounts: { title: '账户', sub: '各账户余额与净资产', icon: 'wallet' },
  categories: { title: '分类', sub: '管理收支分类', icon: 'tags' },
  settings: { title: '设置', sub: '外观、数据与备份', icon: 'gear' }
};

function render() {
  if (!state.data) return;
  const meta = VIEW_META[state.view];
  const vr = document.querySelector('.view-root');
  const keepScroll = state.lastView === state.view && !!vr;
  const st = keepScroll ? vr.scrollTop : 0;
  state.lastView = state.view;
  $('#view-title').textContent = meta.title;
  $('#view-sub').textContent = meta.sub;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  $('#month-cur').textContent = monthLabel(state.month);
  const picker = document.querySelector('.month-picker');
  if (picker) picker.style.display = state.view === 'school' ? 'none' : '';
  ({ school: renderSchool, dashboard: renderDashboard, transactions: renderTransactions, stats: renderStats, budget: renderBudget, accounts: renderAccounts, categories: renderCategories, settings: renderSettings })[state.view]();
  if (vr) vr.scrollTop = st;
}

function applyTheme() {
  const pref = state.data ? state.data.settings.theme : 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const btn = $('#btn-theme');
  if (btn) btn.innerHTML = icon(dark ? 'sun' : 'moon');
}

/* ================= 事件绑定 ================= */
function injectStaticIcons() {
  const navMap = { school: 'cap', dashboard: 'grid', transactions: 'list', stats: 'chart', budget: 'target', accounts: 'wallet', categories: 'tags', settings: 'gear' };
  $$('.nav-item').forEach((b) => { $('.nav-ic', b).innerHTML = icon(navMap[b.dataset.view]); });
  $('#month-prev').innerHTML = icon('left');
  $('#month-next').innerHTML = icon('right');
  $('#btn-backup').innerHTML = icon('download');
  applyTheme();
}

function bindGlobalEvents() {
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.nav-item');
    if (nav) { state.view = nav.dataset.view; render(); return; }
    if (e.target.closest('#btn-quick-add')) { txModal(null); return; }
    if (e.target.closest('#month-prev')) { state.month = shiftMonth(state.month, -1); render(); return; }
    if (e.target.closest('#month-next')) { state.month = shiftMonth(state.month, 1); render(); return; }
    if (e.target.closest('#month-cur')) { openMonthPicker(); return; }
    if (e.target.closest('#btn-theme')) {
      const s = state.data.settings;
      s.theme = s.theme === 'dark' || (s.theme === 'auto' && document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark';
      applyTheme();
      persist();
      return;
    }
    if (e.target.closest('#btn-backup')) { exportDataFile(); return; }
  });

  $('#view-root').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    if (action === 'add-tx') txModal(null);
    else if (action === 'edit-tx') txModal(state.data.transactions.find((t) => t.id === id));
    else if (action === 'add-income') txModal(null, { type: 'income' });
    else if (action === 'add-expense') txModal(null, { type: 'expense' });
    else if (action === 'cycle-reimburse') {
      const t = state.data.transactions.find((x) => x.id === id);
      if (t && t.type === 'expense') {
        t.reimburse = nextReimburse(t.reimburse || 'unreimbursed');
        persist().then(() => render());
      }
    }
    else if (action === 'del-tx') {
      const t = state.data.transactions.find((x) => x.id === id);
      confirmModal({ title: '删除记录', message: `确定删除「${esc(t ? (t.note || (t.type === 'transfer' ? '这笔转账' : (catById(t.categoryId)?.name || '这笔记录'))) : '这笔记录')}」吗？`, okText: '删除', icon: 'trash', danger: true })
        .then((yes) => { if (yes) deleteTransaction(id); });
    }
    else if (action === 'goto-budget') state.view = 'budget';
    else if (action === 'goto-tx') state.view = 'transactions';
    else if (action === 'save-budget') {
      const input = $('#budget-amount');
      const v = input.value.trim();
      if (v === '') { toast('请输入预算金额', 'error'); return; }
      const num = Number(v);
      if (!isFinite(num) || num < 0) { toast('请输入有效的预算金额', 'error'); return; }
      state.data.budgets[state.month] = round2(num);
      persist().then(() => { render(); toast('本月预算已保存', 'success'); });
    }
    else if (action === 'clear-budget') {
      delete state.data.budgets[state.month];
      persist().then(() => { render(); toast('本月预算已清除', 'success'); });
    }
    else if (action === 'add-account') accountModal(null);
    else if (action === 'edit-account') accountModal(accById(id));
    else if (action === 'add-cat') categoryModal(null);
    else if (action === 'edit-cat') categoryModal(catById(id));
    else if (action === 'export-data') exportDataFile();
    else if (action === 'import-data') importDataFile();
    else if (action === 'copy-path') {
      const el = $('#data-path');
      const path = (el && el.dataset.full) || (el && el.textContent) || '';
      if (path) copyText(path).then(() => toast('路径已复制', 'success')).catch(() => toast('复制失败，请手动选择路径', 'error'));
      else toast('暂无路径信息', 'error');
    }
    else if (action === 'clear-data') {
      confirmModal({
        title: '清空所有数据',
        message: '这会删除<b>全部账户、分类、预算和交易记录</b>，且无法恢复。建议先导出备份。确定继续吗？',
        okText: '我确认，清空', icon: 'alert', danger: true
      }).then(async (yes) => {
        if (!yes) return;
        const again = await confirmModal({ title: '再次确认', message: '这是最后一步，真的要清空吗？', okText: '清空', icon: 'alert', danger: true });
        if (!again) return;
        state.data = seedData();
        await persist();
        state.month = currentMonth();
        state.view = 'school';
        render();
        toast('已清空全部数据', 'success');
      });
    }
    if (action === 'goto-budget' || action === 'goto-tx') render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (confirmResolver) { confirmResolver(); return; }
      if (modalOpen) closeModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); txModal(null); }
  });
}

function openMonthPicker() {
  const picker = document.createElement('div');
  picker.className = 'modal-backdrop';
  picker.innerHTML = `
    <div class="modal-card narrow">
      <div class="modal-head"><div class="modal-title">选择月份</div><button class="modal-close">${icon('close')}</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div class="field"><label>月份</label><input id="month-input" type="month" value="${esc(state.month)}" /></div>
        <div class="row-between">
          <button class="btn-ghost" id="pick-today">回到本月</button>
          <button class="btn-primary" id="pick-ok">确定</button>
        </div>
      </div>
    </div>`;
  $('#modal-root').appendChild(picker);
  modalOpen = true;
  const close = () => { picker.remove(); modalOpen = false; };
  picker.addEventListener('mousedown', (e) => { if (e.target === picker) close(); });
  $('.modal-close', picker).addEventListener('click', close);
  $('#pick-today', picker).addEventListener('click', () => { state.month = currentMonth(); render(); close(); });
  $('#pick-ok', picker).addEventListener('click', () => {
    const v = $('#month-input', picker).value;
    if (v) { state.month = v; render(); }
    close();
  });
  const input = $('#month-input', picker);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#pick-ok', picker).click(); });
  try { input.showPicker && input.showPicker(); } catch { /* 忽略非用户手势限制 */ }
}

/* ================= 启动 ================= */
async function init() {
  try {
    state.data = await loadData();
  } catch (e) {
    console.error(e);
    state.data = null;
  }
  if (!state.data || !Array.isArray(state.data.transactions)) {
    state.data = seedData();
    await persist();
  }
  normalizeData(state.data);
  injectStaticIcons();
  bindGlobalEvents();
  render();
  if (state.data.transactions.length === 0) {
    toast('欢迎使用！点击左下角「记一笔」开始', 'info', 3200);
  }
}

document.addEventListener('DOMContentLoaded', init);

/* ================= 冒烟测试（打包前自检） ================= */
window.__runSmoke = async function () {
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });
  try {
    state.data = seedData();
    normalizeData(state.data);
    state.month = '2026-09';
    let now = Date.now();
    const mk = (type, amount, categoryId, accountId, date, note, extra = {}) => ({
      id: uid(), type, amount, categoryId, accountId, toAccountId: null, date, note,
      createdAt: new Date(now++).toISOString(), updatedAt: new Date(now).toISOString(), ...extra
    });
    const cats = state.data.categories;
    const accs = state.data.accounts;
    const food = cats.find((c) => c.name === '餐饮');
    const shop = cats.find((c) => c.name === '购物');
    const salary = cats.find((c) => c.name === '工资');
    state.data.transactions = [
      mk('expense', 28.5, food.id, accs[1].id, '2026-09-03', '午餐'),
      mk('expense', 199.9, shop.id, accs[2].id, '2026-09-10', '买衣服'),
      mk('expense', 60, food.id, accs[0].id, '2026-09-18', '聚餐'),
      mk('income', 8000, salary.id, accs[3].id, '2026-09-01', '9月工资'),
      mk('transfer', 2000, null, accs[3].id, '2026-09-02', '转账', { toAccountId: accs[4].id })
    ];
    state.data.budgets['2026-09'] = 3000;
    food.budget = 500;

    ok('9月支出计算正确', expenseOfMonth('2026-09') === 288.4);
    ok('9月收入计算正确', incomeOfMonth('2026-09') === 8000);
    ok('预算剩余计算正确', 3000 - expenseOfMonth('2026-09') === 2711.6);
    ok('账户余额计算正确', Math.abs(accountBalance(accs[4].id) - 2000) < 1e-9);
    ok('总资产为正', totalAssets() > 0);

    state.data.transactions.push(
      mk('expense', 100, food.id, accs[0].id, '2026-09-20', '报销测试', { reimburse: 'reimbursed' }),
      mk('expense', 50, shop.id, accs[0].id, '2026-09-21', '未报销测试', { reimburse: 'unreimbursed' }),
      mk('expense', 30, food.id, accs[0].id, '2026-09-22', '开票测试', { reimburse: 'invoiced' })
    );
    const rb = reimburseTotals();
    ok('报销状态统计正确', rb.reimbursed === 100 && rb.invoiced === 30 && Math.abs(rb.unreimbursed - 338.4) < 1e-9);

    const views = ['school', 'dashboard', 'transactions', 'stats', 'budget', 'accounts', 'categories', 'settings'];
    for (const v of views) {
      state.view = v;
      try {
        render();
        ok(`${v} 页面渲染`, $('#view-root').innerHTML.length > 0);
      } catch (e) {
        ok(`${v} 页面渲染`, false);
        checks[checks.length - 1].error = String(e);
      }
    }
    state.view = 'school';
    render();
    ok('学校收支页明细区齐全', $$('.school-section').length === 2);
    ok('报销状态标签可切换', $$('.reimb-badge').length >= 3);
    ok('学校页无横向溢出', document.body.scrollWidth <= window.innerWidth + 1);
    const donutCircles = $$('#view-root circle').length;
    state.view = 'dashboard';
    render();
    ok('圆环图生成', $$('.donut-wrap circle').length >= 3);
    ok('金额格式含货币符号', fmtMoney(123.4).includes('¥'));
    ok('无横向溢出', document.body.scrollWidth <= window.innerWidth + 1);
    ok('侧边栏宽度正确', Math.round($('.sidebar').getBoundingClientRect().width) >= 230);
    ok('四张统计卡齐全', $$('.stat-card').length === 4);
    ok('支出构成卡片存在', !!$('.donut-wrap'));
    ok('负数金额带负号', fmtMoney(-5).startsWith('-'));
    state.view = 'transactions';
    state.filters.q = '午餐';
    const found = filteredTxList().length;
    state.filters.q = '';
    ok('搜索筛选生效', found === 1);
    state.view = 'school';
    render();
    return { ok: checks.every((c) => c.pass), checks };
  } catch (e) {
    return { ok: false, error: String(e && e.stack || e), checks };
  }
};
