const STORAGE_KEY = "broker-goals-v1";
const GOOGLE_SHEET_API = "https://script.google.com/macros/s/AKfycbzU9fh2dRcH8C1bd4qgYWQhg08G2HBRqADYuSWKK7-rr0ZhH3Am_BnuxpasbDPmAVBz/exec";
const BUSINESS_ADMIN_API = "https://script.google.com/macros/s/AKfycby_YVfqeWsBQlHtkd1d5tILCXz3qTcIL7uAmlRI1K2Kp8xjVvxHTU7Jupw8O0nHUinz/exec";

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
let businessPartners = [];

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
  currentGoalSummary: document.querySelector("#currentGoalSummary"),
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
  updateTargetInputStyles();
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
  els.personName.addEventListener("change", renderCurrentGoalSummary);
  els.meetingDate.addEventListener("change", renderCurrentGoalSummary);
  els.finishPersonBtn.addEventListener("click", finishCurrentPerson);
  els.exportBtn.addEventListener("click", exportData);
  els.importFile.addEventListener("change", importData);
  els.clearBtn.addEventListener("click", clearData);

  render();
  refreshFromCloud();
  refreshBusinessPerformance();
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
      storeTarget: data.storeTarget || data.storeTargets || state.storeTarget,
      goals: data.goals
    });
    state.goals = state.goals.filter(hasRequiredGoalFields);
    els.storePerformanceTarget.value = state.storeTarget.performance;
    els.storeListingTarget.value = state.storeTarget.listings;
    updateTargetInputStyles();
    saveState();
    render();
    setSyncStatus(`已連上 Google Sheet，共 ${state.goals.length} 筆小目標`);
  } catch (error) {
    setSyncStatus(`暫時讀不到 Google Sheet，先使用本機資料：${error.message}`, true);
  }
}

async function refreshBusinessPerformance() {
  if (!BUSINESS_ADMIN_API) return;
  try {
    const response = await fetch(`${BUSINESS_ADMIN_API}?action=listAll&ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`讀取失敗：${response.status}`);
    const payload = await response.json();
    if (!payload.ok || !payload.state || !Array.isArray(payload.state.partners)) {
      throw new Error(payload.error || "夥伴績效資料格式不正確");
    }
    businessPartners = payload.state.partners.map((record) => ({
      year: Number(record.year) || 0,
      month: Number(record.month) || 0,
      partnerName: normalizePersonName(record.partnerName),
      annualRevenueTarget: Number(record.annualRevenueTarget) || 0,
      actualRevenue: Number(record.actualRevenue) || 0,
      actualListings: Number(record.actualListings) || 0
    }));
    render();
  } catch (error) {
    console.warn("業務行政系統資料暫時無法讀取", error);
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

async function updateStoreTarget() {
  state.storeTarget = {
    performance: Math.max(0, Number(els.storePerformanceTarget.value) || 0),
    listings: Math.max(0, Number(els.storeListingTarget.value) || 0)
  };
  saveState();
  updateTargetInputStyles();
  render();
  await syncAction("updateStoreTarget", { storeTarget: state.storeTarget }, "大湳店月目標已同步到 Google Sheet");
}

function updateTargetInputStyles() {
  [els.storePerformanceTarget, els.storeListingTarget].forEach((input) => {
    input.classList.toggle("target-filled", Number(input.value) > 0);
  });
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
  renderCurrentGoalSummary();
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
  renderCurrentGoalSummary();
  els.personName.focus();
}

function renderCurrentGoalSummary() {
  if (!els.currentGoalSummary) return;
  const goals = state.goals.filter((goal) => goal.person === els.personName.value && goal.meetingDate === els.meetingDate.value);
  els.currentGoalSummary.innerHTML = goals.length
    ? `<strong>本次已輸入</strong><div>${goals.map((goal) => `<span>${escapeHtml(goal.type)} ${goal.target}</span>`).join("")}</div>`
    : "";
}

function render() {
  const month = els.monthFilter.value;
  const goals = state.goals
    .filter((goal) => goalMonthKey(goal) === month)
    .map((goal) => ({ ...goal, inputGroup: goal.inputGroup || goal.meetingDate }));
  renderTeam(goals);
  renderConfirm(goals);
  renderStats(goals);
  renderCurrentGoalSummary();
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
              ${batch.goals.map(editableGoalItemHtml).join("")}
            </ul>
          </section>
        `).join("")}
      `;
      els.teamBoard.append(card);
    });

  els.teamBoard.querySelectorAll(".batch-tab").forEach((button) => {
    button.addEventListener("click", () => switchBatchPage(button));
  });
  els.teamBoard.querySelectorAll("[data-edit-goal]").forEach((button) => button.addEventListener("click", () => toggleGoalEditor(button.dataset.editGoal, true)));
  els.teamBoard.querySelectorAll("[data-cancel-edit]").forEach((button) => button.addEventListener("click", () => toggleGoalEditor(button.dataset.cancelEdit, false)));
  els.teamBoard.querySelectorAll("[data-save-goal]").forEach((button) => button.addEventListener("click", () => saveGoalEdit(button.dataset.saveGoal)));
  els.teamBoard.querySelectorAll("[data-delete-goal]").forEach((button) => button.addEventListener("click", () => deleteGoal(button.dataset.deleteGoal)));
}

function editableGoalItemHtml(goal) {
  return `<li class="goal-item" data-goal-card="${goal.id}">
    <div class="goal-display">${goalItemHtml(goal).replace(/^\s*<li class="goal-item">|<\/li>\s*$/g, "")}
      <div class="goal-actions"><button type="button" data-edit-goal="${goal.id}">修改</button><button class="delete-btn" type="button" data-delete-goal="${goal.id}">刪除</button></div>
    </div>
    <div class="goal-editor hidden"><div class="edit-grid">
      <label>項目<input data-edit-type value="${escapeHtml(goal.type)}"></label>
      <label>目標<input data-edit-target type="number" min="1" value="${goal.target}"></label>
      <label>會議日期<input data-edit-date type="date" value="${goal.meetingDate}"></label>
      <label>備註<input data-edit-note value="${escapeHtml(goal.note || "")}"></label>
    </div><div class="goal-actions"><button class="primary" type="button" data-save-goal="${goal.id}">儲存修改</button><button type="button" data-cancel-edit="${goal.id}">取消</button></div></div>
  </li>`;
}

function toggleGoalEditor(id, editing) {
  const card = els.teamBoard.querySelector(`[data-goal-card="${id}"]`);
  if (!card) return;
  card.querySelector(".goal-display").classList.toggle("hidden", editing);
  card.querySelector(".goal-editor").classList.toggle("hidden", !editing);
}

async function saveGoalEdit(id) {
  const goal = state.goals.find((item) => item.id === id);
  const card = els.teamBoard.querySelector(`[data-goal-card="${id}"]`);
  if (!goal || !card) return;
  const type = card.querySelector("[data-edit-type]").value.trim();
  const meetingDate = card.querySelector("[data-edit-date]").value;
  if (!type || !meetingDate) return alert("項目與會議日期不能空白");
  goal.type = type;
  goal.target = Math.max(1, Number(card.querySelector("[data-edit-target]").value) || 1);
  goal.meetingDate = meetingDate;
  goal.inputGroup = meetingDate;
  goal.dueDate = getDueDate(meetingDate);
  goal.note = card.querySelector("[data-edit-note]").value.trim();
  saveState(); render();
  await syncAction("updateGoal", { goal }, "小目標修改已同步到 Google Sheet");
}

async function deleteGoal(id) {
  if (!confirm("確定刪除這個小目標嗎？")) return;
  state.goals = state.goals.filter((goal) => goal.id !== id);
  saveState(); render();
  await syncAction("deleteGoal", { id }, "小目標已從 Google Sheet 刪除");
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
  const grouped = groupByPerson(goals);
  if (!Object.keys(grouped).length) {
    els.confirmList.innerHTML = "";
    els.confirmList.append(emptyNode());
    return;
  }
  els.confirmList.innerHTML = Object.entries(grouped)
    .sort((a,b) => latestDate(b[1]).localeCompare(latestDate(a[1])) || a[0].localeCompare(b[0], "zh-Hant"))
    .map(([person, personGoals]) => confirmPersonCardHtml(person, personGoals)).join("");

  els.confirmList.querySelectorAll(".confirm-batch-tab").forEach((button) => {
    button.addEventListener("click", () => switchConfirmPage(button));
  });

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

}

function confirmPersonCardHtml(person, personGoals) {
  const batches = groupByInputBatch(personGoals);
  return `<article class="person-card confirm-person-card">
    <div class="card-head"><div><h3>${escapeHtml(person)}</h3><div class="meta">共 ${batches.length} 個日期頁面</div></div><span class="badge">${personGoals.filter(isDone).length}/${personGoals.length}</span></div>
    <div class="batch-tabs" role="tablist" aria-label="${escapeHtml(person)} 的確認日期">
      ${batches.map((batch, index) => `<button class="batch-tab confirm-batch-tab ${index === 0 ? "active" : ""}" type="button" data-confirm-person="${escapeHtml(person)}" data-confirm-batch="${batch.key}">第 ${index + 1} 頁<br><small>${batch.key}</small></button>`).join("")}
    </div>
    ${batches.map((batch, index) => `<section class="batch-page confirm-batch-page ${index === 0 ? "active" : ""}" data-confirm-person-page="${escapeHtml(person)}" data-confirm-batch-page="${batch.key}"><div class="batch-head"><strong>${batch.key}</strong><span>本日 ${batch.goals.length} 項</span></div><ul class="goal-list">
      ${batch.goals.map((goal) => `<li class="goal-item"><div class="goal-title"><span>${escapeHtml(goal.type)} ${goal.target}</span><span class="badge ${isDone(goal) ? "gold" : ""}">${isDone(goal) ? "已達成" : "未達成"}</span></div><label class="actual-control">實際完成 <input type="number" min="0" value="${goal.actual}" data-actual="${goal.id}"></label><div class="meta">期限 ${goal.dueDate}</div>${goal.note ? `<div class="small">${escapeHtml(goal.note)}</div>` : ""}</li>`).join("")}
    </ul></section>`).join("")}
  </article>`;
}

function switchConfirmPage(button) {
  const card = button.closest(".confirm-person-card");
  const person = button.dataset.confirmPerson;
  const batch = button.dataset.confirmBatch;
  card.querySelectorAll(".confirm-batch-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.confirmPerson === person && tab.dataset.confirmBatch === batch));
  card.querySelectorAll(".confirm-batch-page").forEach((page) => page.classList.toggle("active", page.dataset.confirmPersonPage === person && page.dataset.confirmBatchPage === batch));
}

function renderStats(goals) {
  const grouped = groupByPerson(goals);
  els.statsBoard.innerHTML = "";
  const [selectedYear, selectedMonth] = String(els.monthFilter.value || "").split("-").map(Number);
  const currentMonthPerformance = businessPartners.filter((record) => record.year === selectedYear && record.month === selectedMonth);
  const currentRevenue = currentMonthPerformance.reduce((sum, record) => sum + (Number(record.actualRevenue) || 0), 0);
  const currentListings = currentMonthPerformance.reduce((sum, record) => sum + (Number(record.actualListings) || 0), 0);
  els.storeTargetSummary.innerHTML = `
    <div class="target-box">
      <div class="target-half target-goal-half">
        <span>大湳店月目標</span>
        <strong>業績 ${state.storeTarget.performance} 萬元</strong>
        <strong>進案 ${state.storeTarget.listings} 件</strong>
      </div>
      <div class="target-half target-actual-half">
        <span>本月業績</span>
        <strong>目前業績 ${formatMoney(currentRevenue)} 萬元</strong>
        <strong>目前進案 ${currentListings} 件</strong>
      </div>
    </div>
  `;

  if (!Object.keys(grouped).length) {
    els.statsBoard.append(emptyNode());
    return;
  }

  Object.entries(grouped)
    .sort((a, b) => compareNamesByStroke(a[0], b[0]))
    .forEach(([person, personGoals]) => {
      const completedGoals = personGoals.filter(isDone);
      const byType = summarizeTypes(personGoals);
      const chance = closingChance(personGoals);
      const batches = groupByInputBatch(personGoals).length;
      const performance = performanceForPerson(person, els.monthFilter.value);
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
        <div class="monthly-performance-line">
          <span>本月業績目標 <strong>${formatMoney(performance.monthlyTarget)} 萬</strong></span>
          <span>本月業績 <strong>${formatMoney(performance.monthlyRevenue)} 萬</strong></span>
        </div>
        <div class="annual-performance-line">年度業績總計 <strong>${formatMoney(performance.yearToDateRevenue)} 萬</strong></div>
        <div class="compact-stat-line">
          <span>完成小目標 <strong>${completedGoals.length}</strong></span>
          <span>完成率 <strong>${percent(completedGoals.length, personGoals.length)}%</strong></span>
          <span>成交機率 <strong>${chance}%</strong></span>
        </div>
        <div class="chips">
          ${Object.entries(byType).map(([type, count]) => `<span class="chip">${escapeHtml(type)}：${count}</span>`).join("")}
        </div>
      `;
      els.statsBoard.append(card);
  });
}

function performanceForPerson(person, monthValue) {
  const [year, month] = String(monthValue || "").split("-").map(Number);
  const normalizedName = normalizePersonName(person);
  const records = businessPartners.filter((record) => record.year === year && record.partnerName === normalizedName);
  const selectedRecord = records.find((record) => record.month === month);
  const latestTargetRecord = [...records].sort((a, b) => b.month - a.month).find((record) => record.annualRevenueTarget);
  const annualTarget = Number(selectedRecord?.annualRevenueTarget) || Number(latestTargetRecord?.annualRevenueTarget) || 0;
  return {
    monthlyTarget: annualTarget / 12,
    monthlyRevenue: Number(selectedRecord?.actualRevenue) || 0,
    yearToDateRevenue: records.filter((record) => record.month <= month).reduce((sum, record) => sum + (Number(record.actualRevenue) || 0), 0)
  };
}

function normalizePersonName(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function compareNamesByStroke(nameA, nameB) {
  const surnameStrokes = {
    "王": 4,
    "冷": 7,
    "余": 7,
    "宋": 7,
    "林": 8,
    "胡": 9,
    "徐": 10,
    "詹": 13,
    "劉": 15,
    "潘": 15,
    "陳": 16,
    "鍾": 17,
    "謝": 17,
    "簡": 18,
    "魏": 18
  };
  const surnameA = Array.from(String(nameA).trim())[0] || "";
  const surnameB = Array.from(String(nameB).trim())[0] || "";
  const strokesA = surnameStrokes[surnameA] ?? 999;
  const strokesB = surnameStrokes[surnameB] ?? 999;
  if (strokesA !== strokesB) return strokesA - strokesB;
  return String(nameA).localeCompare(String(nameB), "zh-Hant");
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
  const counts = goals.reduce((sum, goal) => {
    sum[goal.type] = (sum[goal.type] || 0) + Math.max(0, Number(goal.actual) || 0);
    return sum;
  }, {});
  const listings = (counts["進案"] || 0) + (counts["委託"] || 0);
  const showings = counts["帶看"] || 0;
  const negotiations = counts["議價"] || 0;
  const offers = counts["收斡"] || 0;
  const deals = counts["成交"] || 0;
  const prospecting = (counts["拜訪"] || 0) + (counts["社區經營"] || 0) + (counts["人際Social"] || 0);
  const funnelScore = Math.min(22, listings * 4) + Math.min(28, showings * 3.5) + Math.min(18, negotiations * 6) + Math.min(22, offers * 11);
  const supportScore = Math.min(5, prospecting * 0.5);
  const activeDates = new Set(goals.filter((goal) => Number(goal.actual) > 0).map((goal) => goal.meetingDate)).size;
  return Math.min(98, Math.round(deals > 0 ? 90 + Math.min(8, deals * 2) : funnelScore + supportScore + Math.min(5, activeDates * 1.5)));
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
  link.download = `大湳店月統計-${month}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function monthlyStatRows(goals) {
  return Object.entries(groupByPerson(goals))
    .sort((a, b) => latestDate(b[1]).localeCompare(latestDate(a[1])) || a[0].localeCompare(b[0], "zh-Hant"))
    .map(([person, personGoals]) => {
      const completedGoals = personGoals.filter(isDone);
      const performance = performanceForPerson(person, els.monthFilter.value);
      return {
        person,
        latestDate: latestDate(personGoals),
        inputTimes: groupByInputBatch(personGoals).length,
        totalGoals: personGoals.length,
        completedGoals: completedGoals.length,
        completionRate: percent(completedGoals.length, personGoals.length),
        closingChance: closingChance(personGoals),
        monthlyTarget: performance.monthlyTarget,
        monthlyRevenue: performance.monthlyRevenue,
        yearToDateRevenue: performance.yearToDateRevenue,
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
      <td>${formatMoney(row.monthlyTarget)}</td>
      <td>${formatMoney(row.monthlyRevenue)}</td>
      <td>${formatMoney(row.yearToDateRevenue)}</td>
      <td>${escapeHtml(row.items)}</td>
    </tr>
  `).join("") : `<tr><td colspan="11">本月尚無資料</td></tr>`;

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
        <p class="title">大湳店 ${month} 月統計表</p>
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
              <th>本月業績目標（萬元）</th>
              <th>本月業績（萬元）</th>
              <th>年度業績總計（萬元）</th>
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
      updateTargetInputStyles();
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
