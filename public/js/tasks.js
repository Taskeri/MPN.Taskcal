const role = sessionStorage.getItem("role");
const username = sessionStorage.getItem("username") || "";
const department = sessionStorage.getItem("department") || "";
const hello = document.getElementById("hello");
const list = document.getElementById("list");
const guard = document.getElementById("guard");
const logout = document.getElementById("logout");

hello.textContent = username ? `שלום, ${username}` : "";

logout.addEventListener("click", () => {
  sessionStorage.clear();
  location.href = "index.html";
});

if (role !== "worker") {
  guard.textContent = "אין הרשאה. רק עובדים יכולים לצפות בלוח המשימות.";
} else {
  load();
}

async function load() {
  guard.textContent = "טוען משימות...";
  try {
    const res = await fetch(`/api/work-orders?username=${encodeURIComponent(username)}&department=${encodeURIComponent(department)}`, {
      headers: { "x-role": "worker" }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "ERR");
    guard.textContent = data.data.length ? "" : "אין משימות פעילות עבורך.";
    render(data.data);
  } catch (err) {
    console.error(err);
    guard.textContent = "שגיאה בטעינת משימות.";
  }
}

function render(rows) {
  list.innerHTML = "";
  const tpl = document.getElementById("taskTpl");

  rows.forEach(r => {
    const el = tpl.content.cloneNode(true);
    el.querySelector(".proj").textContent = r.project || "(ללא פרויקט)";
    el.querySelector(".status").textContent = r.status || "חדש";
    el.querySelector(".desc").textContent = r.description || "";
    el.querySelector(".stage").textContent = r.stage || "";
    el.querySelector(".qtyReq").textContent = r.qty_required ?? 0;
    el.querySelector(".qtyDone").textContent = r.qty_done ?? 0;
    el.querySelector(".start").textContent = r.start || "";

    const openA = el.querySelector("a.ghost");
    openA.href = `task.html?row=${encodeURIComponent(r.row)}`;

    const btnStart = el.querySelector("button.start");
    btnStart.addEventListener("click", async () => {
      btnStart.disabled = true;
      await fetch("/api/tasks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role":"worker" },
        body: JSON.stringify({ row: r.row, username })
      });
      await load();
    });

    list.appendChild(el);
  });
}
