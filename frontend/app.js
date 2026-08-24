const appEl = document.getElementById('app');
const userAreaEl = document.getElementById('userArea');

let viewDate = new Date(); // month currently displayed
let employees = [];

async function main() {
  await handleSlackRedirectIfPresent();
  const session = getSession();

  if (!session) {
    renderLogin();
    return;
  }

  renderUserArea(session.me);
  employees = await apiFetch('/api/employees');
  await renderCalendar();
}

function renderLogin() {
  appEl.innerHTML = `
    <div class="login-screen">
      <h1>班表 Calendar</h1>
      <p>用你的 Slack 帐号登录,查看班表、提交 AL / Off Day / 换班申请。</p>
      <button class="slack-btn" onclick="startSlackLogin()">用 Slack 登录</button>
    </div>`;
}

function renderUserArea(me) {
  userAreaEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;font-size:14px;">
      <span>${me.name}${me.role === 'ADMIN' ? ' · Admin' : ''}</span>
      ${me.role === 'ADMIN' ? '<a href="admin.html" style="color:inherit;">审批后台</a>' : ''}
      <button class="btn ghost" onclick="logout()">登出</button>
    </div>`;
}

async function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const schedule = await apiFetch(`/api/shifts?month=${monthKey}`);
  const me = getSession().me;

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dowLabels = ['一', '二', '三', '四', '五', '六', '日'];
  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += `<div class="day-cell empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
    const day = schedule[dateStr] || { morning: [], night: [], off: [] };
    const line = (list) =>
      list.map((p) => (p.id === me.id ? `<span class="me">${p.name}</span>` : p.name)).join(', ');

    cells += `
      <div class="day-cell">
        <div class="day-num">${d}</div>
        ${day.morning.length ? `<span class="shift-line morning">早 ${line(day.morning)}</span>` : ''}
        ${day.night.length ? `<span class="shift-line night">晚 ${line(day.night)}</span>` : ''}
        ${day.off.map((o) => `<span class="off-badge">${o.type === 'AL' ? 'AL' : 'Off'}: ${o.name}</span>`).join('')}
      </div>`;
  }

  appEl.innerHTML = `
    <div class="month-nav">
      <button onclick="changeMonth(-1)">‹</button>
      <div class="month-label">${year} 年 ${month + 1} 月</div>
      <button onclick="changeMonth(1)">›</button>
      <div class="legend">
        <span><span class="dot morning"></span>早班</span>
        <span><span class="dot night"></span>晚班</span>
      </div>
    </div>
    <div class="calendar">
      ${dowLabels.map((l) => `<div class="dow">${l}</div>`).join('')}
      ${cells}
    </div>
    <button class="fab" onclick="openRequestModal()">+ 提交申请</button>
  `;
}

function changeMonth(delta) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
  renderCalendar();
}

function openRequestModal() {
  const swapOptions = employees
    .filter((e) => e.id !== getSession().me.id)
    .map((e) => `<option value="${e.id}">${e.name}</option>`)
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>提交申请</h3>
      <div class="field">
        <label>类型</label>
        <select id="reqType" onchange="toggleSwapFields()">
          <option value="AL">AL(年假)</option>
          <option value="OFF">Off Day</option>
          <option value="SWAP">换班</option>
        </select>
      </div>
      <div class="field">
        <label>日期</label>
        <input type="date" id="reqDate">
      </div>
      <div id="swapFields" style="display:none;">
        <div class="field">
          <label>换班对象</label>
          <select id="swapWith">${swapOptions}</select>
        </div>
        <div class="field">
          <label>对方原本上班的日期(你要换过去的日期)</label>
          <input type="date" id="swapDate">
        </div>
      </div>
      <div class="field">
        <label>原因(选填)</label>
        <textarea id="reqReason" rows="2"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" onclick="closeModal()">取消</button>
        <button class="btn primary" onclick="submitRequest()">提交</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.id = 'modalOverlay';
}

function toggleSwapFields() {
  const type = document.getElementById('reqType').value;
  document.getElementById('swapFields').style.display = type === 'SWAP' ? 'block' : 'none';
}

function closeModal() {
  document.getElementById('modalOverlay')?.remove();
}

async function submitRequest() {
  const request_type = document.getElementById('reqType').value;
  const request_date = document.getElementById('reqDate').value;
  const reason = document.getElementById('reqReason').value;
  if (!request_date) { alert('请选择日期'); return; }

  const body = { request_type, request_date, reason };
  if (request_type === 'SWAP') {
    body.swap_with_employee_id = Number(document.getElementById('swapWith').value);
    body.swap_date = document.getElementById('swapDate').value;
  }

  const res = await apiFetch('/api/requests', { method: 'POST', body: JSON.stringify(body) });
  if (res.id) {
    alert('申请已提交,等待批准。');
    closeModal();
  } else {
    alert(res.error || '提交失败');
  }
}

main();
