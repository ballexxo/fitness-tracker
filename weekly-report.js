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

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
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

  if (number === 1) return '1 / 5';
  if (number === 2) return '2 / 5';
  if (number === 3) return '3 / 5';
  if (number === 4) return '4 / 5';
  if (number === 5) return '5 / 5';

  return '-';
}

function calculateAge(birthdate) {
  if (!birthdate) return null;

  const today = new Date();
  const birthDate = new Date(birthdate);

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

function roundNumber(value) {
  return Math.round(value);
}

function getActivityFactor(level) {
  const activityMap = {
    low: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
  };

  return activityMap[level] || 1.2;
}

function calculateBmr({ sex, weightKg, heightCm, age }) {
  if (sex === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }

  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

function calculateTargetCalories(maintenanceCalories, goal) {
  if (goal === 'cut') return maintenanceCalories - 500;
  if (goal === 'bulk') return maintenanceCalories + 500;
  return maintenanceCalories;
}

function calculateMacros({ calories, weightKg, dietType }) {
  const proteinG = roundNumber(weightKg * 2);
  const proteinCalories = proteinG * 4;

  let fatG = 0;
  let carbsG = 0;

  if (dietType === 'low_carb') {
    const carbCalories = calories * 0.20;
    carbsG = roundNumber(carbCalories / 4);
    fatG = roundNumber((calories - proteinCalories - carbsG * 4) / 9);
  } else if (dietType === 'low_fat') {
    const fatCalories = calories * 0.20;
    fatG = roundNumber(fatCalories / 9);
    carbsG = roundNumber((calories - proteinCalories - fatG * 9) / 4);
  } else {
    const fatCalories = calories * 0.25;
    fatG = roundNumber(fatCalories / 9);
    carbsG = roundNumber((calories - proteinCalories - fatG * 9) / 4);
  }

  return {
    proteinG,
    carbsG,
    fatG,
  };
}

async function recalculateProfileNutrition(profile, newWeightKg) {
  if (!profile?.sex || !profile?.birthdate || !profile?.height_cm || !profile?.diet_type) {
    return {
      calorie_target: profile?.calorie_target ?? null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    };
  }

  const age = calculateAge(profile.birthdate);
  if (!age) {
    return {
      calorie_target: profile?.calorie_target ?? null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    };
  }

  // Manueller Modus: Kalorienziel bleibt gleich, nur Makros neu
  if (profile.manual_calorie_mode) {
    const calories = Number(profile.calorie_target || 0);

    if (!calories || calories < 500) {
      return {
        calorie_target: profile?.calorie_target ?? null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
      };
    }

    const macros = calculateMacros({
      calories,
      weightKg: newWeightKg,
      dietType: profile.diet_type,
    });

    return {
      calorie_target: calories,
      protein_g: macros.proteinG,
      carbs_g: macros.carbsG,
      fat_g: macros.fatG,
    };
  }

  // Automatischer Modus: alles neu berechnen
  if (!profile.activity_level || !profile.goal) {
    return {
      calorie_target: profile?.calorie_target ?? null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    };
  }

  const bmr = calculateBmr({
    sex: profile.sex,
    weightKg: newWeightKg,
    heightCm: Number(profile.height_cm),
    age,
  });

  const maintenanceCalories = roundNumber(bmr * getActivityFactor(profile.activity_level));
  const calorieTarget = roundNumber(calculateTargetCalories(maintenanceCalories, profile.goal));

  const macros = calculateMacros({
    calories: calorieTarget,
    weightKg: newWeightKg,
    dietType: profile.diet_type,
  });

  return {
    calorie_target: calorieTarget,
    protein_g: macros.proteinG,
    carbs_g: macros.carbsG,
    fat_g: macros.fatG,
  };
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

  const { data: profile } = await supabase
    .from('user_profile_data')
    .select('current_weight_kg, updated_at')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  const { data: lastReport, error: reportError } = await supabase
    .from('weekly_weight_reports')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('report_date', { ascending: false })
    .limit(1);

  let infoHtml = '';

  if (profile?.current_weight_kg) {
    infoHtml += `
      <div class="weekly-info-title">Aktueller Stand</div>
      <div class="weekly-info-value">${profile.current_weight_kg} kg</div>
      <div class="weekly-info-sub">Letztes Update: ${profile.updated_at ? new Date(profile.updated_at).toLocaleDateString('de-DE') : '-'}</div>
    `;
    weeklyWeight.value = profile.current_weight_kg;
  } else {
    infoHtml += `
      <div class="weekly-info-title">Aktueller Stand</div>
      <div class="weekly-info-sub">Noch kein Gewicht hinterlegt</div>
    `;
  }

  weeklyReportInfo.innerHTML = infoHtml;

  if (!reportError && lastReport && lastReport.length > 0) {
    const report = lastReport[0];

    weeklyLastEntryBox.innerHTML = `
      <div class="weekly-last-title">Letzter Wochenbericht</div>
      <div class="calculator-result-line">
        <span class="profile-label-normal">Datum:</span>
        <span class="profile-value-inline">${formatDate(report.report_date)}</span>
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
    `;
    weeklyLastEntryBox.classList.remove('hidden');
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
    const today = new Date().toISOString().slice(0, 10);

    const { error: insertError } = await supabase
      .from('weekly_weight_reports')
      .insert({
        user_id: currentUser.id,
        report_date: today,
        weight_kg: weightValue,
        energy_level: energyValue,
        body_feeling: feelingValue,
        note: noteValue,
      });

    if (insertError) {
      console.error(insertError);
      setStatus(weeklyReportStatus, 'Wochenbericht konnte nicht gespeichert werden.', 'error');
      return;
    }

    const { data: profile } = await supabase
      .from('user_profile_data')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    const recalculated = await recalculateProfileNutrition(profile, weightValue);

    const { error: profileUpdateError } = await supabase
      .from('user_profile_data')
      .upsert({
        user_id: currentUser.id,
        current_weight_kg: weightValue,
        calorie_target: recalculated.calorie_target,
        protein_g: recalculated.protein_g,
        carbs_g: recalculated.carbs_g,
        fat_g: recalculated.fat_g,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (profileUpdateError) {
      console.error(profileUpdateError);
      setStatus(weeklyReportStatus, 'Gewicht konnte nicht im Profil aktualisiert werden.', 'error');
      return;
    }

    setStatus(weeklyReportStatus, 'Wochenbericht wurde erfolgreich gespeichert.', 'success');

    weeklyEnergy.value = '';
    weeklyFeeling.value = '';
    weeklyNote.value = '';

    await loadWeeklyInfo();
  } catch (error) {
    console.error(error);
    setStatus(weeklyReportStatus, 'Beim Speichern ist ein Fehler aufgetreten.', 'error');
  } finally {
    saveWeeklyReportBtn.disabled = false;
    saveWeeklyReportBtn.textContent = 'Wochenbericht speichern';
  }
});

loadWeeklyInfo();