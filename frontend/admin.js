const appEl = document.getElementById('app');
const userAreaEl = document.getElementById('userArea');

let currentFilter = 'pending';

async function main() {
  await handleSlackRedirectIfPresent();
  const session = getSession();

  if (!session) {
    appEl.innerHTML = `
      <div class="login-screen">
        <h1>审批后台</h1>
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
      <a href="index.html" style="color:inherit;">回到日历</a>
      <a href="summary.html" style="color:inherit;">Summary</a>
      <a href="employees.html" style="color:inherit;">员工管理</a>
      <button class="btn ghost" onclick="logout()">登出</button>
    </div>`;

  await renderRequests();
}

const typeLabel = { AL: 'AL 年假', OFF: 'Off Day (Extra)', REPLACEMENT_OFF: 'Replacement Off', SWAP: '换班', SWAP_OFF: '换 Off Day', CARRY_FORWARD: '延后 Extra Off' };
const statusLabel = { pending: '待处理', approved: '已批准', rejected: '已拒绝' };

async function renderRequests() {
  const requests = await apiFetch(`/api/requests?status=${currentFilter}`);

  const tabs = ['pending', 'approved', 'rejected', '']
    .map((s) => {
      const label = s ? statusLabel[s] : '全部';
      const active = s === currentFilter;
      return `<button class="btn ${active ? 'primary' : 'ghost'}" onclick="setFilter('${s}')">${label}</button>`;
    })
    .join('');

  const cards = requests.length
    ? requests
        .map(
          (r) => `
      <div class="request-card">
        <div>
          <div><strong>${r.employee_name}</strong> — ${typeLabel[r.request_type]}
            <span class="badge ${r.status}">${statusLabel[r.status]}</span>
          </div>
          <div class="meta">
            日期: ${r.request_date}
            ${r.request_type === 'SWAP' ? ` → 与 ${r.swap_with_name} 对调` : ''}
            ${r.request_type === 'SWAP_OFF' ? ` → 换到 ${r.swap_date}` : ''}
            ${['OFF', 'REPLACEMENT_OFF'].includes(r.request_type) && r.assignee_name ? ` · 代班人: ${r.assignee_name}` : ''}
            ${r.request_type === 'CARRY_FORWARD' ? ` · 延后天数: ${r.carry_days}` : ''}
            ${r.reason ? ` · 原因: ${r.reason}` : ''}
          </div>
        </div>
        ${
          r.status === 'pending'
            ? `<div class="actions">
                <button class="btn approve" onclick="decide(${r.id}, 'approve')">批准</button>
                <button class="btn reject" onclick="decide(${r.id}, 'reject')">拒绝</button>
              </div>`
            : ''
        }
      </div>`
        )
        .join('')
    : `<div class="empty-state">没有${currentFilter ? statusLabel[currentFilter] : ''}的申请。</div>`;

  appEl.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:20px;">${tabs}</div>
    ${cards}
  `;
}

function setFilter(status) {
  currentFilter = status;
  renderRequests();
}

async function decide(id, action) {
  await apiFetch(`/api/requests/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
  await renderRequests();
}

main();
