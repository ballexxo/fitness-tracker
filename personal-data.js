import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const profileOverview = document.getElementById('profileOverview');

function renderMessage(html) {
  profileOverview.innerHTML = html;
}

function calculateAge(birthdate) {
  if (!birthdate) return '-';

  const today = new Date();
  const birthDate = new Date(birthdate);

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return `${age} Jahre`;
}

function formatGoal(goal) {
  if (goal === 'cut') return 'Abnehmen';
  if (goal === 'maintain') return 'Gewicht halten';
  if (goal === 'bulk') return 'Zunehmen';
  return '-';
}

function formatDietType(dietType) {
  if (dietType === 'balanced') return 'Ausgewogen';
  if (dietType === 'low_carb') return 'Low Carb';
  if (dietType === 'low_fat') return 'Low Fat';
  return '-';
}

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) return '-';
  return new Date(updatedAt).toLocaleDateString('de-DE');
}

async function loadProfile() {
  try {
    renderMessage('Lade Daten...');

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session-Fehler:', sessionError);
      renderMessage(`
        <div class="empty-state-box">
          <strong>Session konnte nicht geladen werden.</strong><br><br>
          Bitte logge dich erneut ein.
        </div>
      `);
      return;
    }

    if (!sessionData?.session?.user) {
      window.location.href = './index.html';
      return;
    }

    const user = sessionData.session.user;

    const { data: profile, error: profileError } = await supabase
      .from('user_profile_data')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Fehler beim Laden der Profildaten:', profileError);
      renderMessage(`
        <div class="empty-state-box">
          <strong>Die Profildaten konnten nicht geladen werden.</strong><br><br>
          Bitte prüfe, ob die Tabelle <b>user_profile_data</b> existiert und die Daten gespeichert wurden.
        </div>
      `);
      return;
    }

    if (!profile) {
      renderMessage(`
        <div class="empty-state-box">
          <strong>Noch keine persönlichen Daten vorhanden.</strong><br><br>
          Trage zuerst deine Daten ein und berechne danach deinen Kalorienbedarf.
        </div>
      `);
      return;
    }

    let warningHtml = '';

    const { data: reports, error: reportsError } = await supabase
      .from('weekly_weight_reports')
      .select('report_date')
      .eq('user_id', user.id)
      .order('report_date', { ascending: false })
      .limit(1);

    if (reportsError) {
      console.error('Fehler beim Laden der Wochenberichte:', reportsError);
    } else if (!reports || reports.length === 0) {
      warningHtml = `
        <div class="profile-warning-box">
          ⚠ Es liegt noch kein Wochenbericht vor
        </div>
      `;
    } else {
      const lastDate = new Date(reports[0].report_date);
      const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays > 7) {
        warningHtml = `
          <div class="profile-warning-box">
            ⚠ Bitte aktualisiere deinen Wochenbericht
          </div>
        `;
      }
    }

    renderMessage(`
      <div class="profile-section">

        <div class="profile-section-title centered-title">
          <div class="line"></div>
          <span>Daten</span>
          <div class="line"></div>
        </div>

        <div class="profile-text-block">
          <div class="profile-name">${profile.display_name || '-'}</div>

          <div class="profile-details">
            <span class="profile-label-normal">Alter:</span>
            <span class="profile-value-inline">${calculateAge(profile.birthdate)}</span><br>

            <span class="profile-label-normal">Größe:</span>
            <span class="profile-value-inline">${profile.height_cm ?? '-'} cm</span><br>

            <span class="profile-label-normal">Gewicht:</span>
<span class="profile-value-inline">${profile.current_weight_kg ?? '-'} kg</span><br>

<span class="profile-label-normal">Letzter Stand:</span>
<span class="profile-value-inline">${formatUpdatedAt(profile.updated_at)}</span>
          </div>
        </div>

      </div>

      <div class="profile-section">

        <div class="profile-section-title centered-title">
          <div class="line"></div>
          <span>Ziel</span>
          <div class="line"></div>
        </div>

        <div class="profile-text-block">
          <span class="profile-label-normal">Ziel:</span>
          <span class="profile-value-inline">${formatGoal(profile.goal)}</span><br>

          <span class="profile-label-normal">Ernährungsform:</span>
          <span class="profile-value-inline">${formatDietType(profile.diet_type)}</span><br>

          <span class="profile-label-normal">Kalorienziel:</span>
          <span class="profile-value-inline">${profile.calorie_target ?? 'xxx'} kcal</span>

          <div class="profile-macros">
            <span class="profile-label-inline">Eiweiß:</span>
            <span class="profile-value-inline">${profile.protein_g ?? '-'} g</span>
            <span class="macro-separator">|</span>

            <span class="profile-label-inline">Kohlenhydrate:</span>
            <span class="profile-value-inline">${profile.carbs_g ?? '-'} g</span>
            <span class="macro-separator">|</span>

            <span class="profile-label-inline">Fett:</span>
            <span class="profile-value-inline">${profile.fat_g ?? '-'} g</span>
          </div>
        </div>

      </div>

      ${warningHtml}
    `);
  } catch (error) {
    console.error('Unerwarteter Fehler in personal-data.js:', error);
    renderMessage(`
      <div class="empty-state-box">
        <strong>Beim Laden ist ein Fehler aufgetreten.</strong><br><br>
        Öffne bitte einmal die Browser-Konsole.
      </div>
    `);
  }
}

loadProfile();