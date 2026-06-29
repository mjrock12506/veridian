/**
 * Typed client for the Veridian FastAPI backend.
 * Base URL comes from NEXT_PUBLIC_API_URL. When it's unset/empty the app runs in
 * the static portfolio demo (read-only pages served from /public/demo) — so a
 * deploy with no backend, or a fresh clone, works out of the box. Set it in
 * web/.env.local (e.g. http://localhost:8000) to use a live backend.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export type RiskLevel = "low" | "medium" | "high";

export interface ScoredOrder {
  order_id: string;
  customer_state: string | null;
  main_category: string | null;
  total_price: number | null;
  n_items: number | null;
  estimated_delivery_days: number | null;
  actual_delivery_days: number | null;
  review_score: number | null;
  purchase_date: string | null;
  delay_probability: number;
  delay_risk: RiskLevel;
  delay_flag: boolean;
  low_review_probability: number;
  low_review_risk: RiskLevel;
  low_review_flag: boolean;
}

export interface DashboardSummary {
  total_orders: number;
  delivered_orders: number;
  scored_sample: number;
  delay_at_risk_pct: number;
  low_review_at_risk_pct: number;
  high_risk_orders: number;
  avg_delay_probability: number;
  delay_threshold: number;
  low_review_threshold: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  risk_distribution: { bucket: string; delay: number; low_review: number }[];
  orders_over_time: { month: string; orders: number }[];
  orders: ScoredOrder[];
}

export interface Driver {
  feature: string;
  importance?: number;
  value: number | string | null;
}

export interface OrderDetail extends ScoredOrder {
  features: Record<string, number | string | null>;
  drivers: { delay: Driver[]; low_review: Driver[] };
}

export interface PredictionResponse {
  model: string;
  probability: number;
  decision_threshold: number;
  flag: boolean;
  risk_level: RiskLevel;
}

export interface AskResponse {
  answer: string;
  model_results: Record<string, unknown>[];
  sources: string[];
  llm_model: string;
  tokens: number;
}

export interface CustomerSegment {
  key: string;
  name: string;
  description: string;
  action: string;
  tone: "primary" | "amber" | "muted";
  customers: number;
  share_pct: number;
  avg_spend: number;
  avg_orders: number;
  revenue_share_pct: number;
}

export interface SegmentsData {
  summary: {
    customers: number;
    orders: number;
    repeat_rate_pct: number;
    avg_order_value: number;
  };
  segments: CustomerSegment[];
  value_tiers: { tier: string; customers: number; revenue_share_pct: number }[];
  top_states: { state: string; customers: number; avg_spend: number }[];
  top_categories: { category: string; orders: number; revenue: number }[];
}

export interface ForecastPoint {
  month: string;
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
}

export interface ForecastData {
  summary: {
    history_months: number;
    last_month: string;
    last_orders: number;
    horizon_months: number;
    next_month: string;
    next_orders: number;
    projected_total: number;
    avg_mom_growth_pct: number;
    trend_per_month: number;
    method: string;
  };
  series: ForecastPoint[];
}

export interface BatchScoreRow {
  order_id: string;
  delay_probability: number;
  delay_risk: RiskLevel;
  delay_flag: boolean;
  low_review_probability: number;
  low_review_risk: RiskLevel;
  low_review_flag: boolean;
}

export interface BatchScoreResult {
  results: BatchScoreRow[];
  summary: {
    orders: number;
    delay_at_risk: number;
    low_review_at_risk: number;
    high_risk: number;
    delay_at_risk_pct: number;
    low_review_at_risk_pct: number;
  };
}

export interface DraftMessageResult {
  message: string;
  source: "ai" | "template";
  llm_model?: string;
  error?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Static portfolio build: when no backend URL is configured, the read-only demo
// pages are served from precomputed JSON in /public/demo so the live site is
// always-on, instant, and free (no server). Live-compute endpoints reject clearly.
const STATIC_DEMO = !API_URL;
const STATIC_DATA: Record<string, string> = {
  "/dashboard": "/demo/dashboard.json",
  "/segments": "/demo/segments.json",
  "/forecast": "/demo/forecast.json",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (STATIC_DEMO) {
    const staticPath = STATIC_DATA[path];
    if (staticPath) {
      const r = await fetch(staticPath, { cache: "force-cache" });
      if (!r.ok) throw new ApiError(r.status, "Demo data unavailable.");
      return r.json() as Promise<T>;
    }
    throw new ApiError(
      0,
      "This is the static demo — live order scoring runs against the model API. Explore the dashboard for ~100k orders already scored."
    );
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, `Could not reach the API at ${API_URL}. Is the backend running?`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

// Grounded canned answers for the static demo (the suggestion chips). The full
// RAG + tool-using copilot runs against the live API when a backend is connected.
function cannedAsk(question: string): AskResponse {
  const q = question.toLowerCase();
  const reply = (answer: string, sources: string[]): AskResponse => ({
    answer, model_results: [], sources, llm_model: "demo (static)", tokens: 0,
  });
  if (q.includes("roc") || q.includes("auc") || q.includes("accura"))
    return reply(
      "The delay model achieves a ROC-AUC of 0.7845 on a held-out test set, and the low-review model 0.7643 — both beat a majority-class baseline and are isotonic-calibrated, so the probabilities are trustworthy, not just ranked.",
      ["docs/MODEL_CARD.md", "reports/metrics_delay.json"]
    );
  if (q.includes("low_review") || q.includes("low review") || q.includes("label"))
    return reply(
      "The low_review label marks an order whose customer left a 1–2★ review (a 12.8% base rate). It's framed post-delivery, so delivery-outcome features are allowed — unlike the delay model, which uses only order-time features.",
      ["docs/data_dictionary.md", "docs/MODEL_CARD.md"]
    );
  if (q.includes("dataset") || q.includes("data") || q.includes("built") || q.includes("olist"))
    return reply(
      "Veridian is built on the Olist Brazilian E-Commerce dataset — ~100k real orders from 2016–2018, joined into one feature row per order across orders, deliveries, payments, and reviews.",
      ["docs/data_dictionary.md"]
    );
  return reply(
    "This is the static portfolio demo, so the copilot answers the suggested questions (model metrics, the labels, the dataset). The full RAG + tool-using copilot runs against the live API once a backend is connected.",
    ["docs/data_dictionary.md"]
  );
}

export const api = {
  dashboard: () => request<DashboardData>("/dashboard"),
  segments: () => request<SegmentsData>("/segments"),
  forecast: () => request<ForecastData>("/forecast"),
  scoreBatch: (orders: Record<string, unknown>[]) =>
    request<BatchScoreResult>("/score/batch", {
      method: "POST",
      body: JSON.stringify({ orders }),
    }),
  draftMessage: (body: { order?: Record<string, unknown>; delay_risk?: string; low_review_risk?: string }) =>
    request<DraftMessageResult>("/draft-message", { method: "POST", body: JSON.stringify(body) }),
  order: (id: string) => request<OrderDetail>(`/orders/${id}`),
  ask: (question: string, order?: Record<string, unknown>, dataContext?: string) =>
    STATIC_DEMO
      ? Promise.resolve(cannedAsk(question))
      : request<AskResponse>("/ask", {
          method: "POST",
          body: JSON.stringify({ question, order: order ?? null, data_context: dataContext ?? null }),
        }),
  predictDelay: (features: Record<string, unknown>) =>
    request<PredictionResponse>("/predict/delay", {
      method: "POST",
      body: JSON.stringify(features),
    }),
  predictLowReview: (features: Record<string, unknown>) =>
    request<PredictionResponse>("/predict/low-review", {
      method: "POST",
      body: JSON.stringify(features),
    }),
};
