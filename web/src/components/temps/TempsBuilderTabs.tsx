type Tab<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
};

export function TempsBuilderTabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="temps-builder-tabs" role="tablist" aria-label="Builder steps">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`temps-builder-tab${active === tab.id ? " is-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="temps-builder-tab-num">{index + 1}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
