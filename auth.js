import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const tabButtons = document.querySelectorAll(".tab-btn");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");

const loginStatus = document.getElementById("loginStatus");
const registerStatus = document.getElementById("registerStatus");

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle("hidden", !message);
}

function clearStatus() {
  setStatus(loginStatus, "");
  setStatus(registerStatus, "");
}

function showTab(tabName) {
  const isLogin = tabName === "login";

  loginTab.classList.toggle("hidden", !isLogin);
  registerTab.classList.toggle("hidden", isLogin);

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  clearStatus();
}

function getFriendlyAuthError(message) {
  const msg = String(message).toLowerCase();

  if (msg.includes("invalid login credentials")) {
    return "E-Mail oder Passwort ist falsch.";
  }

  if (msg.includes("password should be at least")) {
    return "Das Passwort muss mindestens 6 Zeichen lang sein.";
  }

  if (msg.includes("user already registered")) {
    return "Für diese E-Mail existiert bereits ein Konto.";
  }

  if (msg.includes("unable to validate email address")) {
    return "Bitte gib eine gültige E-Mail-Adresse ein.";
  }

  return message;
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showTab(button.dataset.tab);
  });
});

async function redirectIfLoggedIn() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Fehler beim Prüfen der Session:", error);
    return;
  }

  if (data.session) {
    window.location.href = "dashboard.html";
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  loginBtn.disabled = true;
  loginBtn.textContent = "Einloggen...";

  try {
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(loginStatus, getFriendlyAuthError(error.message), "error");
      return;
    }

    window.location.href = "dashboard.html";
  } catch (err) {
    console.error("Login-Fehler:", err);
    setStatus(loginStatus, "Beim Login ist ein Fehler aufgetreten.", "error");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Einloggen";
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  registerBtn.disabled = true;
  registerBtn.textContent = "Wird erstellt...";

  try {
    const email = document.getElementById("registerEmail").value.trim().toLowerCase();
    const password = document.getElementById("registerPassword").value;
    const name = document.getElementById("registerName").value.trim();

    if (!name) {
      setStatus(registerStatus, "Bitte gib einen Namen ein.", "error");
      return;
    }

    if (password.length < 6) {
      setStatus(registerStatus, "Das Passwort muss mindestens 6 Zeichen lang sein.", "error");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
        },
      },
    });

    if (error) {
      setStatus(registerStatus, getFriendlyAuthError(error.message), "error");
      return;
    }

    registerForm.reset();
    showTab("login");
    document.getElementById("loginEmail").value = email;
    setStatus(loginStatus, "Account erstellt. Du kannst dich jetzt einloggen.", "success");
  } catch (err) {
    console.error("Registrierungsfehler:", err);
    setStatus(registerStatus, "Bei der Registrierung ist ein Fehler aufgetreten.", "error");
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "Registrieren";
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    window.location.href = "dashboard.html";
  }
});

showTab("login");
redirectIfLoggedIn();