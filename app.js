const STORAGE_KEY = "broker-goals-v1";
const GOOGLE_SHEET_API = "https://script.google.com/macros/s/AKfycbzU9fh2dRcH8C1bd4qgYWQhg08G2HBRqADYuSWKK7-rr0ZhH3Am_BnuxpasbDPmAVBz/exec";

const quotes = [
  "成交不是奇蹟，是每天多做一點。",
  "先有動作，才有機會。",
  "今天多拜訪，月底多漂亮。",
  "小目標做到位，大結果自然到位。",
  "客戶不會憑空出現，但會被勤快遇見。",
  "把該做的做完，好運就會比較忙。",
  "每一通電話，都可能是下一張委託。",
  "跑在市場前面，市場就會回頭看你。",
  "目標要小，手腳要快。",
  "別等狀態好，做了狀態就好。"
];

const closingWeights = {
  "成交": 28,
  "收斡": 18,
  "議價": 14,
  "帶看": 11,
  "進案": 10,
  "委託": 10,
  "拜訪": 7,
  "廣告": 5,
  "發DM": 4,
  "DM": 4,
  "掃街": 4
};

let state = normalizeState(loadState());

const els = {
  weeklyQuote: document.querySelector("#weeklyQuote"),
  monthFilter: document.querySelector("#monthFilter"),
  storePerformanceTarget: document.querySelector("#storePerformanceTarget"),
  storeListingTarget: document.querySelector("#storeListingTarget"),
  goalForm: document.querySelector("#goalForm"),
  personName: document.querySelector("#personName"),
  meetingDate: document.querySelector("#meetingDate"),
  goalType: document.querySelector("#goalType"),
  customTypeWrap: document.querySelector("#customTypeWrap"),
  customType: document.querySelector("#customType"),
  targetCount: document.querySelector("#targetCount"),
  goalNote: document.querySelector("#goalNote"),
  finishPersonBtn: document.querySelector("#finishPersonBtn"),
  teamBoard: document.querySelector("#teamBoard"),
  confirmList: document.querySelector("#confirmList"),
  statsBoard: document.querySelector("#statsBoard"),
  storeTargetSummary: document.querySelector("#storeTargetSummary"),
  syncStatus: document.querySelector("#syncStatus"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  clearBtn: document.querySelector("#clearBtn"),
  emptyTemplate: document.querySelector("#emptyTemplate")
};

init();

function init() {
  const today = new Date();
  els.monthFilter.value = monthKey(today);
  els.meetingDate.value = isoDate(today);
  els.storePerformanceTarget.value = state.storeTarget.performance;
  els.storeListingTarget.value = state.storeTarget.listings;
  els.weeklyQuote.textContent = quotes[getWeekNumber(today) % quotes.length];

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  els.goalType.addEventListener("change", () => {
    els.customTypeWrap.classList.toggle("hidden", els.goalType.value !== "custom");
  });

  [els.storePerformanceTarget, els.storeListingTarget].forEach((input) => {
    input.addEventListener("change", updateStoreTarget);
  });

  els.monthFilter.addEventListener("change", render);
  els.goalForm.addEventListener("submit", addGoal);
  els.finishPersonBtn.addEventListener("click", finishCurrentPerson);
  els.exportBtn.addEventListener("click", exportData);
  els.importFile.addEventListener("change", importData);
  els.clearBtn.addEventListener("click", clearData);

  render();
  refreshFromCloud();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && Array.isArray(saved.goals) ? saved : { goals: [] };
  } catch {
    return { goals: [] };
  }
}

function normalizeState(rawState) {
  const storeTarget = rawState.storeTarget || {
    performance: Number(rawState.performanceTarget) || 0,
    listings: Number(rawState.listingTarget) || 0
  };

  return {
    storeTarget: {
      performance: Number(storeTarget.performance) || 0,
      listings: Number(storeTarget.listings) || 0
    },
    goals: (rawState.goals || []).map(normalizeGoal)
  };
}

function normalizeGoal(goal) {
  const meetingDate = normalizeDateValue(goal.meetingDate);
  const dueDate = normalizeDateValue(goal.dueDate) || getDueDate(meetingDate);
  const inputGroup = normalizeDateValue(goal.inputGroup) || meetingDate || normalizeDateValue(goal.createdAt) || "";

  return {
    ...goal,
    meetingDate,
    dueDate,
    inputGroup,
    target: Number(goal.target) || 0,
    actual: Number(goal.actual) || 0
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function refreshFromCloud() {
  if (!GOOGLE_SHEET_API) return;

  setSyncStatus("正在讀取 Google Sheet...");
  try {
    const response = await fetch(`${GOOGLE_SHEET_API}?action=list&t=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`讀取失敗：${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data.goals)) throw new Error(data.error || "資料格式不正確");

    state = normalizeState({
      ...state,
      goals: data.goals
    });
    state.goals = state.goals.filter(hasRequiredGoalFields);
    saveState();
    render();
    setSyncStatus(`已連上 Google Sheet，共 ${state.goals.length} 筆小目標`);
  } catch (error) {
    setSyncStatus(`暫時讀不到 Google Sheet，先使用本機資料：${error.message}`, true);
  }
}

async function syncAction(action, payload, successMessage) {
  if (!GOOGLE_SHEET_API) return;

  setSyncStatus("正在同步 Google Sheet...");
  try {
    await fetch(GOOGLE_SHEET_API, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        action,
        ...payload
      })
    });
    setSyncStatus(successMessage);
  } catch (error) {
    setSyncStatus(`同步失敗，資料已先留在本機：${error.message}`, true);
  }
}

function setSyncStatus(message, isError = false) {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = message;
  els.syncStatus.classList.toggle("error", isError);
}

function hasRequiredGoalFields(goal) {
  return goal && goal.id && goal.person && goal.meetingDate && goal.type;
}

function updateStoreTarget() {
  state.storeTarget = {
    performance: Math.max(0, Number(els.storePerformanceTarget.value) || 0),
    listings: Math.max(0, Number(els.storeListingTarget.value) || 0)
  };
  saveState();
  render();
}

async function addGoal(event) {
  event.preventDefault();
  const type = els.goalType.value === "custom" ? els.customType.value.trim() : els.goalType.value;
  const person = els.personName.value.trim();
  if (!type || !person) return;

  const meetingDate = els.meetingDate.value;
  const createdAt = new Date().toISOString();
  const goal = {
    id: window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    person,
    meetingDate,
    dueDate: getDueDate(meetingDate),
    inputGroup: meetingDate,
    type,
    target: Number(els.targetCount.value) || 1,
    actual: 0,
    note: els.goalNote.value.trim(),
    createdAt
  };

  state.goals.push(goal);
  saveState();
  resetGoalFieldsOnly();
  render();
  els.goalType.focus();
  await syncAction("addGoal", { goal }, "小目標已同步到 Google Sheet");
}

function resetGoalFieldsOnly() {
  els.goalType.value = "進案";
  els.customType.value = "";
  els.customTypeWrap.classList.add("hidden");
  els.targetCount.value = 1;
  els.goalNote.value = "";
}

function finishCurrentPerson() {
  els.personName.value = "";
  resetGoalFieldsOnly();
  els.personName.focus();
}

function render() {
  const month = els.monthFilter.value;
  const goals = state.goals
    .filter((goal) => goalMonthKey(goal) === month)
    .map((goal) => ({ ...goal, inputGroup: goal.inputGroup || goal.meetingDate }));
  renderTeam(goals);
  renderConfirm(goals);
  renderStats(goals);
}

function renderTeam(goals) {
  const grouped = groupByPerson(goals);
  els.teamBoard.innerHTML = "";
  if (!Object.keys(grouped).length) {
    els.teamBoard.append(emptyNode());
    return;
  }

  Object.entries(grouped)
    .sort((a, b) => latestDate(b[1]).localeCompare(latestDate(a[1])) || a[0].localeCompare(b[0], "zh-Hant"))
    .forEach(([person, personGoals]) => {
      const completed = personGoals.filter(isDone).length;
      const batches = groupByInputBatch(personGoals);
      const card = document.createElement("article");
      card.className = "person-card";
      card.innerHTML = `
        <div class="card-head">
          <div>
            <h3>${escapeHtml(person)}</h3>
            <div class="meta">已輸入 ${batches.length} 次，共 ${personGoals.length} 個小目標，完成 ${completed} 個</div>
          </div>
          <span class="badge">${percent(completed, personGoals.length)}%</span>
        </div>
        <div class="batch-tabs" role="tablist" aria-label="${escapeHtml(person)} 的輸入日期">
          ${batches.map((batch, index) => `
            <button class="batch-tab ${index === 0 ? "active" : ""}" type="button" data-person="${escapeHtml(person)}" data-batch="${escapeHtml(batch.key)}">
              第 ${index + 1} 頁
            </button>
          `).join("")}
        </div>
        ${batches.map((batch, index) => `
          <section class="batch-page ${index === 0 ? "active" : ""}" data-person-page="${escapeHtml(person)}" data-batch-page="${escapeHtml(batch.key)}">
            <div class="batch-head">
              <strong>${batch.key}</strong>
              <span>本頁 ${batch.goals.length} 個小目標</span>
            </div>
            <ul class="goal-list">
              ${batch.goals.map(goalItemHtml).join("")}
            </ul>
          </section>
        `).join("")}
      `;
      els.teamBoard.append(card);
    });

  els.teamBoard.querySelectorAll(".batch-tab").forEach((button) => {
    button.addEventListener("click", () => switchBatchPage(button));
  });
}

function groupByInputBatch(goals) {
  const grouped = goals.reduce((batches, goal) => {
    const key = goal.inputGroup || goal.meetingDate;
    batches[key] = batches[key] || [];
    batches[key].push(goal);
    return batches;
  }, {});

  return Object.entries(grouped)
    .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
    .map(([key, batchGoals]) => ({
      key,
      goals: batchGoals.sort(compareGoalsNewestFirst)
    }));
}

function switchBatchPage(button) {
  const person = button.dataset.person;
  const batch = button.dataset.batch;
  const card = button.closest(".person-card");
  card.querySelectorAll(".batch-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.person === person && tab.dataset.batch === batch);
  });
  card.querySelectorAll(".batch-page").forEach((page) => {
    page.classList.toggle("active", page.dataset.personPage === person && page.dataset.batchPage === batch);
  });
}

function goalItemHtml(goal) {
  const value = Math.min(100, percent(goal.actual, goal.target));
  const status = isDone(goal) ? "完成" : "進行中";
  const note = goal.note ? `<div class="small">${escapeHtml(goal.note)}</div>` : "";
  return `
    <li class="goal-item">
      <div class="goal-title">
        <span>${escapeHtml(goal.type)} ${goal.target}</span>
        <span>${status}</span>
      </div>
      <div class="progress" aria-label="完成率 ${value}%"><span style="--value:${value}%"></span></div>
      <div class="meta">實際 ${goal.actual} / ${goal.target}，期限 ${goal.dueDate}</div>
      ${note}
    </li>
  `;
}

function renderConfirm(goals) {
  const sortedGoals = [...goals].sort(compareConfirmOrder);
  if (!sortedGoals.length) {
    els.confirmList.innerHTML = "";
    els.confirmList.append(emptyNode());
    return;
  }

  els.confirmList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>夥伴</th>
          <th>最新會議日期</th>
          <th>項目</th>
          <th>目標</th>
          <th>實際完成</th>
          <th>會議日期</th>
          <th>期限</th>
          <th>狀態</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${sortedGoals.map((goal) => `
          <tr>
            <td data-label="夥伴">${escapeHtml(goal.person)}</td>
            <td data-label="最新會議日期">${goal.meetingDate}</td>
            <td data-label="項目">${escapeHtml(goal.type)}</td>
            <td data-label="目標">${goal.target}</td>
            <td data-label="實際完成"><input type="number" min="0" value="${goal.actual}" data-actual="${goal.id}"></td>
            <td data-label="會議日期">${goal.meetingDate}</td>
            <td data-label="期限">${goal.dueDate}</td>
            <td data-label="狀態"><span class="badge ${isDone(goal) ? "gold" : ""}">${isDone(goal) ? "已達成" : "未達成"}</span></td>
            <td data-label="操作"><button class="delete-btn" type="button" data-delete="${goal.id}">刪除</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  els.confirmList.querySelectorAll("[data-actual]").forEach((input) => {
    input.addEventListener("change", async () => {
      const goal = state.goals.find((item) => item.id === input.dataset.actual);
      if (!goal) return;
      goal.actual = Math.max(0, Number(input.value) || 0);
      saveState();
      render();
      await syncAction("updateActual", { id: goal.id, actual: goal.actual }, "完成數已同步到 Google Sheet");
    });
  });

  els.confirmList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.delete;
      state.goals = state.goals.filter((goal) => goal.id !== button.dataset.delete);
      saveState();
      render();
      await syncAction("deleteGoal", { id }, "資料已從 Google Sheet 刪除");
    });
  });
}

function renderStats(goals) {
  const grouped = groupByPerson(goals);
  els.statsBoard.innerHTML = "";
  els.storeTargetSummary.innerHTML = `
    <div class="target-box">
      <span>大湳店月目標</span>
      <strong>業績 ${state.storeTarget.performance} 萬元</strong>
      <strong>進案 ${state.storeTarget.listings} 件</strong>
    </div>
  `;

  if (!Object.keys(grouped).length) {
    els.statsBoard.append(emptyNode());
    return;
  }

  Object.entries(grouped)
    .sort((a, b) => latestDate(b[1]).localeCompare(latestDate(a[1])) || a[0].localeCompare(b[0], "zh-Hant"))
    .forEach(([person, personGoals]) => {
      const completedGoals = personGoals.filter(isDone);
      const byType = summarizeTypes(personGoals);
      const chance = closingChance(personGoals);
      const batches = groupByInputBatch(personGoals).length;
      const card = document.createElement("article");
      card.className = `stat-card ${chance < 60 ? "chance-low" : "chance-high"}`;
      card.innerHTML = `
        <div class="card-head">
          <div>
            <h3>${escapeHtml(person)}</h3>
            <div class="meta">本月已輸入 ${batches} 次，最新日期 ${latestDate(personGoals)}</div>
          </div>
          <span class="badge">${completedGoals.length} / ${personGoals.length}</span>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <div class="small">完成小目標</div>
            <p class="stat-number">${completedGoals.length}</p>
          </div>
          <div class="stat-box">
            <div class="small">完成百分率</div>
            <p class="stat-number">${percent(completedGoals.length, personGoals.length)}%</p>
          </div>
          <div class="stat-box">
            <div class="small">成交機率</div>
            <p class="stat-number">${chance}%</p>
          </div>
        </div>
        <div class="chips">
          ${Object.entries(byType).map(([type, count]) => `<span class="chip">${escapeHtml(type)}：${count}</span>`).join("")}
        </div>
      `;
      els.statsBoard.append(card);
    });
}

function compareConfirmOrder(a, b) {
  const personCompare = String(a.person || "").localeCompare(String(b.person || ""), "zh-Hant");
  if (personCompare !== 0) return personCompare;
  return compareGoalsNewestFirst(a, b);
}

function compareGoalsNewestFirst(a, b) {
  const dateCompare = String(b.meetingDate || b.inputGroup).localeCompare(String(a.meetingDate || a.inputGroup));
  if (dateCompare !== 0) return dateCompare;
  return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

function latestDate(goals) {
  return goals.reduce((latest, goal) => {
    const date = goal.meetingDate || goal.inputGroup || "";
    return date > latest ? date : latest;
  }, "");
}

function groupByPerson(goals) {
  return goals.reduce((grouped, goal) => {
    const key = goal.person || "未命名";
    grouped[key] = grouped[key] || [];
    grouped[key].push(goal);
    return grouped;
  }, {});
}

function summarizeTypes(goals) {
  return goals.reduce((summary, goal) => {
    summary[goal.type] = (summary[goal.type] || 0) + 1;
    return summary;
  }, {});
}

function closingChance(goals) {
  if (!goals.length) return 0;
  const completedScore = goals.reduce((score, goal) => {
    const completionRatio = Math.min(1, goal.actual / goal.target);
    return score + completionRatio * (closingWeights[goal.type] || 6);
  }, 0);
  const consistencyBonus = goals.filter(isDone).length * 3;
  return Math.min(95, Math.round(12 + completedScore + consistencyBonus));
}

function getDueDate(dateValue) {
  const normalizedDate = normalizeDateValue(dateValue);
  const date = new Date(`${normalizedDate}T00:00:00`);
  date.setDate(date.getDate() + (date.getDay() === 4 ? 4 : 3));
  return isoDate(date);
}

function isDone(goal) {
  return Number(goal.actual) >= Number(goal.target);
}

function percent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function goalMonthKey(goal) {
  const normalizedDate = normalizeDateValue(goal.meetingDate);
  if (!normalizedDate) return "";
  return normalizedDate.slice(0, 7);
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return isoDate(value);

  const text = String(value).trim();
  const ymd = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${String(ymd[2]).padStart(2, "0")}-${String(ymd[3]).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return isoDate(parsed);
  return "";
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWeekNumber(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - start) / 86400000);
  return Math.ceil((days + start.getDay() + 1) / 7);
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
}

function exportData() {
  const month = els.monthFilter.value || monthKey(new Date());
  const goals = state.goals.filter((goal) => goalMonthKey(goal) === month);
  const rows = monthlyStatRows(goals);
  const html = buildExcelHtml(month, rows);
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `大湳店月底統計-${month}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function monthlyStatRows(goals) {
  return Object.entries(groupByPerson(goals))
    .sort((a, b) => latestDate(b[1]).localeCompare(latestDate(a[1])) || a[0].localeCompare(b[0], "zh-Hant"))
    .map(([person, personGoals]) => {
      const completedGoals = personGoals.filter(isDone);
      return {
        person,
        latestDate: latestDate(personGoals),
        inputTimes: groupByInputBatch(personGoals).length,
        totalGoals: personGoals.length,
        completedGoals: completedGoals.length,
        completionRate: percent(completedGoals.length, personGoals.length),
        closingChance: closingChance(personGoals),
        items: Object.entries(summarizeTypes(personGoals)).map(([type, count]) => `${type}：${count}`).join("、")
      };
    });
}

function buildExcelHtml(month, rows) {
  const tableRows = rows.length ? rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.person)}</td>
      <td>${row.latestDate}</td>
      <td>${row.inputTimes}</td>
      <td>${row.totalGoals}</td>
      <td>${row.completedGoals}</td>
      <td>${row.completionRate}%</td>
      <td>${row.closingChance}%</td>
      <td>${escapeHtml(row.items)}</td>
    </tr>
  `).join("") : `<tr><td colspan="8">本月尚無資料</td></tr>`;

  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #999; padding: 8px; mso-number-format:"\\@"; }
          th { background: #eaf4ef; font-weight: bold; }
          .title { font-size: 18px; font-weight: bold; }
        </style>
      </head>
      <body>
        <p class="title">大湳店 ${month} 月底統計表</p>
        <p>月目標：業績 ${state.storeTarget.performance} 萬元；進案 ${state.storeTarget.listings} 件</p>
        <table>
          <thead>
            <tr>
              <th>夥伴</th>
              <th>最新會議日期</th>
              <th>輸入次數</th>
              <th>小目標總數</th>
              <th>完成小目標</th>
              <th>完成百分率</th>
              <th>成交機率</th>
              <th>項目統計</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.goals)) throw new Error("資料格式不正確");
      state = normalizeState(imported);
      els.storePerformanceTarget.value = state.storeTarget.performance;
      els.storeListingTarget.value = state.storeTarget.listings;
      saveState();
      render();
    } catch (error) {
      alert(error.message);
    }
  };
  reader.readAsText(file);
}

function clearData() {
  if (!confirm("確定要清空所有小目標資料嗎？")) return;
  state = {
    storeTarget: {
      performance: Number(els.storePerformanceTarget.value) || 0,
      listings: Number(els.storeListingTarget.value) || 0
    },
    goals: []
  };
  saveState();
  render();
}

function emptyNode() {
  return els.emptyTemplate.content.firstElementChild.cloneNode(true);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
