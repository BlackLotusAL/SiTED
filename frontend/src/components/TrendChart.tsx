import { useMemo, useState } from "react";

export interface TrendChartPoint {
  label: string;
  value: number;
}

export interface TrendChartProps {
  title: string;
  unit: string;
  data: TrendChartPoint[];
  max?: number;
  color: "blue" | "violet" | "amber";
}

export function TrendChart({ title, unit, data, max, color }: TrendChartProps) {
  const [activePoint, setActivePoint] = useState<TrendChartPoint | null>(null);
  const axisMax = useMemo(() => max ?? roundUp(Math.max(...data.map((point) => point.value), 1)), [data, max]);
  const midpoint = Math.round(axisMax / 2);

  return (
    <figure className="mini-chart" aria-label={`${title} 近 7 天趋势`}>
      <figcaption className="chart-title">
        <span>
          <b className={color}></b>
          {title}
        </span>
        <em>单位：{unit}</em>
      </figcaption>
      <div className="mini-y-axis" aria-hidden="true">
        <span>{axisMax.toLocaleString("zh-CN")}</span>
        <span>{midpoint.toLocaleString("zh-CN")}</span>
        <span>0</span>
      </div>
      <div className="mini-chart-area">
        {data.map((point) => (
          <button
            aria-label={`${point.label} ${title} ${point.value} ${unit}`}
            className={`chart-bar ${color}`}
            data-testid="trend-chart-bar"
            key={point.label}
            onBlur={() => setActivePoint(null)}
            onFocus={() => setActivePoint(point)}
            onMouseEnter={() => setActivePoint(point)}
            onMouseLeave={() => setActivePoint(null)}
            style={{ height: `${Math.max(8, Math.round((point.value / axisMax) * 100))}%` }}
            type="button"
          />
        ))}
        {activePoint ? (
          <div className="chart-tooltip" role="tooltip">
            {activePoint.label} {title} {activePoint.value.toLocaleString("zh-CN")} {unit}
          </div>
        ) : null}
      </div>
      <div className="mini-x-axis" aria-hidden="true">
        {data.map((point) => (
          <span data-testid="trend-chart-x-label" key={point.label}>
            {point.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

function roundUp(value: number): number {
  if (value <= 10) {
    return 10;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}
