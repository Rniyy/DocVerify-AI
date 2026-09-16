/**
 * Shared auth helpers, used by every page. The login/register form logic
 * at the bottom only runs on login.html (it checks for its own DOM nodes
 * first), so this one file can be included everywhere.
 */

const AUTH_STORAGE_KEY = "docCompareAuth";

function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
}

function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

/** Redirects to login.html if not signed in; otherwise returns the auth object. */
function requireAuth() {
  const auth = getAuth();
  if (!auth || !auth.token) {
    window.location.href = "login.html";
    return null;
  }
  return auth;
}

function authHeader() {
  const auth = getAuth();
  return auth?.token ? { Authorization: `Bearer ${auth.token}` } : {};
}

function logout() {
  clearAuth();
  window.location.href = "login.html";
}

/** Fills in #topbarAccount with the signed-in email + a logout button, if that element exists on the page. */
function renderAccountBar() {
  const el = document.getElementById("topbarAccount");
  if (!el) return;
  const auth = getAuth();
  if (!auth) return;

  el.innerHTML = `<span class="topbar__account-email">${escapeHtmlLocal(auth.user?.email ?? "")}</span>`;
  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "topbar__logout";
  logoutBtn.textContent = "Log out";
  logoutBtn.addEventListener("click", logout);
  el.appendChild(logoutBtn);
}

function escapeHtmlLocal(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Login/Register form (only runs on login.html)
// ---------------------------------------------------------------
(function initAuthForm() {
  const form = document.getElementById("authForm");
  if (!form) return; // not on login.html

  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const passwordHint = document.getElementById("passwordHint");
  const submitBtn = document.getElementById("submitBtn");
  const errorsEl = document.getElementById("authErrors");

  let mode = "login"; // or "register"

  function setMode(nextMode) {
    mode = nextMode;
    const isLogin = mode === "login";
    tabLogin.classList.toggle("auth__tab--active", isLogin);
    tabRegister.classList.toggle("auth__tab--active", !isLogin);
    submitBtn.textContent = isLogin ? "Sign In" : "Create Account";
    passwordHint.hidden = isLogin;
    errorsEl.innerHTML = "";
  }

  tabLogin.addEventListener("click", () => setMode("login"));
  tabRegister.addEventListener("click", () => setMode("register"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorsEl.innerHTML = "";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "login" ? "Signing in…" : "Creating account…";

    try {
      const endpoint = mode === "login" ? "login" : "register";
      const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
      }

      setAuth(data.token, data.user);
      window.location.href = "index.html";
    } catch (err) {
      const div = document.createElement("div");
      div.className = "error-item";
      div.textContent = err.message || "Something went wrong.";
      errorsEl.appendChild(div);
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "login" ? "Sign In" : "Create Account";
    }
  });

  setMode("login");
})();
