"use strict";
// Reads https://caught.studio/api/admin with the admin key typed on this device. Keeps the key, never the data.
// ?api=http://localhost:PORT points it at a local server for testing (localhost only, so a link can't send
// the key anywhere else).
const API = (() => {
  const asked = new URLSearchParams(location.search).get("api");
  try {
    const u = asked && new URL(asked);
    if (u && ["localhost", "127.0.0.1"].includes(u.hostname)) return u.origin;
  } catch (_) { /* not a URL: use the real one */ }
  return "https://caught.studio";
})();
const KEY = "caught-admin-key";
const $ = (id) => document.getElementById(id);
const store = {
  get() { try { return localStorage.getItem(KEY) || ""; } catch (_) { return ""; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch (_) { /* private mode: works until the tab closes */ } },
  clear() { try { localStorage.removeItem(KEY); } catch (_) {} },
};
// one-time setup link: …/caught-admin/#key=KEY (the part after # never leaves the phone); stored, then wiped from the address
// On iPhone a home-screen app has its own storage, separate from Safari, so a browser tab offers the key to copy.
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let fromLink = false;
if (location.hash.startsWith("#key=")) {
  store.set(decodeURIComponent(location.hash.slice(5)));
  history.replaceState(null, "", location.pathname + location.search);
  fromLink = !standalone;
}
let key = store.get(), data = null, loading = false;
const shown = { people: 10, demos: 8 };

const money = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const short = (c) => c >= 100000 ? "$" + (c / 100000).toFixed(c >= 1000000 ? 0 : 1) + "K" : money(c);
const ago = (t) => {
  const s = Math.max(0, data.now - t);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 7 * 86400) return Math.floor(s / 86400) + " d ago";
  return new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const day = (t) => new Date(t * 1000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === "class" ? (n.className = v) : n.setAttribute(k, v);
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
const row = (main, sub, right, rightClass = "num") =>
  el("li", {}, el("span", { class: "main" }, main, sub ? el("small", {}, sub) : null), el("span", { class: rightClass }, right));
const fill = (id, items, empty) => {
  const ul = $(id);
  ul.replaceChildren(...(items.length ? items : [el("li", { class: "empty" }, empty)]));
};

function gate(msg = "") {
  $("dash").hidden = true; $("reload").hidden = true; $("stamp").textContent = "";
  $("gate").hidden = false; $("gate-msg").textContent = msg;
  $("key").focus();
}

async function load() {
  if (loading || !key) return;
  loading = true; $("reload").classList.add("spin");
  try {
    const r = await fetch(API + "/api/admin", { headers: { Authorization: "Bearer " + key }, cache: "no-store", referrerPolicy: "no-referrer" });
    if (r.status === 403) { store.clear(); key = ""; return gate("That key was refused. Check ADMIN_KEY on the server."); }
    if (!r.ok) throw new Error("caught.studio answered " + r.status);
    data = await r.json();
    render();
  } catch (e) {
    if (!data) return gate("Couldn't reach caught.studio (" + e.message + "). Try again in a minute.");
    $("stamp").textContent = "Offline · from " + new Date(data.now * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } finally {
    loading = false; $("reload").classList.remove("spin");
  }
}

function render() {
  const d = data;
  $("gate").hidden = true; $("dash").hidden = false; $("reload").hidden = false;
  $("handoff").hidden = !fromLink;
  $("stamp").textContent = "Updated " + new Date(d.now * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // what needs the owner comes first; nothing else on the page asks for anything
  const owedTotal = d.owed.reduce((s, o) => s + o.cents, 0);
  const needs = d.attention.map((a) => el("li", {}, el("b", {}, a.what), el("span", {}, (a.detail || "") + " · " + ago(a.at))));
  if (owedTotal) needs.push(el("li", {}, el("b", {}, money(owedTotal) + " payable to " + d.owed.length + " affiliate" + (d.owed.length > 1 ? "s" : "")),
    el("span", {}, "Past the 30-day refund window. Pay on the full admin page.")));
  $("needs").replaceChildren(...(needs.length
    ? [el("h2", {}, "Needs you"), el("ul", {}, ...needs)]
    : [el("p", { class: "clear" }, "Nothing needs you.")]));

  $("t-rev").textContent = short(d.revenue.d1);
  $("t-sign").textContent = d.signups_24h;
  $("t-clip").textContent = d.claims_24h;
  $("rev-line").textContent = `${money(d.revenue.d7)} this week · ${money(d.revenue.d30)} in 30 days · ${money(d.revenue.total)} all time, after tax. `
    + `${d.signups_7d} sign-ups this week, ${d.moments_24h} moments found in 24 h.`;

  chart("chart-rev", d.days, (x) => x.cents);
  chart("chart-sign", d.days, (x) => x.signups);
  pick(d.days.length - 1);

  // who comes back after day one, and which Discord messages bring them (older servers send no "engagement")
  const g = d.engagement;
  $("back-card").hidden = !g;
  if (g) {
    const c = g.cohort, pct = c.signed_up ? ` (${Math.round(100 * c.came_back / c.signed_up)}%)` : "";
    $("back-line").textContent = `${g.claimers_24h} people claimed in 24 h, ${g.claimers_7d} in 7 days. Of ${c.signed_up} who signed up `
      + `2 to 9 days ago, ${c.came_back} claimed again later${pct}. ${g.away_with_clips} away 2+ days with clips to claim, `
      + `${g.no_channel_7d} new this week without a channel.`;
    fill("back", g.messages.map((m) => row(m.name, `${m.delivered} of ${m.sent} delivered to ${m.people} people, 7 days`,
      `${m.opened} back`)), "");
  }

  $("live").replaceChildren(...(d.live.length ? d.live.map((n) => el("span", {}, n.replace(/^(twitch|kick|youtube)-/, "")))
    : [el("span", { class: "none" }, "Nobody is live.")]));

  const paid = d.plans.reduce((s, p) => s + p.n, 0);
  fill("plans", [...d.plans.map((p) => row(p.name, null, p.n)),
    row("Free", null, d.users - paid), row("All users", null, d.users)], "");

  fill("payments", d.payments.map((p) => {
    const li = row(p.name || "Unknown customer", p.plan + (p.refunded ? " · refunded" : "") + " · " + ago(p.at),
      money(p.cents) + (p.currency && p.currency.toLowerCase() !== "usd" ? " " + p.currency.toUpperCase() : ""));
    if (p.refunded) li.lastChild.classList.add("gone");
    return li;
  }), "No payments yet.");

  list("people", d.people.map((u) => row(u.name || "No name", u.plan + (u.until ? " until " + new Date(u.until * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""),
    ago(u.joined), "ago")), "No users yet.");

  const running = d.demos.list.filter((x) => x.state.startsWith("watching")).length;
  const queued = d.demos.list.filter((x) => x.state === "queued").length;
  $("demo-line").textContent = `${running} watching of ${d.demos.spots} spots, ${queued} queued.`;
  list("demos", d.demos.list.map((x) => {
    const li = row(x.channel.replace(/^twitch-/, ""), x.state + (x.link ? ` · opened ${x.opens}×, downloaded ${x.downloads}×` : ""), "", "ago");
    if (x.link) {
      const b = el("button", { class: "copy", type: "button" }, "Copy link");
      b.onclick = () => navigator.clipboard.writeText(x.link).then(() => { b.textContent = "Copied"; }, () => { b.textContent = "Copy failed"; });
      li.lastChild.replaceWith(b);
    }
    return li;
  }), "No demos yet.");

  fill("owed", d.owed.map((o) => row(o.name || "No name", o.payout || "no payout email", money(o.cents))), "Nothing payable now.");
  $("owed-line").textContent = d.owed_waiting ? `${money(d.owed_waiting)} more is still inside the refund window.` : "";

  $("full").href = API + "/admin?key=" + encodeURIComponent(key);
}

function list(id, items, empty) {
  const btn = document.querySelector(`[data-more="${id}"]`);
  fill(id, items.slice(0, shown[id]), empty);
  btn.hidden = items.length <= shown[id];
  btn.onclick = () => { shown[id] = Infinity; render(); };
}

function chart(id, days, val) {
  const top = Math.max(1, ...days.map(val));
  $(id).replaceChildren(...days.map((x, i) => {
    const b = el("button", { type: "button", "aria-label": day(x.day), "data-i": i }, el("i"));
    b.firstChild.style.height = (val(x) / top) * 100 + "%";
    b.onclick = () => pick(i);
    return b;
  }));
}

function pick(i) {
  const x = data.days[i];
  $("day-pick").textContent = `${i === data.days.length - 1 ? "Today (UTC)" : day(x.day)}: ${money(x.cents)}, ${x.signups} sign-up${x.signups === 1 ? "" : "s"}`;
  document.querySelectorAll(".chart button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === i)));
}

$("keyform").addEventListener("submit", (e) => {
  e.preventDefault();
  key = $("key").value.trim();
  $("key").value = "";
  store.set(key);
  $("gate-msg").textContent = "Checking…";
  load();
});
$("paste").onclick = async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    // the whole setup link works too
    key = text.includes("#key=") ? decodeURIComponent(text.split("#key=")[1]) : text;
    if (!key) return void ($("gate-msg").textContent = "The clipboard is empty. Tap Copy key in Safari first.");
    store.set(key);
    $("gate-msg").textContent = "Checking…";
    load();
  } catch (_) {
    $("gate-msg").textContent = "Couldn't read the clipboard. Long-press the key field below and tap Paste.";
    $("key").focus();
  }
};
// the clipboard API first; the older select-and-copy where it's refused; last, a field to copy by hand
async function copyKey(btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(key); ok = true; } catch (_) {
    const t = el("textarea", { readonly: "", style: "position:fixed;opacity:0;top:0" });
    t.value = key; document.body.append(t); t.select(); t.setSelectionRange(0, key.length);
    try { ok = document.execCommand("copy"); } catch (_) {}
    t.remove();
  }
  if (ok) return void (btn.textContent = btn.id === "copykey" ? "Copied. Now open the home-screen app and tap Paste key." : "Copied");
  const f = el("input", { readonly: "", "aria-label": "Admin key", class: "keyfield" });
  f.value = key; btn.replaceWith(f); f.focus(); f.select();
}
for (const id of ["copykey", "copykey2"]) $(id).onclick = (e) => copyKey(e.currentTarget);
$("reload").onclick = load;
$("signout").onclick = () => { store.clear(); key = ""; data = null; gate(); };
// fresh numbers whenever the app comes back to the front, and every minute while it's open
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
setInterval(() => { if (!document.hidden) load(); }, 60000);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
key ? load() : gate();
