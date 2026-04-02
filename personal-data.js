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

function hasGoalData(profile) {
  return (
    profile &&
    profile.goal &&
    profile.diet_type &&
    profile.calorie_target !== null &&
    profile.calorie_target !== undefined &&
    profile.protein_g !== null &&
    profile.protein_g !== undefined &&
    profile.carbs_g !== null &&
    profile.carbs_g !== undefined &&
    profile.fat_g !== null &&
    profile.fat_g !== undefined
  );
}

function createSectionTitle(title) {
  return `
    <div class="dashboard-summary-line personal-card-line">
      <span>${title}</span>
    </div>
  `;
}

function createInfoRow(label, value) {
  return `
    <div class="personal-info-row">
      <span class="personal-info-label">${label}</span>
      <span class="personal-info-value">${value}</span>
    </div>
  `;
}

function createReminderCard(text, href, buttonLabel) {
  return `
    <div class="dashboard-summary-reminder dashboard-summary-reminder-warning personal-reminder-card">
      <div class="dashboard-summary-reminder-text">
        <span class="dashboard-summary-reminder-icon">⚠</span>
        <span>${text}</span>
      </div>
      <a class="dashboard-summary-reminder-btn" href="${href}">
        ${buttonLabel}
      </a>
    </div>
  `;
}

async function loadProfile() {
  try {
    renderMessage('<div class="personal-loading">Lade Daten...</div>');

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session-Fehler:', sessionError);
      renderMessage(`
        <div class="personal-empty-state">
          <div class="personal-empty-title">Session konnte nicht geladen werden.</div>
          <div class="personal-empty-text">Bitte logge dich erneut ein.</div>
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
        <div class="personal-empty-state">
          <div class="personal-empty-title">Die Profildaten konnten nicht geladen werden.</div>
          <div class="personal-empty-text">
            Bitte prüfe, ob die Tabelle <strong>user_profile_data</strong> existiert und Daten gespeichert wurden.
          </div>
        </div>
      `);
      return;
    }

    if (!profile) {
      renderMessage(`
        <div class="personal-empty-state">
          <div class="personal-empty-title">Noch keine persönlichen Daten vorhanden.</div>
          <div class="personal-empty-text">Trage zuerst deine Daten ein.</div>
          <div class="personal-empty-action">
            <a class="dashboard-summary-primary-btn" href="personal-data-form.html">Daten eintragen</a>
          </div>
        </div>
      `);
      return;
    }

    let warningHtml = '';

    const { data: reports, error: reportsError } = await supabase
      .from('weekly_weight_reports')
      .select('week_start_date, report_date')
      .eq('user_id', user.id)
      .order('week_start_date', { ascending: false })
      .limit(1);

    if (reportsError) {
      console.error('Fehler beim Laden der Wochenberichte:', reportsError);
    } else if (reports && reports.length > 0) {
      const lastDate = new Date(reports[0].report_date || reports[0].week_start_date);
      const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays > 7) {
        warningHtml = createReminderCard(
          'Bitte aktualisiere deinen Wochenbericht.',
          'weekly-report.html',
          'Aktualisieren'
        );
      }
    }

    const goalSectionHtml = hasGoalData(profile)
      ? `
        <div class="personal-info-grid personal-info-grid-goal">
          ${createInfoRow('Ziel', formatGoal(profile.goal))}
          ${createInfoRow('Ernährungsform', formatDietType(profile.diet_type))}
          ${createInfoRow('Kalorienziel', `${profile.calorie_target} kcal`)}
        </div>

        <div class="personal-macro-row">
          <span class="personal-macro-label">Eiweiß</span>
          <span class="personal-macro-value">${profile.protein_g} g</span>

          <span class="personal-macro-divider">|</span>

          <span class="personal-macro-label">Kohlenhydrate</span>
          <span class="personal-macro-value">${profile.carbs_g} g</span>

          <span class="personal-macro-divider">|</span>

          <span class="personal-macro-label">Fett</span>
          <span class="personal-macro-value">${profile.fat_g} g</span>
        </div>
      `
      : `
        <div class="personal-empty-inline">
          <div class="personal-empty-inline-text">Noch kein Ziel berechnet.</div>
          <div class="personal-empty-inline-action">
            <a class="dashboard-summary-primary-btn" href="calorie-calculator.html">Kalorienrechner öffnen</a>
          </div>
        </div>
      `;

    renderMessage(`
      <div class="personal-card-content">

        <div class="personal-card-section">
          ${createSectionTitle('Daten')}

          <div class="personal-user-name">
            ${profile.display_name || '-'}
          </div>

          <div class="personal-info-grid">
            ${createInfoRow('Alter', calculateAge(profile.birthdate))}
            ${createInfoRow('Größe', `${profile.height_cm ?? '-'} cm`)}
            ${createInfoRow('Gewicht', `${profile.current_weight_kg ?? '-'} kg`)}
            ${createInfoRow('Letzter Stand', formatUpdatedAt(profile.updated_at))}
          </div>
        </div>

        <div class="personal-card-section">
          ${createSectionTitle('Ziel')}
          ${goalSectionHtml}
        </div>

        ${warningHtml}

      </div>
    `);
  } catch (error) {
    console.error('Unerwarteter Fehler in personal-data.js:', error);
    renderMessage(`
      <div class="personal-empty-state">
        <div class="personal-empty-title">Beim Laden ist ein Fehler aufgetreten.</div>
        <div class="personal-empty-text">Öffne bitte einmal die Browser-Konsole.</div>
      </div>
    `);
  }
}

loadProfile();