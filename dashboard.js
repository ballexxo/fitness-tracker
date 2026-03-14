import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const streakValue = document.getElementById("streakValue");
const streakText = document.getElementById("streakText");
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const helloText = document.getElementById("helloText");
const logoutBtn = document.getElementById("logoutBtn");

async function loadDashboard(){

const { data } = await supabase.auth.getSession();

if(!data.session){

window.location.href="index.html";
return;

}

const user = data.session.user;

// Name aus Supabase holen
const displayName = user.user_metadata.display_name || user.email;

// Element für den Namen holen
const userName = document.getElementById("userName");

// Namen einsetzen
userName.textContent = displayName;

const now = new Date();

document.getElementById("currentDate").innerText = now.toLocaleDateString("de-DE");

document.getElementById("currentWeekday").innerText =
now.toLocaleDateString("de-DE",{weekday:"long"});

}

function renderDemoStreak() {
  // Platzhalter für die erste Design-Version.
  // Später rechnen wir hier die echte Streak aus den Trainingsdaten.
  const streakDays = 3;

  streakValue.textContent = `${streakDays} Tage`;

  if (streakDays === 0) {
    streakText.textContent = "Starte heute deinen ersten aktiven Tag.";
  } else if (streakDays < 5) {
    streakText.textContent = "Starker Anfang. Bleib dran.";
  } else {
    streakText.textContent = "Richtig stark. Deine Serie läuft.";
  }
}

logoutBtn.onclick = async ()=>{

await supabase.auth.signOut();
window.location.href="index.html";

}



loadDashboard();
renderDemoStreak();