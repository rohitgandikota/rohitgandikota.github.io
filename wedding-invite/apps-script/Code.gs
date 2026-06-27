/**
 * Rohit & Aditi — Wedding RSVP backend + admin helpers (Google Apps Script).
 *
 *   1) WEB APP  : doGet / doPost — the API the invite page talks to.
 *   2) ADMIN API: doGet?action=admin&key=ADMIN_KEY — all data for the dashboard.
 *   3) ADMIN UI : a "💍 Wedding" menu in the Sheet to mint tokens, links,
 *                 one-tap WhatsApp / email messages, and see who's pending.
 *
 * The Sheet IS your database. See SETUP.md.
 */

// ======================= CONFIG =======================
const SITE_URL  = 'https://rohitgandikota.github.io/wedding-invite/';
const SHEET_NAME = 'Guests';

// Secret key the admin dashboard must send. CHANGE THIS to your own random string.
const ADMIN_KEY = 'CHANGE-ME-to-a-long-random-string';

const INVITE_TEXT =
  "Hi {name}! 💍 Rohit & Aditi are getting married and would love for you to join the celebrations. " +
  "Here's your personal invitation & RSVP: {link}";

const COLS = {
  name: 'Name',
  email: 'Email',
  whatsapp: 'WhatsApp',      // international digits only, e.g. 919876543210
  partySize: 'PartySize',    // max people allowed on this invite
  token: 'Token',
  inviteLink: 'InviteLink',
  whatsappSend: 'WhatsAppSend',
  emailSend: 'EmailSend',
  status: 'Status',          // auto: Yes / No
  guests: 'Guests',
  events: 'Events',          // e.g. "Sangeet, Wedding"
  meal: 'Meal',              // Vegetarian / Non-vegetarian
  song: 'Song',
  message: 'Message',
  respondedAt: 'RespondedAt'
};

const EVENT_LABELS = { sangeet: 'Sangeet', wedding: 'Wedding', reception: 'Reception' };
// ======================================================


// ---------- WEB APP ----------
function doGet(e) {
  try {
    if ((e.parameter.action || '') === 'admin') return adminDump(e);

    const token = (e.parameter.token || '').trim();
    if (!token) return json({ ok: false, error: 'no token' });
    const f = findRowByToken(token);
    if (!f) return json({ ok: false, error: 'not found' });

    const r = f.row;
    return json({
      ok: true,
      name: r[COLS.name] || 'friend',
      partyMax: Number(r[COLS.partySize]) || 1,
      attending: normalizeAttending(r[COLS.status]),
      events: parseEvents(r[COLS.events]),
      guests: Number(r[COLS.guests]) || 0,
      meal: mealKey(r[COLS.meal]),
      song: r[COLS.song] || '',
      message: r[COLS.message] || ''
    });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json({ ok: false, error: 'bad json' }); }
  if (body.action === 'addGuest') return adminAddGuest(body);
  return saveRsvp(body);
}

// ---- guest RSVP (no key; guarded by the secret token) ----
function saveRsvp(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const token = (body.token || '').trim();
    if (!token) return json({ ok: false, error: 'no token' });
    const f = findRowByToken(token);
    if (!f) return json({ ok: false, error: 'not found' });

    const attending = body.attending === 'yes' ? 'yes' : 'no';
    const s = f.sheet, idx = f.colIndex, rowNum = f.rowNum;

    setCell(s, rowNum, idx, COLS.status, attending === 'yes' ? 'Yes' : 'No');
    setCell(s, rowNum, idx, COLS.guests, attending === 'yes' ? (Number(body.guests) || 1) : 0);
    setCell(s, rowNum, idx, COLS.events,
      attending === 'yes' ? (Array.isArray(body.events) ? body.events.map(function(k){return EVENT_LABELS[k]||k;}).join(', ') : '') : '');
    setCell(s, rowNum, idx, COLS.meal,
      attending === 'yes' ? (body.meal === 'nonveg' ? 'Non-vegetarian' : (body.meal === 'veg' ? 'Vegetarian' : '')) : '');
    setCell(s, rowNum, idx, COLS.song, attending === 'yes' ? (body.song || '') : '');
    setCell(s, rowNum, idx, COLS.message, body.message || '');
    setCell(s, rowNum, idx, COLS.respondedAt, new Date());

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---- add one guest from the admin portal (key-guarded) ----
function adminAddGuest(body) {
  if ((body.key || '') !== ADMIN_KEY) return json({ ok: false, error: 'unauthorized' });
  const name = String(body.name || '').trim();
  if (!name) return json({ ok: false, error: 'Name is required' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = readSheet();
    const sheet = r.sheet, ci = r.headerIdx;
    if (ci[COLS.name] == null || ci[COLS.token] == null || ci[COLS.inviteLink] == null)
      throw new Error('Sheet is missing Name / Token / InviteLink columns');

    const email = String(body.email || '').trim();
    const phone = String(body.whatsapp || '').replace(/[^0-9]/g, '');
    const partySize = Math.max(1, Number(body.partySize) || 1);

    const token = Utilities.getUuid().replace(/-/g, '');
    const link = inviteLinkFor(token);
    const msg = inviteMessageFor(name, link);
    const rowNum = sheet.getLastRow() + 1;

    setCell(sheet, rowNum, ci, COLS.name, name);
    if (ci[COLS.email] != null) setCell(sheet, rowNum, ci, COLS.email, email);
    if (ci[COLS.whatsapp] != null && phone) {
      const pc = sheet.getRange(rowNum, ci[COLS.whatsapp] + 1);
      pc.setNumberFormat('@'); pc.setValue(phone);   // keep digits as text, no sci-notation
    }
    setCell(sheet, rowNum, ci, COLS.partySize, partySize);
    setCell(sheet, rowNum, ci, COLS.token, token);
    setCell(sheet, rowNum, ci, COLS.inviteLink, link);
    if (ci[COLS.whatsappSend] != null && phone) setCell(sheet, rowNum, ci, COLS.whatsappSend, waUrlFor(phone, msg));
    if (ci[COLS.emailSend] != null && email) setCell(sheet, rowNum, ci, COLS.emailSend, mailtoFor(email, msg));

    return json({
      ok: true, name: name, link: link, token: token, message: msg,
      whatsappUrl: phone ? waUrlFor(phone, msg) : '',
      emailUrl: email ? mailtoFor(email, msg) : ''
    });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---- shared invite-link / message builders ----
function inviteLinkFor(token) { return SITE_URL + '?t=' + token; }
function inviteMessageFor(name, link) { return INVITE_TEXT.replace('{name}', name).replace('{link}', link); }
function waUrlFor(phone, msg) {
  const p = String(phone).replace(/[^0-9]/g, '');
  return p ? ('https://wa.me/' + p + '?text=' + encodeURIComponent(msg)) : '';
}
function mailtoFor(email, msg) {
  return email ? ('mailto:' + email + '?subject=' + encodeURIComponent("You're invited to Rohit & Aditi's wedding 💍") +
    '&body=' + encodeURIComponent(msg)) : '';
}

// ---------- ADMIN API (read-only data dump, key-guarded) ----------
function adminDump(e) {
  if ((e.parameter.key || '') !== ADMIN_KEY) return json({ ok: false, error: 'unauthorized' });
  const { headerIdx, values } = readSheet();
  const ci = headerIdx;
  const want = ['name','email','whatsapp','partySize','status','guests','events','meal','song','message','respondedAt','inviteLink','whatsappSend','emailSend'];
  const guests = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[ci[COLS.name]]) continue;
    const o = {};
    want.forEach(function(k){
      const col = ci[COLS[k]];
      let v = (col == null) ? '' : row[col];
      if (k === 'respondedAt' && v instanceof Date) v = v.toISOString();
      o[k] = v === undefined || v === null ? '' : v;
    });
    guests.push(o);
  }
  return json({ ok: true, guests: guests });
}


// ================= ADMIN MENU =================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💍 Wedding')
    .addItem('1 · Generate tokens & links', 'generateTokensAndLinks')
    .addItem('2 · Show who hasn\'t responded', 'showPending')
    .addToUi();
}

function generateTokensAndLinks() {
  const { sheet, headerIdx, values } = readSheet();
  const need = function(k){ return requireCol(headerIdx, k); };
  const ci = {
    name: need('name'), token: need('token'), link: need('inviteLink'),
    wa: need('whatsappSend'), em: need('emailSend'),
    phone: headerIdx[COLS.whatsapp], email: headerIdx[COLS.email]
  };

  let made = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[ci.name]) continue;
    if (row[ci.token]) continue;

    const token = Utilities.getUuid().replace(/-/g, '');
    const link = SITE_URL + '?t=' + token;
    const rowNum = i + 1;

    sheet.getRange(rowNum, ci.token + 1).setValue(token);
    sheet.getRange(rowNum, ci.link + 1).setValue(link);

    const msg = INVITE_TEXT.replace('{name}', row[ci.name]).replace('{link}', link);
    if (ci.phone != null && row[ci.phone]) {
      const phone = String(row[ci.phone]).replace(/[^0-9]/g, '');
      sheet.getRange(rowNum, ci.wa + 1).setValue('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg));
    }
    if (ci.email != null && row[ci.email]) {
      sheet.getRange(rowNum, ci.em + 1).setValue(
        'mailto:' + row[ci.email] + '?subject=' + encodeURIComponent("You're invited to Rohit & Aditi's wedding 💍") +
        '&body=' + encodeURIComponent(msg));
    }
    made++;
  }
  SpreadsheetApp.getUi().alert(made + ' new invite link(s) generated.\n\nClick a WhatsAppSend / EmailSend cell, then the link in the tooltip to send. Re-run anytime after adding guests.');
}

function showPending() {
  const { headerIdx, values } = readSheet();
  const ci = { name: requireCol(headerIdx, 'name'), status: requireCol(headerIdx, 'status') };
  const pending = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[ci.name]) continue;
    if (!String(row[ci.status] || '').trim()) pending.push(row[ci.name]);
  }
  const ui = SpreadsheetApp.getUi();
  if (!pending.length) { ui.alert('🎉 Everyone has responded!'); return; }
  ui.alert('Awaiting RSVP from ' + pending.length + ' guest(s):\n\n• ' + pending.join('\n• '));
}


// ================= helpers =================
function readSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + SHEET_NAME + '".');
  const values = sheet.getDataRange().getValues();
  const headerIdx = {};
  (values[0] || []).forEach(function(h, i){ headerIdx[String(h).trim()] = i; });
  return { ss: ss, sheet: sheet, values: values, headerIdx: headerIdx };
}

function requireCol(headerIdx, key) {
  const header = COLS[key];
  if (!(header in headerIdx)) throw new Error('Missing column header: "' + header + '"');
  return headerIdx[header];
}

function findRowByToken(token) {
  const r = readSheet();
  const tIdx = r.headerIdx[COLS.token];
  if (tIdx == null) throw new Error('Missing "' + COLS.token + '" column');
  for (let i = 1; i < r.values.length; i++) {
    if (String(r.values[i][tIdx]).trim() === token) {
      const rowObj = {};
      for (const h in r.headerIdx) rowObj[h] = r.values[i][r.headerIdx[h]];
      return { sheet: r.sheet, rowNum: i + 1, row: rowObj, colIndex: r.headerIdx };
    }
  }
  return null;
}

function setCell(sheet, rowNum, colIndex, header, value) {
  const idx = colIndex[header];
  if (idx == null) return;
  sheet.getRange(rowNum, idx + 1).setValue(value);
}

function normalizeAttending(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'yes') return 'yes';
  if (s === 'no') return 'no';
  return '';
}

function parseEvents(str) {
  if (!str) return [];
  const map = { sangeet: 'sangeet', wedding: 'wedding', reception: 'reception' };
  return String(str).split(',').map(function(x){ return map[x.trim().toLowerCase()]; }).filter(Boolean);
}

function mealKey(m) {
  const s = String(m || '').toLowerCase();
  if (s.indexOf('non') === 0 || s === 'nonveg') return 'nonveg';
  if (s.indexOf('veg') === 0) return 'veg';
  return '';
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
