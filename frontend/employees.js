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
      <a href="holidays.html" style="color:inherit;">假期管理</a>
      <button class="btn ghost" onclick="logout()">登出</button>
    </div>`;

  await renderEmployees();
}

async function renderEmployees() {
  const list = await apiFetch('/api/employees');

  const rows = list
    .map(
      (e) => `
      <tr${e.active ? '' : ' style="opacity:0.5;"'}>
        <td>${e.name}${e.active ? '' : ' (已停用)'}</td>
        <td class="mono">${e.slack_user_id}</td>
        <td>${e.role}</td>
        <td>${e.send_reminders ? '✅' : '—'}</td>
        <td>${e.extra_off_eligible ? '✅' : '—'}</td>
        <td style="display:flex;gap:6px;">
          <button class="btn ghost" onclick="openEditEmployee(${e.id})">编辑</button>
          ${
            e.active
              ? `<button class="btn ghost" onclick="toggleActive(${e.id}, false)">停用</button>`
              : `<button class="btn ghost" onclick="toggleActive(${e.id}, true)">启用</button>`
          }
          <button class="btn ghost" style="color:var(--accent-red);" onclick="deleteEmployeeForever(${e.id}, '${e.name}')">彻底删除</button>
        </td>
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
    <div class="summary-form" style="margin-top:20px;">
      <h3>手动发送提醒</h3>
      <p style="font-size:13px;color:var(--ink-soft);margin-top:-6px;">立即发送「明天班表」提醒给所有明天有班的人,不用等到每天固定的排程时间。</p>
      <button class="btn primary" onclick="sendRemindersNow()">立即发送明天班表提醒</button>
    </div>
  `;
}

async function sendRemindersNow() {
  if (!confirm('确定要现在发送「明天班表」提醒吗?会立即私讯所有明天有排班的人。')) return;
  const res = await apiFetch('/api/admin/send-reminders-now', { method: 'POST', body: JSON.stringify({}) });
  if (res.ok) {
    alert(`已发送提醒给 ${res.sent} 人。`);
  } else {
    alert(res.error || '发送失败');
  }
}

async function toggleActive(id, active) {
  const action = active ? 'reactivate' : 'deactivate';
  if (!active && !confirm('停用后这个人不能再登入、也不会出现在换班/代班选单里,但历史记录会保留。确定要停用吗?')) return;
  const res = await apiFetch(`/api/employees/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
  if (res.ok) {
    await renderEmployees();
  } else {
    alert(res.error || '操作失败');
  }
}

async function deleteEmployeeForever(id, name) {
  if (!confirm(`删除「${name}」?\n(如果他名下已经有班表/请假/OT 等历史记录,系统会先挡下来,并问你要不要连历史记录一起删掉。)`)) return;
  const res = await apiFetch(`/api/employees/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await renderEmployees();
    return;
  }
  if (res.canForce) {
    if (confirm(`${res.error}\n\n要不要连同他的历史记录一起彻底删除?此操作无法复原。`)) {
      const forced = await apiFetch(`/api/employees/${id}?force=1`, { method: 'DELETE' });
      if (forced.ok) {
        await renderEmployees();
      } else {
        alert(forced.error || '删除失败');
      }
    }
    return;
  }
  alert(res.error || '删除失败');
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
        <option value="HR" ${isEdit && e.role === 'HR' ? 'selected' : ''}>HR(仅可查看日历 & Summary)</option>
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
