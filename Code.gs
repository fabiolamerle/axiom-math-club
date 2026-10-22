/**
 * AXIOM Math Club: booking backend (Google Apps Script + Google Sheets).
 * Setup steps are in README.md.
 *
 * Sheets used:
 *   Availability  Tutor | Tutor Email | Day | Start | End | Meeting Link
 *                 Meeting Link is the tutor's fixed Zoom/Teams link, emailed to students who pick Online.
 *                 Day is a weekday ("Monday" / "Lunes") for every week, or a date (2026-10-28) for one day.
 *   Topics        Category | Topic
 *   Events        Date | Start | End | Title | Location | Details  (shown on the site's calendar)
 *   Tutor Applications  written by the site's "Become a tutor" form.
 *   Bookings      written by the site. Status goes Pending -> Accepted / Declined when the tutor
 *                 answers from the email. Set Status to "Cancelled" to free a slot by hand.
 */
const CONFIG = {
  clubName: 'AXIOM Math Club',
  sessionMinutes: 30,   // time grid: sessions start on the half hour
  durations: [30, 60, 120], // session lengths students can pick (minutes)
  daysAhead: 21,        // how far ahead students can book
  calendarDays: 62,     // how far ahead the calendar shows tutor availability
  minNoticeHours: 12,   // students can't book closer than this to the session
  alsoNotify: '',       // extra emails (comma-separated) that get every booking request, e.g. the club president
  siteUrl: 'https://fabiolamerle.github.io/axiom-math-club/',
  defaultMeetingLink: '', // used for Online sessions when a tutor has no Meeting Link of their own
};

const FORMATS = ['In person', 'Online'];

const BOOKING_HEADERS = ['Created', 'Booking ID', 'Status', 'Date', 'Time', 'Tutor', 'Tutor Email',
  'Student', 'Student Email', 'Student Phone', 'Grade', 'Topic', 'Format', 'Duration', 'Notes', 'Responded', 'Token'];

const APPLICATION_HEADERS = ['Created', 'Status', 'Name', 'Email', 'Phone', 'AS Year', 'Highest Math',
  'Topics', 'Availability', 'Why'];

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
  ensureSheet_(ss, 'Availability', ['Tutor', 'Tutor Email', 'Day', 'Start', 'End', 'Meeting Link'], [
    ['C/3C Hernandez', 'luan.hernandez@upr.edu', 'Monday', '18:00', '19:00', ''],
    ['C/3C Hernandez', 'luan.hernandez@upr.edu', 'Wednesday', '18:00', '19:00', ''],
    ['C/2d Lt Merle Cintron', 'Fabiola.merle@upr.edu', 'Tuesday', '12:30', '14:30', ''],
    ['C/2d Lt Merle Cintron', 'Fabiola.merle@upr.edu', 'Thursday', '12:30', '14:30', ''],
    ['C/2d Lt Vivas', 'Julian.vivas@upr.edu', 'Monday', '16:30', '19:30', ''],
    ['C/2d Lt Vivas', 'Julian.vivas@upr.edu', 'Tuesday', '16:30', '19:30', ''],
    ['C/2d Lt Vivas', 'Julian.vivas@upr.edu', 'Wednesday', '16:30', '19:30', ''],
    ['C/2d Lt Vivas', 'Julian.vivas@upr.edu', 'Thursday', '16:30', '19:30', ''],
    ['C/2d Lt Vivas', 'Julian.vivas@upr.edu', 'Friday', '16:30', '19:30', ''],
    ['C/Maj Cortes Garay', 'Jorge.cortes4@upr.edu', 'Tuesday', '15:00', '18:00', ''],
    ['C/Maj Cortes Garay', 'Jorge.cortes4@upr.edu', 'Thursday', '15:00', '18:00', ''],
    ['C/Maj Cortes Garay', 'Jorge.cortes4@upr.edu', 'Friday', '14:00', '17:00', ''],
  ]);
  ensureSheet_(ss, 'Events', ['Date', 'Start', 'End', 'Title', 'Location', 'Details'], [
    ['2026-10-28', '16:30', '', 'AXIOM 1st Meeting', 'Room 104', 'Our first club meeting. Everyone is welcome.'],
  ]);
  ensureSheet_(ss, 'Topics', ['Category', 'Topic'], DEFAULT_TOPICS);
  ensureSheet_(ss, 'Bookings', BOOKING_HEADERS, []);
  ensureSheet_(ss, 'Tutor Applications', APPLICATION_HEADERS, []);
}

function ensureSheet_(ss, name, headers, rows) {
  const existing = ss.getSheetByName(name);
  if (existing) return ensureHeaders_(existing, headers);
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1000, headers.length).setNumberFormat('@'); // keep dates and times as plain text
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
}

/** Adds any missing header columns at the end (for sheets made by an older version). */
function ensureHeaders_(sh, headers) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const have = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const missing = headers.filter(h => have.indexOf(h) < 0);
  if (!missing.length) return;
  const at = have.filter(String).length + 1;
  sh.getRange(1, at, 1000, missing.length).setNumberFormat('@');
  sh.getRange(1, at, 1, missing.length).setValues([missing]).setFontWeight('bold');
}

// ---------- web endpoints ----------
function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.action === 'respond') return responsePage_(q.id, q.token, q.decision);
  try {
    const free = freeSlots_().map(s => ({ date: s.date, time: s.time, tutor: s.tutor }));
    const blocks = availabilityBlocks_(CONFIG.calendarDays)
      .map(b => ({ date: b.date, tutor: b.tutor, start: fromMinutes_(b.start), end: fromMinutes_(b.end) }));
    return json_({
      sessionMinutes: CONFIG.sessionMinutes, durations: CONFIG.durations, free: free, topics: topics_(),
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
  if (p.action === 'apply') return json_(handleApplication_(p));
  if (p.action === 'stats') return json_(adminStats_(p.password));
  const clean = v => String(v == null ? '' : v).trim().slice(0, 500);
  const b = {
    name: clean(p.name), email: clean(p.email), phone: clean(p.phone), grade: clean(p.grade),
    topic: clean(p.topic), format: clean(p.format), date: clean(p.date), time: clean(p.time), notes: clean(p.notes),
    tutor: clean(p.tutor), duration: Number(p.duration),
  };
  if (!b.name || !b.grade) return json_({ ok: false, error: 'invalid', message: 'Fill in your name and AS year.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return json_({ ok: false, error: 'invalid', message: 'Enter a valid email.' });
  if (b.phone.replace(/\D/g, '').length < 7) return json_({ ok: false, error: 'invalid', message: 'Enter a valid phone number.' });
  if (!topics_().some(t => t[1] === b.topic)) return json_({ ok: false, error: 'invalid', message: 'Choose a topic from the list.' });
  if (FORMATS.indexOf(b.format) < 0) return json_({ ok: false, error: 'invalid', message: 'Choose In person or Online.' });
  if (CONFIG.durations.indexOf(b.duration) < 0) return json_({ ok: false, error: 'invalid', message: 'Choose how long the session is.' });
  if (!b.tutor) return json_({ ok: false, error: 'invalid', message: 'Pick a time with a tutor.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let booking;
  try {
    // The tutor must be free for every half hour the session covers.
    const free = freeSlots_();
    const start = toMinutes_(b.time);
    let tutor = null;
    for (let m = start; start != null && m < start + b.duration; m += CONFIG.sessionMinutes) {
      const hit = free.find(s => s.date === b.date && s.time === fromMinutes_(m) && s.tutor === b.tutor);
      if (!hit) { tutor = null; break; }
      if (!tutor) tutor = { name: hit.tutor, email: hit.email };
    }
    if (!tutor) return json_({ ok: false, error: 'slot_taken' });
    booking = {
      id: 'AX-' + Utilities.getUuid().slice(0, 6).toUpperCase(),
      token: Utilities.getUuid().replace(/-/g, ''),
      date: b.date, time: b.time, tutor: tutor.name, tutorEmail: tutor.email, topic: b.topic, format: b.format,
      duration: b.duration,
    };
    const rec = {
      'Created': new Date().toISOString(), 'Booking ID': booking.id, 'Status': 'Pending',
      'Date': b.date, 'Time': b.time, 'Tutor': tutor.name, 'Tutor Email': tutor.email,
      'Student': b.name, 'Student Email': b.email, 'Student Phone': b.phone, 'Grade': b.grade,
      'Topic': b.topic, 'Format': b.format, 'Duration': String(b.duration), 'Notes': b.notes, 'Responded': '', 'Token': booking.token,
    };
    const sh = SpreadsheetApp.getActive().getSheetByName('Bookings');
    ensureHeaders_(sh, BOOKING_HEADERS);
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
    sh.appendRow(headers.map(h => (h in rec ? rec[h] : '')));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  try {
    sendRequestEmails_(booking, b);
  } catch (err) {
    console.error('Email failed: ' + err); // the request is saved even if email fails
  }
  return json_({ ok: true, booking: { id: booking.id, date: booking.date, time: booking.time, duration: booking.duration, tutor: booking.tutor, topic: booking.topic, status: 'Pending' } });
}

// ---------- admin dashboard ----------
// The password lives in Script Properties (Project Settings), never in this public file.
function adminStats_(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('admin_fails') || 0);
  if (fails >= 10) return { ok: false, error: 'locked', message: 'Too many wrong passwords. Try again in 10 minutes.' };
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!real) return { ok: false, error: 'no_password', message: 'No admin password is set yet. Add ADMIN_PASSWORD in Apps Script → Project Settings → Script Properties.' };
  if (String(password || '') !== real) {
    cache.put('admin_fails', String(fails + 1), 600);
    return { ok: false, error: 'wrong_password', message: 'Wrong password.' };
  }

  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const anon = email => Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(email || '').trim().toLowerCase())).slice(0, 12);
  // Only what the stats need: no student names, emails or phone numbers leave the sheet.
  const bookings = readRows_(ss, 'Bookings').filter(r => r['Booking ID']).map(r => ({
    date: cellDate_(r['Date'], tz), time: cellTime_(r['Time'], tz),
    duration: Number(r['Duration']) || CONFIG.sessionMinutes,
    tutor: String(r['Tutor'] || '').trim(), topic: String(r['Topic'] || '').trim(),
    format: String(r['Format'] || 'In person').trim(), status: String(r['Status'] || '').trim(),
    year: String(r['Grade'] || '').trim(), student: anon(r['Student Email']),
  }));
  let applications = { total: 0, fresh: 0 };
  if (ss.getSheetByName('Tutor Applications')) {
    const apps = readRows_(ss, 'Tutor Applications').filter(r => r['Name']);
    applications = { total: apps.length, fresh: apps.filter(r => String(r['Status']).toLowerCase() === 'new').length };
  }
  return {
    ok: true, now: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'),
    tutors: tutorNames_(), bookings: bookings, applications: applications,
  };
}

// ---------- tutor applications ----------
function handleApplication_(p) {
  const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 500);
  const a = {
    name: clean(p.name), email: clean(p.email), phone: clean(p.phone), asYear: clean(p.asYear),
    math: clean(p.math), topics: clean(p.topics, 1000), availability: clean(p.availability, 1000), why: clean(p.why, 2000),
  };
  if (!a.name || !a.asYear) return { ok: false, error: 'invalid', message: 'Fill in your name and AS year.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return { ok: false, error: 'invalid', message: 'Enter a valid email.' };
  if (a.phone.replace(/\D/g, '').length < 7) return { ok: false, error: 'invalid', message: 'Enter a valid phone number.' };
  if (!a.why) return { ok: false, error: 'invalid', message: 'Tell us why you want to tutor.' };

  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, 'Tutor Applications', APPLICATION_HEADERS, []);
  ss.getSheetByName('Tutor Applications').appendRow([new Date().toISOString(), 'New', a.name, a.email, a.phone,
    a.asYear, a.math, a.topics, a.availability, a.why]);

  try {
    const rows = [['Name', a.name], ['Email', a.email], ['Phone', a.phone], ['AS year', a.asYear],
      ['Highest math', a.math || '—'], ['Can help with', a.topics || '—'], ['Usually free', a.availability || '—'], ['Why', a.why]];
    const table = '<table cellpadding="6" style="border-collapse:collapse;' + FONT_ + '">' +
      rows.map(x => '<tr><td style="color:#5a6880;vertical-align:top">' + esc_(x[0]) + '</td><td><b>' + esc_(x[1]) + '</b></td></tr>').join('') +
      '</table>';
    let owner = '';
    try { owner = Session.getEffectiveUser().getEmail(); } catch (err) { /* fall back to alsoNotify */ }
    const staff = [owner].concat(CONFIG.alsoNotify.split(',')).map(x => x.trim()).filter(Boolean);
    if (staff.length) {
      MailApp.sendEmail({
        to: staff.join(','), replyTo: a.email, name: CONFIG.clubName,
        subject: 'New tutor application: ' + a.name + ' (' + a.asYear + ')',
        htmlBody: '<h2 style="' + FONT_ + 'color:#1b2d4b">New tutor application</h2>' + table +
          '<p style="' + FONT_ + 'color:#5a6880">It is saved in the "Tutor Applications" tab. Reply to this email to contact the applicant.</p>',
      });
    }
    MailApp.sendEmail({
      to: a.email, name: CONFIG.clubName,
      subject: 'We got your tutor application',
      htmlBody: '<h2 style="' + FONT_ + 'color:#1b2d4b">Thanks for applying, ' + esc_(a.name.split(' ')[0]) + '!</h2>' +
        '<p style="' + FONT_ + '">The ' + esc_(CONFIG.clubName) + ' team will review your application and contact you soon.</p>',
    });
  } catch (err) {
    console.error('Application email failed: ' + err); // the application is saved even if email fails
  }
  return { ok: true };
}

// ---------- tutor accepts / declines ----------
// The email links open a page with a button instead of answering on open, so email
// security scanners that pre-open links can't accept or decline by accident.
function responsePage_(id, token, decision) {
  const found = findBooking_(id);
  const valid = found && token && found.rec['Token'] === token;
  const status = valid ? String(found.rec['Status']) : '';
  let body;
  if (!valid) {
    body = '<h1>Link not valid</h1><p>This link is incomplete or the booking no longer exists.</p>';
  } else if (status !== 'Pending') {
    body = '<h1>Already answered</h1><p>This session is marked <b>' + esc_(status) + '</b>.</p>' + detailsTable_(found.rec, true);
  } else {
    const accept = decision !== 'decline';
    body = '<h1>' + (accept ? 'Accept' : 'Decline') + ' this session?</h1>' + detailsTable_(found.rec, true) +
      '<div id="actions">' +
      '<button class="primary" onclick="send(\'' + (accept ? 'accept' : 'decline') + '\')">' + (accept ? 'Accept session' : 'Decline session') + '</button>' +
      '<button class="secondary" onclick="send(\'' + (accept ? 'decline' : 'accept') + '\')">' + (accept ? 'Decline instead' : 'Accept instead') + '</button>' +
      '</div><p id="msg"></p>' +
      '<script>function send(d){document.getElementById("actions").hidden=true;' +
      'document.getElementById("msg").textContent="Saving…";' +
      'google.script.run.withSuccessHandler(function(r){document.getElementById("msg").textContent=r.message;})' +
      '.withFailureHandler(function(){document.getElementById("msg").textContent="Something went wrong. Reload the page and try again.";' +
      'document.getElementById("actions").hidden=false;})' +
      '.respondToBooking(' + JSON.stringify(id) + ',' + JSON.stringify(token) + ',d);}</script>';
  }
  const html = '<style>body{font-family:Arial,sans-serif;color:#142238;max-width:560px;margin:32px auto;padding:0 16px}' +
    'h1{color:#1b2d4b;font-size:26px}button{font-size:17px;padding:12px 20px;border-radius:8px;margin:16px 8px 0 0;cursor:pointer}' +
    '.primary{background:#2c5aa8;color:#fff;border:0}.secondary{background:#fff;color:#2c5aa8;border:2px solid #2c5aa8}' +
    '#msg{font-size:18px;font-weight:bold;color:#1d7a4a}td{padding:6px 10px 6px 0}</style>' +
    '<p style="letter-spacing:.2em;color:#5a6880;font-size:12px">' + esc_(CONFIG.clubName.toUpperCase()) + '</p>' + body;
  return HtmlService.createHtmlOutput(html).setTitle(CONFIG.clubName).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Called from the tutor's confirmation page. */
function respondToBooking(id, token, decision) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let found, status;
  try {
    found = findBooking_(id);
    if (!found || !token || found.rec['Token'] !== token) return { ok: false, message: 'This link is not valid.' };
    if (found.rec['Status'] !== 'Pending') return { ok: false, message: 'This session was already marked ' + found.rec['Status'] + '.' };
    status = decision === 'decline' ? 'Declined' : 'Accepted';
    found.set('Status', status);
    found.set('Responded', new Date().toISOString());
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  found.rec['Status'] = status;
  try {
    sendDecisionEmail_(found.rec);
  } catch (err) {
    console.error('Email failed: ' + err);
    return { ok: true, message: status + '. We could not email the student, so please contact them directly.' };
  }
  return { ok: true, message: status === 'Accepted'
    ? 'Accepted. The student got a confirmation email.'
    : 'Declined. The student was told to pick another time, and the slot is open again.' };
}

function findBooking_(id) {
  if (!id) return null;
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName('Bookings');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const idCol = headers.indexOf('Booking ID');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) !== String(id)) continue;
    const rec = {};
    headers.forEach((h, j) => { rec[h] = values[i][j]; });
    rec['Date'] = cellDate_(rec['Date'], tz);
    rec['Time'] = cellTime_(rec['Time'], tz);
    const row = i + 1;
    return { rec: rec, set: (h, v) => sh.getRange(row, headers.indexOf(h) + 1).setValue(v) };
  }
  return null;
}

// ---------- availability ----------
/** Every free half hour per tutor: {date, time, tutor, email}. Bookings block each half hour they cover. */
function freeSlots_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const step = CONFIG.sessionMinutes;

  const booked = {};
  readRows_(ss, 'Bookings').forEach(r => {
    const status = String(r['Status']).toLowerCase();
    if (status.indexOf('cancel') === 0 || status.indexOf('declin') === 0) return; // slot is free again
    const start = toMinutes_(cellTime_(r['Time'], tz));
    if (start == null) return;
    const len = Number(r['Duration']) || step;
    for (let m = start; m < start + len; m += step) {
      booked[[String(r['Tutor']).trim(), cellDate_(r['Date'], tz), fromMinutes_(m)].join('|')] = true;
    }
  });

  const cutoff = Utilities.formatDate(new Date(Date.now() + CONFIG.minNoticeHours * 3600e3), tz, 'yyyy-MM-dd HH:mm');
  const out = [];
  const seen = {};
  availabilityBlocks_(CONFIG.daysAhead).forEach(b => {
    for (let m = b.start; m + step <= b.end; m += step) {
      const time = fromMinutes_(m);
      const k = [b.tutor, b.date, time].join('|');
      if (b.date + ' ' + time < cutoff || booked[k] || seen[k]) continue;
      seen[k] = true;
      out.push({ date: b.date, time: time, tutor: b.tutor, email: b.email });
    }
  });
  return out.sort((a, c) => (a.date + a.time + a.tutor).localeCompare(c.date + c.time + c.tutor));
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

/** Each tutor's Meeting Link (first one filled in for that tutor), falling back to CONFIG.defaultMeetingLink. */
function meetingLink_(tutor) {
  const row = readRows_(SpreadsheetApp.getActive(), 'Availability')
    .find(r => String(r['Tutor'] || '').trim() === tutor && String(r['Meeting Link'] || '').trim());
  return row ? String(row['Meeting Link']).trim() : CONFIG.defaultMeetingLink;
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
const FONT_ = 'font-family:Arial,sans-serif;';

function detailsTable_(r, forTutor) {
  const rows = [['Topic', r['Topic']], ['When', whenText_(r['Date'], r['Time'], r['Duration'])], ['Session', r['Format'] || 'In person'], ['Tutor', r['Tutor']]];
  if (forTutor) {
    rows.push(['Student', r['Student'] + ' (' + r['Grade'] + ')'], ['Student email', r['Student Email']],
      ['Student phone', r['Student Phone']], ['Notes', r['Notes'] || '—']);
  }
  rows.push(['Booking ID', r['Booking ID']]);
  return '<table cellpadding="6" style="border-collapse:collapse;' + FONT_ + '">' +
    rows.map(x => '<tr><td style="color:#5a6880">' + esc_(x[0]) + '</td><td><b>' + esc_(x[1]) + '</b></td></tr>').join('') +
    '</table>';
}

function button_(href, label, primary) {
  return '<a href="' + esc_(href) + '" style="' + FONT_ + 'display:inline-block;padding:12px 22px;margin:8px 8px 0 0;' +
    'border-radius:8px;font-weight:bold;text-decoration:none;' +
    (primary ? 'background:#2c5aa8;color:#ffffff;' : 'background:#ffffff;color:#b3261e;border:2px solid #b3261e;') +
    '">' + esc_(label) + '</a>';
}

function sendRequestEmails_(bk, st) {
  const rec = {
    'Topic': bk.topic, 'Format': bk.format, 'Duration': bk.duration, 'Date': bk.date, 'Time': bk.time, 'Tutor': bk.tutor, 'Booking ID': bk.id,
    'Student': st.name, 'Grade': st.grade, 'Student Email': st.email, 'Student Phone': st.phone, 'Notes': st.notes,
  };
  const when = whenText_(bk.date, bk.time, bk.duration);
  const online = bk.format === 'Online';
  const tutorNote = online
    ? (meetingLink_(bk.tutor)
      ? 'Online session: when you accept, the student automatically gets your meeting link.'
      : 'Online session: you have no Meeting Link in the Availability sheet yet, so send the student your Zoom/Teams link.')
    : 'In-person session: reply to the student to agree on where to meet.';
  const base = ScriptApp.getService().getUrl() + '?action=respond&id=' + encodeURIComponent(bk.id) + '&token=' + bk.token;

  if (bk.tutorEmail) {
    MailApp.sendEmail({
      to: bk.tutorEmail,
      replyTo: st.email,
      name: CONFIG.clubName,
      subject: 'Session request: ' + bk.topic + ' · ' + when,
      htmlBody: '<h2 style="' + FONT_ + 'color:#1b2d4b">New tutoring request</h2>' +
        '<p style="' + FONT_ + '">' + esc_(st.name) + ' wants a session with you. Can you take it?</p>' +
        '<p style="' + FONT_ + 'background:#e2eafa;padding:10px;border-radius:6px">' + esc_(tutorNote) + '</p>' +
        detailsTable_(rec, true) + '<p>' + button_(base + '&decision=accept', 'Accept', true) +
        button_(base + '&decision=decline', 'Decline', false) + '</p>' +
        '<p style="' + FONT_ + 'color:#5a6880">The student gets an email as soon as you answer. Reply to this email to write to the student.</p>',
    });
  }

  const extra = CONFIG.alsoNotify.split(',').map(x => x.trim()).filter(Boolean);
  if (extra.length) {
    MailApp.sendEmail({
      to: extra.join(','),
      name: CONFIG.clubName,
      subject: 'Session request for ' + bk.tutor + ': ' + bk.topic + ' · ' + when,
      htmlBody: '<p style="' + FONT_ + '">FYI: waiting for ' + esc_(bk.tutor) + ' to accept or decline.</p>' + detailsTable_(rec, true),
    });
  }

  MailApp.sendEmail({
    to: st.email,
    name: CONFIG.clubName,
    subject: 'Request received: ' + bk.topic + ' · ' + when,
    htmlBody: '<h2 style="' + FONT_ + 'color:#1b2d4b">We got your request, ' + esc_(st.name.split(' ')[0]) + '!</h2>' +
      '<p style="' + FONT_ + '">We sent it to ' + esc_(bk.tutor) + '. You\'ll get another email when they accept or decline.</p>' +
      detailsTable_(rec, false),
  });
}

function sendDecisionEmail_(r) {
  const accepted = r['Status'] === 'Accepted';
  const first = esc_(String(r['Student']).split(' ')[0]);
  let howToJoin = '';
  if (accepted && r['Format'] === 'Online') {
    const link = meetingLink_(String(r['Tutor']));
    howToJoin = link
      ? '<p style="' + FONT_ + '"><b>This session is online.</b> Join at the session time:</p>' +
        '<p>' + button_(link, 'Join the meeting', true) + '</p>' +
        '<p style="' + FONT_ + 'color:#5a6880;font-size:13px">Link: ' + esc_(link) + '</p>'
      : '<p style="' + FONT_ + '"><b>This session is online.</b> Your tutor will email you the meeting link before the session.</p>';
  } else if (accepted) {
    howToJoin = '<p style="' + FONT_ + '"><b>This session is in person.</b> Your tutor will confirm where to meet. You can also reply to this email to ask.</p>';
  }
  const msg = {
    to: r['Student Email'],
    name: CONFIG.clubName,
    subject: (accepted ? 'Confirmed: ' : 'Not available: ') + r['Topic'] + ' · ' + whenText_(r['Date'], r['Time'], r['Duration']),
    htmlBody: accepted
      ? '<h2 style="' + FONT_ + 'color:#1d7a4a">You\'re confirmed, ' + first + '!</h2>' +
        '<p style="' + FONT_ + '">' + esc_(r['Tutor']) + ' accepted your session.</p>' + detailsTable_(r, false) + howToJoin +
        '<p style="' + FONT_ + 'color:#5a6880">Need to cancel or reschedule? Reply to this email.</p>'
      : '<h2 style="' + FONT_ + 'color:#1b2d4b">Sorry, ' + first + '</h2>' +
        '<p style="' + FONT_ + '">' + esc_(r['Tutor']) + ' can\'t make this time. Please pick another one.</p>' +
        detailsTable_(r, false) + '<p>' + button_(CONFIG.siteUrl + 'book.html', 'Pick another time', true) + '</p>',
  };
  if (r['Tutor Email']) msg.replyTo = String(r['Tutor Email']);
  MailApp.sendEmail(msg);
}

function whenText_(iso, time, duration) {
  const len = Number(duration) || CONFIG.sessionMinutes;
  const p = iso.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2], 12);
  const day = Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEE, MMM d');
  const fmt = t => t.replace(':', ''); // military time, e.g. 1630
  const label = len < 60 ? len + ' min' : (len / 60) + (len === 60 ? ' hour' : ' hours');
  return day + ', ' + fmt(time) + '–' + fmt(fromMinutes_(toMinutes_(time) + len)) + ' (' + label + ')';
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
