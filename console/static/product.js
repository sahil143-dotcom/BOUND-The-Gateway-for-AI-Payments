function inr(paise) {
  return "₹" + (Number(paise || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function mark(state) {
  if (state === "pass") return "✓";
  if (state === "fail") return "✕";
  return "·";
}

function chain(items) {
  return (
    "<ol>" +
    items
      .map(function (item, i) {
        var cls = item.cls ? ' class="' + item.cls + '"' : "";
        var arrow = i ? '<li class="arrow">↓</li>' : "";
        return arrow + "<li" + cls + ">" + item.text + "</li>";
      })
      .join("") +
    "</ol>"
  );
}

async function loadMetrics() {
  const m = await fetch("/metrics").then((r) => r.json());
  document.getElementById("rail-label").textContent = m.rail_label;
  document.getElementById("m-requests").textContent = m.requests;
  document.getElementById("m-approved").textContent = m.approved;
  document.getElementById("m-blocked").textContent = m.blocked;
  document.getElementById("m-captured").textContent = inr(m.captured_paise);
  document.getElementById("m-prevented").textContent = inr(m.blocked_paise);
  const reasons = (m.deny_reasons || [])
    .map((d) => d.code + " ×" + d.count + " (" + inr(d.paise) + ")")
    .join(" · ");
  document.getElementById("deny-reasons").textContent = reasons
    ? "Blocked reasons: " + reasons
    : "";
  return m;
}

function fillBuyer(plan, merchant) {
  const sku = plan.sku || {};
  document.getElementById("agent-narration").textContent =
    plan.narration || plan.reason || "No match.";
  document.getElementById("f-product").textContent = sku.name || "—";
  document.getElementById("f-merchant").textContent = (merchant && merchant.name) || "—";
  document.getElementById("f-price").textContent =
    sku.price_paise != null ? inr(sku.price_paise) : "—";
  document.getElementById("f-qty").textContent =
    plan.items && plan.items[0] ? String(plan.items[0].quantity) : "—";
  document.getElementById("f-intent").textContent = plan.intent
    ? (plan.intent.query || "") + ", under " + inr(plan.intent.max_paise)
    : "—";
  document.getElementById("f-max").textContent = plan.intent ? inr(plan.intent.max_paise) : "—";
  document.getElementById("f-cat").textContent = sku.category || "—";
}

function renderGates(gates) {
  const ul = document.getElementById("gates");
  ul.innerHTML = "";
  (gates || []).forEach((g) => {
    const li = document.createElement("li");
    li.className = g.state;
    li.innerHTML = "<i>" + mark(g.state) + "</i><span>" + g.label + "</span>";
    ul.appendChild(li);
  });
}

function renderVerdict(complete) {
  const box = document.getElementById("verdict");
  const settle = document.getElementById("settle");
  if (!complete) {
    box.className = "verdict";
    box.textContent = "";
    settle.innerHTML = "";
    return;
  }
  const approved = complete.decision === "APPROVE";
  const railCalled = complete.rail_call === true;
  box.className = "verdict " + (approved ? "approved" : "denied");
  box.textContent = approved ? "BOUND APPROVED" : "BOUND DENIED";
  if (approved) {
    settle.innerHTML = chain([
      { text: "BOUND APPROVED", cls: "yes" },
      { text: "Payment rail called", cls: "yes" },
      {
        text: "Razorpay order created" + (complete.order_id ? " · " + complete.order_id : ""),
        cls: "yes",
      },
      {
        text: "Payment completed" + (complete.payment_id ? " · " + complete.payment_id : ""),
        cls: "yes",
      },
    ]);
  } else if (railCalled) {
    settle.innerHTML = chain([
      { text: "BOUND DENIED", cls: "no" },
      { text: "Reason: " + (complete.decision || "") },
      { text: "Payment rail called: YES" },
      {
        text:
          "Razorpay order created: " +
          (complete.order_id ? complete.order_id : "YES"),
      },
    ]);
  } else {
    settle.innerHTML = chain([
      { text: "BOUND DENIED", cls: "no" },
      { text: "Reason: " + (complete.decision || "") },
      { text: "Payment rail called: NO", cls: "no" },
      { text: "Razorpay order created: NO", cls: "no" },
    ]);
  }
}

function renderAuth(payload) {
  document.getElementById("auth-empty").hidden = true;
  document.getElementById("auth-body").hidden = false;
  const sku = (payload.buyer && payload.buyer.sku) || {};
  const checkout = payload.checkout || {};
  const complete = payload.complete || {};
  const amount = checkout.amount_paise != null ? checkout.amount_paise : sku.price_paise;
  document.getElementById("a-amount").textContent = amount != null ? inr(amount) : "—";
  document.getElementById("a-product").textContent = sku.name || "—";
  document.getElementById("a-merchant").textContent =
    (payload.merchant && payload.merchant.name) || "—";
  document.getElementById("a-trace").textContent =
    checkout.trace_id || complete.trace_id || "—";
  renderGates(payload.gates);
  renderVerdict(complete);
}

function timelineFromEvents(events) {
  const list = events || [];
  const types = list.map((e) => e.type);
  const steps = [{ text: "AI REQUEST" }];
  if (list.some((e) => e.intent_mandate_id) || types.includes("CART_ISSUED")) {
    steps.push({ text: "IntentMandate" });
  }
  if (types.includes("CART_ISSUED")) steps.push({ text: "CartMandate" });
  if (types.includes("POLICY_CHECK")) steps.push({ text: "Policy checks" });

  const deny = list.find((e) => e.type === "DENY");
  if (deny) {
    steps.push({ text: "DENIED", cls: "fail" });
    steps.push({ text: deny.decision || "DENIED", cls: "fail" });
    steps.push({ text: "RAIL CALL = NO", cls: "fail" });
    return steps;
  }

  if (types.includes("ORDER_CREATE") || types.includes("RECEIPT")) {
    steps.push({ text: "APPROVED", cls: "ok" });
  }
  const order = list.find((e) => e.type === "ORDER_CREATE" && e.rzp_order_id);
  if (order) {
    steps.push({ text: "Razorpay Order · " + order.rzp_order_id });
  } else if (types.includes("ORDER_CREATE")) {
    steps.push({ text: "Razorpay Order" });
  }
  const pay = list.find((e) => e.rzp_payment_id && e.type !== "DENY");
  if (pay) steps.push({ text: "Payment · " + pay.rzp_payment_id });
  if (list.some((e) => e.rzp_event_id)) steps.push({ text: "Webhook" });
  if (types.includes("RECEIPT")) steps.push({ text: "AP2 Payment Receipt", cls: "ok" });
  return steps;
}

function renderTimeline(steps) {
  const ol = document.getElementById("timeline");
  ol.innerHTML = "";
  if (!steps.length) {
    ol.innerHTML = '<li class="muted">No trace selected.</li>';
    return;
  }
  steps.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = s.cls || "";
    li.textContent = s.text;
    ol.appendChild(li);
    if (i < steps.length - 1) {
      const d = document.createElement("li");
      d.className = "down";
      d.textContent = "↓";
      ol.appendChild(d);
    }
  });
}

async function replayTrace(traceId) {
  if (!traceId) return;
  const data = await fetch("/audit/" + encodeURIComponent(traceId)).then((r) => {
    if (!r.ok) throw new Error("unknown trace");
    return r.json();
  });
  document.getElementById("trace-input").value = traceId;
  renderTimeline(timelineFromEvents(data.events));
  return data;
}

async function runScenario(scenario) {
  const buttons = [document.getElementById("btn-buy"), document.getElementById("btn-expire")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    const payload = await fetch("/buyer/shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "red cotton shirt",
        max_paise: 180000,
        complete: true,
        scenario: scenario,
      }),
    }).then((r) => r.json());
    if (payload.rail_label) {
      document.getElementById("rail-label").textContent = payload.rail_label;
    }
    if (payload.buyer && payload.buyer.ok === false) {
      fillBuyer(payload.buyer, payload.merchant);
      return;
    }
    fillBuyer(payload.buyer, payload.merchant);
    if (payload.checkout) renderAuth(payload);
    const trace =
      (payload.checkout && payload.checkout.trace_id) ||
      (payload.complete && payload.complete.trace_id);
    if (trace) await replayTrace(trace);
    await loadMetrics();
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

document.getElementById("btn-buy").addEventListener("click", () => runScenario("happy"));
document.getElementById("btn-expire").addEventListener("click", () => runScenario("expire"));
document.getElementById("replay-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("trace-input").value.trim();
  if (id) await replayTrace(id);
});

loadMetrics().then(() => {
  const initial = document.getElementById("trace-input").value.trim();
  if (initial) replayTrace(initial);
});
