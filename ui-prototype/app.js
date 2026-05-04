const iconPaths = {
  dashboard: '<path d="M4 13h6V5H4v8Zm10 6h6V5h-6v14ZM4 19h6v-3H4v3Z"/>',
  search: '<circle cx="10" cy="10" r="5"/><path d="m14 14 4 4"/>',
  practice: '<path d="M5 5h10l4 4v10H5V5Z"/><path d="M14 5v5h5M8 14h8M8 17h5"/>',
  review: '<path d="M5 6h14M5 12h14M5 18h9"/><path d="m16 17 2 2 4-5"/>',
  exam: '<path d="M6 4h12l2 3v13H4V7l2-3Z"/><path d="M8 10h8M8 14h8M8 18h5"/>',
  admin: '<path d="M12 4 5 7v5c0 4 3 7 7 8 4-1 7-4 7-8V7l-7-3Z"/><path d="M9 12h6M12 9v6"/>',
  stats: '<path d="M5 19V9M12 19V5M19 19v-7"/><path d="M4 19h17"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>',
  bookmark: '<path d="M7 5h10v15l-5-3-5 3V5Z"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>'
};

document.querySelectorAll("[data-icon]").forEach((node) => {
  const name = node.dataset.icon;
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ""}</svg>`;
});

const title = document.getElementById("page-title");
const pages = [...document.querySelectorAll(".page")];
const navItems = [...document.querySelectorAll(".nav-item")];

function showPage(pageId, syncHash = true) {
  pages.forEach((page) => page.classList.toggle("active", page.id === pageId));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.page === pageId));
  const nextPage = document.getElementById(pageId);
  if (nextPage) title.textContent = nextPage.dataset.title;
  if (syncHash && nextPage) window.history.replaceState(null, "", `#${pageId}`);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-page]");
  const jump = event.target.closest("[data-page-jump]");
  if (nav) showPage(nav.dataset.page);
  if (jump) showPage(jump.dataset.pageJump);
});

window.addEventListener("hashchange", () => {
  const pageId = window.location.hash.replace("#", "");
  if (document.getElementById(pageId)) showPage(pageId, false);
});

const initialPage = window.location.hash.replace("#", "");
if (document.getElementById(initialPage)) showPage(initialPage, false);

const options = [...document.querySelectorAll("#practice .option")];
options.forEach((option) => {
  option.addEventListener("click", () => {
    options.forEach((item) => item.classList.remove("is-selected"));
    option.classList.add("is-selected");
  });
});

const submitAnswer = document.getElementById("submit-answer");
if (submitAnswer) {
  submitAnswer.addEventListener("click", () => {
    options.forEach((option) => {
      option.classList.remove("is-selected", "is-correct", "is-wrong");
      if (option.dataset.answer === "correct") option.classList.add("is-correct");
    });
    document.getElementById("answer-panel").hidden = false;
  });
}

document.querySelectorAll("[data-review-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.reviewTab;
    document.querySelectorAll("[data-review-tab]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll("[data-review-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.reviewPanel === tab);
    });
  });
});

const weekdayHeaders = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const monthData = [
  {
    year: 2026,
    month: 3,
    label: "2026 年 3 月",
    total: "286 题",
    days: 31,
    values: [0, 1, 0, 2, 1, 3, 2, 0, 1, 3, 0, 2, 1, 0, 2, 3, 1, 1, 0, 2, 3, 0, 1, 2, 0, 3, 1, 2, 1, 0, 2]
  },
  {
    year: 2026,
    month: 4,
    label: "2026 年 4 月",
    total: "428 题",
    days: 30,
    values: [2, 3, 1, 0, 2, 1, 3, 2, 2, 0, 1, 3, 2, 1, 0, 2, 3, 3, 2, 1, 2, 0, 3, 1, 2, 3, 2, 0, 1, 2]
  },
  {
    year: 2026,
    month: 5,
    label: "2026 年 5 月",
    total: "312 题",
    days: 31,
    values: [3, 2, 1, 0, 2, 3, 1, 0, 1, 3, 2, 0, 1, 2, 3, 1, 0, 2, 1, 3, 0, 2, 3, 1, 0, 2, 1, 3, 2, 0, 1]
  }
];

let activeMonthIndex = 2;
const calendarGrid = document.querySelector("[data-calendar-grid]");
const monthLabel = document.querySelector("[data-month-label]");
const monthTotal = document.querySelector("[data-month-total]");
const monthStart = document.querySelector("[data-month-start]");
const monthEnd = document.querySelector("[data-month-end]");

function appendEmptyCell() {
  const cell = document.createElement("span");
  cell.className = "day-cell is-empty";
  cell.setAttribute("aria-hidden", "true");
  calendarGrid.appendChild(cell);
}

function renderMonth(index) {
  if (!calendarGrid) return;
  activeMonthIndex = Math.max(0, Math.min(monthData.length - 1, index));
  const month = monthData[activeMonthIndex];
  const firstDay = new Date(month.year, month.month - 1, 1).getDay();
  const leadingEmptyCells = (firstDay + 6) % 7;
  const totalCells = leadingEmptyCells + month.days;
  const trailingEmptyCells = Math.max(0, 42 - totalCells);

  monthLabel.textContent = month.label;
  monthTotal.textContent = month.total;
  monthStart.textContent = `${month.month} 月 1 日`;
  monthEnd.textContent = `${month.month} 月 ${month.days} 日`;
  calendarGrid.innerHTML = "";

  weekdayHeaders.forEach((weekday) => {
    const header = document.createElement("span");
    header.className = "weekday-cell";
    header.textContent = weekday;
    calendarGrid.appendChild(header);
  });

  for (let i = 0; i < leadingEmptyCells; i += 1) appendEmptyCell();

  for (let day = 1; day <= month.days; day += 1) {
    const cell = document.createElement("span");
    const intensity = month.values[day - 1] || 0;
    cell.className = `day-cell is-${intensity}`;
    cell.textContent = day;
    cell.title = `${month.month} 月 ${day} 日：训练强度 ${intensity}`;
    calendarGrid.appendChild(cell);
  }

  for (let i = 0; i < trailingEmptyCells; i += 1) appendEmptyCell();
}

document.querySelectorAll("[data-month-shift]").forEach((button) => {
  button.addEventListener("click", () => {
    renderMonth(activeMonthIndex + Number(button.dataset.monthShift));
  });
});

renderMonth(activeMonthIndex);
