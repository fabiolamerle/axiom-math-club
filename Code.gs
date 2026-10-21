/**
 * AXIOM Math Club: booking backend (Google Apps Script + Google Sheets).
 * Setup steps are in README.md.
 *
 * Sheets used:
 *   Availability  Tutor | Tutor Email | Day | Start | End
 *                 Day is a weekday ("Monday" / "Lunes") for every week, or a date (2026-10-28) for one day.
 *   Topics        Category | Topic
 *   Events        Date | Start | End | Title | Location | Details  (shown on the site's calendar)
 *   Bookings      written by the site. Set Status to "Cancelled" to free a slot.
 */
const CONFIG = {
  clubName: 'AXIOM Math Club',
  sessionMinutes: 30,   // length of each session
  daysAhead: 21,        // how far ahead students can book
  calendarDays: 62,     // how far ahead the calendar shows tutor availability
  minNoticeHours: 12,   // students can't book closer than this to the session
  alsoNotify: '',       // extra emails (comma-separated) that get every booking, e.g. the club president
};

const BOOKING_HEADERS = ['Created', 'Booking ID', 'Status', 'Date', 'Time', 'Tutor', 'Tutor Email',
  'Student', 'Student Email', 'Grade', 'Topic', 'Notes'];

const DEFAULT_TOPICS = [
  ['Precalculus', 'Functions & Graphs'],
  ['Precalculus', 'Polynomial & Rational Functions'],
  ['Precalculus', 'Exponential & Logarithmic Functions'],
  ['Precalculus', 'Trigonometry: Unit Circle'],
  ['Precalculus', 'Trigonometric Identities & Equations'],
  ['Precalculus', 'Inverse Trig Functions'],
  ['Precalculus', 'Sequences & Series'],
  ['Precalculus', 'Conic Sections'],
  ['Precalculus', 'Vectors & Parametric Equations'],
  ['Precalculus', 'Intro to Limits'],
  ['Other math', 'Algebra I'],
  ['Other math', 'Algebra II'],
  ['Other math', 'Geometry'],
  ['Other math', 'Calculus'],
  ['Other math', 'Statistics'],
  ['Other math', 'SAT / ACT Math'],
  ['Other math', 'Homework help (other)'],
];

const WEEKDAYS = {
  sunday: 0, domingo: 0, monday: 1, lunes: 1, tuesday: 2, martes: 2,
  wednesday: 3, 'miércoles': 3, miercoles: 3, thursday: 4, jueves: 4,
  friday: 5, viernes: 5, saturday: 6, 'sábado': 6, sabado: 6,
};

/** Run once from the Apps Script editor to create the sheets. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  // Tutor emails are typed straight into the sheet, not here, so they stay private.
  ensureSheet_(ss, 'Availability', ['Tutor', 'Tutor Email', 'Day', 'Start', 'End'], [
    ['C/3C Hernandez', '', 'Monday', '18:00', '19:00'],
    ['C/3C Hernandez', '', 'Wednesday', '18:00', '19:00'],
    ['C/2d Lt Merle Cintron', '', 'Tuesday', '12:30', '14:30'],
    ['C/2d Lt Merle Cintron', '', 'Thursday', '12:30', '14:30'],
    // Hours not set yet: fill in Day / Start / End.
    ['C/2d Lt Vivas', '', '', '', ''],
    ['C/Maj Cortes Garay', '', '', '', ''],
  ]);
  ensureSheet_(ss, 'Events', ['Date', 'Start', 'End', 'Title', 'Location', 'Details'], [
    ['2026-10-28', '', '', 'AXIOM 1st Meeting', '', 'Our first club meeting. Everyone is welcome.'],
  ]);
  ensureSheet_(ss, 'Topics', ['Category', 'Topic'], DEFAULT_TOPICS);
  ensureSheet_(ss, 'Bookings', BOOKING_HEADERS, []);
}

function ensureSheet_(ss, name, headers, rows) {
  if (ss.getSheetByName(name)) return;
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1000, headers.length).setNumberFormat('@'); // keep dates and times as plain text
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
}

// ---------- web endpoints ----------
function doGet(e) {
  try {
    const slots = openSlots_().map(s => ({ date: s.date, time: s.time, tutors: s.tutors.length }));
    const blocks = availabilityBlocks_(CONFIG.calendarDays)
      .map(b => ({ date: b.date, tutor: b.tutor, start: fromMinutes_(b.start), end: fromMinutes_(b.end) }));
    return json_({
      sessionMinutes: CONFIG.sessionMinutes, slots: slots, topics: topics_(),
      tutors: tutorNames_(), availability: blocks, events: events_(),
    });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request', message: 'Invalid request.' });
  }
  const clean = v => String(v == null ? '' : v).trim().slice(0, 500);
  const b = {
    name: clean(p.name), email: clean(p.email), grade: clean(p.grade),
    topic: clean(p.topic), date: clean(p.date), time: clean(p.time), notes: clean(p.notes),
  };
  if (!b.name || !b.grade) return json_({ ok: false, error: 'invalid', message: 'Fill in your name and grade.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return json_({ ok: false, error: 'invalid', message: 'Enter a valid email.' });
  if (!topics_().some(t => t[1] === b.topic)) return json_({ ok: false, error: 'invalid', message: 'Choose a topic from the list.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let booking;
  try {
    const slot = openSlots_().find(s => s.date === b.date && s.time === b.time);
    if (!slot) return json_({ ok: false, error: 'slot_taken' });
    const tutor = slot.tutors[0];
    booking = {
      id: 'AX-' + Utilities.getUuid().slice(0, 6).toUpperCase(),
      date: b.date, time: b.time, tutor: tutor.name, tutorEmail: tutor.email, topic: b.topic,
    };
    SpreadsheetApp.getActive().getSheetByName('Bookings').appendRow([
      new Date().toISOString(), booking.id, 'Confirmed', b.date, b.time, tutor.name, tutor.email,
      b.name, b.email, b.grade, b.topic, b.notes,
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  try {
    sendEmails_(booking, b);
  } catch (err) {
    console.error('Email failed: ' + err); // the booking is saved even if email fails
  }
  return json_({ ok: true, booking: { id: booking.id, date: booking.date, time: booking.time, tutor: booking.tutor, topic: booking.topic } });
}

// ---------- availability ----------
function openSlots_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const step = CONFIG.sessionMinutes;

  const booked = {};
  readRows_(ss, 'Bookings').forEach(r => {
    if (String(r['Status']).toLowerCase().indexOf('cancel') === 0) return;
    booked[[String(r['Tutor']).trim(), cellDate_(r['Date'], tz), cellTime_(r['Time'], tz)].join('|')] = true;
  });

  const cutoff = Utilities.formatDate(new Date(Date.now() + CONFIG.minNoticeHours * 3600e3), tz, 'yyyy-MM-dd HH:mm');
  const map = {};
  availabilityBlocks_(CONFIG.daysAhead).forEach(b => {
    for (let m = b.start; m + step <= b.end; m += step) {
      const time = fromMinutes_(m);
      if (b.date + ' ' + time < cutoff) continue;
      if (booked[[b.tutor, b.date, time].join('|')]) continue;
      const k = b.date + '|' + time;
      if (!map[k]) map[k] = { date: b.date, time: time, tutors: [] };
      if (!map[k].tutors.some(t => t.name === b.tutor)) map[k].tutors.push({ name: b.tutor, email: b.email });
    }
  });
  return Object.keys(map).sort().map(k => map[k]);
}

/** Every tutor time block from today through `days` ahead: {date, tutor, email, start, end} (minutes). */
function availabilityBlocks_(days) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const avail = readRows_(ss, 'Availability');
  const now = new Date();
  const out = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(now.getTime() + i * 86400e3);
    const iso = Utilities.formatDate(day, tz, 'yyyy-MM-dd');
    const dow = Number(Utilities.formatDate(day, tz, 'u')) % 7; // 'u' = 1 (Mon) … 7 (Sun)
    avail.forEach(r => {
      const tutor = String(r['Tutor'] || '').trim();
      if (!tutor || !dayMatches_(r['Day'], iso, dow, tz)) return;
      const start = toMinutes_(cellTime_(r['Start'], tz));
      const end = toMinutes_(cellTime_(r['End'], tz));
      if (start == null || end == null || end <= start) return;
      out.push({ date: iso, tutor: tutor, email: String(r['Tutor Email'] || '').trim(), start: start, end: end });
    });
  }
  return out.sort((a, b) => (a.date + fromMinutes_(a.start)).localeCompare(b.date + fromMinutes_(b.start)));
}

function tutorNames_() {
  const names = [];
  readRows_(SpreadsheetApp.getActive(), 'Availability').forEach(r => {
    const t = String(r['Tutor'] || '').trim();
    if (t && names.indexOf(t) < 0) names.push(t);
  });
  return names;
}

/** Upcoming events (and the past 31 days, so the current month looks complete). */
function events_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Events');
  if (!sh) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const from = Utilities.formatDate(new Date(Date.now() - 31 * 86400e3), tz, 'yyyy-MM-dd');
  return readRows_(ss, 'Events')
    .map(r => ({
      date: cellDate_(r['Date'], tz), start: cellTime_(r['Start'], tz), end: cellTime_(r['End'], tz),
      title: String(r['Title'] || '').trim(), location: String(r['Location'] || '').trim(),
      details: String(r['Details'] || '').trim(),
    }))
    .filter(e => e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= from)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function dayMatches_(cell, iso, dow, tz) {
  if (cell instanceof Date) return cellDate_(cell, tz) === iso;
  const s = String(cell || '').trim().toLowerCase();
  if (!s) return false;
  if (s in WEEKDAYS) return WEEKDAYS[s] === dow;
  return cellDate_(s, tz) === iso;
}

function topics_() {
  const rows = readRows_(SpreadsheetApp.getActive(), 'Topics')
    .map(r => [String(r['Category'] || 'Topics').trim(), String(r['Topic'] || '').trim()])
    .filter(r => r[1]);
  return rows.length ? rows : DEFAULT_TOPICS;
}

// ---------- email ----------
function sendEmails_(bk, st) {
  const when = whenText_(bk.date, bk.time);
  const rows = [['Topic', bk.topic], ['When', when], ['Tutor', bk.tutor], ['Student', st.name + ' (' + st.grade + ')'],
    ['Student email', st.email], ['Notes', st.notes || '—'], ['Booking ID', bk.id]];
  const table = '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif">' +
    rows.map(r => '<tr><td style="color:#5a6880">' + esc_(r[0]) + '</td><td><b>' + esc_(r[1]) + '</b></td></tr>').join('') +
    '</table>';

  const staff = [bk.tutorEmail].concat(CONFIG.alsoNotify.split(',')).map(s => s.trim()).filter(Boolean);
  if (staff.length) {
    MailApp.sendEmail({
      to: staff.join(','),
      replyTo: st.email,
      subject: 'New session booked: ' + bk.topic + ' · ' + when,
      htmlBody: '<h2 style="font-family:Arial,sans-serif;color:#1b2d4b">New tutoring session</h2>' + table +
        '<p style="font-family:Arial,sans-serif;color:#5a6880">Reply to this email to contact the student.</p>',
    });
  }

  const confirm = {
    to: st.email,
    name: CONFIG.clubName,
    subject: 'You\'re booked: ' + bk.topic + ' · ' + when,
    htmlBody: '<h2 style="font-family:Arial,sans-serif;color:#1b2d4b">See you soon, ' + esc_(st.name.split(' ')[0]) + '!</h2>' +
      '<p style="font-family:Arial,sans-serif">Your ' + esc_(CONFIG.clubName) + ' session is confirmed.</p>' + table +
      '<p style="font-family:Arial,sans-serif;color:#5a6880">Need to cancel or reschedule? Reply to this email.</p>',
  };
  if (bk.tutorEmail) confirm.replyTo = bk.tutorEmail;
  MailApp.sendEmail(confirm);
}

function whenText_(iso, time) {
  const p = iso.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2], 12);
  const day = Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEE, MMM d');
  const fmt = t => { const m = toMinutes_(t); const h = Math.floor(m / 60); return ((h + 11) % 12 + 1) + ':' + String(m % 60).padStart(2, '0') + (h < 12 ? ' AM' : ' PM'); };
  return day + ', ' + fmt(time) + '–' + fmt(fromMinutes_(toMinutes_(time) + CONFIG.sessionMinutes));
}

// ---------- helpers ----------
function readRows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '". Run setup() first.');
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(h => String(h).trim());
  return values.map(row => {
    const o = {};
    headers.forEach((h, i) => { o[h] = row[i]; });
    return o;
  });
}

function cellDate_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return s;
}

function cellTime_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
  const m = String(v || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return '';
  let h = Number(m[1]);
  const ap = (m[3] || '').charAt(0);
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + (m[2] || '00');
}

function toMinutes_(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fromMinutes_(n) {
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
