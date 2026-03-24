import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const weeklyReportInfo = document.getElementById('weeklyReportInfo');
const weeklyReportForm = document.getElementById('weeklyReportForm');
const weeklyWeight = document.getElementById('weeklyWeight');
const weeklyEnergy = document.getElementById('weeklyEnergy');
const weeklyFeeling = document.getElementById('weeklyFeeling');
const weeklyNote = document.getElementById('weeklyNote');
const weeklyReportStatus = document.getElementById('weeklyReportStatus');
const saveWeeklyReportBtn = document.getElementById('saveWeeklyReportBtn');
const weeklyLastEntryBox = document.getElementById('weeklyLastEntryBox');

let currentUser = null;
let currentWeekReport = null;

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sonntag
  const mondayDistance = day === 0 ? 6 : day - 1;

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayDistance);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const weekday = date.toLocaleDateString('de-DE', { weekday: 'long' });
  const fullDate = date.toLocaleDateString('de-DE');
  return `${weekday}, ${fullDate}`;
}

function getScoreLabel(value) {
  const number = Number(value);
  if (number >= 1 && number <= 5) return `${number} / 5`;
  return '-';
}

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  currentUser = data.session.user;
  return currentUser;
}

async function loadWeeklyInfo() {
  await guardPage();
  setStatus(weeklyReportStatus, '');

  const { monday, sunday } = getCurrentWeekBounds();
  const weekStartDate = getLocalDateString(monday);
  const weekEndDate = getLocalDateString(sunday);

  const { data: profile } = await supabase
    .from('user_profile_data')
    .select('current_weight_kg, updated_at')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  const { data: currentReport, error: currentReportError } = await supabase
    .from('weekly_weight_reports')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('week_start_date', weekStartDate)
    .maybeSingle();

  if (currentReportError) {
    console.error(currentReportError);
  }

  currentWeekReport = currentReport || null;

  weeklyReportInfo.innerHTML = `
    <div class="weekly-info-title">Berichts-Woche</div>
    <div class="weekly-info-value">${monday.toLocaleDateString('de-DE')} - ${sunday.toLocaleDateString('de-DE')}</div>
    <div class="weekly-info-sub" style="margin-top: 10px;">
      ${
        currentWeekReport
          ? 'Du kannst deinen Bericht für diese Woche noch bearbeiten.'
          : 'Für diese Woche wurde noch kein Wochenbericht abgegeben.'
      }
    </div>
  `;

  if (profile?.current_weight_kg) {
    weeklyWeight.value = profile.current_weight_kg;
  }

  if (currentWeekReport) {
    weeklyWeight.value = currentWeekReport.weight_kg ?? profile?.current_weight_kg ?? '';
    weeklyEnergy.value = currentWeekReport.energy_level ?? '';
    weeklyFeeling.value = currentWeekReport.body_feeling ?? '';
    weeklyNote.value = currentWeekReport.note || '';

    saveWeeklyReportBtn.textContent = 'Wochenbericht aktualisieren';
  } else {
    weeklyEnergy.value = '';
    weeklyFeeling.value = '';
    weeklyNote.value = '';
    saveWeeklyReportBtn.textContent = 'Wochenbericht speichern';
  }

  const { data: lastReportList, error: lastReportError } = await supabase
    .from('weekly_weight_reports')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('week_start_date', { ascending: false })
    .limit(1);

  if (!lastReportError && lastReportList && lastReportList.length > 0) {
    const report = lastReportList[0];

    weeklyLastEntryBox.innerHTML = `
      <div class="weekly-last-title">Letzter Wochenbericht</div>
      <div class="calculator-result-line">
        <span class="profile-label-normal">Woche:</span>
        <span class="profile-value-inline">${report.week_start_date} bis ${report.week_end_date}</span>
      </div>
      <div class="calculator-result-line">
        <span class="profile-label-normal">Gewicht:</span>
        <span class="profile-value-inline">${report.weight_kg} kg</span>
      </div>
      <div class="calculator-result-line">
        <span class="profile-label-normal">Energielevel:</span>
        <span class="profile-value-inline">${getScoreLabel(report.energy_level)}</span>
      </div>
      <div class="calculator-result-line">
        <span class="profile-label-normal">Körpergefühl:</span>
        <span class="profile-value-inline">${getScoreLabel(report.body_feeling)}</span>
      </div>
      <div class="calculator-result-line">
        <span class="profile-label-normal">Notiz:</span>
        <span class="profile-value-inline">${report.note || '-'}</span>
      </div>
      <div class="calculator-result-line">
        <span class="profile-label-normal">Letzte Änderung:</span>
        <span class="profile-value-inline">${formatDate(report.report_date)}</span>
      </div>
    `;
    weeklyLastEntryBox.classList.remove('hidden');
  } else {
    weeklyLastEntryBox.classList.add('hidden');
  }
}

weeklyReportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(weeklyReportStatus, '');

  await guardPage();

  const weightValue = Number(weeklyWeight.value);
  const energyValue = Number(weeklyEnergy.value);
  const feelingValue = Number(weeklyFeeling.value);
  const noteValue = weeklyNote.value.trim();

  if (!weightValue || weightValue <= 0) {
    setStatus(weeklyReportStatus, 'Bitte gib ein gültiges Gewicht ein.', 'error');
    return;
  }

  if (!energyValue || !feelingValue) {
    setStatus(weeklyReportStatus, 'Bitte wähle Energielevel und Körpergefühl aus.', 'error');
    return;
  }

  saveWeeklyReportBtn.disabled = true;
  saveWeeklyReportBtn.textContent = 'Wird gespeichert...';

  try {
    const { monday, sunday } = getCurrentWeekBounds();
    const weekStartDate = getLocalDateString(monday);
    const weekEndDate = getLocalDateString(sunday);
    const today = getLocalDateString();

    const { error: upsertError } = await supabase
      .from('weekly_weight_reports')
      .upsert({
        user_id: currentUser.id,
        week_start_date: weekStartDate,
        week_end_date: weekEndDate,
        report_date: today,
        weight_kg: weightValue,
        energy_level: energyValue,
        body_feeling: feelingValue,
        note: noteValue,
      }, { onConflict: 'user_id,week_start_date' });

    if (upsertError) {
      console.error(upsertError);
      setStatus(weeklyReportStatus, 'Wochenbericht konnte nicht gespeichert werden.', 'error');
      return;
    }

    const { error: profileUpdateError } = await supabase
      .from('user_profile_data')
      .upsert({
        user_id: currentUser.id,
        current_weight_kg: weightValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (profileUpdateError) {
      console.error(profileUpdateError);
      setStatus(weeklyReportStatus, 'Gewicht konnte nicht im Profil aktualisiert werden.', 'error');
      return;
    }

    setStatus(weeklyReportStatus, 'Wochenbericht wurde erfolgreich gespeichert.', 'success');
    await loadWeeklyInfo();
  } catch (error) {
    console.error(error);
    setStatus(weeklyReportStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    saveWeeklyReportBtn.disabled = false;
  }
});

loadWeeklyInfo();