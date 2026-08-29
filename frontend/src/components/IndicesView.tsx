import React, { useState, useEffect } from "react";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { IndexDaily } from "../types";
import { fetchIndices } from "../services/api";

interface IndicesViewProps {
  category: "sectoral" | "thematic" | "strategy" | "broad";
  selectedDate: string;
}

export const IndicesView: React.FC<IndicesViewProps> = ({ category, selectedDate }) => {
  const [indices, setIndices] = useState<IndexDaily[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof IndexDaily>("pct_change");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const catTitleMap = {
    sectoral: "Sectoral Indices",
    thematic: "Thematic Indices",
    strategy: "Strategy Indices",
    broad: "Broad Market Indices",
  };

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchIndices(category, selectedDate);
        if (isMounted) setIndices(data);
      } catch (err) {
        console.error(`Failed to load ${category} indices:`, err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [category, selectedDate]);

  const handleSort = (field: keyof IndexDaily) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredAndSorted = indices
    .filter((i) => {
      const q = search.toLowerCase();
      return (
        i.index_name.toLowerCase().includes(q) ||
        (i.index_symbol && i.index_symbol.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (valA === undefined || valA === null) valA = sortDirection === "asc" ? Infinity : -Infinity;
      if (valB === undefined || valB === null) valB = sortDirection === "asc" ? Infinity : -Infinity;
      if (typeof valA === "string") {
        return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === "asc" ? valA - valB : valB - valA;
    });

  return (
    <div className="space-y-4">
      
      {/* Search & Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-card">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Filter ${catTitleMap[category]}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <strong className="text-slate-900 font-mono">{filteredAndSorted.length}</strong> {catTitleMap[category]}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-card">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-[#00B386] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-mono text-slate-500">Loading {catTitleMap[category]}...</p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-xs text-slate-400 shadow-card">
          No index data found for {catTitleMap[category]} on {selectedDate}.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider select-none sticky top-0 z-10">
                <tr>
                  <th onClick={() => handleSort("index_name")} className="py-3 px-4 cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center gap-1.5">
                      <span>Index Name</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("value")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Value</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("variation")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Variation</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("pct_change")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition min-w-[100px]">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>% Change</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("pe")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>P/E</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("pb")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>P/B</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("dy")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Div Yield</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th className="py-3 px-4 text-center">Advances / Declines</th>

                  <th onClick={() => handleSort("per_change_30d")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition hidden md:table-cell">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>30D %</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>

                  <th onClick={() => handleSort("year_high")} className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 transition hidden lg:table-cell">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>52W High</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredAndSorted.map((idx) => {
                  const pct = idx.pct_change || 0;
                  const isPos = pct > 0;
                  const isNeg = pct < 0;

                  return (
                    <tr key={idx.index_name} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {idx.index_name}
                      </td>

                      <td className="py-3 px-4 text-right font-bold font-mono text-slate-900 tabular-nums">
                        {idx.value?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "-"}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {idx.variation !== undefined && idx.variation !== null
                          ? `${idx.variation > 0 ? "+" : ""}${idx.variation.toFixed(2)}`
                          : "-"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono tabular-nums ${
                            isPos
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                              : isNeg
                              ? "bg-red-50 text-red-700 border border-red-200/60"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {isPos ? "+" : ""}{pct.toFixed(2)}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {idx.pe ? idx.pe.toFixed(2) : "-"}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {idx.pb ? idx.pb.toFixed(2) : "-"}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {idx.dy !== undefined && idx.dy !== null ? `${idx.dy.toFixed(2)}%` : "-"}
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-[11px] tabular-nums">
                        {idx.advances !== undefined && idx.declines !== undefined ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="text-emerald-700 font-bold">{idx.advances}</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-red-700 font-bold">{idx.declines}</span>
                          </div>
                        ) : "-"}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums hidden md:table-cell">
                        <span className={(idx.per_change_30d || 0) >= 0 ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>
                          {idx.per_change_30d ? `${idx.per_change_30d > 0 ? "+" : ""}${idx.per_change_30d.toFixed(2)}%` : "-"}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums hidden lg:table-cell">
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
