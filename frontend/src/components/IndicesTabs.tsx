import React, { useState, useEffect } from "react";
import { 
  Layers, 
  PieChart, 
  Target, 
  Compass, 
  ArrowUp, 
  ArrowDown, 
  Search,
  Sparkles
} from "lucide-react";
import { IndexDaily } from "../types";
import { fetchIndices } from "../services/api";

interface IndicesTabsProps {
  selectedDate: string;
}

export const IndicesTabs: React.FC<IndicesTabsProps> = ({ selectedDate }) => {
  const [activeCategory, setActiveCategory] = useState<string>("Sectoral");
  const [indices, setIndices] = useState<IndexDaily[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  const categories = [
    { id: "Sectoral", label: "Sectoral Indices", icon: PieChart, color: "text-blue-400" },
    { id: "Broad Market", label: "Broad Market", icon: Layers, color: "text-indigo-400" },
    { id: "Thematic", label: "Thematic Indices", icon: Compass, color: "text-amber-400" },
    { id: "Strategy", label: "Strategy Indices", icon: Target, color: "text-purple-400" },
  ];

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchIndices(activeCategory, selectedDate);
        if (isMounted) setIndices(data);
      } catch (err) {
        console.error(`Failed to load ${activeCategory} indices:`, err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [activeCategory, selectedDate]);

  const filteredIndices = indices.filter((idx) => {
    const q = search.toLowerCase();
    return (
      idx.index_name.toLowerCase().includes(q) ||
      (idx.index_symbol && idx.index_symbol.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setSearch(""); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? "bg-slate-800 text-white shadow-md border border-slate-700"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? cat.color : "text-slate-500"}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Search ${activeCategory}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition font-sans"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3" />
          <p className="text-xs">Loading {activeCategory} indices...</p>
        </div>
      ) : filteredIndices.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-xs">
          No index data found for {activeCategory} on {selectedDate}.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-slate-900/60 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                  <th className="py-3 px-4">Index Name</th>
                  <th className="py-3 px-4 text-right">Value</th>
                  <th className="py-3 px-4 text-right">Variation</th>
                  <th className="py-3 px-4 text-right">% Change</th>
                  <th className="py-3 px-4 text-right">P/E</th>
                  <th className="py-3 px-4 text-right">P/B</th>
                  <th className="py-3 px-4 text-right">Div Yield</th>
                  <th className="py-3 px-4 text-center">Adv / Dec</th>
                  <th className="py-3 px-4 text-right">30D %</th>
                  <th className="py-3 px-4 text-right">365D %</th>
                  <th className="py-3 px-4 text-right">52W High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredIndices.map((idx) => {
                  const pct = idx.pct_change || 0;
                  const isPos = pct > 0;
                  const isNeg = pct < 0;

                  return (
                    <tr key={idx.index_name} className="hover:bg-slate-800/50 transition">
                      
                      {/* Index Name */}
                      <td className="py-3 px-4 font-bold text-white tracking-wide">
                        {idx.index_name}
                      </td>

                      {/* Value */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                        {idx.value?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "-"}
                      </td>

                      {/* Variation */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {idx.variation !== undefined && idx.variation !== null
                          ? `${idx.variation > 0 ? "+" : ""}${idx.variation.toFixed(2)}`
                          : "-"}
                      </td>

                      {/* % Change */}
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-xs font-bold ${
                            isPos
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : isNeg
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                              : "bg-slate-800 text-slate-300 border border-slate-700"
                          }`}
                        >
                          {isPos ? <ArrowUp className="w-3 h-3" /> : isNeg ? <ArrowDown className="w-3 h-3" /> : null}
                          {isPos ? "+" : ""}{pct.toFixed(2)}%
                        </span>
                      </td>

                      {/* P/E */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {idx.pe ? idx.pe.toFixed(2) : "-"}
                      </td>

                      {/* P/B */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {idx.pb ? idx.pb.toFixed(2) : "-"}
                      </td>

                      {/* Div Yield */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {idx.dy !== undefined && idx.dy !== null ? `${idx.dy.toFixed(2)}%` : "-"}
                      </td>

                      {/* Advances / Declines */}
                      <td className="py-3 px-4 text-center font-mono text-[11px]">
                        {idx.advances !== undefined && idx.declines !== undefined ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-emerald-400 font-semibold">{idx.advances}</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-rose-400 font-semibold">{idx.declines}</span>
                          </div>
                        ) : "-"}
                      </td>

                      {/* 30D % */}
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        <span className={(idx.per_change_30d || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {idx.per_change_30d ? `${idx.per_change_30d > 0 ? "+" : ""}${idx.per_change_30d.toFixed(2)}%` : "-"}
                        </span>
                      </td>

                      {/* 365D % */}
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        <span className={(idx.per_change_365d || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {idx.per_change_365d ? `${idx.per_change_365d > 0 ? "+" : ""}${idx.per_change_365d.toFixed(2)}%` : "-"}
                        </span>
                      </td>

                      {/* 52W High */}
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {idx.year_high?.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
