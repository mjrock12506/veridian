"use client";

import * as React from "react";

import { useAuth } from "@/components/auth/auth-provider";

/*
  Live mode = signed in AND a delivery webhook is connected. In that state the
  Action Center actually POSTs each resolved action to the user's webhook
  (Slack / Zapier / Make / Apps Script) instead of simulating it. Guests, or
  signed-in users without a connector, stay in demo (simulated) mode.

  The webhook URL is stored in localStorage and shared across pages (the
  Integrations page sets it; the Action Center reads it) via a custom event so
  same-tab updates propagate immediately.
*/

const KEY = "veridian_webhook";
const EVT = "veridian-webhook-change";

export function getWebhook(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) || "";
}

export function setWebhook(url: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, url.trim());
  window.dispatchEvent(new Event(EVT));
}

export function useWebhook(): string {
  const [url, setUrl] = React.useState("");
  React.useEffect(() => {
    const sync = () => setUrl(getWebhook());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return url;
}

export interface LiveMode {
  signedIn: boolean;
  connected: boolean;
  webhook: string;
  isLive: boolean;
}

export function useLiveMode(): LiveMode {
  const { user } = useAuth();
  const webhook = useWebhook();
  const signedIn = !!user;
  const connected = !!webhook;
  return { signedIn, connected, webhook, isLive: signedIn && connected };
}
