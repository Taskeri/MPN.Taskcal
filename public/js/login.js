const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "מזהה...";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "LOGIN_FAILED");

    const { role, department } = data.user || {};
    sessionStorage.setItem("username", username);
    sessionStorage.setItem("role", role);
    sessionStorage.setItem("department", department || "");

    if (role === "worker") {
      location.href = "tasks.html";
    } else {
      msg.textContent = "בשלב זה רק עובדים יכולים להיכנס ללוח המשימות.";
    }
  } catch (err) {
    console.error(err);
    msg.textContent = "שגיאה בהתחברות";
  }
});
