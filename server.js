\
/**
 * server.js — Express + Google Sheets (Heb/Eng headers), worker auth, tasks APIs.
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const SHEET_ID = process.env.SHEET_ID;
const USERS_SHEET = process.env.USERS_SHEET || "Sheet1";
const ORDERS_SHEET = process.env.ORDERS_SHEET || "Sheet2";

// ---------- Google Sheets ----------
async function sheetsClient() {
  const credentials = process.env.GOOGLE_CREDENTIALS;
  if (!credentials) throw new Error("Missing GOOGLE_CREDENTIALS in .env");
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function idxBySynonyms(header, synonyms) {
  const norm = (s) => (s || "").toString().trim().toLowerCase();
  const H = header.map(norm);
  for (const syn of synonyms) {
    const i = H.findIndex((h) => h.includes(norm(syn)));
    if (i !== -1) return i;
  }
  return -1;
}

function tsNow() {
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  const d = new Date();
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const HH = pad(d.getHours());
  const MM = pad(d.getMinutes());
  const SS = pad(d.getSeconds());
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}:${SS}`;
}

// ---------- USERS ----------
async function loadUsers() {
  const sheets = await sheetsClient();
  const range = `${USERS_SHEET}!A1:Z`;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  const rows = data.values || [];
  if (!rows.length) return [];
  const header = rows[0];
  const body = rows.slice(1);

  const iUser = idxBySynonyms(header, ["userne", "username", "user", "שם עובד", "שם משתמש"]);
  const iPass = idxBySynonyms(header, ["password", "pass", "סיסמה", "סיסמא"]);
  const iRole = idxBySynonyms(header, ["role", "דרגה", "תפקיד"]);
  const iActive = idxBySynonyms(header, ["active", "פעיל", "סטטוס"]);
  const iDept = idxBySynonyms(header, ["department", "dept", "מחלקה"]);

  return body
    .map((r, i) => ({
      row: i + 2,
      username: (r[iUser] || "").toString().trim(),
      password: (r[iPass] || "").toString().trim(),
      role: (r[iRole] || "").toString().trim().toLowerCase(),
      active: iActive === -1 ? "TRUE" : (r[iActive] || "TRUE").toString().trim().toUpperCase(),
      department: iDept === -1 ? "" : (r[iDept] || "").toString().trim(),
    }))
    .filter((u) => u.username);
}

// ---------- LOGIN ----------
app.post("/api/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: "MISSING_CREDENTIALS" });
    const users = await loadUsers();
    const user = users.find((u) => u.username === username && u.password === password && u.active !== "FALSE");
    if (!user) return res.status(401).json({ ok: false, error: "BAD_CREDENTIALS" });
    return res.json({ ok: true, user: { username, role: user.role, department: user.department } });
  } catch (err) { next(err); }
});

// ---------- Worker-only middleware ----------
function requireWorker(req, res, next) {
  const role = (req.headers["x-role"] || "").toString().toLowerCase();
  if (role !== "worker") return res.status(403).json({ ok: false, error: "FORBIDDEN_ROLE" });
  next();
}

// ---------- WORK ORDERS (Sheet2) ----------
async function loadOrders() {
  const sheets = await sheetsClient();
  const range = `${ORDERS_SHEET}!A1:ZZ`;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  const rows = data.values || [];
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0];
  const body = rows.slice(1);

  const by = (arr) => idxBySynonyms(header, arr);
  const iProj = by(["פרויקט", "פרויקט/הזמנה", "project", "order"]);
  const iStage = by(["שלב/מחלקה", "שלב", "מחלקה", "stage", "department"]);
  const iTaskNo = by(["מספר משימה", "task no", "task"]);
  const iDesc = by(["תיאור", "תיאור משימה", "פעולה/מוצר", "description"]);
  const iQtyReq = by(["כמות דרושה", "כמות דרושות", "qty required", "כמות דרושה לביצוע"]);
  const iQtyDone = by(["כמות בוצע", "כמות ביצוע", "qty done"]);
  const iStatus = by(["סטטוס ביצוע", "סטטוס", "status"]);
  const iWorker = by(["עובד אחראי", "worker", "אחראי"]);
  const iManager = by(["מנהל אחראי", "manager"]);
  const iStart = by(["תחילה", "התחלה", "start"]);
  const iEnd = by(["סיום", "end"]);
  const iNotes = by(["הערות", "notes"]);

  const mapped = body.map((r, i) => ({
    row: i + 2,
    project: (r[iProj] || "").toString(),
    stage: (r[iStage] || "").toString(),
    task_no: (r[iTaskNo] || "").toString(),
    description: (r[iDesc] || "").toString(),
    qty_required: parseFloat((r[iQtyReq] || "").toString().replace(/,/g, "")) || 0,
    qty_done: parseFloat((r[iQtyDone] || "").toString().replace(/,/g, "")) || 0,
    status: (r[iStatus] || "").toString(),
    worker: (r[iWorker] || "").toString(),
    manager: (r[iManager] || "").toString(),
    start: (r[iStart] || "").toString(),
    end: (r[iEnd] || "").toString(),
    notes: (r[iNotes] || "").toString(),
    _rowRaw: r,
    _indices: { iStatus, iWorker, iStart, iEnd, iQtyDone, iNotes }
  }));

  return { header, rows: mapped };
}

// משימות לעובד (או לפי מחלקה אם אין שיבוץ עובד)
app.get("/api/work-orders", requireWorker, async (req, res, next) => {
  try {
    const username = (req.query.username || "").toString().trim();
    const department = (req.query.department || "").toString().trim();
    const { rows } = await loadOrders();

    const result = rows
      .filter((r) => {
        const workerMatch = r.worker && username && r.worker.toString().trim() == username;
        const deptFallback = (!r.worker || r.worker.toString().trim() === "") && department && r.stage && r.stage.toString().includes(department);
        return workerMatch || deptFallback;
      })
      .filter((r) => !/סגור|סגירה|done|closed/i.test((r.status || "").toString().trim()));

    res.json({ ok: true, data: result });
  } catch (err) { next(err); }
});

// עדכון תא בודד
async function updateCell(row, colIndex, value) {
  const sheets = await sheetsClient();
  const colLetter = (n) => {
    let s = "";
    n += 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const range = `${ORDERS_SHEET}!${colLetter(colIndex)}${row}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

// START task
app.post("/api/tasks/start", requireWorker, async (req, res, next) => {
  try {
    const { row, username } = req.body || {};
    if (!row || !username) return res.status(400).json({ ok: false, error: "MISSING_PARAMS" });
    const { rows } = await loadOrders();
    const r = rows.find((x) => x.row == row);
    if (!r) return res.status(404).json({ ok: false, error: "ROW_NOT_FOUND" });

    const { iWorker, iStatus, iStart } = r._indices;
    if (iWorker !== -1 && (!r.worker || r.worker.trim() === "")) await updateCell(row, iWorker, username);
    if (iStatus !== -1) await updateCell(row, iStatus, r.status && r.status.trim() ? r.status : "בתהליך");
    if (iStart !== -1 && (!r.start || r.start.trim() === "")) await updateCell(row, iStart, tsNow());

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// עדכון כמות
app.post("/api/tasks/updateQuantity", requireWorker, async (req, res, next) => {
  try {
    const { row, qty_done } = req.body || {};
    if (!row || qty_done === undefined) return res.status(400).json({ ok: false, error: "MISSING_PARAMS" });
    const { rows } = await loadOrders();
    const r = rows.find((x) => x.row == row);
    if (!r) return res.status(404).json({ ok: false, error: "ROW_NOT_FOUND" });

    const { iQtyDone } = r._indices;
    if (iQtyDone === -1) return res.status(400).json({ ok: false, error: "QTY_DONE_COLUMN_NOT_FOUND" });
    await updateCell(row, iQtyDone, qty_done);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DONE
app.post("/api/tasks/done", requireWorker, async (req, res, next) => {
  try {
    const { row, qty_done, notes } = req.body || {};
    if (!row) return res.status(400).json({ ok: false, error: "MISSING_PARAMS" });
    const { rows } = await loadOrders();
    const r = rows.find((x) => x.row == row);
    if (!r) return res.status(404).json({ ok: false, error: "ROW_NOT_FOUND" });

    const { iEnd, iStatus, iQtyDone, iNotes } = r._indices;
    if (iEnd !== -1) await updateCell(row, iEnd, tsNow());
    if (iStatus !== -1) await updateCell(row, iStatus, "בוצע לאישור");
    if (iQtyDone !== -1 && qty_done !== undefined) await updateCell(row, iQtyDone, qty_done);
    if (iNotes !== -1 && notes !== undefined) await updateCell(row, iNotes, notes);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// בית ו־Health
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/health", (req, res) => res.json({ ok: true }));

// Error handler
app.use((err, req, res, next) => {
  console.error("UNCAUGHT:", err);
  res.status(500).json({ ok: false, error: "SERVER_ERROR" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MPN server listening on " + PORT));
