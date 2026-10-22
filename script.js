// Paste your Google Apps Script web app URL here (see README.md).
// While it is empty, the site runs in demo mode with sample times.
const API_URL = "https://script.google.com/macros/s/AKfycbzjTCzVQWR3kC8WMNvHb5nbbAFq3l3KAmn8gNr3f5rnzU9wkznv-5OSOH7cJSOppnGd/exec";

const DEFAULT_TOPICS = [
  ["Precalculus", "Functions & Graphs"],
  ["Precalculus", "Polynomial & Rational Functions"],
  ["Precalculus", "Exponential & Logarithmic Functions"],
  ["Precalculus", "Trigonometry: Unit Circle"],
  ["Precalculus", "Trigonometric Identities & Equations"],
  ["Precalculus", "Inverse Trig Functions"],
  ["Precalculus", "Sequences & Series"],
  ["Precalculus", "Conic Sections"],
  ["Precalculus", "Vectors & Parametric Equations"],
  ["Precalculus", "Intro to Limits"],
  ["Other math", "Algebra I"],
  ["Other math", "Algebra II"],
  ["Other math", "Geometry"],
  ["Other math", "Calculus"],
  ["Other math", "Statistics"],
  ["Other math", "SAT / ACT Math"],
  ["Other math", "Homework help (other)"],
];

const $ = (sel) => document.querySelector(sel);
const state = {
  demo: !API_URL,
  free: [],     // every free half hour per tutor, from the server
  slots: [],    // start times (with tutor) that fit the chosen length
  durations: [30, 60, 120],
  duration: 30,
  tutor: null,
  topics: DEFAULT_TOPICS,
  sessionMinutes: 30,
  date: null,
  time: null,
  tutors: [],
  availability: [],
  events: [],
  calMonth: null, // first day of the month shown
  calDay: null,   // selected day (ISO)
};

// ---------- formatting ----------
function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function fmtDuration(mins) {
  return mins < 60 ? `${mins} min` : `${mins / 60} ${mins === 60 ? "hour" : "hours"}`;
}
function fmtWhen(date, time, mins = state.duration) {
  const day = parseISO(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return `${day}, ${fmtTime(time)} – ${fmtTime(addMinutes(time, mins))} (${fmtDuration(mins)})`;
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

// ---------- topics ----------
function groupTopics() {
  const groups = new Map();
  for (const [cat, topic] of state.topics) {
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(topic);
  }
  return groups;
}
function renderTopics() {
  const select = $("#topic");
  const current = select.value;
  select.replaceChildren(el("option", { value: "" }, "Choose a topic…"));
  const list = $("#topic-list");
  list.replaceChildren();
  for (const [cat, topics] of groupTopics()) {
    const og = el("optgroup", { label: cat });
    topics.forEach((t) => og.append(el("option", { value: t }, t)));
    select.append(og);
    list.append(el("div", {}, el("h3", {}, cat), el("ul", {}, ...topics.map((t) => el("li", {}, t)))));
  }
  select.value = current;
}

// ---------- slots ----------
async function loadSlots() {
  try {
    const data = state.demo ? demoSlots() : await (await fetch(`${API_URL}?action=slots`)).json();
    if (data.error) throw new Error(data.error);
    if (!data.free) throw new Error("Booking server is out of date: update the Apps Script deployment.");
    state.free = data.free;
    if (data.topics && data.topics.length) state.topics = data.topics;
    if (data.sessionMinutes) state.sessionMinutes = data.sessionMinutes;
    if (data.durations && data.durations.length) state.durations = data.durations;
    if (state.durations.indexOf(state.duration) < 0) state.duration = state.durations[0];
    state.tutors = data.tutors || [];
    state.availability = data.availability || [];
    state.events = data.events || [];
  } catch (err) {
    console.error(err);
    $("#dates").replaceChildren(el("p", { class: "error" }, "Couldn't load open times. Refresh the page to try again."));
    $("#day-detail").replaceChildren(el("p", { class: "error" }, "Couldn't load the calendar. Refresh the page to try again."));
    return;
  }
  renderTopics();
  computeOptions();
  renderDurations();
  renderDates();
  renderCalendar();
}

// A start time works when the same tutor is free for every half hour of the chosen length.
function computeOptions() {
  const free = new Set(state.free.map((s) => `${s.tutor}|${s.date}|${s.time}`));
  const steps = state.duration / state.sessionMinutes;
  state.slots = state.free.filter((s) => {
    for (let k = 1; k < steps; k++) {
      if (!free.has(`${s.tutor}|${s.date}|${addMinutes(s.time, k * state.sessionMinutes)}`)) return false;
    }
    return true;
  });
}

function renderDurations() {
  $("#durations").replaceChildren(...state.durations.map((d) => el("button", {
    type: "button", class: "dur-btn", "aria-pressed": String(d === state.duration),
    onclick: () => {
      state.duration = d; state.time = state.tutor = null;
      computeOptions(); renderDurations(); renderDates(); renderCalendar();
    },
  }, fmtDuration(d))));
}

function slotsByDate() {
  const map = new Map();
  for (const s of state.slots) {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s);
  }
  return map;
}

function renderDates() {
  const byDate = slotsByDate();
  const box = $("#dates");
  if (!byDate.size) {
    box.replaceChildren(el("p", { class: "muted" }, state.free.length
      ? `No tutor has ${fmtDuration(state.duration)} free in a row. Try a shorter session.`
      : "No open times in the next few weeks. Check back soon."));
    state.date = state.time = null;
    renderTimes();
    return;
  }
  if (!byDate.has(state.date)) { state.date = null; state.time = state.tutor = null; }
  box.replaceChildren(
    ...[...byDate].map(([date, slots]) => {
      const d = parseISO(date);
      return el("button", {
        type: "button", class: "date-btn", "aria-pressed": String(date === state.date),
        "aria-label": `${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${slots.length} open times`,
        onclick: () => { state.date = date; state.time = state.tutor = null; renderDates(); },
      },
        el("span", { class: "dow" }, d.toLocaleDateString("en-US", { weekday: "short" })),
        el("span", { class: "day" }, String(d.getDate())),
        el("span", { class: "mon" }, d.toLocaleDateString("en-US", { month: "short" })),
        el("span", { class: "count" }, `${slots.length} open`),
      );
    })
  );
  renderTimes();
}

function renderTimes() {
  const box = $("#times");
  if (!state.date) {
    box.replaceChildren(el("p", { class: "muted" }, "Pick a day first."));
  } else {
    const slots = slotsByDate().get(state.date) || [];
    box.replaceChildren(
      ...slots.map((s) => el("button", {
        type: "button", class: "time-btn", style: `--c: ${tutorColor(s.tutor)}`,
        "aria-pressed": String(s.time === state.time && s.tutor === state.tutor),
        onclick: () => { state.time = s.time; state.tutor = s.tutor; renderTimes(); },
      },
        `${fmtTime(s.time)} – ${fmtTime(addMinutes(s.time, state.duration))}`,
        el("small", { class: "who" }, el("span", { class: "dot", "aria-hidden": "true" }), s.tutor),
      ))
    );
  }
  renderSummary();
}

function renderSummary() {
  $('#summary [data-k="topic"]').textContent = $("#topic").value || "—";
  $('#summary [data-k="format"]').textContent = $("#booking-form").elements.format.value || "—";
  $('#summary [data-k="when"]').textContent = state.date && state.time ? fmtWhen(state.date, state.time) : "—";
  $('#summary [data-k="tutor"]').textContent = state.tutor || "—";
}

// ---------- calendar ----------
const todayISO = () => isoOf(new Date());
function tutorColor(name) {
  const i = state.tutors.indexOf(name);
  return `var(--t${(i < 0 ? 0 : i) % 4})`;
}
function shortName(name) {
  return name.replace(/^C\/\S+(\s+Lt)?\s+/, ""); // "C/2d Lt Vivas" -> "Vivas"
}
function initials(name) {
  return shortName(name).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function fmtRange(start, end) {
  if (!start) return "Time TBA";
  return end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
}
function dayData(iso) {
  return {
    events: $("#show-events").checked ? state.events.filter((e) => e.date === iso) : [],
    blocks: $("#show-tutors").checked ? state.availability.filter((b) => b.date === iso) : [],
  };
}

function renderCalendar() {
  const now = new Date();
  if (!state.calMonth) state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!state.calDay) state.calDay = todayISO();
  const m = state.calMonth;
  $("#cal-title").textContent = m.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  $("#cal-prev").disabled = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();

  const cells = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => el("div", { class: "cal-dow" }, d));
  for (let i = 0; i < m.getDay(); i++) cells.push(el("div", { class: "cal-cell blank", "aria-hidden": "true" }));
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const today = todayISO();
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoOf(new Date(m.getFullYear(), m.getMonth(), d));
    const { events, blocks } = dayData(iso);
    const tutors = [...new Set(blocks.map((b) => b.tutor))];
    const cls = ["cal-cell", iso === today && "today", iso < today && "past"].filter(Boolean).join(" ");
    const label = `${parseISO(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}: ` +
      `${events.length} events, ${tutors.length} tutors available`;
    const dots = el("span", { class: "cal-dots", "aria-hidden": "true" },
      ...events.map(() => el("i", { style: "--c: var(--event)" })),
      ...tutors.map((t) => el("i", { style: `--c: ${tutorColor(t)}` })));
    cells.push(el("button", {
      type: "button", class: cls, "aria-pressed": String(iso === state.calDay), "aria-label": label,
      onclick: () => { state.calDay = iso; renderCalendar(); },
    },
      el("span", { class: "cal-num" }, String(d)),
      ...events.map((e) => el("span", { class: "cal-ev", title: e.title }, e.title)),
      ...tutors.map((t) => el("span", { class: "cal-tu", style: `--c: ${tutorColor(t)}`, title: t }, shortName(t))),
      dots,
    ));
  }
  $("#cal-grid").replaceChildren(...cells);
  renderDayDetail();
  renderTutorList();
}

function renderDayDetail() {
  const iso = state.calDay;
  const { events, blocks } = dayData(iso);
  const box = $("#day-detail");
  const parts = [el("h3", {}, parseISO(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))];

  if ($("#show-events").checked) {
    parts.push(el("div", {}, el("h4", {}, "Events"),
      events.length
        ? el("ul", { class: "detail-list" }, ...events.map((e) => el("li", { class: "ev-item" },
            el("strong", {}, e.title),
            el("span", {}, [fmtRange(e.start, e.end), e.location].filter(Boolean).join(" · ")),
            ...(e.details ? [el("span", {}, e.details)] : []))))
        : el("p", { class: "muted" }, "No events this day.")));
  }
  if ($("#show-tutors").checked) {
    parts.push(el("div", {}, el("h4", {}, "Tutors available"),
      blocks.length
        ? el("ul", { class: "detail-list" }, ...blocks.map((b) => el("li", { class: "tu-item", style: `--c: ${tutorColor(b.tutor)}` },
            el("span", { class: "who" }, el("span", { class: "dot" }), b.tutor),
            el("span", { class: "when" }, fmtRange(b.start, b.end)))))
        : el("p", { class: "muted" }, "No tutors scheduled this day.")));
    const open = state.slots.filter((s) => s.date === iso).length;
    if (open) {
      parts.push(el("button", {
        type: "button", class: "btn btn-block",
        onclick: () => {
          state.date = iso; state.time = state.tutor = null; renderDates();
          $("#book").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        },
      }, `Book this day · ${open} open`));
    } else if (blocks.length) {
      parts.push(el("p", { class: "muted" }, iso < todayISO() ? "This day has passed." : "No open booking times this day yet."));
    }
  }
  box.replaceChildren(...parts);
}

function renderTutorList() {
  const list = $("#tutor-list");
  if (!state.tutors.length) {
    list.replaceChildren(el("li", { class: "muted" }, "Tutor list coming soon."));
    return;
  }
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  list.replaceChildren(...state.tutors.map((t) => {
    const days = [...new Set(state.availability.filter((b) => b.tutor === t).map((b) => parseISO(b.date).getDay()))].sort();
    return el("li", { style: `--c: ${tutorColor(t)}` },
      el("span", { class: "avatar", "aria-hidden": "true" }, initials(t)),
      el("span", {}, t, el("small", {}, days.length ? `Usually ${days.map((d) => dayNames[d]).join(", ")}` : "No hours posted yet")));
  }));
}

function shiftMonth(n) {
  const m = state.calMonth;
  state.calMonth = new Date(m.getFullYear(), m.getMonth() + n, 1);
  renderCalendar();
}

// ---------- booking ----------
function showError(msg) {
  const box = $("#form-error");
  box.textContent = msg;
  box.hidden = !msg;
}

async function submitBooking(e) {
  e.preventDefault();
  const f = e.target;
  const payload = {
    action: "book",
    topic: f.elements.topic.value,
    date: state.date,
    time: state.time,
    tutor: state.tutor,
    duration: state.duration,
    name: f.elements.name.value.trim(),
    email: f.elements.email.value.trim(),
    phone: f.elements.phone.value.trim(),
    format: f.elements.format.value,
    grade: f.elements.grade.value,
    notes: f.elements.notes.value.trim(),
  };
  if (!payload.topic) return showError("Choose a topic.");
  if (!payload.date || !payload.time || !payload.tutor) return showError("Pick a day and a time with a tutor.");
  if (!payload.format) return showError("Choose In person or Online.");
  if (!payload.name) return showError("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return showError("Enter a valid email so we can confirm your session.");
  if (payload.phone.replace(/\D/g, "").length < 7) return showError("Enter a phone number so your tutor can reach you.");
  if (!payload.grade) return showError("Select your AS year.");
  showError("");

  const btn = $("#submit");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const res = state.demo
      ? demoBook(payload)
      : await (await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) })).json();
    if (!res.ok) {
      if (res.error === "slot_taken") {
        showError("Someone just booked that time. Pick another one.");
        await loadSlots();
      } else {
        showError(res.message || "Booking didn't go through. Try again.");
      }
      return;
    }
    showConfirmation(res.booking, payload);
  } catch (err) {
    console.error(err);
    showError("Couldn't reach the booking server. Check your connection and try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Request session";
  }
}

function showConfirmation(b, p) {
  $("#c-topic").textContent = b.topic;
  $("#c-when").textContent = fmtWhen(b.date, b.time, b.duration || p.duration);
  $("#c-format").textContent = p.format;
  $("#c-tutor").textContent = b.tutor;
  $("#c-id").textContent = b.id;
  $("#c-msg").textContent = state.demo
    ? "Demo mode: no email was sent."
    : `${b.tutor} got your request. You'll get an email at ${p.email} when they accept or decline.`;
  $("#booking-form").hidden = true;
  $("#confirmation").hidden = false;
  $("#confirmation").focus();
}

function resetForm() {
  const f = $("#booking-form");
  f.elements.notes.value = "";
  state.date = state.time = state.tutor = null;
  $("#confirmation").hidden = true;
  f.hidden = false;
  loadSlots();
}

// ---------- demo mode (no backend) ----------
// Same hours as the Availability sheet.
const DEMO_TUTORS = ["C/3C Hernandez", "C/2d Lt Merle Cintron", "C/2d Lt Vivas", "C/Maj Cortes Garay"];
const DEMO_WEEK = {
  1: [[DEMO_TUTORS[2], "16:30", "19:30"], [DEMO_TUTORS[0], "18:00", "19:00"]],
  2: [[DEMO_TUTORS[1], "12:30", "14:30"], [DEMO_TUTORS[3], "15:00", "18:00"], [DEMO_TUTORS[2], "16:30", "19:30"]],
  3: [[DEMO_TUTORS[2], "16:30", "19:30"], [DEMO_TUTORS[0], "18:00", "19:00"]],
  4: [[DEMO_TUTORS[1], "12:30", "14:30"], [DEMO_TUTORS[3], "15:00", "18:00"], [DEMO_TUTORS[2], "16:30", "19:30"]],
  5: [[DEMO_TUTORS[3], "14:00", "17:00"], [DEMO_TUTORS[2], "16:30", "19:30"]],
};
const DEMO_EVENTS = [
  { date: "2026-10-28", start: "", end: "", title: "AXIOM 1st Meeting", location: "", details: "Our first club meeting. Everyone is welcome." },
];
function demoBooked() {
  try { return JSON.parse(localStorage.getItem("axiom-demo-bookings") || "[]"); } catch { return []; }
}
function demoSlots() {
  const booked = demoBooked();
  const free = [];
  const now = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = isoOf(d);
    for (const [tutor, start, end] of DEMO_WEEK[d.getDay()] || []) {
      for (let t = start; addMinutes(t, 30) <= end; t = addMinutes(t, 30)) {
        const taken = booked.some((b) => b.date === iso && b.tutor === tutor && t >= b.time && t < addMinutes(b.time, b.duration || 30));
        if (!taken) free.push({ date: iso, time: t, tutor });
      }
    }
  }
  free.sort((a, b) => (a.date + a.time + a.tutor).localeCompare(b.date + b.time + b.tutor));
  const availability = [];
  for (let i = 0; i <= 62; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    for (const [tutor, start, end] of DEMO_WEEK[d.getDay()] || []) availability.push({ date: isoOf(d), tutor, start, end });
  }
  return { sessionMinutes: 30, durations: [30, 60, 120], free, topics: DEFAULT_TOPICS, tutors: DEMO_TUTORS, availability, events: DEMO_EVENTS };
}
function demoBook(p) {
  const free = new Set(demoSlots().free.map((s) => `${s.tutor}|${s.date}|${s.time}`));
  for (let m = 0; m < p.duration; m += 30) {
    if (!free.has(`${p.tutor}|${p.date}|${addMinutes(p.time, m)}`)) return { ok: false, error: "slot_taken" };
  }
  const booking = { id: "AX-" + Math.random().toString(36).slice(2, 8).toUpperCase(), date: p.date, time: p.time, duration: p.duration, tutor: p.tutor, topic: p.topic };
  try { localStorage.setItem("axiom-demo-bookings", JSON.stringify([...demoBooked(), booking])); } catch {}
  return { ok: true, booking };
}

// ---------- start ----------
$("#demo-note").hidden = !state.demo;
$("#topic").addEventListener("change", renderSummary);
document.querySelectorAll('input[name="format"]').forEach((r) => r.addEventListener("change", renderSummary));
$("#booking-form").addEventListener("submit", submitBooking);
$("#book-another").addEventListener("click", resetForm);
$("#cal-prev").addEventListener("click", () => shiftMonth(-1));
$("#cal-next").addEventListener("click", () => shiftMonth(1));
$("#show-events").addEventListener("change", renderCalendar);
$("#show-tutors").addEventListener("change", renderCalendar);
renderTopics();
loadSlots();
