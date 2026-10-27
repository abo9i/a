use strict';

const STORAGE_KEY = 'hailReports';
const INITIAL_REPORTS = [
  { id: 1, place: 'شارع الملك عبدالعزيز', district: 'النقرة', state: 'open', severity: 'عالية', x: 43, y: 42, note: 'حفرة قرب تقاطع رئيسي' },
  { id: 2, place: 'طريق عقدة', district: 'الوسيطاء', state: 'open', severity: 'متوسطة', x: 23, y: 59, note: 'تآكل بطبقة الرصف' },
  { id: 3, place: 'شارع الأمير سلطان', district: 'الجامعيين', state: 'open', severity: 'عالية', x: 79, y: 35, note: 'حفرة مؤثرة على المسار' },
  { id: 4, place: 'طريق صديان', district: 'صديان', state: 'open', severity: 'منخفضة', x: 68, y: 78, note: 'هبوط موضعي في الطريق' },
  { id: 5, place: 'شارع فهد العلي العريفي', district: 'الزهراء', state: 'closed', severity: '—', x: 63, y: 58, note: 'تمت المعالجة والتحقق' },
  { id: 6, place: 'شارع النقرة العام', district: 'النقرة', state: 'closed', severity: '—', x: 48, y: 28, note: 'تمت المعالجة' },
];

const elements = {
  openCount: document.querySelector('#openCount'),
  closedCount: document.querySelector('#closedCount'),
  pins: document.querySelector('#pins'),
  feed: document.querySelector('#feed'),
  districtBars: document.querySelector('#districtBars'),
  mapFilter: document.querySelector('#mapFilter'),
  modal: document.querySelector('#modal'),
  form: document.querySelector('#reportForm'),
  toast: document.querySelector('#toast'),
};

let reports = loadReports();
let toastTimeout;

function loadReports() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : INITIAL_REPORTS;
  } catch {
    return INITIAL_REPORTS;
  }
}

function saveReports() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    showToast('تعذر الحفظ في هذا المتصفح');
  }
  renderDashboard();
}

function formatNumber(value) {
  return new Intl.NumberFormat('ar-SA').format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

function renderStats() {
  const openCount = reports.filter((report) => report.state === 'open').length;
  elements.openCount.textContent = formatNumber(openCount);
  elements.closedCount.textContent = formatNumber(reports.length - openCount);
}

function renderMap() {
  const filter = elements.mapFilter.value;
  const visibleReports = reports.filter((report) => filter === 'all' || report.state === filter);

  elements.pins.innerHTML = visibleReports.map((report) => {
    const x = Math.max(0, Math.min(100, Number(report.x) || 0)) * 7.6;
    const y = Math.max(0, Math.min(100, Number(report.y) || 0)) * 3.6;
    const color = report.state === 'open' ? '#d7514c' : '#2f9861';
    const mark = report.state === 'open' ? '!' : '✓';
    const label = `${report.place}، ${report.district}، ${report.state === 'open' ? 'حفرة مفتوحة' : 'تمت المعالجة'}`;

    return `<g class="pin" transform="translate(${x} ${y})" data-id="${escapeHtml(report.id)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">
      <circle r="12" fill="${color}"></circle><text y="1">${mark}</text>
    </g>`;
  }).join('');

  elements.pins.querySelectorAll('.pin').forEach((pin) => {
    const openDetails = () => {
      const report = reports.find((item) => String(item.id) === pin.dataset.id);
      if (report) showToast(`${report.place} · ${report.district} · ${report.state === 'open' ? 'حفرة مفتوحة' : 'تمت المعالجة'}`);
    };
    pin.addEventListener('click', openDetails);
    pin.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetails();
      }
    });
  });
}

function renderFeed() {
  const latestReports = [...reports].slice(-4).reverse();
  if (latestReports.length === 0) {
    elements.feed.innerHTML = '<p class="footnote">لا توجد بلاغات بعد.</p>';
    return;
  }

  elements.feed.innerHTML = latestReports.map((report) => {
    const isClosed = report.state === 'closed';
    return `<article class="incident ${isClosed ? 'closed' : ''}">
      <i class="signal" aria-hidden="true"></i>
      <div><strong>${escapeHtml(report.place)}</strong><small>${escapeHtml(report.district)} · ${escapeHtml(report.note)}</small></div>
      <span class="badge">${isClosed ? 'معالج' : 'مفتوح'}</span>
    </article>`;
  }).join('');
}

function renderDistrictBars() {
  const openByDistrict = reports.reduce((totals, report) => {
    if (report.state === 'open') totals[report.district] = (totals[report.district] || 0) + 1;
    return totals;
  }, {});
  const districts = Object.entries(openByDistrict).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCount = Math.max(1, ...districts.map(([, count]) => count));

  elements.districtBars.innerHTML = districts.map(([district, count]) => `
    <div class="barrow">
      <span>${escapeHtml(district)}</span>
      <div class="track" role="progressbar" aria-label="بلاغات ${escapeHtml(district)}" aria-valuemin="0" aria-valuemax="${maxCount}" aria-valuenow="${count}">
        <div class="fill" style="width: ${Math.max(8, (count / maxCount) * 100)}%"></div>
      </div>
      <b>${formatNumber(count)}</b>
    </div>`).join('') || '<p class="footnote">لا توجد بلاغات مفتوحة.</p>';
}

function renderDashboard() {
  renderStats();
  renderMap();
  renderFeed();
  renderDistrictBars();
}

function openModal() {
  elements.modal.classList.add('open');
  elements.modal.setAttribute('aria-hidden', 'false');
  document.querySelector('#district').focus();
}

function closeModal() {
  elements.modal.classList.remove('open');
  elements.modal.setAttribute('aria-hidden', 'true');
  document.querySelector('#newReport').focus();
}

function addReport(event) {
  event.preventDefault();
  const district = document.querySelector('#district').value;
  const street = document.querySelector('#location').value.trim();
  const isClosed = document.querySelector('#condition').value === 'closed';

  reports.push({
    id: Date.now(),
    place: street,
    district,
    state: isClosed ? 'closed' : 'open',
    severity: isClosed ? '—' : document.querySelector('#severity').value,
    note: document.querySelector('#note').value.trim() || (isClosed ? 'تمت المعالجة والتحقق' : 'بلاغ جديد'),
    x: 20 + Math.random() * 60,
    y: 22 + Math.random() * 58,
  });

  saveReports();
  elements.form.reset();
  closeModal();
  showToast('تم حفظ البلاغ في هذا المتصفح');
}

function exportReports() {
  const file = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hail-road-reports.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('تم تصدير ملف البلاغات');
}

function setCurrentDate() {
  const date = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Riyadh',
  }).format(new Date());
  document.querySelector('#today').textContent = date;
}

function bindEvents() {
  document.querySelector('#newReport').addEventListener('click', openModal);
  document.querySelector('#reportNav').addEventListener('click', openModal);
  document.querySelector('#cancel').addEventListener('click', closeModal);
  elements.modal.addEventListener('click', (event) => {
    if (event.target === elements.modal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.modal.classList.contains('open')) closeModal();
  });
  elements.form.addEventListener('submit', addReport);
  elements.mapFilter.addEventListener('change', renderMap);
  document.querySelector('#exportBtn').addEventListener('click', exportReports);
  document.querySelector('#viewAll').addEventListener('click', () => showToast(`إجمالي السجل: ${formatNumber(reports.length)} بلاغات`));
  document.querySelector('#allReports').addEventListener('click', () => showToast(`إجمالي السجل: ${formatNumber(reports.length)} بلاغات`));
  document.querySelector('#analytics').addEventListener('click', () => showToast('تعرض المؤشرات التجريبية في لوحة الرصد'));
}

setCurrentDate();
bindEvents();
renderDashboard();
