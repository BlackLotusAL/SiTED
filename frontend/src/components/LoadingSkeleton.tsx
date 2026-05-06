type LoadingSkeletonVariant =
  | "dashboard"
  | "question-list"
  | "question-preview"
  | "practice"
  | "exam"
  | "review-table"
  | "stats"
  | "role-bindings"
  | "route";

interface LoadingSkeletonProps {
  variant: LoadingSkeletonVariant;
  className?: string;
}

export function LoadingSkeleton({ variant, className = "" }: LoadingSkeletonProps) {
  return (
    <div className={`loading-skeleton ${variant} ${className}`.trim()} aria-busy="true" aria-label="内容加载中">
      {renderSkeleton(variant)}
    </div>
  );
}

function renderSkeleton(variant: LoadingSkeletonVariant) {
  if (variant === "dashboard") {
    return (
      <>
        <div className="skeleton-panel skeleton-hero-block">
          <div>
            <span className="skeleton-line short" />
            <span className="skeleton-line title" />
            <span className="skeleton-line" />
            <span className="skeleton-line medium" />
          </div>
          <div className="skeleton-calendar" />
        </div>
        {Array.from({ length: 4 }, (_value, index) => (
          <div className="skeleton-panel skeleton-metric" key={index}>
            <span className="skeleton-line short" />
            <span className="skeleton-line title compact" />
            <span className="skeleton-line medium" />
          </div>
        ))}
      </>
    );
  }

  if (variant === "question-list") {
    return (
      <>
        {Array.from({ length: 5 }, (_value, index) => (
          <div className="skeleton-panel skeleton-question-card" key={index}>
            <span className="skeleton-line short" />
            <span className="skeleton-line title compact" />
            <span className="skeleton-line" />
            <span className="skeleton-line medium" />
          </div>
        ))}
      </>
    );
  }

  if (variant === "question-preview") {
    return (
      <aside className="detail-panel panel question-preview-card skeleton-panel">
        <span className="skeleton-line title compact" />
        <span className="skeleton-line short" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line medium" />
        <div className="skeleton-options">
          {Array.from({ length: 4 }, (_value, index) => (
            <span className="skeleton-option" key={index} />
          ))}
        </div>
      </aside>
    );
  }

  if (variant === "practice" || variant === "exam") {
    return (
      <div className={variant === "exam" ? "exam-layout" : "practice-shell"}>
        <section className="panel skeleton-panel skeleton-paper">
          <span className="skeleton-line short" />
          <span className="skeleton-line title" />
          <span className="skeleton-line" />
          <span className="skeleton-line medium" />
          <div className="skeleton-options">
            {Array.from({ length: 4 }, (_value, index) => (
              <span className="skeleton-option" key={index} />
            ))}
          </div>
          <span className="skeleton-button" />
        </section>
        <aside className="panel skeleton-panel skeleton-side">
          <span className="skeleton-line title compact" />
          <span className="skeleton-line medium" />
          <div className="skeleton-sheet-grid">
            {Array.from({ length: 12 }, (_value, index) => (
              <span key={index} />
            ))}
          </div>
        </aside>
      </div>
    );
  }

  if (variant === "review-table" || variant === "role-bindings") {
    return (
      <section className="skeleton-panel skeleton-table" aria-label="数据加载中">
        <span className="skeleton-line title compact" />
        {Array.from({ length: variant === "role-bindings" ? 4 : 6 }, (_value, index) => (
          <div className="skeleton-row" key={index}>
            <span className="skeleton-line" />
            <span className="skeleton-line medium" />
            <span className="skeleton-line short" />
            <span className="skeleton-line short" />
          </div>
        ))}
      </section>
    );
  }

  if (variant === "stats") {
    return (
      <>
        <div className="stats-kpis">
          {Array.from({ length: 4 }, (_value, index) => (
            <div className="skeleton-panel skeleton-metric" key={index}>
              <span className="skeleton-line short" />
              <span className="skeleton-line title compact" />
              <span className="skeleton-line medium" />
            </div>
          ))}
        </div>
        <div className="stats-layout admin-stats-layout">
          <section className="panel skeleton-panel skeleton-chart" />
          <section className="panel skeleton-panel skeleton-chart" />
        </div>
      </>
    );
  }

  return (
    <section className="panel skeleton-panel skeleton-route">
      <span className="skeleton-line short" />
      <span className="skeleton-line title" />
      <span className="skeleton-line" />
      <span className="skeleton-line medium" />
    </section>
  );
}
