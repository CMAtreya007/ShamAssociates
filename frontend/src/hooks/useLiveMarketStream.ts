import { useState, useEffect, useRef, useCallback } from "react";
import { Nifty50Stock } from "../types";
import { authFetch, API_BASE } from "../services/api";

export interface MarketPulseData {
  market_status?: string;
  advances?: number;
  declines?: number;
  unchanged?: number;
  total_turnover_cr?: number;
  stocks_count?: number;
}

export interface LiveStreamState {
  stocks: Nifty50Stock[];
  pulse: MarketPulseData;
  marketStatus: string;
  isConnected: boolean;
  lastTickTime: string | null;
  priceFlashMap: Record<string, "UP" | "DOWN">;
}

export function useLiveMarketStream(initialStocks: Nifty50Stock[] = []) {
  const [stocks, setStocks] = useState<Nifty50Stock[]>(initialStocks);
  const [pulse, setPulse] = useState<MarketPulseData>({});
  const [marketStatus, setMarketStatus] = useState<string>("OPEN");
  const [isConnected, setIsConnected] = useState(false);
  const [lastTickTime, setLastTickTime] = useState<string | null>(null);
  const [priceFlashMap, setPriceFlashMap] = useState<Record<string, "UP" | "DOWN">>({});

  const prevLtpMap = useRef<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Sync initial stocks if provided
  useEffect(() => {
    if (initialStocks.length > 0 && stocks.length === 0) {
      setStocks(initialStocks);
      const initialMap: Record<string, number> = {};
      initialStocks.forEach((s) => {
        if (s.ltp) initialMap[s.symbol] = s.ltp;
      });
      prevLtpMap.current = initialMap;
    }
  }, [initialStocks]);

  const handleTickData = useCallback((data: any) => {
    if (!data || !data.stocks) return;

    const newFlashMap: Record<string, "UP" | "DOWN"> = {};
    const updatedStocks: Nifty50Stock[] = data.stocks;

    updatedStocks.forEach((stk) => {
      const prevLtp = prevLtpMap.current[stk.symbol];
      const curLtp = stk.ltp;

      if (prevLtp !== undefined && curLtp !== undefined && curLtp !== prevLtp) {
        if (curLtp > prevLtp) {
          newFlashMap[stk.symbol] = "UP";
        } else if (curLtp < prevLtp) {
          newFlashMap[stk.symbol] = "DOWN";
        }
      }

      if (curLtp !== undefined) {
        prevLtpMap.current[stk.symbol] = curLtp;
      }
    });

    setStocks(updatedStocks);
    if (data.pulse) setPulse(data.pulse);
    if (data.market_status) setMarketStatus(data.market_status);
    if (data.timestamp) setLastTickTime(data.timestamp);

    // Apply Price Flash
    if (Object.keys(newFlashMap).length > 0) {
      setPriceFlashMap((prev) => ({ ...prev, ...newFlashMap }));
      setTimeout(() => {
        setPriceFlashMap({});
      }, 900);
    }
  }, []);

  // Fallback REST fetcher
  const fetchRestTick = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/data/live`);
      if (res.ok) {
        const data = await res.json();
        handleTickData(data);
      }
    } catch (e) {
      // Offline / connecting
    }
  }, [handleTickData]);

  // Connect WebSocket
  useEffect(() => {
    let isCancelled = false;

    const getWebSocketUrl = () => {
      const token = localStorage.getItem("nse_terminal_auth_token");
      let base = "";
      if (import.meta.env.VITE_WS_URL) {
        base = import.meta.env.VITE_WS_URL;
      } else if (typeof window !== "undefined") {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const isDev = window.location.port === "5180" || window.location.port === "5173" || window.location.port === "5175";
        const host = isDev ? "127.0.0.1:8756" : window.location.host;
        base = `${protocol}//${host}/api/ws/live`;
      } else {
        base = "ws://127.0.0.1:8756/api/ws/live";
      }
      return token ? `${base}?token=${encodeURIComponent(token)}` : base;
    };

    const connectWebSocket = () => {
      try {
        const wsUrl = getWebSocketUrl();
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isCancelled) {
            setIsConnected(true);
            console.log("⚡ [WebSocket] Live market stream connected.");
          }
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === "LIVE_TICK" || parsed.type === "INITIAL_SNAPSHOT") {
              handleTickData(parsed);
            }
          } catch (err) {
            console.warn("Failed to parse live WS tick:", err);
          }
        };

        ws.onerror = () => {
          if (!isCancelled) {
            setIsConnected(false);
          }
        };

        ws.onclose = () => {
          if (!isCancelled) {
            setIsConnected(false);
            console.log("🔌 [WebSocket] Connection closed. Retrying in 3s...");
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
          }
        };
      } catch (err) {
        if (!isCancelled) {
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    // Fallback periodic poll in case WebSocket is not reachable
    const pollInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        fetchRestTick();
      }
    }, 3000);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [handleTickData, fetchRestTick]);

  return {
    stocks,
    pulse,
    marketStatus,
    isConnected,
    lastTickTime,
    priceFlashMap
  };
}
