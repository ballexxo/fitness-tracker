import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// ------------------------------------------------------------
// Platzhalter-Seite: Persönliche Daten
// - Prüft, ob ein User eingeloggt ist
// - Ermöglicht Logout
// - Leitet bei fehlender Session zurück zum Login
// ------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const logoutBtn = document.getElementById('logoutBtn');

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Session-Fehler:', error);
    window.location.href = './index.html';
    return;
  }

  if (!data.session?.user) {
    window.location.href = './index.html';
  }
}

logoutBtn.addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Logout-Fehler:', error);
    return;
  }

  window.location.href = './index.html';
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session?.user) {
    window.location.href = './index.html';
  }
});

guardPage();
