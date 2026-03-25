import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let chart = null;
let currentRange = 'last';
let currentType = 'weight';

const chartCanvas = document.getElementById('bodyChart');
const textEl = document.getElementById('bodyText');
const cardsEl = document.getElementById('bodyCards');
const motivationEl = document.getElementById('bodyMotivation');

async function getUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.user) {
    window.location.href = './index.html';
    return null;
  }

  return data.session.user;
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setHours(0, 0, 0, 0);
  return getLocalDateString(d);
}

function formatShortDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
}

async function loadData() {
  const user = await getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('weekly_weight_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('week_start_date', { ascending: true });

  if (error) {
    console.error('Fehler beim Laden der Wochenberichte:', error);
    return [];
  }

  return data || [];
}

function filterData(data) {
  if (currentRange === 'month') {
    const start = getDateMonthsAgo(1);
    return data.filter((d) => d.week_start_date >= start);
  }

  if (currentRange === 'last') {
    return data.slice(-2);
  }

  return data;
}

function getValue(d) {
  if (currentType === 'weight') return Number(d.weight_kg || 0);
  if (currentType === 'energy') return Number(d.energy_level || 0);
  if (currentType === 'feeling') return Number(d.body_feeling || 0);
  return 0;
}

function getTypeLabel() {
  if (currentType === 'weight') return 'Gewicht';
  if (currentType === 'energy') return 'Energielevel';
  if (currentType === 'feeling') return 'Körpergefühl';
  return '';
}

function getRangeLabel() {
  if (currentRange === 'last') return 'zum letzten Bericht';
  if (currentRange === 'month') return 'in den letzten 4 Wochen';
  return 'insgesamt';
}

function getTrendText(values) {
  if (values.length < 2) {
    return 'Noch nicht genug Daten für eine Auswertung vorhanden.';
  }

  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;

  if (currentType === 'weight') {
    const rounded = Math.round(diff * 10) / 10;

    if (rounded > 0) {
      return `Dein ${getTypeLabel().toLowerCase()} ist ${getRangeLabel()} <span class="statistics-trend-positive">um ${rounded} kg gestiegen</span>.`;
    }

    if (rounded < 0) {
      return `Dein ${getTypeLabel().toLowerCase()} ist ${getRangeLabel()} <span class="statistics-trend-negative">um ${Math.abs(rounded)} kg gesunken</span>.`;
    }

    return `Dein ${getTypeLabel().toLowerCase()} ist ${getRangeLabel()} stabil geblieben.`;
  }

  const rounded = Math.round(diff * 10) / 10;

  if (rounded > 0) {
    return `Dein ${getTypeLabel().toLowerCase()} ist ${getRangeLabel()} <span class="statistics-trend-positive">um ${rounded} gestiegen</span>.`;
  }

  if (rounded < 0) {
    return `Dein ${getTypeLabel().toLowerCase()} ist ${getRangeLabel()} <span class="statistics-trend-negative">um ${Math.abs(rounded)} gefallen</span>.`;
  }

  return `Dein ${getTypeLabel().toLowerCase()} ist ${getRangeLabel()} stabil geblieben.`;
}

function renderChart(data) {
  if (chart) chart.destroy();

  if (!data.length) {
    textEl.textContent = 'Noch keine Wochenberichte vorhanden.';
    return;
  }

  const labels = data.map((d, index) => {
    if (currentRange === 'last' && data.length === 2) {
      return index === 0 ? 'Vorheriger Bericht' : 'Aktueller Bericht';
    }
    return formatShortDate(d.week_start_date);
  });

  const values = data.map(getValue);

  chart = new Chart(chartCanvas, {
    type: currentRange === 'last' ? 'bar' : 'line',
    data: {
      labels,
      datasets: [
        {
          label: getTypeLabel(),
          data: values,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: currentRange === 'last' ? 0 : 4,
          pointHoverRadius: currentRange === 'last' ? 0 : 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#ffffff',
            font: {
              size: 13,
              weight: '700',
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
        y: {
          ticks: {
            color: '#cbd5e1',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
  });

  textEl.innerHTML = getTrendText(values);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderCards(allData, filteredData) {
  if (!allData.length) {
    cardsEl.innerHTML = '';
    return;
  }

  const latest = allData[allData.length - 1];
  const compareBase = filteredData[0] || latest;

  const currentWeight = Number(latest.weight_kg || 0);
  const weightDiff = currentWeight - Number(compareBase.weight_kg || 0);

  let energyText = '-';
  let feelingText = '-';

  if (currentRange === 'last') {
    if (filteredData.length >= 2) {
      const prev = filteredData[0];
      const curr = filteredData[filteredData.length - 1];
      const energyDiff = Number(curr.energy_level || 0) - Number(prev.energy_level || 0);
      const feelingDiff = Number(curr.body_feeling || 0) - Number(prev.body_feeling || 0);

      energyText = `${energyDiff > 0 ? '+' : ''}${energyDiff}`;
      feelingText = `${feelingDiff > 0 ? '+' : ''}${feelingDiff}`;
    }
  } else {
    energyText = `Ø ${average(filteredData.map((d) => Number(d.energy_level || 0))).toFixed(1)}`;
    feelingText = `Ø ${average(filteredData.map((d) => Number(d.body_feeling || 0))).toFixed(1)}`;
  }

  cardsEl.innerHTML = `
    <div class="stat-card fade-up-item fade-up-delay-1">
      Aktuelles Gewicht<br>
      <b>${currentWeight.toFixed(1)} kg</b>
    </div>

    <div class="stat-card fade-up-item fade-up-delay-2">
      Veränderung<br>
      <b class="${weightDiff >= 0 ? 'statistics-trend-positive' : 'statistics-trend-negative'}">
        ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} kg
      </b>
    </div>

    <div class="stat-card fade-up-item fade-up-delay-3">
      Energielevel<br>
      <b class="${String(energyText).startsWith('-') ? 'statistics-trend-negative' : 'statistics-trend-positive'}">${energyText}</b>
    </div>

    <div class="stat-card fade-up-item fade-up-delay-4">
      Körpergefühl<br>
      <b class="${String(feelingText).startsWith('-') ? 'statistics-trend-negative' : 'statistics-trend-positive'}">${feelingText}</b>
    </div>
  `;
}

function renderMotivation(filteredData) {
  if (!filteredData.length) {
    motivationEl.innerHTML = '';
    return;
  }

  const first = filteredData[0];
  const latest = filteredData[filteredData.length - 1];

  const weightDiff = Number(latest.weight_kg || 0) - Number(first.weight_kg || 0);
  const energyDiff = Number(latest.energy_level || 0) - Number(first.energy_level || 0);
  const feelingDiff = Number(latest.body_feeling || 0) - Number(first.body_feeling || 0);

  const weightText =
    weightDiff < 0
      ? 'Dein Gewicht entwickelt sich aktuell nach unten.'
      : weightDiff > 0
        ? 'Dein Gewicht entwickelt sich aktuell nach oben.'
        : 'Dein Gewicht ist aktuell stabil.';

  const energyText =
    energyDiff > 0
      ? 'Dein Energielevel hat sich verbessert.'
      : energyDiff < 0
        ? 'Dein Energielevel ist zuletzt gesunken.'
        : 'Dein Energielevel ist stabil geblieben.';

  const feelingText =
    feelingDiff > 0
      ? 'Dein Körpergefühl entwickelt sich positiv.'
      : feelingDiff < 0
        ? 'Dein Körpergefühl ist etwas gesunken.'
        : 'Dein Körpergefühl ist stabil geblieben.';

  motivationEl.innerHTML = `
    <p>${weightText}</p>
    <p>${energyText}</p>
    <p>${feelingText}</p>
  `;
}

function updateActiveButtons(containerSelector, activeValue, dataAttr) {
  document.querySelectorAll(`${containerSelector} button`).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset[dataAttr] === activeValue);
  });
}

async function init() {
  const allData = await loadData();

  const filteredData = filterData(allData);

  renderChart(filteredData);
  renderCards(allData, filteredData);
  renderMotivation(filteredData);

  updateActiveButtons('#bodyRangeSwitch', currentRange, 'range');
  updateActiveButtons('#bodyTypeSwitch', currentType, 'type');
}

document.querySelectorAll('#bodyRangeSwitch button').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentRange = btn.dataset.range;
    init();
  });
});

document.querySelectorAll('#bodyTypeSwitch button').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    init();
  });
});

init();