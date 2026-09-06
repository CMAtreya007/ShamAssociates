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
  Star,
  ChevronRight,
  X,
  TrendingUp
} from "lucide-react";

export type NavView = "nifty50" | "sectoral" | "thematic" | "strategy" | "broad" | "custom_stocks" | "catalysts";

interface LeftSidebarProps {
  activeView: NavView;
  onViewChange: (view: NavView) => void;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeView,
  onViewChange,
  onOpenLogs,
  onOpenSettings,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const navItems = [
    { id: "nifty50", label: "Nifty 50", icon: LayoutGrid, count: "50" },
    { id: "catalysts", label: "Corporate Catalysts", icon: CalendarDays, count: "Live", isSpecial: true },
    { id: "sectoral", label: "Sectoral Indices", icon: PieChart, count: "21" },
    { id: "thematic", label: "Thematic Indices", icon: Compass, count: "41" },
    { id: "strategy", label: "Strategy Indices", icon: Target, count: "42" },
    { id: "broad", label: "Broad Market", icon: Layers, count: "18" },
    { id: "custom_stocks", label: "Custom Stocks", icon: Star, count: "Watchlist", isCustom: true },
  ];

  const handleNavClick = (id: NavView) => {
    onViewChange(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavContent = () => (
    <>
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
              onClick={() => handleNavClick(item.id as NavView)}
              className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? "bg-emerald-50 text-[#00B386] border border-emerald-200/80 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#00B386]" : item.isSpecial ? "text-emerald-600" : "text-slate-400"}`} />
                <span className="truncate">{item.label}</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md font-semibold shrink-0 ml-1.5 ${
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

      {/* System & Tools Group */}
      <div className="pt-3 border-t border-slate-200 space-y-1 mt-auto lg:mt-0">
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          System & Tools
        </div>
        
        <button
          onClick={() => {
            onOpenLogs();
            if (onCloseMobile) onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
        >
          <History className="w-4 h-4 text-slate-400 shrink-0" />
          <span>Audit Logs</span>
        </button>

        <button
          onClick={() => {
            onOpenSettings();
            if (onCloseMobile) onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
        >
          <Settings className="w-4 h-4 text-slate-400 shrink-0" />
          <span>Settings & Config</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* 1. Desktop Persistent Left Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex w-60 border-r border-slate-200 bg-white flex-col p-3 gap-3 select-none flex-shrink-0">
        {renderNavContent()}
      </aside>

      {/* 2. Mobile & Tablet Slide-Over Drawer (< 1024px) */}
      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onCloseMobile}
          />

          {/* Drawer sheet container */}
          <div className="relative w-72 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col p-4 gap-3 z-10 select-none animate-in slide-in-from-left duration-200">
            {/* Drawer Header with App Brand & Close Button */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#00B386] to-teal-400 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20">
                  <TrendingUp className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div className="leading-tight">
                  <span className="font-bold text-sm tracking-tight text-slate-900 font-sans">
                    NSE Pulse
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    Navigation Menu
                  </span>
                </div>
              </div>

              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Close Navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation List */}
            <div className="flex-1 overflow-y-auto space-y-3">
              {renderNavContent()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
