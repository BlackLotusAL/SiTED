import type { ReactNode } from "react";

interface StatsPanelProps {
  title: string;
  children: ReactNode;
}

export function StatsPanel({ title, children }: StatsPanelProps) {
  return (
    <section className="panel stats-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
