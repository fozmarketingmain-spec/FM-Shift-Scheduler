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
      <a href="summary.html" style="color:inherit;">Summary</a>
      <button class="btn ghost" onclick="logout()">登出</button>
    </div>`;
}

async function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const [schedule, holidays] = await Promise.all([
    apiFetch(`/api/shifts?month=${monthKey}`),
    apiFetch(`/api/holidays?month=${monthKey}`),
  ]);
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
    const holidayName = holidays[dateStr];
    const line = (list) =>
      list.map((p) => (p.id === me.id ? `<span class="me">${p.name}</span>` : p.name)).join(', ');

    cells += `
      <div class="day-cell${holidayName ? ' holiday' : ''}" ${holidayName ? `title="${holidayName}"` : ''}>
        <div class="day-num">${d}</div>
        ${holidayName ? `<span class="ph-badge">🎉 ${holidayName}</span>` : ''}
        ${day.morning.length ? `<span class="shift-line morning">早 ${line(day.morning)}</span>` : ''}
        ${day.night.length ? `<span class="shift-line night">晚 ${line(day.night)}</span>` : ''}
        ${day.off.map((o) => `<span class="off-badge${o.type.includes('固定') ? ' fixed' : ''}">${o.type}: ${o.name}</span>`).join('')}
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
        <span><span class="dot" style="background:#F5D949;"></span>公共假期</span>
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

async function openRequestModal() {
  const me = getSession().me;
  const balances = await apiFetch('/api/balances');
  const otherEmployees = employees.filter((e) => e.id !== me.id);
  const swapOptions = otherEmployees.map((e) => `<option value="${e.id}">${e.name}</option>`).join('');
  const assigneeOptions = otherEmployees.map((e) => `<option value="${e.id}">${e.name}</option>`).join('');

  const extraOk = balances.extraOffRemaining !== null && balances.extraOffRemaining > 0;
  const replOk = balances.replacementOffRemaining > 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>提交申请</h3>
      <div class="field">
        <label>类型</label>
        <select id="reqType" onchange="toggleRequestFields()">
          <option value="AL">AL(年假)</option>
          <option value="OFF" ${extraOk ? '' : 'disabled'}>Off Day — 剩 ${balances.extraOffRemaining ?? '不适用'} 天${extraOk ? '' : '(已用完/不适用)'}</option>
          <option value="REPLACEMENT_OFF" ${replOk ? '' : 'disabled'}>Replacement Off — 剩 ${balances.replacementOffRemaining} 天${replOk ? '' : '(暂无可用)'}</option>
          <option value="SWAP" ${''}>换班</option>
          <option value="SWAP_OFF">换 Off Day</option>
          <option value="CARRY_FORWARD" ${balances.extraOffRemaining ? '' : 'disabled'}>延后 Extra Off 到下月</option>
        </select>
      </div>
      <div class="field">
        <label id="dateLabel">日期</label>
        <input type="date" id="reqDate">
      </div>
      <div id="assigneeField" class="field" style="display:none;">
        <label>代班人</label>
        <select id="assigneeId">${assigneeOptions}</select>
      </div>
      <div id="swapField" class="field" style="display:none;">
        <label>换班对象</label>
        <select id="swapWith">${swapOptions}</select>
      </div>
      <div id="swapOffField" class="field" style="display:none;">
        <label>要换到的新日期</label>
        <input type="date" id="swapOffDate">
      </div>
      <div id="carryDaysField" class="field" style="display:none;">
        <label>要延后几天(剩 ${balances.extraOffRemaining ?? 0} 天可延)</label>
        <input type="number" id="carryDays" min="1" max="${balances.extraOffRemaining ?? 0}" value="1">
      </div>
      <div class="field">
        <label id="reasonLabel">原因(选填)</label>
        <textarea id="reqReason" rows="2"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" onclick="closeModal()">取消</button>
        <button class="btn primary" onclick="submitRequest()">提交</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.id = 'modalOverlay';
  toggleRequestFields();
}

const REASON_REQUIRED_TYPES = ['AL', 'CARRY_FORWARD', 'SWAP', 'SWAP_OFF'];

function toggleRequestFields() {
  const type = document.getElementById('reqType').value;
  document.getElementById('assigneeField').style.display = ['OFF', 'REPLACEMENT_OFF'].includes(type) ? 'block' : 'none';
  document.getElementById('swapField').style.display = type === 'SWAP' ? 'block' : 'none';
  document.getElementById('swapOffField').style.display = type === 'SWAP_OFF' ? 'block' : 'none';
  document.getElementById('carryDaysField').style.display = type === 'CARRY_FORWARD' ? 'block' : 'none';
  document.getElementById('dateLabel').textContent =
    type === 'CARRY_FORWARD' ? '从哪个月开始延(选该月任一天即可)' : type === 'SWAP_OFF' ? '原本的 Off 日期' : '日期';
  document.getElementById('reasonLabel').textContent = REASON_REQUIRED_TYPES.includes(type) ? '原因(必填)' : '原因(选填)';
}

function closeModal() {
  document.getElementById('modalOverlay')?.remove();
}

async function submitRequest() {
  const request_type = document.getElementById('reqType').value;
  const request_date = document.getElementById('reqDate').value;
  const reason = document.getElementById('reqReason').value;
  if (!request_date) { alert('请选择日期'); return; }
  if (REASON_REQUIRED_TYPES.includes(request_type) && !reason.trim()) {
    alert('这个类型的申请必须填写原因');
    return;
  }

  const body = { request_type, request_date, reason };
  if (request_type === 'SWAP') {
    body.swap_with_employee_id = Number(document.getElementById('swapWith').value);
  }
  if (request_type === 'SWAP_OFF') {
    body.swap_date = document.getElementById('swapOffDate').value;
    if (!body.swap_date) { alert('请选择要换到的新日期'); return; }
  }
  if (request_type === 'OFF' || request_type === 'REPLACEMENT_OFF') {
    body.assignee_id = Number(document.getElementById('assigneeId').value);
  }
  if (request_type === 'CARRY_FORWARD') {
    body.carry_days = Number(document.getElementById('carryDays').value);
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
