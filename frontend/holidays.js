const appEl = document.getElementById('app');
const userAreaEl = document.getElementById('userArea');

let viewMonth = new Date();

async function main() {
  await handleSlackRedirectIfPresent();
  const session = getSession();

  if (!session) {
    appEl.innerHTML = `
      <div class="login-screen">
        <h1>假期管理</h1>
        <p>用你的 Slack 帐号登录。</p>
        <button class="slack-btn" onclick="startSlackLogin()">用 Slack 登录</button>
      </div>`;
    return;
  }

  if (session.me.role !== 'ADMIN') {
    appEl.innerHTML = `<div class="empty-state">这个页面只开放给管理员。</div>`;
    return;
  }

  userAreaEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;font-size:14px;">
      <span>${session.me.name} · Admin</span>
      <a href="index.html" style="color:inherit;">日历</a>
      <a href="admin.html" style="color:inherit;">审批后台</a>
      <a href="summary.html" style="color:inherit;">Summary</a>
      <a href="employees.html" style="color:inherit;">员工管理</a>
      <button class="btn ghost" onclick="logout()">登出</button>
    </div>`;

  await renderHolidays();
}

function monthKey() {
  return `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
}

async function renderHolidays() {
  const mk = monthKey();
  const holidays = await apiFetch(`/api/holidays?month=${mk}`);
  const dates = Object.keys(holidays).sort();

  const rows = dates.length
    ? dates
        .map(
          (d) => `
      <tr>
        <td>${d}</td>
        <td>${holidays[d]}</td>
        <td><button class="btn ghost" onclick="removeHoliday('${d}')">删除</button></td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="3" style="color:var(--ink-soft);">这个月还没有设定公共假期</td></tr>`;

  appEl.innerHTML = `
    <div class="month-nav">
      <button onclick="changeMonth(-1)">‹</button>
      <div class="month-label">${viewMonth.getFullYear()} 年 ${viewMonth.getMonth() + 1} 月</div>
      <button onclick="changeMonth(1)">›</button>
    </div>

    <table class="summary-table">
      <thead><tr><th>日期</th><th>假期名称</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="summary-form">
      <h3>新增公共假期</h3>
      <div class="field">
        <label>日期</label>
        <input type="date" id="newHolidayDate">
      </div>
      <div class="field">
        <label>假期名称</label>
        <input type="text" id="newHolidayName" placeholder="例如: Merdeka Day">
      </div>
      <button class="btn primary" onclick="addHoliday()">新增</button>
    </div>
  `;
}

function changeMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  renderHolidays();
}

async function addHoliday() {
  const date = document.getElementById('newHolidayDate').value;
  const name = document.getElementById('newHolidayName').value.trim();
  if (!date || !name) { alert('日期和名称都要填'); return; }

  const res = await apiFetch('/api/holidays', { method: 'POST', body: JSON.stringify({ date, name }) });
  if (res.ok) {
    viewMonth = new Date(date + 'T00:00:00');
    await renderHolidays();
  } else {
    alert(res.error || '新增失败');
  }
}

async function removeHoliday(date) {
  if (!confirm(`确定要删除 ${date} 这个假期吗?`)) return;
  const res = await apiFetch(`/api/holidays/${date}`, { method: 'DELETE' });
  if (res.ok) {
    await renderHolidays();
  } else {
    alert(res.error || '删除失败');
  }
}

main();
