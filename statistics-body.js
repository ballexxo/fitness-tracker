import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let chart;
let currentRange = 'last';
let currentType = 'weight';

const chartCanvas = document.getElementById('bodyChart');
const textEl = document.getElementById('bodyText');
const cardsEl = document.getElementById('bodyCards');
const motivationEl = document.getElementById('bodyMotivation');

async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data.session.user;
}

function getDateMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split('T')[0];
}

async function loadData() {
  const user = await getUser();

  const { data } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: true });

  return data || [];
}

function filterData(data) {
  if (currentRange === 'month') {
    const start = getDateMonthsAgo(1);
    return data.filter(d => d.date >= start);
  }

  if (currentRange === 'last') {
    return data.slice(-2);
  }

  return data;
}

function getValue(d) {
  if (currentType === 'weight') return d.weight;
  if (currentType === 'energy') return d.energy_level;
  if (currentType === 'feeling') return d.body_feeling;
}

function renderChart(data) {
  if (chart) chart.destroy();

  const labels = data.map(d => new Date(d.date).toLocaleDateString());
  const values = data.map(getValue);

  chart = new Chart(chartCanvas, {
    type: currentRange === 'last' ? 'bar' : 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        tension: 0.3
      }]
    }
  });

  renderText(values);
}

function renderText(values) {
  if (values.length < 2) {
    textEl.textContent = 'Nicht genug Daten.';
    return;
  }

  const diff = values[values.length - 1] - values[0];

  const sign = diff > 0 ? '+' : '';
  const cls = diff >= 0 ? 'green' : 'red';

  textEl.innerHTML = `
    Veränderung: <span class="${cls}">${sign}${diff.toFixed(1)}</span>
  `;
}

function renderCards(data) {
  if (!data.length) return;

  const latest = data[data.length - 1];
  const first = data[0];

  cardsEl.innerHTML = `
    <div class="stat-card">Gewicht<br><b>${latest.weight} kg</b></div>
    <div class="stat-card">Veränderung<br><b>${(latest.weight - first.weight).toFixed(1)} kg</b></div>
    <div class="stat-card">Energie<br><b>${latest.energy_level}</b></div>
    <div class="stat-card">Gefühl<br><b>${latest.body_feeling}</b></div>
  `;
}

function renderMotivation(data) {
  if (!data.length) return;

  const latest = data[data.length - 1];
  const first = data[0];

  const diff = latest.weight - first.weight;

  motivationEl.innerHTML = `
    <p>${diff < 0 ? 'Du bist auf einem guten Weg 🔥' : 'Bleib dran 💪'}</p>
    <p>Dein Körper entwickelt sich weiter.</p>
    <p>Konsistenz ist der Schlüssel.</p>
  `;
}

async function init() {
  const data = await loadData();
  const filtered = filterData(data);

  renderChart(filtered);
  renderCards(filtered);
  renderMotivation(filtered);
}

document.querySelectorAll('#bodyRangeSwitch button').forEach(btn => {
  btn.onclick = () => {
    currentRange = btn.dataset.range;
    init();
  };
});

document.querySelectorAll('#bodyTypeSwitch button').forEach(btn => {
  btn.onclick = () => {
    currentType = btn.dataset.type;
    init();
  };
});

init();