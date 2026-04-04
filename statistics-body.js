import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let chart = null;
let currentRange = 'last';
let currentType = 'weight';

const chartCanvas = document.getElementById('bodyChart');
const textEl = document.getElementById('bodyText');
const cardsEl = document.getElementById('bodyCards');

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

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getEnergyState(score) {
  const s = Number(score || 0);

  if (s < 1.5) return { label: 'sehr niedrig', colorClass: 'statistics-trend-negative' };
  if (s < 2.5) return { label: 'niedrig', colorClass: 'statistics-trend-negative' };
  if (s < 3.5) return { label: 'mittel', colorClass: 'statistics-trend-warning' };
  if (s < 4.5) return { label: 'gut', colorClass: 'statistics-trend-positive' };
  return { label: 'sehr gut', colorClass: 'statistics-trend-positive' };
}

function getFeelingState(score) {
  const s = Number(score || 0);

  if (s < 1.5) return { label: 'sehr schlecht', colorClass: 'statistics-trend-negative' };
  if (s < 2.5) return { label: 'schlecht', colorClass: 'statistics-trend-negative' };
  if (s < 3.5) return { label: 'neutral', colorClass: 'statistics-trend-warning' };
  if (s < 4.5) return { label: 'gut', colorClass: 'statistics-trend-positive' };
  return { label: 'sehr gut', colorClass: 'statistics-trend-positive' };
}

function getCurrentState(score) {
  if (currentType === 'energy') return getEnergyState(score);
  if (currentType === 'feeling') return getFeelingState(score);
  return { label: '', colorClass: '' };
}

function getWeightTrendText(values) {
  if (values.length < 2) {
    return 'Noch nicht genug Daten für eine Auswertung vorhanden.';
  }

  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  const rounded = Math.round(diff * 10) / 10;

  let label = 'Veränderung';
  if (currentRange === 'last') label = 'Vergleich zum letzten Bericht';
  if (currentRange === 'month') label = 'Veränderung in 4 Wochen';
  if (currentRange === 'total') label = 'Veränderung gesamt';

  return `${label}: <span class="statistics-text-neutral">${diff > 0 ? '+' : ''}${rounded} kg</span>`;
}

function getStateTrendText(filteredData) {
  if (!filteredData.length) {
    return 'Noch nicht genug Daten für eine Auswertung vorhanden.';
  }

  const values = filteredData.map(getValue);
  const label = currentType === 'energy' ? 'Dein Energielevel ist' : 'Dein Körpergefühl ist';

  if (currentRange === 'last') {
    if (values.length < 2) {
      return 'Noch nicht genug Daten für eine Auswertung vorhanden.';
    }

    const diff = values[values.length - 1] - values[0];

    if (diff > 0) {
      return `${label} <span class="statistics-trend-positive">gestiegen</span>.`;
    }
    if (diff < 0) {
      return `${label} <span class="statistics-trend-negative">gesunken</span>.`;
    }
    return `${label} <span class="statistics-trend-warning">gleich geblieben</span>.`;
  }

  const avg = average(values);
  const state = getCurrentState(avg);
  const avgLabel = currentType === 'energy'
    ? 'Dein Durchschnitts-Energielevel ist'
    : 'Dein Durchschnitts-Körpergefühl ist';

  return `${avgLabel} <span class="${state.colorClass}">${state.label}</span>.`;
}

function buildChartOptions(values) {
  const options = {
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
  };

  if (currentType === 'weight' && values.length >= 2) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(0.5, Math.abs(max - min) * 0.8);

    options.scales.y.min = Math.max(0, min - padding);
    options.scales.y.max = max + padding;
  }

  if (currentType !== 'weight') {
    options.scales.y.min = 0;
    options.scales.y.max = 5;
    options.scales.y.ticks.stepSize = 1;
  }

  return options;
}

function renderChart(data) {
  if (chart) chart.destroy();

  if (!data.length) {
    textEl.textContent = 'Noch keine Wochenberichte vorhanden.';
    return;
  }

  const labels = data.map((d) => formatShortDate(d.week_start_date));
  const values = data.map(getValue);

  chart = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: getTypeLabel(),
          data: values,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 5,
        },
      ],
    },
    options: buildChartOptions(values),
  });

  textEl.innerHTML =
    currentType === 'weight'
      ? getWeightTrendText(values)
      : getStateTrendText(data);
}

function getDeltaClass(value) {
  if (value > 0) return 'statistics-trend-positive';
  if (value < 0) return 'statistics-trend-negative';
  return 'statistics-trend-warning';
}

function renderCards(allData, filteredData) {
  if (!allData.length) {
    cardsEl.innerHTML = '';
    return;
  }

  const latest = allData[allData.length - 1];

  if (currentType === 'weight') {
    const currentWeight = Number(latest.weight_kg || 0);
    const compareBase = filteredData[0] || latest;
    const weightDiff = currentWeight - Number(compareBase.weight_kg || 0);

    let changeLabel = 'Veränderung';
    if (currentRange === 'last') changeLabel = 'Zum letzten Bericht';
    if (currentRange === 'month') changeLabel = 'In 4 Wochen';
    if (currentRange === 'total') changeLabel = 'Gesamt';

    cardsEl.innerHTML = `
      <div class="statistics-grid body-cards-grid statistics-body-cards-grid-modern">
        <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-1">
          <div class="statistics-mini-label">${'Aktuelles Gewicht'}</div>
          <div class="statistics-mini-value statistics-text-neutral">${currentWeight.toFixed(1)} kg</div>
        </div>

        <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-2">
          <div class="statistics-mini-label">${changeLabel}</div>
          <div class="statistics-mini-value statistics-text-neutral">
            ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} kg
          </div>
        </div>
      </div>
    `;
    return;
  }

  const currentValue = getValue(latest);
  const currentState = getCurrentState(currentValue);

  let secondLabel = '';
  let secondValue = '';
  let secondClass = 'statistics-trend-positive';

  if (currentRange === 'last') {
    secondLabel = 'Zum letzten Bericht';

    if (filteredData.length >= 2) {
      const prev = filteredData[0];
      const curr = filteredData[filteredData.length - 1];
      const diff = getValue(curr) - getValue(prev);

      secondValue = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`;
      secondClass = getDeltaClass(diff);
    } else {
      secondValue = '0.0';
      secondClass = 'statistics-trend-warning';
    }
  } else {
    const avg = average(filteredData.map(getValue));
    const avgState = getCurrentState(avg);

    secondLabel = currentRange === 'month' ? 'Ø 4 Wochen' : 'Ø Gesamt';
    secondValue = `${avg.toFixed(1)} - ${avgState.label}`;
    secondClass = avgState.colorClass;
  }

  cardsEl.innerHTML = `
    <div class="statistics-grid body-cards-grid statistics-body-cards-grid-modern">
      <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-1">
        <div class="statistics-mini-label">${currentType === 'energy' ? 'Aktuelles Energielevel' : 'Aktuelles Körpergefühl'}</div>
        <div class="statistics-mini-value ${currentState.colorClass}">
          ${currentValue.toFixed(1)} - ${currentState.label}
        </div>
      </div>

      <div class="statistics-mini-card statistics-mini-card-modern fade-up-item fade-up-delay-2">
        <div class="statistics-mini-label">${secondLabel}</div>
        <div class="statistics-mini-value ${secondClass}">
          ${secondValue}
        </div>
      </div>
    </div>
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