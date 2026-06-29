import type { ScoredOrder } from "@/lib/api";

/*
  Shared risk->action logic used by the AI Action Center, the agentic workflow,
  and Connect. One source of truth for "what priority is this", "what's the play",
  and "what do we say to the customer".
*/

export type Priority = "high" | "medium";

export function priorityOf(o: ScoredOrder): Priority | null {
  if (o.delay_risk === "high" || o.low_review_risk === "high") return "high";
  if (o.delay_risk === "medium" || o.low_review_risk === "medium") return "medium";
  return null;
}

export function playbook(o: ScoredOrder): string {
  if (o.delay_risk === "high") return "Expedite shipping + notify the customer";
  if (o.low_review_risk === "high") return "Proactive apology + support outreach";
  if (o.delay_risk === "medium") return "Confirm the delivery ETA with the carrier";
  return "Schedule a post-delivery check-in";
}

// Instant, on-brand draft tailored to the order's risk + details — kept client-side
// so the demo is snappy and reliable (the /draft-message LLM endpoint stays wired
// in the codebase to show the integration; this powers the demo).
export function composeMessage(o: ScoredOrder): string {
  const where = o.customer_state ? ` in ${o.customer_state}` : "";
  const what = o.main_category ? ` of ${o.main_category.replace(/_/g, " ")}` : "";
  if (o.delay_risk === "high" || o.delay_risk === "medium") {
    return `Hi! We're keeping a close eye on your recent order${what} to make sure it reaches you${where} as quickly as possible. If the delivery timeline shifts we'll let you know right away — and you can reply here any time. Thanks so much for your patience!`;
  }
  if (o.low_review_risk === "high" || o.low_review_risk === "medium") {
    return `Hi! Thank you for your order${what}. We want to be sure you're completely happy with it — if anything isn't quite right, just reply and we'll put it right straight away. We really appreciate your business!`;
  }
  return `Hi! Thanks for your order${what} — it's on track. We're here if you need anything at all, so don't hesitate to reach out. We appreciate you!`;
}

export const rank = (o: ScoredOrder) =>
  (priorityOf(o) === "high" ? 1000 : 0) + Math.max(o.delay_probability, o.low_review_probability);
