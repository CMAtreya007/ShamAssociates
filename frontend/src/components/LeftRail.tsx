import React from "react";
import { 
  LayoutGrid, 
  PieChart, 
  Compass, 
  Target, 
  Layers, 
  History, 
  Settings, 
  FileCode2 
} from "lucide-react";

export type NavView = "nifty50" | "sectoral" | "thematic" | "strategy" | "broad";

interface LeftRailProps {
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
}

export const LeftRail: React.FC<LeftRailProps> = ({
  activeView,
  onViewChange,
  onOpenLogs,
  onOpenSettings,
}) => {
  const navItems = [
    { id: "nifty50", label: "Nifty 50", icon: LayoutGrid, count: "50" },
    { id: "sectoral", label: "Sectoral", icon: PieChart, count: "21" },
    { id: "thematic", label: "Thematic", icon: Compass, count: "41" },
    { id: "strategy", label: "Strategy", icon: Target, count: "42" },
    { id: "broad", label: "Broad Market", icon: Layers, count: "18" },
  ];

  return (
    <aside className="w-56 border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-col justify-between p-3 select-none flex-shrink-0">
      
      {/* Navigation Group */}
      <div className="space-y-1">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Market Views
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as NavView)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition ${
                isActive
                  ? "bg-[var(--bg-base)] text-[var(--accent)] border border-[var(--border-hairline)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-hover)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`} />
                <span>{item.label}</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1F2530] text-[var(--text-muted)]">
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom Tools & Config */}
      <div className="pt-3 border-t border-[var(--border-hairline)] space-y-1">
        
        <button
          onClick={onOpenLogs}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-hover)] transition"
        >
          <History className="w-4 h-4 text-[var(--text-muted)]" />
          <span>Audit Logs</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-hover)] transition"
        >
          <Settings className="w-4 h-4 text-[var(--text-muted)]" />
          <span>Settings & Config</span>
        </button>

        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition"
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>FastAPI Swagger Docs</span>
        </a>

      </div>

    </aside>
  );
};
