'use strict';

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

let reports = [];
let toastTimeout;

function formatNumber(value) {
  return new Intl.NumberFormat('ar-SA').format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'تعذر إكمال الطلب');
  return result;
}

async function loadReports() {
  try {
    reports = await requestJson('/api/reports');
    renderDashboard();
  } catch (error) {
    showToast(error.message);
  }
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
    const open = report.state === 'open';
    const label = `${report.place}، ${report.district}، ${open ? 'حفرة مفتوحة' : 'تمت المعالجة'}`;
    return `<g class="pin" transform="translate(${x} ${y})" data-id="${escapeHtml(report.id)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">
      <circle r="12" fill="${open ? '#d7514c' : '#2f9861'}"></circle><text y="1">${open ? '!' : '✓'}</text>
    </g>`;
  }).join('');

  elements.pins.querySelectorAll('.pin').forEach((pin) => {
    const showDetails = () => {
      const report = reports.find((item) => String(item.id) === pin.dataset.id);
      if (report) showToast(`${report.place} · ${report.district} · ${report.state === 'open' ? 'حفرة مفتوحة' : 'تمت المعالجة'}`);
    };
    pin.addEventListener('click', showDetails);
    pin.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showDetails();
      }
    });
  });
}

function renderFeed() {
  const latest = [...reports].slice(-4).reverse();
  if (latest.length === 0) {
    elements.feed.innerHTML = '<p class="footnote">لا توجد بلاغات بعد.</p>';
    return;
  }
  elements.feed.innerHTML = latest.map((report) => {
    const closed = report.state === 'closed';
    return `<article class="incident ${closed ? 'closed' : ''}">
      <i class="signal" aria-hidden="true"></i>
      <div><strong>${escapeHtml(report.place)}</strong><small>${escapeHtml(report.district)} · ${escapeHtml(report.note)}</small></div>
      <span class="badge">${closed ? 'معالج' : 'مفتوح'}</span>
    </article>`;
  }).join('');
}

function renderDistrictBars() {
  const totals = reports.reduce((result, report) => {
    if (report.state === 'open') result[report.district] = (result[report.district] || 0) + 1;
    return result;
  }, {});
  const districts = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCount = Math.max(1, ...districts.map(([, count]) => count));

  elements.districtBars.innerHTML = districts.map(([district, count]) => `
    <div class="barrow">
      <span>${escapeHtml(district)}</span>
      <div class="track" role="progressbar" aria-label="بلاغات ${escapeHtml(district)}" aria-valuemin="0" aria-valuemax="${maxCount}" aria-valuenow="${count}">
        <div class="fill" style="width: ${Math.max(8, count / maxCount * 100)}%"></div>
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

async function addReport(event) {
  event.preventDefault();
  const submitButton = elements.form.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    const payload = {
      district: document.querySelector('#district').value,
      place: document.querySelector('#location').value.trim(),
      state: document.querySelector('#condition').value,
      severity: document.querySelector('#severity').value,
      note: document.querySelector('#note').value.trim(),
    };
    const report = await requestJson('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    reports.push(report);
    renderDashboard();
    elements.form.reset();
    closeModal();
    showToast('تم حفظ البلاغ في قاعدة البيانات');
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
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
  document.querySelector('#today').textContent = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Riyadh',
  }).format(new Date());
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
  const showReportCount = () => showToast(`إجمالي السجل: ${formatNumber(reports.length)} بلاغات`);
  document.querySelector('#viewAll').addEventListener('click', showReportCount);
  document.querySelector('#allReports').addEventListener('click', showReportCount);
  document.querySelector('#analytics').addEventListener('click', () => showToast('تعرض المؤشرات التجريبية في لوحة الرصد'));
}

setCurrentDate();
bindEvents();
loadReports();
