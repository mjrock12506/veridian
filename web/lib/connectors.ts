import {
  Mail, MessageSquare, Table2, Headphones, Users, ShoppingBag, Database,
  FileSpreadsheet, Boxes, type LucideIcon,
} from "lucide-react";

import type { ScoredOrder } from "@/lib/api";

/*
  The integration catalog. Two halves of the pipeline:
  - SOURCES: where order data is pulled in from.
  - DESTINATIONS: where the AI Action Center delivers its actions.
  Used by the homepage connectors showcase and the Action Center routing bar, so
  the "where does it go" story is consistent across the product.
*/

export type Connector = {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  blurb: string;
};

export const SOURCES: Connector[] = [
  { id: "shopify", name: "Shopify", icon: ShoppingBag, color: "text-emerald-600", blurb: "Orders & fulfillment" },
  { id: "amazon", name: "Amazon Seller", icon: Boxes, color: "text-amber-600", blurb: "Marketplace orders" },
  { id: "csv", name: "CSV / Excel", icon: FileSpreadsheet, color: "text-blue-600", blurb: "Any platform export" },
  { id: "warehouse", name: "Postgres / BigQuery", icon: Database, color: "text-indigo-600", blurb: "Your data warehouse" },
];

export const DESTINATIONS: Connector[] = [
  { id: "email", name: "Gmail / Outlook", icon: Mail, color: "text-rose-600", blurb: "Send the drafted message" },
  { id: "slack", name: "Slack", icon: MessageSquare, color: "text-violet-600", blurb: "Alert the ops channel" },
  { id: "sheets", name: "Google Sheets", icon: Table2, color: "text-emerald-600", blurb: "Append to a tracker" },
  { id: "support", name: "Zendesk / Gorgias", icon: Headphones, color: "text-amber-600", blurb: "Open a support ticket" },
  { id: "crm", name: "HubSpot / Salesforce", icon: Users, color: "text-orange-600", blurb: "Log the touchpoint" },
];

const BY_ID = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
export const destination = (id: string): Connector => BY_ID[id];

/*
  Which destinations an order's action routes to, derived from its risk — this is
  the "agentic routing" decision the AI makes per order. A delay risk emails the
  customer + logs to the tracker; a low-review risk opens a support ticket too.
*/
export function routeFor(o: ScoredOrder): string[] {
  const ids: string[] = ["email", "sheets"];
  if (o.low_review_risk === "high" || o.low_review_risk === "medium") ids.unshift("support");
  if (o.delay_risk === "high" || o.low_review_risk === "high") ids.push("slack");
  return Array.from(new Set(ids));
}
