import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const calculatorForm = document.getElementById('calculatorForm');
const goalSelect = document.getElementById('goalSelect');
const dietTypeSelect = document.getElementById('dietTypeSelect');
const manualCaloriesToggle = document.getElementById('manualCaloriesToggle');
const automaticCalculationFields = document.getElementById('automaticCalculationFields');
const manualCaloriesField = document.getElementById('manualCaloriesField');
const activityLevel = document.getElementById('activityLevel');
const trainingDaysPerWeek = document.getElementById('trainingDaysPerWeek');
const avgTrainingMinutes = document.getElementById('avgTrainingMinutes');
const manualCaloriesInput = document.getElementById('manualCaloriesInput');
const calculatorStatus = document.getElementById('calculatorStatus');
const calculateBtn = document.getElementById('calculateBtn');
const calculatorResult = document.getElementById('calculatorResult');

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.toggle('hidden', !message);
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

function updateModeVisibility() {
  const isManual = manualCaloriesToggle.checked;

  automaticCalculationFields.classList.toggle('hidden', isManual);
  manualCaloriesField.classList.toggle('hidden', !isManual);

  activityLevel.required = !isManual;
  trainingDaysPerWeek.required = !isManual;
  avgTrainingMinutes.required = !isManual;

  manualCaloriesInput.required = isManual;
}

async function guardPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

async function loadExistingValues() {
  const user = await guardPage();
  if (!user) return;

  const { data, error } = await supabase
    .from('user_profile_data')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return;

  goalSelect.value = data.goal || '';
  dietTypeSelect.value = data.diet_type || '';
  activityLevel.value = data.activity_level || '';
  trainingDaysPerWeek.value = data.training_days_per_week ?? '';
  avgTrainingMinutes.value = data.avg_training_minutes ?? '';

  manualCaloriesToggle.checked = !!data.manual_calorie_mode;
  if (data.manual_calorie_mode && data.calorie_target) {
    manualCaloriesInput.value = data.calorie_target;
  }

  updateModeVisibility();
}

manualCaloriesToggle.addEventListener('change', updateModeVisibility);

calculatorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(calculatorStatus, '');
  calculatorResult.classList.add('hidden');

  const user = await guardPage();
  if (!user) return;

  calculateBtn.disabled = true;
  calculateBtn.textContent = 'Wird berechnet...';

  try {
    const { data: profile, error: profileError } = await supabase
      .from('user_profile_data')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      setStatus(calculatorStatus, 'Bitte trage zuerst deine persönlichen Daten ein.', 'error');
      return;
    }

    const age = calculateAge(profile.birthdate);

    if (!age || !profile.sex || !profile.height_cm || !profile.current_weight_kg) {
      setStatus(calculatorStatus, 'Bitte vervollständige zuerst deine Stammdaten.', 'error');
      return;
    }

    if (!goalSelect.value || !dietTypeSelect.value) {
      setStatus(calculatorStatus, 'Bitte wähle Ziel und Ernährungsform aus.', 'error');
      return;
    }

    const weightKg = Number(profile.current_weight_kg);
    const heightCm = Number(profile.height_cm);

    let calorieTarget = 0;
    let maintenanceCalories = null;
    let bmr = null;

    if (manualCaloriesToggle.checked) {
      calorieTarget = Number(manualCaloriesInput.value);

      if (!calorieTarget || calorieTarget < 500) {
        setStatus(calculatorStatus, 'Bitte gib ein gültiges eigenes Kalorienziel ein.', 'error');
        return;
      }
    } else {
      bmr = calculateBmr({
        sex: profile.sex,
        weightKg,
        heightCm,
        age,
      });

      maintenanceCalories = roundNumber(bmr * getActivityFactor(activityLevel.value));
      calorieTarget = roundNumber(calculateTargetCalories(maintenanceCalories, goalSelect.value));
    }

    const macros = calculateMacros({
      calories: calorieTarget,
      weightKg,
      dietType: dietTypeSelect.value,
    });

    const updatePayload = {
      user_id: user.id,
      goal: goalSelect.value,
      diet_type: dietTypeSelect.value,
      calorie_target: calorieTarget,
      protein_g: macros.proteinG,
      carbs_g: macros.carbsG,
      fat_g: macros.fatG,
      manual_calorie_mode: manualCaloriesToggle.checked,
      updated_at: new Date().toISOString(),
    };

    if (!manualCaloriesToggle.checked) {
      updatePayload.activity_level = activityLevel.value;
      updatePayload.training_days_per_week = Number(trainingDaysPerWeek.value);
      updatePayload.avg_training_minutes = Number(avgTrainingMinutes.value);
    }

    const { error: updateError } = await supabase
      .from('user_profile_data')
      .upsert(updatePayload, { onConflict: 'user_id' });

    if (updateError) {
      console.error(updateError);
      setStatus(calculatorStatus, 'Die Berechnung konnte nicht gespeichert werden.', 'error');
      return;
    }

    calculatorResult.innerHTML = `
      ${
        manualCaloriesToggle.checked
          ? `
            <div class="calculator-result-line">
              <span class="profile-label-normal">Kalorienziel:</span>
              <span class="profile-value-inline">${calorieTarget} kcal</span>
            </div>
          `
          : `
            <div class="calculator-result-line">
              <span class="profile-label-normal">Grundumsatz:</span>
              <span class="profile-value-inline">${roundNumber(bmr)} kcal</span>
            </div>

            <div class="calculator-result-line">
              <span class="profile-label-normal">Erhaltungsbedarf:</span>
              <span class="profile-value-inline">${maintenanceCalories} kcal</span>
            </div>

            <div class="calculator-result-line">
              <span class="profile-label-normal">Kalorienziel:</span>
              <span class="profile-value-inline">${calorieTarget} kcal</span>
            </div>
          `
      }

      <div class="profile-macros" style="margin-top: 18px;">
        <span class="profile-label-inline">Eiweiß:</span>
        <span class="profile-value-inline">${macros.proteinG} g</span>
        <span class="macro-separator">|</span>

        <span class="profile-label-inline">Kohlenhydrate:</span>
        <span class="profile-value-inline">${macros.carbsG} g</span>
        <span class="macro-separator">|</span>

        <span class="profile-label-inline">Fett:</span>
        <span class="profile-value-inline">${macros.fatG} g</span>
      </div>
    `;

    calculatorResult.classList.remove('hidden');
    setStatus(calculatorStatus, 'Kalorienziel und Makros wurden gespeichert.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(calculatorStatus, 'Beim Berechnen ist ein Fehler aufgetreten.', 'error');
  } finally {
    calculateBtn.disabled = false;
    calculateBtn.textContent = 'Berechnen und speichern';
  }
});

updateModeVisibility();
loadExistingValues();