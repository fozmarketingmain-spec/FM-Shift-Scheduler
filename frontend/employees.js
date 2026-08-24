const appEl = document.getElementById('app');
const userAreaEl = document.getElementById('userArea');

async function main() {
  await handleSlackRedirectIfPresent();
  const session = getSession();

  if (!session) {
    appEl.innerHTML = `
      <div class="login-screen">
        <h1>员工管理</h1>
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
      <button class="btn ghost" onclick="logout()">登出</button>
    </div>`;

  await renderEmployees();
}

async function renderEmployees() {
  const list = await apiFetch('/api/employees');

  const rows = list
    .map(
      (e) => `
      <tr>
        <td>${e.name}</td>
        <td class="mono">${e.slack_user_id}</td>
        <td>${e.role}</td>
        <td>${e.send_reminders ? '✅' : '—'}</td>
        <td>${e.extra_off_eligible ? '✅' : '—'}</td>
        <td><button class="btn ghost" onclick="openEditEmployee(${e.id})">编辑</button></td>
      </tr>`
    )
    .join('');

  appEl.innerHTML = `
    <table class="summary-table">
      <thead>
        <tr><th>姓名</th><th>Slack Member ID</th><th>角色</th><th>每日提醒</th><th>Extra Off 额度</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="fab" onclick="openAddEmployee()">+ 新增员工</button>
  `;
}

function employeeFormHtml(e) {
  const isEdit = !!e;
  return `
    <div class="field">
      <label>姓名</label>
      <input type="text" id="empName" value="${isEdit ? e.name : ''}">
    </div>
    <div class="field">
      <label>Slack Member ID</label>
      <input type="text" id="empSlackId" value="${isEdit ? e.slack_user_id : ''}" placeholder="U0123ABCDEF">
    </div>
    <div class="field">
      <label>角色</label>
      <select id="empRole">
        <option value="AM" ${!isEdit || e.role === 'AM' ? 'selected' : ''}>AM</option>
        <option value="ADMIN" ${isEdit && e.role === 'ADMIN' ? 'selected' : ''}>ADMIN(可审批、编辑班表)</option>
      </select>
    </div>
    <div class="field">
      <label><input type="checkbox" id="empReminders" ${!isEdit || e.send_reminders ? 'checked' : ''} style="width:auto;"> 接收每日班次提醒</label>
    </div>
    <div class="field">
      <label><input type="checkbox" id="empExtraOff" ${isEdit && e.extra_off_eligible ? 'checked' : ''} style="width:auto;"> 享有每月 Extra Off 额度</label>
    </div>
  `;
}

function openAddEmployee() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>新增员工</h3>
      ${employeeFormHtml(null)}
      <div class="modal-actions">
        <button class="btn ghost" onclick="closeModal()">取消</button>
        <button class="btn primary" onclick="saveEmployee(null)">新增</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.id = 'modalOverlay';
}

async function openEditEmployee(id) {
  const list = await apiFetch('/api/employees');
  const e = list.find((x) => x.id === id);
  if (!e) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>编辑 ${e.name}</h3>
      ${employeeFormHtml(e)}
      <div class="modal-actions">
        <button class="btn ghost" onclick="closeModal()">取消</button>
        <button class="btn primary" onclick="saveEmployee(${id})">保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.id = 'modalOverlay';
}

function closeModal() {
  document.getElementById('modalOverlay')?.remove();
}

async function saveEmployee(id) {
  const name = document.getElementById('empName').value.trim();
  const slack_user_id = document.getElementById('empSlackId').value.trim();
  const role = document.getElementById('empRole').value;
  const send_reminders = document.getElementById('empReminders').checked;
  const extra_off_eligible = document.getElementById('empExtraOff').checked;

  if (!name || !slack_user_id) {
    alert('姓名和 Slack Member ID 都要填');
    return;
  }

  const body = JSON.stringify({ name, slack_user_id, role, send_reminders, extra_off_eligible });
  const res = id
    ? await apiFetch(`/api/employees/${id}`, { method: 'PUT', body })
    : await apiFetch('/api/employees', { method: 'POST', body });

  if (res.ok || res.id) {
    closeModal();
    await renderEmployees();
  } else {
    alert(res.error || '保存失败');
  }
}

main();
