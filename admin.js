// Admin dashboard. Loaded after script.js, so it reuses API_URL, state and the helpers there.
const admin = { data: null, range: "all", password: "" };

const RANGES = [
  ["all", "All time"],
  ["semester", "This semester"],
  ["month", "This month"],
  ["30", "Last 30 days"],
];
const YEARS = ["AS100", "AS200", "AS300", "AS400", "Other"];
const PASS_KEY = "axiom-admin-pass";

// ---------- loading ----------
async function fetchStats(password) {
  if (state.demo) return demoStats();
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "stats", password }) });
  return res.json();
}

async function openDashboard(password) {
  const err = $("#admin-error");
  const btn = $("#admin-open");
  btn.disabled = true;
  btn.textContent = "Opening…";
  try {
    const res = await fetchStats(password);
    if (!res.ok) {
      err.textContent = res.message || "Couldn't open the dashboard.";
      err.hidden = false;
      try { sessionStorage.removeItem(PASS_KEY); } catch {}
      return;
    }
    err.hidden = true;
    admin.password = password;
    admin.data = res;
    state.tutors = res.tutors || [];
    try { sessionStorage.setItem(PASS_KEY, password); } catch {}
    $("#admin-login").hidden = true;
    $("#dash").hidden = false;
    $("#dash-sample").hidden = !state.demo;
    renderDashboard();
  } catch (error) {
    console.error(error);
    err.textContent = "Couldn't reach the server. Check your connection and try again.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Open dashboard";
  }
}

// ---------- time range ----------
function rangeBounds() {
  const today = admin.data.now.slice(0, 10);
  const d = parseISO(today);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (admin.range) {
    case "month":
      return [isoOf(new Date(y, m, 1)), isoOf(new Date(y, m + 1, 0))];
    case "30":
      return [isoOf(new Date(y, m, d.getDate() - 30)), today];
    case "semester":
      if (m >= 7) return [`${y}-08-01`, `${y}-12-31`];
      if (m <= 4) return [`${y}-01-01`, `${y}-05-31`];
      return [`${y}-06-01`, `${y}-07-31`];
    default:
      return [null, null];
  }
}

function inRange(b) {
  const [from, to] = rangeBounds();
  return (!from || b.date >= from) && (!to || b.date <= to);
}

// ---------- stats ----------
function computeStats() {
  const now = admin.data.now;
  const all = admin.data.bookings.filter(inRange);
  const st = (b) => b.status.toLowerCase();
  const accepted = all.filter((b) => st(b) === "accepted");
  const endKey = (b) => `${b.date} ${addMinutes(b.time, b.duration)}`;
  const completed = accepted.filter((b) => endKey(b) <= now);
  const upcoming = accepted.filter((b) => `${b.date} ${b.time}` > now);
  const requests = all.filter((b) => !st(b).startsWith("cancel"));
  const declined = all.filter((b) => st(b).startsWith("declin"));

  const tutors = new Map();
  const tutorRow = (name) => {
    if (!tutors.has(name)) tutors.set(name, { name, sessions: 0, minutes: 0, upcoming: 0, requests: 0, declined: 0 });
    return tutors.get(name);
  };
  state.tutors.forEach(tutorRow);
  requests.forEach((b) => { tutorRow(b.tutor).requests++; });
  declined.forEach((b) => { tutorRow(b.tutor).declined++; });
  // A group session has one row per cadet, but the tutor gave that time once:
  // count each session once and each half hour of tutor time once.
  const sessionKey = (b) => `${b.tutor}|${b.date}|${b.time}|${b.duration}`;
  const seenSession = new Set();
  const seenSlot = new Set();
  completed.forEach((b) => {
    const t = tutorRow(b.tutor);
    if (!seenSession.has(sessionKey(b))) { seenSession.add(sessionKey(b)); t.sessions++; }
    for (let m = 0; m < b.duration; m += 30) {
      const slot = `${b.tutor}|${b.date}|${addMinutes(b.time, m)}`;
      if (!seenSlot.has(slot)) { seenSlot.add(slot); t.minutes += 30; }
    }
  });
  const upcomingSessions = new Set(upcoming.map(sessionKey));
  upcomingSessions.forEach((k) => { tutorRow(k.split("|")[0]).upcoming++; });

  const count = (list, key) => {
    const map = new Map();
    list.forEach((b) => map.set(key(b), (map.get(key(b)) || 0) + 1));
    return map;
  };

  return {
    all, accepted, completed, upcoming, requests, declined,
    pending: all.filter((b) => st(b) === "pending"),
    cancelled: all.filter((b) => st(b).startsWith("cancel")),
    sessionsDone: seenSession.size,
    sessionsAhead: upcomingSessions.size,
    groupSessions: [...seenSession].filter((k) => completed.filter((b) => sessionKey(b) === k).length > 1).length,
    minutes: [...tutors.values()].reduce((sum, t) => sum + t.minutes, 0),
    // One booking can cover several cadets (booked together), so count every one of them.
    cadets: new Set(completed.flatMap((b) => b.students || [b.student])).size,
    acceptRate: accepted.length + declined.length ? accepted.length / (accepted.length + declined.length) : null,
    tutors: [...tutors.values()].sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions || a.name.localeCompare(b.name)),
    topics: count(requests, (b) => b.topic || "Not given"),
    formats: count(accepted, (b) => (b.format === "Online" ? "Online" : "In person")),
    years: (() => {
      const map = new Map();
      requests.flatMap((b) => b.years || [b.year]).forEach((y) => {
        const k = YEARS.includes(y) ? y : "Other";
        map.set(k, (map.get(k) || 0) + 1);
      });
      return map;
    })(),
  };
}

const fmtHours = (minutes) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
};

// ---------- render ----------
function renderDashboard() {
  const s = computeStats();
  renderRange();
  $("#dash-updated").textContent = `Updated ${admin.data.now.slice(11)} · ${parseISO(admin.data.now.slice(0, 10)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  renderKpis(s);
  renderWeeks(s);
  renderBars($("#chart-topics"), topEntries(s.topics, 8), "requests");
  renderTutorTable(s);
  renderBars($("#chart-format"), ["In person", "Online"].map((k) => [k, s.formats.get(k) || 0]), "sessions", true);
  renderBars($("#chart-years"), YEARS.map((k) => [k, s.years.get(k) || 0]), "requests");
  renderStatus(s);
}

function renderRange() {
  $("#range").replaceChildren(...RANGES.map(([key, label]) => el("button", {
    type: "button", class: "range-btn", "aria-pressed": String(key === admin.range),
    onclick: () => { admin.range = key; renderDashboard(); },
  }, label)));
}

function renderKpis(s) {
  const tiles = [
    ["Sessions completed", String(s.sessionsDone), `${s.groupSessions} of them group sessions`],
    ["Hours tutored", fmtHours(s.minutes), "Total time of completed sessions"],
    ["Cadets helped", String(s.cadets), "Different cadets in completed sessions"],
    ["Upcoming sessions", String(s.sessionsAhead), "Accepted, not yet held"],
    ["Waiting for a tutor", String(s.pending.length), "Requests still Pending", s.pending.length ? "warn" : ""],
    ["Acceptance rate", s.acceptRate == null ? "—" : `${Math.round(s.acceptRate * 100)}%`, "Accepted ÷ (accepted + declined)"],
  ];
  $("#kpis").replaceChildren(...tiles.map(([label, value, hint, flag]) => el("div", { class: `kpi${flag ? " kpi-" + flag : ""}` },
    el("span", { class: "kpi-label" }, label),
    el("span", { class: "kpi-value" }, value),
    el("span", { class: "kpi-hint" }, hint))));
}

function topEntries(map, n) {
  const entries = [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (entries.length <= n) return entries;
  const rest = entries.slice(n - 1).reduce((sum, [, v]) => sum + v, 0);
  return [...entries.slice(0, n - 1), ["Other topics", rest]];
}

function emptyNote(box, text) {
  box.replaceChildren(el("p", { class: "muted empty" }, text));
}

// Horizontal bars: label, bar, value. One series, so one color and no legend.
function renderBars(box, entries, unit, showShare) {
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (!total) return emptyNote(box, `No ${unit} in this time range yet.`);
  const max = Math.max(...entries.map(([, v]) => v));
  box.replaceChildren(el("div", { class: "hbars" }, ...entries.map(([label, value]) => {
    const share = Math.round((value / total) * 100);
    const tipText = `${label}: ${value} ${value === 1 ? unit.replace(/s$/, "") : unit} (${share}%)`;
    return el("div", { class: "hbar-row", tabindex: "0", "data-tip": tipText, "aria-label": tipText },
      el("span", { class: "hbar-label" }, label),
      el("span", { class: "hbar-track" }, el("span", { class: "hbar-fill", style: `width: ${value ? Math.max((value / max) * 100, 1.5) : 0}%` })),
      el("span", { class: "hbar-value" }, showShare ? `${value} · ${share}%` : String(value)));
  })));
}

function weekStart(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return isoOf(d);
}

function renderWeeks(s) {
  const box = $("#chart-weeks");
  const [from, to] = rangeBounds();
  const today = admin.data.now.slice(0, 10);
  const dates = s.accepted.map((b) => b.date);
  if (!dates.length) return emptyNote(box, "No accepted sessions in this time range yet.");
  const first = weekStart(from || dates.reduce((a, b) => (a < b ? a : b)));
  const lastDate = to || [today, ...dates].reduce((a, b) => (a > b ? a : b));
  let weeks = [];
  for (let w = first; w <= lastDate; w = isoOf(new Date(parseISO(w).getFullYear(), parseISO(w).getMonth(), parseISO(w).getDate() + 7))) weeks.push(w);
  weeks = weeks.slice(-16); // keep the chart readable
  const counts = new Map(weeks.map((w) => [w, 0]));
  s.accepted.forEach((b) => { const w = weekStart(b.date); if (counts.has(w)) counts.set(w, counts.get(w) + 1); });
  const max = Math.max(1, ...counts.values());
  const top = max <= 4 ? max : Math.ceil(max / 2) * 2; // even top tick so the midline is a whole number
  const short = (iso) => parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const thisWeek = weekStart(today);
  box.replaceChildren(el("div", { class: "vchart" },
    el("div", { class: "vaxis", "aria-hidden": "true" },
      el("span", {}, String(top)), el("span", {}, top % 2 ? "" : String(top / 2)), el("span", {}, "0")),
    el("div", { class: "vplot" },
      ...[...counts].map(([w, n], i) => {
        const tipText = `Week of ${short(w)}: ${n} ${n === 1 ? "session" : "sessions"}${w === thisWeek ? " (this week)" : ""}`;
        return el("div", { class: `vcol${w === thisWeek ? " now" : ""}`, tabindex: "0", "data-tip": tipText, "aria-label": tipText },
          el("span", { class: "vbar", style: `height: calc((100% - 22px) * ${n / top})` }),
          // With many weeks, label every other one so the dates don't collide.
          el("span", { class: "vlabel" }, counts.size <= 8 || i % 2 === 0 || w === thisWeek ? short(w) : ""));
      }))));
}

function renderTutorTable(s) {
  const box = $("#tutor-table");
  if (!s.tutors.length) return emptyNote(box, "No tutors yet.");
  const maxMin = Math.max(1, ...s.tutors.map((t) => t.minutes));
  const leader = s.tutors[0].minutes > 0 ? s.tutors[0].name : null;
  box.replaceChildren(el("table", { class: "tutor-stats" },
    el("thead", {}, el("tr", {},
      el("th", { scope: "col" }, "Tutor"),
      el("th", { scope: "col", class: "num" }, "Hours"),
      el("th", { scope: "col", class: "num" }, "Sessions"),
      el("th", { scope: "col", class: "num" }, "Upcoming"),
      el("th", { scope: "col", class: "num" }, "Requests"),
      el("th", { scope: "col", class: "num" }, "Declined"))),
    el("tbody", {}, ...s.tutors.map((t) => el("tr", {},
      el("th", { scope: "row" },
        el("span", { class: "who" }, el("span", { class: "dot", style: `--c: ${tutorColor(t.name)}`, "aria-hidden": "true" }), t.name,
          ...(t.name === leader ? [el("span", { class: "badge" }, "Most hours")] : [])),
        el("span", { class: "mini-track", "aria-hidden": "true" }, el("span", { class: "mini-fill", style: `width: ${(t.minutes / maxMin) * 100}%` }))),
      el("td", { class: "num strong" }, fmtHours(t.minutes)),
      el("td", { class: "num" }, String(t.sessions)),
      el("td", { class: "num" }, String(t.upcoming)),
      el("td", { class: "num" }, String(t.requests)),
      el("td", { class: "num" }, String(t.declined)))))));
}

function renderStatus(s) {
  const items = [
    ["ok", "✓", "Accepted", s.accepted.length],
    ["warn", "…", "Pending", s.pending.length],
    ["bad", "✕", "Declined", s.declined.length],
    ["muted", "–", "Cancelled", s.cancelled.length],
  ];
  const apps = admin.data.applications;
  $("#status-list").replaceChildren(...items.map(([kind, icon, label, n]) =>
    el("span", { class: `status status-${kind}` }, el("b", { "aria-hidden": "true" }, icon), `${label}: ${n}`)),
    el("span", { class: "status status-info" }, el("b", { "aria-hidden": "true" }, "+"),
      `Tutor applications: ${apps.total} (${apps.fresh} new, all time)`));
}

// ---------- tooltip ----------
function showTip(target) {
  const tip = $("#tip");
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), document.documentElement.clientWidth - w - 8);
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
}
function hideTip() { $("#tip").hidden = true; }
document.addEventListener("mouseover", (e) => { const t = e.target.closest("[data-tip]"); t ? showTip(t) : hideTip(); });
document.addEventListener("focusin", (e) => { const t = e.target.closest("[data-tip]"); t ? showTip(t) : hideTip(); });
document.addEventListener("scroll", hideTip, { passive: true });

// ---------- CSV export ----------
function exportCsv() {
  const s = computeStats();
  const label = RANGES.find(([k]) => k === admin.range)[1];
  const rows = [["Tutor", "Hours", "Completed sessions", "Upcoming", "Requests", "Declined"],
    ...s.tutors.map((t) => [t.name, fmtHours(t.minutes), t.sessions, t.upcoming, t.requests, t.declined])];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `axiom-tutor-hours-${label.toLowerCase().replace(/\s+/g, "-")}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------- demo data ----------
function demoStats() {
  const tutors = ["C/3C Hernandez", "C/2d Lt Merle Cintron", "C/2d Lt Vivas", "C/Maj Cortes Garay"];
  const topics = DEFAULT_TOPICS.map(([, t]) => t);
  const now = new Date();
  const bookings = [];
  for (let i = 0; i < 70; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60 + ((i * 37) % 75));
    const status = i % 9 === 0 ? "Declined" : i % 13 === 0 ? "Pending" : i % 17 === 0 ? "Cancelled" : "Accepted";
    bookings.push({
      date: isoOf(d), time: ["12:30", "15:00", "16:30", "18:00"][i % 4], duration: [30, 60, 60, 120][i % 4],
      tutor: tutors[(i * 7) % 4], topic: topics[(i * i + 3) % 9], format: i % 3 ? "In person" : "Online",
      status, year: YEARS[i % 5], student: `s${i % 23}`,
    });
  }
  const pad = (n) => String(n).padStart(2, "0");
  return { ok: true, now: `${isoOf(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`, tutors, bookings, applications: { total: 3, fresh: 1 } };
}

// ---------- start ----------
$("#admin-login").addEventListener("submit", (e) => {
  e.preventDefault();
  const pass = $("#admin-pass").value;
  if (!pass && !state.demo) {
    $("#admin-error").textContent = "Enter the admin password.";
    $("#admin-error").hidden = false;
    return;
  }
  openDashboard(pass);
});
$("#dash-refresh").addEventListener("click", () => openDashboard(admin.password));
$("#dash-lock").addEventListener("click", () => {
  try { sessionStorage.removeItem(PASS_KEY); } catch {}
  admin.password = "";
  admin.data = null;
  $("#dash").hidden = true;
  $("#admin-login").hidden = false;
  $("#admin-pass").value = "";
});
$("#export-csv").addEventListener("click", exportCsv);
try {
  const saved = sessionStorage.getItem(PASS_KEY);
  if (saved) openDashboard(saved);
} catch {}
