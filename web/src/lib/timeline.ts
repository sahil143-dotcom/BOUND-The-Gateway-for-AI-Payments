import type { LedgerEvent } from "./types";
import { decisionBanner } from "./copy";

export type TimelineStep = {
  key: string;
  title: string;
  detail?: string;
  tone: "plain" | "ok" | "stop";
  event?: LedgerEvent;
};

export function timelineFromEvents(events: LedgerEvent[]): TimelineStep[] {
  const steps: TimelineStep[] = [{ key: "req", title: "AI REQUEST", tone: "plain" }];

  const cart = events.find((e) => e.type === "CART_ISSUED");
  if (cart) {
    steps.push({ key: "cart", title: "BOUND AUTHORIZES", tone: "plain", event: cart });
  }

  const deny = events.find((e) => e.type === "DENY");
  if (deny) {
    steps.push({
      key: "denied",
      title: decisionBanner(deny.decision || ""),
      detail: "Razorpay was not called",
      tone: "stop",
      event: deny,
    });
    return steps;
  }

  const receipt = events.find((e) => e.type === "RECEIPT");
  const order = events.find((e) => e.type === "ORDER_CREATE");
  steps.push({
    key: "ok",
    title: "BOUND said yes",
    detail: "Razorpay was called",
    tone: "ok",
    event: order || receipt,
  });
  if (receipt || order) {
    steps.push({
      key: "done",
      title: "RAZORPAY SETTLES",
      tone: "plain",
      event: receipt || order,
    });
  }
  return steps;
}
