import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const profileOverview = document.getElementById('profileOverview');

async function loadProfile() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    window.location.href = './index.html';
    return;
  }

  const user = sessionData.session.user;

  // Profil laden
  const { data: profile, error: profileError } = await supabase
    .from('user_profile_data')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Fehler beim Laden der Profildaten:', profileError);
    profileOverview.innerHTML = `
      <div class="empty-state-box">
        <strong>Deine Daten konnten nicht geladen werden.</strong><br><br>
        Bitte trage zuerst deine persönlichen Daten ein.
      </div>
    `;
    return;
  }

  // Falls noch kein Datensatz vorhanden ist
  if (!profile) {
    profileOverview.innerHTML = `
      <div class="empty-state-box">
        <strong>Noch keine persönlichen Daten vorhanden.</strong><br><br>
        Trage zuerst deine Daten ein und berechne danach deinen Kalorienbedarf.
      </div>
    `;
    return;
  }

  // Wochenbericht prüfen
  const { data: reports, error: reportsError } = await supabase
    .from('weekly_weight_reports')
    .select('report_date')
    .eq('user_id', user.id)
    .order('report_date', { ascending: false })
    .limit(1);

  let warningHtml = '';

  if (!reportsError && reports && reports.length > 0) {
    const lastDate = new Date(reports[0].report_date);
    const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > 7) {
      warningHtml = `
        <div class="profile-warning-box">
          ⚠ Bitte aktualisiere deinen Wochenbericht
        </div>
      `;
    }
  } else if (!reports || reports.length === 0) {
    warningHtml = `
      <div class="profile-warning-box">
        ⚠ Es liegt noch kein Wochenbericht vor
      </div>
    `;
  }

  const today = new Date();
  let ageText = '-';

  if (profile.birthdate) {
    const birthDate = new Date(profile.birthdate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    ageText = `${age} Jahre`;
  }

  profileOverview.innerHTML = `
    <div class="profile-grid">
      <div class="profile-item">
        <span class="profile-label">Name</span>
        <span class="profile-value">${profile.display_name || '-'}</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Gewicht</span>
        <span class="profile-value">${profile.current_weight_kg ?? '-'} kg</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Größe</span>
        <span class="profile-value">${profile.height_cm ?? '-'} cm</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Alter</span>
        <span class="profile-value">${ageText}</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Kalorienziel</span>
        <span class="profile-value">${profile.calorie_target ?? '-'} kcal</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Ernährungsform</span>
        <span class="profile-value">${profile.diet_type || '-'}</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Ziel</span>
        <span class="profile-value">${profile.goal || '-'}</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Eiweiß</span>
        <span class="profile-value">${profile.protein_g ?? '-'} g</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Kohlenhydrate</span>
        <span class="profile-value">${profile.carbs_g ?? '-'} g</span>
      </div>

      <div class="profile-item">
        <span class="profile-label">Fett</span>
        <span class="profile-value">${profile.fat_g ?? '-'} g</span>
      </div>
    </div>

    ${warningHtml}
  `;
}

loadProfile();