import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export interface CalendarMonth {
  year: number;
  month: number;
  total: number;
  values?: number[];
  days?: Array<{ day: number; count: number }>;
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const MONTHS: CalendarMonth[] = [
  {
    year: 2026,
    month: 4,
    total: 428,
    values: [2, 3, 1, 0, 2, 1, 3, 2, 2, 0, 1, 3, 2, 1, 0, 2, 3, 3, 2, 1, 2, 0, 3, 1, 2, 3, 2, 0, 1, 2]
  },
  {
    year: 2026,
    month: 5,
    total: 312,
    values: [3, 2, 1, 0, 2, 3, 1, 0, 1, 3, 2, 0, 1, 2, 3, 1, 0, 2, 1, 3, 0, 2, 3, 1, 0, 2, 1, 3, 2, 0, 1]
  },
  {
    year: 2026,
    month: 6,
    total: 366,
    values: [1, 2, 0, 3, 1, 2, 0, 1, 3, 2, 2, 0, 1, 3, 2, 1, 0, 2, 3, 2, 1, 0, 3, 1, 2, 0, 1, 3, 2, 1]
  }
];

export function TrainingCalendar({ months = MONTHS, initialMonthIndex }: { months?: CalendarMonth[]; initialMonthIndex?: number } = {}) {
  const [activeMonth, setActiveMonth] = useState(initialMonthIndex ?? Math.min(1, months.length - 1));
  const activeMonths = months.length > 0 ? months : MONTHS;
  const safeActiveMonth = Math.min(activeMonth, activeMonths.length - 1);
  const month = activeMonths[safeActiveMonth];
  const cells = useMemo(() => buildCalendarCells(month), [month]);

  function shiftMonth(delta: number) {
    setActiveMonth((current) => Math.min(Math.max(current + delta, 0), activeMonths.length - 1));
  }

  return (
    <section className="training-calendar" aria-label="月度训练日历">
      <div className="visual-header">
        <h3>训练日历</h3>
        <strong>{month.total} 题</strong>
      </div>
      <div className="month-switcher">
        <button
          className="icon-button small"
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={safeActiveMonth === 0}
          aria-label="上一月"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <span>{formatMonth(month)}</span>
        <button
          className="icon-button small"
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={safeActiveMonth === activeMonths.length - 1}
          aria-label="下一月"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="calendar-grid" role="grid" aria-label={`${formatMonth(month)}训练强度`}>
        {WEEKDAYS.map((weekday) => (
          <span className="weekday-cell" role="columnheader" key={weekday}>
            {weekday}
          </span>
        ))}
        {cells.map((cell, index) =>
          cell.day === undefined ? (
            <span className="day-cell is-empty" role="gridcell" aria-label="空白日期" key={`empty-${index}`} />
          ) : (
            <span
              className={`day-cell is-${cell.intensity}`}
              role="gridcell"
              aria-label={`${month.month} 月 ${cell.day} 日，训练强度 ${cell.intensity}`}
              title={`${month.month} 月 ${cell.day} 日：训练强度 ${cell.intensity}`}
              key={cell.day}
            >
              {cell.day}
            </span>
          )
        )}
      </div>
      <div className="visual-axis">
        <span>{month.month} 月 1 日</span>
        <span>
          {month.month} 月 {daysInMonth(month)} 日
        </span>
      </div>
    </section>
  );
}

function buildCalendarCells(month: CalendarMonth) {
  const days = daysInMonth(month);
  const leadingEmptyCells = (new Date(month.year, month.month - 1, 1).getDay() + 6) % 7;
  const values = month.values ?? valuesFromDays(month.days ?? []);
  const cells: Array<{ day?: number; intensity?: number }> = [];

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    cells.push({});
  }

  for (let day = 1; day <= days; day += 1) {
    cells.push({ day, intensity: values[day - 1] ?? 0 });
  }

  while (cells.length < 42) {
    cells.push({});
  }

  return cells.slice(0, 42);
}

function valuesFromDays(days: Array<{ day: number; count: number }>): number[] {
  const max = Math.max(1, ...days.map((day) => day.count));
  const values = Array<number>(31).fill(0);
  days.forEach((day) => {
    values[day.day - 1] = day.count === 0 ? 0 : Math.min(3, Math.max(1, Math.ceil((day.count / max) * 3)));
  });
  return values;
}

function daysInMonth(month: CalendarMonth): number {
  return new Date(month.year, month.month, 0).getDate();
}

function formatMonth(month: CalendarMonth): string {
  return `${month.year} 年 ${month.month} 月`;
}
