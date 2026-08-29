import React from "react";
import { 
  LayoutGrid, 
  PieChart, 
  Compass, 
  Target, 
  Layers, 
  CalendarDays,
  History, 
  Settings, 
  ChevronRight
} from "lucide-react";

export type NavView = "nifty50" | "sectoral" | "thematic" | "strategy" | "broad" | "catalysts";

interface LeftSidebarProps {
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeView,
  onViewChange,
  onOpenLogs,
  onOpenSettings,
}) => {
  const navItems = [
    { id: "nifty50", label: "Nifty 50", icon: LayoutGrid, count: "50" },
    { id: "catalysts", label: "Corporate Catalysts", icon: CalendarDays, count: "Live", isSpecial: true },
    { id: "sectoral", label: "Sectoral Indices", icon: PieChart, count: "21" },
    { id: "thematic", label: "Thematic Indices", icon: Compass, count: "41" },
    { id: "strategy", label: "Strategy Indices", icon: Target, count: "42" },
    { id: "broad", label: "Broad Market", icon: Layers, count: "18" },
  ];

  return (
    <aside className="w-60 border-r border-slate-200 bg-white flex flex-col p-3 gap-3 select-none flex-shrink-0">
      
      {/* Navigation Group: Market Categories */}
      <div className="space-y-1">
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Market Categories
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as NavView)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                isActive
                  ? "bg-emerald-50 text-[#00B386] border border-emerald-200/80 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? "text-[#00B386]" : item.isSpecial ? "text-emerald-600" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md font-semibold ${
                isActive 
                  ? "bg-emerald-100/70 text-emerald-800" 
                  : item.isSpecial 
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" 
                  : "bg-slate-100 text-slate-500"
              }`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* System & Tools Group Placed Directly Below Market Categories */}
      <div className="pt-3 border-t border-slate-200 space-y-1">
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          System & Tools
        </div>
        
        <button
          onClick={onOpenLogs}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
        >
          <History className="w-4 h-4 text-slate-400" />
          <span>Audit Logs</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings & Config</span>
        </button>

      </div>

    </aside>
  );
};
