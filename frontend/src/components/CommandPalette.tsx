import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, TrendingUp, TrendingDown, FileSpreadsheet, RefreshCw, X } from "lucide-react";
import { Nifty50Stock } from "../types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stocks: Nifty50Stock[];
  onSelectStock: (symbol: string) => void;
  onExport: () => void;
  onSync: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  stocks,
  onSelectStock,
  onExport,
  onSync,
}) => {
  const [search, setSearch] = useState("");

  // Keyboard shortcut listener (⌘K or Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName))) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-modal overflow-hidden text-sm font-sans">
        <Command className="flex flex-col h-full" loop>
          
          {/* Search Input Bar */}
          <div className="flex items-center px-4 py-3 border-b border-slate-100 gap-3 bg-white">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search stocks, sectors, commands (e.g. RELIANCE, TCS, Export)..."
              className="w-full bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs font-sans"
              autoFocus
            />
            <button
              onClick={() => onOpenChange(false)}
              className="text-[10px] px-2 py-1 rounded-md bg-slate-100 text-slate-500 hover:text-slate-800 font-mono font-medium"
            >
              ESC
            </button>
          </div>

          {/* Results List */}
          <Command.List className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-50">
            
            <Command.Empty className="py-8 text-center text-xs text-slate-400">
              No matching stocks or commands found.
            </Command.Empty>

            {/* Quick Actions Group */}
            <Command.Group heading="Quick Actions" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2">
              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onExport();
                }}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer hover:bg-emerald-50 text-xs text-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-[#00B386]" />
                  <span className="font-semibold text-slate-800">Download All Multi-Sheet Workbooks (.xlsx)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">⌘+E</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onSync();
                }}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer hover:bg-blue-50 text-xs text-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-slate-800">Trigger Immediate NSE Market Sync</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">⌘+R</span>
              </Command.Item>
            </Command.Group>

            {/* Constituents Group */}
            <Command.Group heading="Nifty 50 Constituents" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2 mt-1">
              {stocks.map((stock) => {
                const pct = stock.pct_change || 0;
                const isPos = pct > 0;
                return (
                  <Command.Item
                    key={stock.symbol}
                    value={`${stock.symbol} ${stock.company_name || ""}`}
                    onSelect={() => {
                      onOpenChange(false);
                      onSelectStock(stock.symbol);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 text-xs transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center font-bold text-[11px] text-slate-700 font-mono">
                        {stock.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 group-hover:text-[#00B386] transition font-sans">
                          {stock.symbol}
                        </span>
                        <span className="text-[11px] text-slate-400 block truncate max-w-xs">
                          {stock.company_name || stock.symbol}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span className="font-bold text-slate-900">
                        ₹{stock.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          isPos ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {isPos ? "+" : ""}{pct.toFixed(2)}%
                      </span>
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>

          </Command.List>

          <div className="bg-slate-50 border-t border-slate-100 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>Use ↑↓ to navigate, Enter to select</span>
            <span>Esc to close</span>
          </div>

        </Command>
      </div>
    </div>
  );
};
