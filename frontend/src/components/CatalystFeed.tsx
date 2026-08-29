import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  CalendarDays, 
  TrendingUp, 
  Layers, 
  DollarSign, 
  FileText, 
  ChevronRight, 
  Search, 
  Calendar,
  AlertCircle,
  ExternalLink,
  Clock
} from "lucide-react";
import { CorporateAction, CorporateAnnouncement } from "../types";
import { fetchCatalysts, fetchAnnouncements } from "../services/api";

interface CatalystFeedProps {
  onSelectStock: (symbol: string) => void;
}

type CatalystFilter = "all" | "DIVIDEND" | "SPLIT_BONUS" | "RESULTS" | "BOARD_MEETING" | "ANNOUNCEMENTS";

export const CatalystFeed: React.FC<CatalystFeedProps> = ({ onSelectStock }) => {
  const [catalysts, setCatalysts] = useState<CorporateAction[]>([]);
  const [announcements, setAnnouncements] = useState<CorporateAnnouncement[]>([]);
  const [activeFilter, setActiveFilter] = useState<CatalystFilter>("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const [catData, annData] = await Promise.all([
        fetchCatalysts("all", undefined, 80).catch(() => []),
        fetchAnnouncements(40).catch(() => [])
      ]);
      setCatalysts(catData);
      setAnnouncements(annData);
    } catch (err) {
      console.error("Failed to load catalysts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Filtered Events
  const filteredCatalysts = catalysts.filter((item) => {
    // Filter chip matching
    if (activeFilter === "DIVIDEND" && item.action_type !== "DIVIDEND") return false;
    if (activeFilter === "SPLIT_BONUS" && !["SPLIT", "BONUS", "BUYBACK", "RIGHTS"].includes(item.action_type)) return false;
    if (activeFilter === "RESULTS" && item.action_type !== "RESULTS") return false;
    if (activeFilter === "BOARD_MEETING" && item.action_type !== "BOARD_MEETING") return false;

    // Search matching
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchSymbol = item.symbol.toLowerCase().includes(q);
      const matchComp = item.company_name?.toLowerCase().includes(q);
      const matchSubj = item.subject.toLowerCase().includes(q);
      return matchSymbol || matchComp || matchSubj;
    }
    return true;
  });

  const filteredAnnouncements = announcements.filter((ann) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        ann.symbol.toLowerCase().includes(q) ||
        ann.company_name?.toLowerCase().includes(q) ||
        ann.subject.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-card">
        
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeFilter === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            All Catalysts ({catalysts.length})
          </button>

          <button
            onClick={() => setActiveFilter("DIVIDEND")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeFilter === "DIVIDEND"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/50"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Dividends</span>
          </button>

          <button
            onClick={() => setActiveFilter("SPLIT_BONUS")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeFilter === "SPLIT_BONUS"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-purple-700 bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200/50"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Splits & Bonus</span>
          </button>

          <button
            onClick={() => setActiveFilter("RESULTS")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeFilter === "RESULTS"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-blue-700 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/50"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Earnings / Results</span>
          </button>

          <button
            onClick={() => setActiveFilter("BOARD_MEETING")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeFilter === "BOARD_MEETING"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-700 bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200/50"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Board Meetings</span>
          </button>

          <button
            onClick={() => setActiveFilter("ANNOUNCEMENTS")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              activeFilter === "ANNOUNCEMENTS"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Live Filings ({announcements.length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search catalyst events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
          />
        </div>

      </div>

      {/* 2. Feed Stream Container */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-card">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-[#00B386] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-mono text-slate-500">Loading corporate actions & live catalysts...</p>
        </div>
      ) : activeFilter === "ANNOUNCEMENTS" ? (
        /* Regulatory Announcements Feed */
        <div className="space-y-3">
          {filteredAnnouncements.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-xs text-slate-400 shadow-card">
              No regulatory announcements found matching "{search}".
            </div>
          ) : (
            filteredAnnouncements.map((ann, i) => (
              <div
                key={`${ann.symbol}-${ann.broadcast_date}-${i}`}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card hover:shadow-card-hover transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 font-mono flex-shrink-0">
                    {ann.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectStock(ann.symbol)}
                        className="font-bold text-slate-900 hover:text-[#00B386] transition font-sans text-sm"
                      >
                        {ann.symbol}
                      </button>
                      <span className="text-[11px] text-slate-500 truncate max-w-xs">
                        {ann.company_name || ann.symbol}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium mt-1">
                      {ann.subject}
                    </p>
                    {ann.description && ann.description !== ann.subject && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                        {ann.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                    {ann.broadcast_date}
                  </span>
                  {ann.attachment_url && (
                    <a
                      href={ann.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[#00B386] font-semibold hover:underline"
                    >
                      <span>View Filing PDF</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Corporate Actions & Events Feed */
        <div className="space-y-3">
          {filteredCatalysts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-xs text-slate-400 shadow-card">
              No corporate actions or catalysts found matching current filters.
            </div>
          ) : (
            filteredCatalysts.map((item, i) => {
              const isDiv = item.action_type === "DIVIDEND";
              const isSplit = ["SPLIT", "BONUS", "BUYBACK", "RIGHTS"].includes(item.action_type);
              const isResults = item.action_type === "RESULTS";
              const isBM = item.action_type === "BOARD_MEETING";

              return (
                <div
                  key={`${item.symbol}-${item.subject}-${item.ex_date}-${i}`}
                  onClick={() => onSelectStock(item.symbol)}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-card hover:shadow-card-hover transition cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Action Type Badge */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs font-mono flex-shrink-0 ${
                        isDiv
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                          : isSplit
                          ? "bg-purple-50 text-purple-700 border border-purple-200/80"
                          : isResults
                          ? "bg-blue-50 text-blue-700 border border-blue-200/80"
                          : isBM
                          ? "bg-amber-50 text-amber-700 border border-amber-200/80"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {item.action_type.slice(0, 3)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 group-hover:text-[#00B386] transition font-sans text-sm">
                          {item.symbol}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate max-w-xs">
                          {item.company_name || item.symbol}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono ${
                            isDiv
                              ? "bg-emerald-100/70 text-emerald-800"
                              : isSplit
                              ? "bg-purple-100/70 text-purple-800"
                              : isResults
                              ? "bg-blue-100/70 text-blue-800"
                              : isBM
                              ? "bg-amber-100/70 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {item.action_type}
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 font-medium mt-1">
                        {item.subject}
                      </p>

                      {item.details && item.details !== item.subject && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                          {item.details}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Meta Dates */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                    {item.ex_date && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-bold">Ex: {item.ex_date}</span>
                      </div>
                    )}

                    {item.record_date && (
                      <span className="text-[10px] font-mono text-slate-400">
                        Record Date: {item.record_date}
                      </span>
                    )}

                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition hidden sm:block mt-1" />
                  </div>

                </div>
              );
            })
          )}
        </div>
      )}

    </div>
  );
};
