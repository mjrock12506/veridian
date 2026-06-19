/**
 * Typed client for the Veridian FastAPI backend.
 * Base URL comes from NEXT_PUBLIC_API_URL (falls back to the local dev server).
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export const api = {
  dashboard: () => request<DashboardData>("/dashboard"),
  order: (id: string) => request<OrderDetail>(`/orders/${id}`),
  ask: (question: string, order?: Record<string, unknown>) =>
    request<AskResponse>("/ask", {
      method: "POST",
      body: JSON.stringify({ question, order: order ?? null }),
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
