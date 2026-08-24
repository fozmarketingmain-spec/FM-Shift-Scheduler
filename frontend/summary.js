const appEl = document.getElementById('app');
const userAreaEl = document.getElementById('userArea');

let viewMonth = new Date();
let employees = [];

async function main() {
  await handleSlackRedirectIfPresent();
  const session = getSession();

  if (!session) {
    appEl.innerHTML = `
      <div class="login-screen">
        <h1>Summary</h1>
        <p>用你的 Slack 帐号登录。</p>
        <button class="slack-btn" onclick="startSlackLogin()">用 Slack 登录</button>
      </div>`;
    return;
  }

  renderUserArea(session.me);
  employees = await apiFetch('/api/employees');
  await renderSummary();
}

function renderUserArea(me) {
  userAreaEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;font-size:14px;">
      <span>${me.name}${me.role === 'ADMIN' ? ' · Admin' : ''}</span>
      <a href="index.html" style="color:inherit;">日历</a>
      ${me.role === 'ADMIN' ? '<a href="admin.html" style="color:inherit;">审批后台</a>' : ''}
      <button class="btn ghost" onclick="logout()">登出</button>
    </div>`;
}

function monthKey() {
  return `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
}

async function renderSummary() {
  const me = getSession().me;
  const mk = monthKey();
  const rows = await apiFetch(`/api/summary?month=${mk}`);

  const offRows = rows
    .map(
      (r) => `
      <tr>
        <td>${r.name}</td>
        <td>${r.monthlyOff ? r.monthlyOff.total : '-'}</td>
        <td>${r.monthlyOff ? r.monthlyOff.used : '-'}</td>
        <td>${r.monthlyOff ? r.monthlyOff.carryForward : '-'}</td>
      </tr>`
    )
    .join('');

  const replRows = rows
    .map(
      (r) => `
      <tr>
        <td>${r.name}</td>
        <td>${r.replacement.total}</td>
        <td>${r.replacement.settle}</td>
        <td>${r.replacement.carryForward}</td>
      </tr>`
    )
    .join('');

  const otRows = rows
    .map(
      (r) => `
      <tr>
        <td>${r.name}</td>
        <td>${r.ot.ph}</td>
        <td>${r.ot.normal}</td>
      </tr>`
    )
    .join('');

  const otForm =
    me.role === 'ADMIN'
      ? `
      <div class="summary-form">
        <h3>登记 OT 时数</h3>
        <div class="field">
          <label>员工</label>
          <select id="otEmployee">${employees.map((e) => `<option value="${e.id}">${e.name}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>类型</label>
          <select id="otType">
            <option value="PH">PH OT(公共假期)</option>
            <option value="Normal">Normal OT</option>
          </select>
        </div>
        <div class="field">
          <label>时数</label>
          <input type="number" id="otHours" step="0.5" min="0.5">
        </div>
        <div class="field">
          <label>备注(选填)</label>
          <input type="text" id="otNote">
        </div>
        <button class="btn primary" onclick="submitOt()">加入</button>
      </div>`
      : '';

  appEl.innerHTML = `
    <div class="month-nav">
      <button onclick="changeMonth(-1)">‹</button>
      <div class="month-label">${viewMonth.getFullYear()} 年 ${viewMonth.getMonth() + 1} 月</div>
      <button onclick="changeMonth(1)">›</button>
    </div>

    <h3>Monthly Off</h3>
    <table class="summary-table">
      <thead><tr><th></th><th>Total</th><th>Used</th><th>Carry Forward</th></tr></thead>
      <tbody>${offRows}</tbody>
    </table>

    <h3>Shift Replacement</h3>
    <table class="summary-table">
      <thead><tr><th></th><th>Total</th><th>Settle</th><th>Carry Forward</th></tr></thead>
      <tbody>${replRows}</tbody>
    </table>

    <h3>OT</h3>
    <table class="summary-table">
      <thead><tr><th></th><th>Total PH OT (Hour)</th><th>Total Normal OT (Hour)</th></tr></thead>
      <tbody>${otRows}</tbody>
    </table>

    ${otForm}
  `;
}

function changeMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  renderSummary();
}

async function submitOt() {
  const employee_id = Number(document.getElementById('otEmployee').value);
  const ot_type = document.getElementById('otType').value;
  const hours = Number(document.getElementById('otHours').value);
  const note = document.getElementById('otNote').value;
  if (!hours || hours <= 0) { alert('请输入时数'); return; }

  const res = await apiFetch('/api/ot', {
    method: 'POST',
    body: JSON.stringify({ employee_id, month: monthKey(), ot_type, hours, note }),
  });
  if (res.ok) {
    await renderSummary();
  } else {
    alert(res.error || '加入失败');
  }
}

main();
