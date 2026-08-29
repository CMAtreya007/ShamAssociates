export interface CorporateAction {
  id?: number;
  symbol: string;
  company_name?: string;
  series?: string;
  subject: string;
  action_type: "DIVIDEND" | "SPLIT" | "BONUS" | "RESULTS" | "BOARD_MEETING" | "BUYBACK" | "RIGHTS" | "AGM" | "EGM" | "OTHER" | string;
  ex_date?: string;
  record_date?: string;
  bc_start_date?: string;
  bc_end_date?: string;
  nd_start_date?: string;
  nd_end_date?: string;
  details?: string;
  priority_level: number;
  created_at?: string;
}

export interface CorporateAnnouncement {
  id?: number;
  symbol: string;
  company_name?: string;
  broadcast_date: string;
  subject: string;
  description?: string;
  attachment_url?: string;
  created_at?: string;
}

export interface Nifty50Stock {
  id?: number;
  date: string;
  symbol: string;
  company_name?: string;
  series?: string;
  open?: number;
  high?: number;
  low?: number;
  previous_close?: number;
  ltp?: number;
  change?: number;
  pct_change?: number;
  volume?: number;
  turnover?: number;
  year_high?: number;
  year_low?: number;
  per_change_30d?: number;
  per_change_365d?: number;
  near_wkh?: number;
  near_wkl?: number;
  ffmc?: number;
  last_update_time?: string;
  catalysts?: CorporateAction[];
}

export interface StockDetail {
  id?: number;
  date: string;
  symbol: string;
  company_name?: string;
  industry?: string;
  isin?: string;
  delivery_pct?: number;
  face_value?: number;
  daily_volatility?: number;
  annual_volatility?: number;
  issued_capital?: number;
  applicable_margin?: number;
  impact_cost?: number;
  free_float_mcap?: number;
  total_turnover?: number;
  total_volume?: number;
  trade_info?: Record<string, any>;
  price_info?: Record<string, any>;
  security_info?: Record<string, any>;
  order_book?: Record<string, any>;
  meta_data?: Record<string, any>;
  actions?: CorporateAction[];
}

export interface IndexDaily {
  id?: number;
  date: string;
  index_category: string;
  index_name: string;
  index_symbol?: string;
  value?: number;
  variation?: number;
  pct_change?: number;
  open?: number;
  high?: number;
  low?: number;
  previous_close?: number;
  year_high?: number;
  year_low?: number;
  pe?: number;
  pb?: number;
  dy?: number;
  advances?: number;
  declines?: number;
  unchanged?: number;
  per_change_30d?: number;
  per_change_365d?: number;
  one_week_ago_val?: number;
  one_month_ago_val?: number;
  one_year_ago_val?: number;
}

export interface FetchLog {
  id: number;
  run_timestamp: string;
  trade_date?: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED_HOLIDAY" | "IN_PROGRESS";
  source: string;
  rows_fetched: number;
  indices_count: number;
  stocks_count: number;
  stock_details_count: number;
  corporate_actions_count?: number;
  duration_seconds: number;
  error_message?: string;
  details?: Record<string, any>;
}

export interface FetchStatus {
  last_sync?: FetchLog | null;
  is_syncing: boolean;
  today_synced: boolean;
  latest_trade_date?: string | null;
  total_records: number;
  next_scheduled_run?: string | null;
}
