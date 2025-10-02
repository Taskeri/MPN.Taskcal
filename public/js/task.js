const params = new URLSearchParams(location.search);
const row = Number(params.get("row") || 0);
const role = sessionStorage.getItem("role");
const username = sessionStorage.getItem("username") || "";
const department = sessionStorage.getItem("department") || "";
const title = document.getElementById("title");
const meta = document.getElementById("meta");
const msg = document.getElementById("msg");

if (role !== "worker") {
  msg.textContent = "אין הרשאה.";
}

(async function init() {
  try {
    const res = await fetch(`/api/work-orders?username=${encodeURIComponent(username)}&department=${encodeURIComponent(department)}`, {
      headers: { "x-role": "worker" }
    });
    const data = await res.json();
    const task = (data.data || []).find(x => Number(x.row) === row);
    if (!task) {
      msg.textContent = "משימה לא נמצאה או שאין הרשאה.";
      return;
    }
    title.textContent = `משימה: ${task.description || task.project || ""}`;
    meta.innerHTML = `
      <div><b>פרויקט:</b> ${task.project || ""}</div>
      <div><b>שלב/מחלקה:</b> ${task.stage || ""}</div>
      <div><b>סטטוס:</b> ${task.status || "חדש"}</div>
      <div><b>כמות דרושה:</b> ${task.qty_required ?? 0}</div>
      <div><b>כמות בוצע:</b> ${task.qty_done ?? 0}</div>
      <div><b>תחילה:</b> ${task.start || ""}</div>
    `;

    document.getElementById("btnStart").addEventListener("click", async () => {
      msg.textContent = "מעדכן...";
      await fetch("/api/tasks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role":"worker" },
        body: JSON.stringify({ row, username })
      });
      msg.textContent = "המשימה החלה.";
      setTimeout(()=>location.reload(), 500);
    });

    document.getElementById("btnSaveQty").addEventListener("click", async () => {
      const qty = Number(document.getElementById("qty").value || 0);
      msg.textContent = "מעדכן כמות...";
      const res = await fetch("/api/tasks/updateQuantity", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role":"worker" },
        body: JSON.stringify({ row, qty_done: qty })
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "ERR");
      msg.textContent = "כמות עודכנה.";
    });

    document.getElementById("btnDone").addEventListener("click", async () => {
      const qty = Number(document.getElementById("qty").value || 0);
      const notes = document.getElementById("notes").value;
      msg.textContent = "מסיים משימה...";
      const res = await fetch("/api/tasks/done", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role":"worker" },
        body: JSON.stringify({ row, qty_done: qty, notes })
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "ERR");
      msg.textContent = "המשימה סומנה כ'בוצע לאישור'.";
      setTimeout(()=> location.href="tasks.html", 700);
    });

  } catch (err) {
    console.error(err);
    msg.textContent = "שגיאה בטעינת משימה.";
  }
})();
