export type ReviewTab = "mistakes" | "bookmarks" | "records";

const TABS: Array<{ id: ReviewTab; label: string }> = [
  { id: "mistakes", label: "错题" },
  { id: "bookmarks", label: "收藏" },
  { id: "records", label: "记录" }
];

interface ReviewTabsProps {
  activeTab: ReviewTab;
  onChange: (tab: ReviewTab) => void;
}

export function ReviewTabs({ activeTab, onChange }: ReviewTabsProps) {
  return (
    <div className="segmented review-tabs" role="tablist" aria-label="复习类型">
      {TABS.map((tab) => (
        <button
          className={activeTab === tab.id ? "active" : undefined}
          role="tab"
          aria-selected={activeTab === tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          key={tab.id}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
