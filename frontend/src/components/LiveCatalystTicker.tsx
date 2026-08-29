import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  Megaphone, 
  CalendarDays, 
  DollarSign, 
  ChevronUp, 
  ChevronDown, 
  ArrowRight,
  Clock,
  ExternalLink,
  Flame,
  FileText
} from "lucide-react";
import { CorporateAction, CorporateAnnouncement } from "../types";
import { fetchCatalysts, fetchAnnouncements } from "../services/api";

interface LiveCatalystTickerProps {
  onSelectStock: (symbol: string) => void;
}

interface TickerItem {
  id: string;
  symbol: string;
  type: string;
  subject: string;
  details?: string;
  dateStr: string;
  timestamp: number;
  isLiveFiling?: boolean;
  attachmentUrl?: string;
}

const parseEventTimestamp = (dateStr?: string): number => {
  if (!dateStr || dateStr === "-" || dateStr === "Upcoming") return 0;
  const clean = dateStr.replace(/^(Ex:|Record:|Meeting:|Filing:)\s*/i, "").trim();
  
  // Standard ISO / Date constructor
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d.getTime();

  // Try DD-MMM-YYYY (e.g. 04-Sep-2026)
  const parts = clean.split("-");
  if (parts.length === 3) {
    const monthNames: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const day = parseInt(parts[0], 10);
    const month = monthNames[parts[1].toLowerCase().slice(0, 3)];
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      return new Date(year, month, day).getTime();
    }
  }
  return 0;
};

export const LiveCatalystTicker: React.FC<LiveCatalystTickerProps> = ({ onSelectStock }) => {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Fetch live top catalysts & announcements without limit
  const loadTickerData = async () => {
    try {
      const [cats, anns] = await Promise.all([
        fetchCatalysts("all", undefined).catch(() => []),
        fetchAnnouncements().catch(() => [])
      ]);

      const merged: TickerItem[] = [];
      const seenKeys = new Set<string>();

      // 1. Add fresh real-time regulatory announcements (NSE Filings)
      anns.forEach((a, idx) => {
        const key = `FILING-${a.symbol}-${a.subject}-${a.broadcast_date}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          merged.push({
            id: `ann-${a.symbol}-${idx}-${Date.now()}`,
            symbol: a.symbol,
            type: "FILING",
            subject: a.subject,
            details: a.broadcast_date,
            dateStr: a.broadcast_date ? (a.broadcast_date.includes(" ") ? a.broadcast_date.split(" ")[0] : a.broadcast_date) : "Today",
            timestamp: parseEventTimestamp(a.broadcast_date) || (Date.now() - idx * 60000),
            isLiveFiling: true,
            attachmentUrl: a.attachment_url,
          });
        }
      });

      // 2. Add corporate actions & board meetings (Dividends, Splits, Results, etc.)
      cats.forEach((c, idx) => {
        const rawDate = c.ex_date || c.record_date;
        const ts = parseEventTimestamp(rawDate);
        const key = `${c.action_type}-${c.symbol}-${c.subject}-${rawDate}`;

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          let label = "Upcoming";
          if (c.ex_date) label = `Ex: ${c.ex_date}`;
          else if (c.record_date) label = `Record: ${c.record_date}`;

          merged.push({
            id: `ca-${c.symbol}-${idx}`,
            symbol: c.symbol,
            type: c.action_type || "ACTION",
            subject: c.subject,
            details: c.details,
            dateStr: label,
            timestamp: ts,
            isLiveFiling: false,
          });
        }
      });

      // Sort with live filings first, then latest/upcoming events chronologically descending
      merged.sort((a, b) => {
        if (a.isLiveFiling && !b.isLiveFiling) return -1;
        if (!a.isLiveFiling && b.isLiveFiling) return 1;
        return b.timestamp - a.timestamp;
      });

      if (merged.length > 0) {
        setItems(merged);
      }
    } catch (err) {
      console.error("Failed to load ticker items:", err);
    }
  };

  useEffect(() => {
    loadTickerData();
    // Continuous live polling every 12 seconds for real-time market updates
    const interval = setInterval(loadTickerData, 12000);
    return () => clearInterval(interval);
  }, []);

  // Bottom-up marquee rotation timer (cycles every 4 seconds)
  useEffect(() => {
    if (items.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  if (items.length === 0) return null;

  const current = items[currentIndex];

  const isDiv = current.type === "DIVIDEND";
  const isSplit = ["SPLIT", "BONUS", "BUYBACK", "RIGHTS"].includes(current.type);
  const isResults = current.type === "RESULTS" || current.type === "BOARD_MEETING";
  const isFiling = current.type === "FILING";

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-slate-50 border border-emerald-500/30 rounded-2xl p-3 shadow-sm overflow-hidden flex items-center justify-between gap-3 text-xs select-none"
    >
      
      {/* 1. Left: Live Pulse Tag */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-emerald-200/80 shadow-2xs font-mono text-[10px] font-bold text-emerald-800">
          <span className="w-2 h-2 rounded-full bg-[#00B386] animate-pulse-breathing shadow-[0_0_6px_#00B386]" />
          <span className="hidden sm:inline">LIVE CATALYSTS</span>
          <span className="sm:hidden">LIVE</span>
        </div>
        <div className="hidden lg:flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>Latest Corporate Actions & Feed</span>
        </div>
      </div>

      {/* 2. Center: Bottom-Up Vertical Marquee Container */}
      <div className="flex-1 h-7 relative overflow-hidden flex items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            onClick={() => onSelectStock(current.symbol)}
            className="absolute inset-0 flex items-center gap-2.5 cursor-pointer group"
          >
            {/* Symbol Tag */}
            <span className="font-mono font-bold text-slate-900 group-hover:text-[#00B386] transition text-xs flex-shrink-0 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
              {current.symbol}
            </span>

            {/* Type Badge */}
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                isDiv
                  ? "bg-emerald-100 text-emerald-800"
                  : isSplit
                  ? "bg-purple-100 text-purple-800"
                  : isResults
                  ? "bg-blue-100 text-blue-800"
                  : isFiling
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-800"
              }`}
            >
              {current.type}
            </span>

            {/* Subject / Description Text */}
            <span className="text-slate-800 font-medium truncate max-w-xs md:max-w-md lg:max-w-xl group-hover:underline">
              {current.subject}
            </span>

            {/* Date Tag */}
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200/60 flex-shrink-0">
              <Clock className="w-3 h-3 text-slate-400" />
              {current.dateStr}
            </span>

            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#00B386] group-hover:translate-x-0.5 transition hidden sm:inline flex-shrink-0" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. Right: Marquee Controls & Item Counter */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
          {currentIndex + 1}/{items.length}
        </span>

        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
          <button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)}
            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded transition"
            title="Previous Announcement"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % items.length)}
            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded transition"
            title="Next Announcement"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
};
