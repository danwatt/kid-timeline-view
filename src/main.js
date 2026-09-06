import { schoolYearForDate, schoolYearDetails } from './school-year.js';
import { DataSet } from 'vis-data';
import { Timeline } from 'vis-timeline';
import 'vis-timeline/styles/vis-timeline-graph2d.css';

// Age band definitions: [startAge, endAge, label, cssClass]
const AGE_BANDS = [
  [0, 5, 'Pre-School', 'band-pre'],
  [5, 13, 'Child - School', 'band-0'],
  [13, 16, 'Teen', 'band-1'],
  [16, 18, 'Driving', 'band-2'],
  [18, 21, 'College', 'band-3'],
  [21, 25, 'Adult', 'band-4'],
];

// School year: mid-August to mid-May
const SCHOOL_START = { month: 7, day: 15 }; // August = month 7 (0-indexed)
const SCHOOL_END = { month: 4, day: 15 }; // May = month 4

const countInput = document.getElementById('count');
const buildFormBtn = document.getElementById('buildForm');
const kidsForm = document.getElementById('kidsForm');
const kidInputs = document.getElementById('kidInputs');
const setupSection = document.getElementById('setup');
const timelineWrap = document.getElementById('timelineWrap');
const legendEl = document.getElementById('legend');
const resetBtn = document.getElementById('reset');
const editBtn = document.getElementById('edit');

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
}

const STORAGE_KEY = 'kid-timeline-kids';
const STORAGE_KEY_PARENTS = 'kid-timeline-parents';

let timeline = null;
let currentKids = [];
let currentParents = [];

// Start year of the nearest upcoming school year
function nearestSchoolYearStart(now = new Date()) {
  const y = now.getFullYear();
  const start = new Date(y, SCHOOL_START.month, SCHOOL_START.day);
  return now <= start ? y : y + 1;
}

function saveKids(kids) {
  const data = kids.map((k) => ({
    name: k.name,
    dob: k.dob.toISOString().slice(0, 10),
    grade: k.grade,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadKids() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((k) => ({
      name: k.name,
      dob: new Date(k.dob + 'T00:00:00'),
      grade: k.grade,
    }));
  } catch {
    return null;
  }
}

function saveParents(parents) {
  const data = parents.map((p) => ({
    name: p.name,
    dob: p.dob ? p.dob.toISOString().slice(0, 10) : null,
  }));
  localStorage.setItem(STORAGE_KEY_PARENTS, JSON.stringify(data));
}

function loadParents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PARENTS);
    if (!raw) return [];
    return JSON.parse(raw).map((p) => ({
      name: p.name,
      dob: p.dob ? new Date(p.dob + 'T00:00:00') : null,
    }));
  } catch {
    return [];
  }
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// Full years elapsed between dob and a given date
function ageAt(dob, date) {
  let age = date.getFullYear() - dob.getFullYear();
  const m = date.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && date.getDate() < dob.getDate())) age--;
  return age;
}

// Grade a child is entering for the given school year, assuming a Sept 1 cutoff
// (age 5 by Sept 1 => Kindergarten = grade 0).
function computeGrade(dob, startYear = nearestSchoolYearStart()) {
  return ageAt(dob, new Date(startYear, 8, 1)) - 5;
}

// Build the per-parent and per-kid inputs, optionally prefilled
function buildKidForm(prefill = [], prefillParents = []) {
  const n = Math.max(1, Math.min(12, parseInt(countInput.value, 10) || 1));
  countInput.value = n;
  const startYear = nearestSchoolYearStart();
  const startDateLabel = new Date(
    startYear,
    SCHOOL_START.month,
    SCHOOL_START.day,
  ).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const parentRows = [0, 1]
    .map((i) => {
      const p = prefillParents[i];
      const name = p ? p.name : `Parent ${i + 1}`;
      const dob = p && p.dob ? p.dob.toISOString().slice(0, 10) : '';
      return `
      <div class="kid-row parent-row">
        <span class="person-avatar parent-avatar" aria-hidden="true">${i + 1}</span>
        <label>Name<input type="text" class="parent-name" placeholder="Parent ${i + 1} name" value="${escapeHtml(name)}" /></label>
        <label>Date of birth<input type="date" class="parent-dob" value="${dob}" /></label>
      </div>`;
    })
    .join('');

  kidInputs.innerHTML = `
    <div class="section-label">The grown-ups <span>OPTIONAL</span></div><p class="section-description">Add birthdays to see retirement at age 65.</p>
    ${parentRows}
    <div class="section-label">The little ones <span>YOUR NEXT CHAPTER</span></div>
    <details class="grade-help"><summary>About school grades · ${startYear}–${startYear + 1}</summary><p class="grade-hint">Grade each child is entering for the <strong>${startYear}-${startYear + 1}</strong> school year (starting ${startDateLabel}). Use 0 for Kindergarten, and negative values for kids not yet started (e.g. -1 starts K next year). Leave blank to compute it from the birth date (K = age 5 by Sept 1).</p></details>
  `;
  for (let i = 0; i < n; i++) {
    const k = prefill[i];
    const name = k ? k.name : `Child ${i + 1}`;
    const dob = k && k.dob ? k.dob.toISOString().slice(0, 10) : '';
    const grade = k && Number.isFinite(k.grade) ? k.grade : '';
    const row = document.createElement('div');
    row.className = 'kid-row';
    row.innerHTML = `
      <span class="person-avatar avatar-${i % 4}" aria-hidden="true">${i + 1}</span>
      <label>Name<input type="text" class="kid-name" placeholder="Child ${i + 1} name" value="${escapeHtml(name)}" required /></label>
      <label>Date of birth<input type="date" class="kid-dob" value="${dob}" required /></label>
      <label>Grade<input type="number" class="kid-grade" min="-5" max="12" placeholder="Auto" value="${grade}" /></label>
    `;
    kidInputs.appendChild(row);
  }
  kidsForm.classList.remove('hidden');
}

buildFormBtn.addEventListener('click', () => {
  const kids = [...document.querySelectorAll('.kid-name')].map((el, i) => ({
    name: el.value,
    dob: document.querySelectorAll('.kid-dob')[i].value,
    grade: parseInt(document.querySelectorAll('.kid-grade')[i].value, 10),
  }));
  const parents = [...document.querySelectorAll('.parent-name')].map(
    (el, i) => ({
      name: el.value,
      dob: document.querySelectorAll('.parent-dob')[i].value,
    }),
  );
  const dates = (people) =>
    people.map((p) => ({
      ...p,
      dob: p.dob ? new Date(p.dob + 'T00:00:00') : null,
    }));
  buildKidForm(dates(kids), dates(parents));
});

editBtn.addEventListener('click', () => {
  countInput.value = currentKids.length || countInput.value;
  timelineWrap.classList.add('hidden');
  setupSection.classList.remove('hidden');
  buildKidForm(currentKids, currentParents);
});

kidsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const names = [...document.querySelectorAll('.kid-name')].map((el) =>
    el.value.trim(),
  );
  const dobs = [...document.querySelectorAll('.kid-dob')].map((el) => el.value);
  const grades = [...document.querySelectorAll('.kid-grade')].map((el) => {
    const v = parseInt(el.value, 10);
    return Number.isFinite(v) ? v : null;
  });
  const kids = names.map((name, i) => {
    const dob = new Date(dobs[i] + 'T00:00:00');
    return {
      name,
      dob,
      grade: grades[i] === null ? computeGrade(dob) : grades[i],
    };
  });

  const pNames = [...document.querySelectorAll('.parent-name')].map((el) =>
    el.value.trim(),
  );
  const pDobs = [...document.querySelectorAll('.parent-dob')].map(
    (el) => el.value,
  );
  const parents = pNames
    .map((name, i) => ({
      name: name || `Parent ${i + 1}`,
      dob: pDobs[i] ? new Date(pDobs[i] + 'T00:00:00') : null,
    }))
    .filter((p) => p.dob);

  saveKids(kids);
  saveParents(parents);
  renderTimeline(kids, parents);
});

resetBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_PARENTS);
  countInput.value = 2;
  buildKidForm();
  timelineWrap.classList.add('hidden');
  setupSection.classList.remove('hidden');
});

function schoolSessions(minDate, maxDate, driveData) {
  // One background band per school year a kid is enrolled in K-12, sliced so the
  // stretches where a parent must drive get their own class (no overlapping items).
  const driving = parentDrivingIntervals(driveData, minDate, maxDate).map(
    (s) => [+s.start, +s.end],
  );
  const items = [];
  const firstYear = minDate.getFullYear() - 1;
  const lastYear = maxDate.getFullYear() + 1;
  for (let y = firstYear; y <= lastYear; y++) {
    const start = +new Date(y, SCHOOL_START.month, SCHOOL_START.day);
    const end = +new Date(y + 1, SCHOOL_END.month, SCHOOL_END.day);
    const anyEnrolled = driveData.some(
      (w) => +w.enroll < end && +w.grad > start,
    );
    if (!anyEnrolled) continue;

    const cuts = new Set([start, end]);
    driving.forEach(([ds, de]) => {
      if (ds > start && ds < end) cuts.add(ds);
      if (de > start && de < end) cuts.add(de);
    });
    const pts = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < pts.length - 1; i++) {
      const s = pts[i];
      const e = pts[i + 1];
      const mid = (s + e) / 2;
      const isDriving = driving.some(([ds, de]) => ds <= mid && mid < de);
      const range = `${new Date(s).toLocaleDateString()} – ${new Date(e).toLocaleDateString()}`;
      items.push({
        start: new Date(s),
        end: new Date(e),
        type: 'background',
        className: isDriving
          ? 'school-session parent-driving'
          : 'school-session',
        content: '',
        title: isDriving
          ? `Parent must drive to school: ${range} (no child old enough)`
          : `School in session: ${range}`,
      });
    }
  }
  return items;
}

// Is the date within a school session (mid-Aug to mid-May)? Summer = not in session.
function inSchoolSession(date) {
  const m = date.getMonth();
  const d = date.getDate();
  const afterStart =
    m > SCHOOL_START.month ||
    (m === SCHOOL_START.month && d >= SCHOOL_START.day);
  const beforeEnd =
    m < SCHOOL_END.month || (m === SCHOOL_END.month && d <= SCHOOL_END.day);
  return afterStart || beforeEnd;
}

// Merged date ranges (during school sessions) where a ride is needed and no child
// is old enough to drive — i.e. a parent must drive to school.
function parentDrivingIntervals(driveData, minDate, maxDate) {
  if (driveData.length === 0) return [];

  const bounds = new Set();
  driveData.forEach((d) => {
    bounds.add(+d.enroll);
    bounds.add(+d.grad);
    bounds.add(+d.canDrive);
  });
  // School-session edges so slices sit cleanly inside/outside a session
  for (let y = minDate.getFullYear() - 1; y <= maxDate.getFullYear() + 1; y++) {
    bounds.add(+new Date(y, SCHOOL_START.month, SCHOOL_START.day));
    bounds.add(+new Date(y, SCHOOL_END.month, SCHOOL_END.day));
  }
  const times = [...bounds].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < times.length - 1; i++) {
    const start = times[i];
    const end = times[i + 1];
    const mid = (start + end) / 2;
    const needsRide = driveData.some((d) => +d.enroll <= mid && mid < +d.grad);
    const childDrives = driveData.some(
      (d) => +d.canDrive <= mid && mid < +d.grad,
    );
    const parentDrives =
      needsRide && !childDrives && inSchoolSession(new Date(mid));
    if (!parentDrives) continue;
    const last = segments[segments.length - 1];
    if (last && last.end === start) {
      last.end = end; // merge adjacent parent slices
    } else {
      segments.push({ start, end });
    }
  }

  return segments.map((seg) => ({
    start: new Date(seg.start),
    end: new Date(seg.end),
  }));
}

const INSURE_GROUP = 'insure';
const PARENT_DRIVERS = 2;
const INSURE_FROM = 16;
const INSURE_TO = 21;

// Discrete color per insured-driver count (6+ all purple)
const COUNT_COLORS = {
  2: '#94b7aa', // sage
  3: '#c4d3a3', // green
  4: '#edd18e', // ochre
  5: '#dfa98c', // terracotta
};
function countColor(count) {
  return COUNT_COLORS[count] || '#c7b2cc'; // purple for 6+
}

// Total insured drivers = 2 parents + any kid currently aged 16-21
function addInsuranceLane(items, kids, itemId, minDate, maxDate) {
  const windows = kids.map((k) => ({
    from: +addYears(k.dob, INSURE_FROM),
    to: +addYears(k.dob, INSURE_TO),
  }));

  const bounds = new Set([+minDate, +maxDate]);
  windows.forEach((w) => {
    bounds.add(w.from);
    bounds.add(w.to);
  });
  const times = [...bounds].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < times.length - 1; i++) {
    const start = times[i];
    const end = times[i + 1];
    const mid = (start + end) / 2;
    const count =
      PARENT_DRIVERS +
      windows.filter((w) => w.from <= mid && mid < w.to).length;
    const last = segments[segments.length - 1];
    if (last && last.count === count && last.end === start) {
      last.end = end;
    } else {
      segments.push({ start, end, count });
    }
  }

  segments.forEach((seg) => {
    const color = countColor(seg.count);
    items.add({
      id: itemId++,
      group: INSURE_GROUP,
      start: new Date(seg.start),
      end: new Date(seg.end),
      type: 'range',
      content: String(seg.count),
      className: 'insure-item',
      style: `background-color:${color}; border-color:${color}; color:#283d35;`,
      title: `${seg.count} insured drivers`,
    });
  });

  return itemId;
}

const RETIRE_AGE = 65;

function renderTimeline(kids, parents = []) {
  currentKids = kids;
  currentParents = parents;
  const groups = new DataSet([
    ...parents.map((p, i) => ({
      id: `parent-${i}`,
      content: escapeHtml(p.name),
      className: 'lane-parent',
    })),
    ...kids.map((kid, i) => ({ id: i, content: escapeHtml(kid.name) })),
    { id: INSURE_GROUP, content: 'Insured drivers' },
  ]);

  const items = new DataSet();
  let itemId = 0;

  let minDate = null;
  let maxDate = null;

  const startYear = nearestSchoolYearStart();
  const driveData = [];

  // Adult band for all kids runs until the youngest child turns 25
  const adultEnd = kids.reduce(
    (latest, k) =>
      addYears(k.dob, 25) > latest ? addYears(k.dob, 25) : latest,
    addYears(kids[0].dob, 25),
  );

  kids.forEach((kid, gi) => {
    const hasGrade = Number.isFinite(kid.grade);

    // Milestone dates when grade is known; otherwise fall back to plain ages
    let collegeStart, collegeEnd;
    if (hasGrade) {
      const gradYear = startYear + (12 - kid.grade) + 1; // grade-12 school year ends here
      collegeStart = new Date(gradYear, SCHOOL_START.month, SCHOOL_START.day); // fall after grad
      collegeEnd = new Date(gradYear + 4, SCHOOL_END.month, SCHOOL_END.day); // 4 yrs, end of spring
    } else {
      collegeStart = addYears(kid.dob, 18);
      collegeEnd = addYears(kid.dob, 21);
    }

    // [from, to, AGE_BANDS index]
    const drivingStart = addYears(kid.dob, 16);
    const childEnd = addYears(kid.dob, 13);
    // School starts at Kindergarten (mid-August of the K school year) when the
    // grade is known, else age 5. Clamp within [birth, age 13].
    const kStart0 = hasGrade
      ? new Date(startYear - kid.grade, SCHOOL_START.month, SCHOOL_START.day)
      : addYears(kid.dob, 5);
    const kStart = new Date(Math.min(Math.max(+kStart0, +kid.dob), +childEnd));
    const bands = [
      [addYears(kid.dob, 0), kStart, 0], // Pre-School
      [kStart, childEnd, 1], // Child - School
      [childEnd, addYears(kid.dob, 16), 2], // Teen
      [
        drivingStart,
        collegeStart > drivingStart ? collegeStart : addYears(kid.dob, 18),
        3,
      ], // Driving -> college start
      [collegeStart, collegeEnd, 4], // College
      [collegeEnd, adultEnd, 5], // Adult
    ];

    bands.forEach(([start, end, bi]) => {
      if (+end <= +start) return; // skip empty bands (e.g. no pre-school years)
      const [, , label, cls] = AGE_BANDS[bi];
      if (!minDate || start < minDate) minDate = start;
      if (!maxDate || end > maxDate) maxDate = end;
      items.add({
        id: itemId++,
        group: gi,
        start,
        end,
        type: 'range',
        content: label,
        className: cls,
        title: `${kid.name}: ${label}`,
      });
    });

    if (hasGrade) {
      // Kindergarten start: mid-August of the school year in which the kid is in grade 0
      const kYear = startYear - kid.grade;
      const kDate = new Date(kYear, SCHOOL_START.month, SCHOOL_START.day);
      if (!minDate || kDate < minDate) minDate = kDate;
      items.add({
        id: itemId++,
        group: gi,
        start: kDate,
        type: 'point',
        content: '✏️',
        className: 'k-event',
        title: `${kid.name} starts Kindergarten ~${kDate.toLocaleDateString()}`,
      });

      // HS graduation: end of the school year in which the kid is in grade 12
      const gradYear = startYear + (12 - kid.grade) + 1;
      const gradDate = new Date(gradYear, SCHOOL_END.month, SCHOOL_END.day);
      items.add({
        id: itemId++,
        group: gi,
        start: gradDate,
        type: 'point',
        content: '🎓',
        className: 'grad-event',
        title: `${kid.name} graduates high school ~${gradDate.toLocaleDateString()}`,
      });

      // Data for the driving lane: needs a ride while enrolled; can drive at 16 until own grad
      driveData.push({ enroll: kDate, grad: gradDate, canDrive: drivingStart });
    }
  });

  // School-in-session background bands (span all groups); stretches where a parent
  // must drive to school are recolored via the `parent-driving` class.
  schoolSessions(minDate, maxDate, driveData).forEach((s) =>
    items.add({ id: itemId++, ...s }),
  );

  itemId = addInsuranceLane(items, kids, itemId, minDate, maxDate);

  // Parent retirement (age 65) markers
  parents.forEach((p, i) => {
    const retire = addYears(p.dob, RETIRE_AGE);
    items.add({
      id: itemId++,
      group: `parent-${i}`,
      start: retire,
      type: 'point',
      content: `🏖️ Retires ${retire.getFullYear()}`,
      className: 'retire-event',
      title: `${p.name} turns ${RETIRE_AGE} ~${retire.toLocaleDateString()}`,
    });
  });

  // When both parents have retired (latest age-65 date), mark each child's age
  if (parents.length > 0) {
    const bothRetired = parents.reduce(
      (latest, p) =>
        addYears(p.dob, RETIRE_AGE) > latest
          ? addYears(p.dob, RETIRE_AGE)
          : latest,
      addYears(parents[0].dob, RETIRE_AGE),
    );
    kids.forEach((kid, gi) => {
      const age = ageAt(kid.dob, bothRetired);
      items.add({
        id: itemId++,
        group: gi,
        start: bothRetired,
        type: 'point',
        content: `Age ${age}`,
        className: 'retire-age-event',
        title: `${kid.name} is ${age} when both parents are retired (~${bothRetired.toLocaleDateString()})`,
      });
    });
  }

  // Default view spans every item (all kids' bands, K/grad markers, parent
  // retirement) with a small margin on each side.
  let dataMin = Infinity;
  let dataMax = -Infinity;
  items.forEach((it) => {
    const s = +new Date(it.start);
    const e = it.end ? +new Date(it.end) : s;
    if (s < dataMin) dataMin = s;
    if (e > dataMax) dataMax = e;
  });
  const pad = (dataMax - dataMin) * 0.03;

  const options = {
    stack: false,
    orientation: 'top',
    margin: { item: { horizontal: 0, vertical: 28 }, axis: 14 },
    zoomMin: 1000 * 60 * 60 * 24 * 30, // ~1 month
    onInitialDrawComplete: () => fitTimeline(),
    start: new Date(dataMin - pad),
    end: new Date(dataMax + pad),
  };

  timelineWrap.classList.remove('hidden');
  setupSection.classList.add('hidden');

  const container = document.getElementById('timeline');
  if (timeline) timeline.destroy();
  timeline = new Timeline(container, items, groups, options);

  document.getElementById('familySummary').textContent =
    `${kids.length} ${kids.length === 1 ? 'child' : 'children'} · ${parents.length} ${parents.length === 1 ? 'parent' : 'parents'} · A lifetime of possibilities.`;
  buildLegend();
  const yearSelect = document.getElementById('schoolYearSelect');
  const firstYear = Math.min(new Date(dataMin).getFullYear(), startYear);
  const lastYear = Math.max(new Date(dataMax).getFullYear(), startYear);
  yearSelect.innerHTML = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, i) => {
      const year = firstYear + i;
      return `<option value="${year}">${year}–${year + 1}</option>`;
    },
  ).join('');
  showSchoolYear(startYear);
  timeline.on('click', ({ time, what }) => {
    if (!time || what === 'group-label') return;
    showSchoolYear(schoolYearForDate(time));
    document.getElementById('schoolYearModal').showModal();
  });
}

function buildLegend() {
  legendEl.innerHTML =
    AGE_BANDS.map(
      ([, , label, cls]) => `<span class="legend-item ${cls}">${label}</span>`,
    ).join('') +
    `<span class="legend-item legend-school">School in session</span>` +
    `<span class="legend-item legend-driving">Parent must drive to school</span>`;
}

// Restore saved kids on load
const saved = loadKids();
if (saved) renderTimeline(saved, loadParents());
else buildKidForm();

document
  .getElementById('zoomIn')
  .addEventListener('click', () => timeline?.zoomIn(0.35));
document
  .getElementById('zoomOut')
  .addEventListener('click', () => timeline?.zoomOut(0.35));
document
  .getElementById('today')
  .addEventListener('click', () => timeline?.moveTo(new Date()));
// Reserve screen space for point labels, whose width does not shrink when
// zooming out. A percentage of the date range alone clips labels on phones.
function fitTimeline() {
  if (!timeline) return;
  timeline.fit({ animation: false });
  const container = document.getElementById('timeline');
  const width = container.querySelector('.vis-panel.vis-center')?.clientWidth;
  const labels = container.querySelectorAll(
    '.retire-event .vis-item-content, .retire-age-event .vis-item-content',
  );
  if (!width || !labels.length) return;

  const labelWidth = Math.max(...[...labels].map((label) => label.scrollWidth));
  const leftSpace = 16;
  const rightSpace = labelWidth + 32; // Point marker, label offset, and breathing room.
  const availableWidth = width - leftSpace - rightSpace;
  if (availableWidth <= 0) return;

  const { min, max } = timeline.getDataRange();
  if (!min || !max || +max <= +min) return;
  const timePerPixel = (+max - +min) / availableWidth;
  timeline.setWindow(
    new Date(+min - leftSpace * timePerPixel),
    new Date(+max + rightSpace * timePerPixel),
    { animation: false },
  );
}

document.getElementById('fit').addEventListener('click', fitTimeline);

function showSchoolYear(year) {
  const select = document.getElementById('schoolYearSelect');
  if (![...select.options].some((option) => Number(option.value) === year)) {
    select.add(new Option(`${year}–${year + 1}`, String(year)));
  }
  select.value = String(year);
  const rows = schoolYearDetails(currentKids, year, nearestSchoolYearStart());
  const drivers = rows.filter((kid) => kid.enrolled && kid.driver).length;
  const passengers = rows.filter((kid) => kid.enrolled && !kid.driver).length;
  const dateLabel = (date) =>
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  const start = new Date(year, SCHOOL_START.month, SCHOOL_START.day);
  const end = new Date(year + 1, SCHOOL_END.month, SCHOOL_END.day);
  document.getElementById('schoolYearTitle').textContent =
    `${year}–${year + 1} · Who’s riding with whom?`;
  document.getElementById('schoolYearDetails').innerHTML = `
    <div class="school-year-summary"><strong>${drivers} school-age ${drivers === 1 ? 'driver' : 'drivers'} <span>·</span> ${passengers} school ${passengers === 1 ? 'passenger' : 'passengers'}</strong><span>At the start of the year · ${dateLabel(start)}</span></div>
    <div class="school-year-table-wrap"><table class="school-year-table"><thead><tr><th scope="col">Child</th><th scope="col">Grade / stage</th><th scope="col">Driving &amp; passengers</th></tr></thead><tbody>
    ${rows.map((kid) => `<tr><th scope="row">${escapeHtml(kid.name)}</th><td>${kid.stage}</td><td><span class="ride-status ${kid.driver ? 'can-drive' : ''}">${!kid.born ? '—' : kid.driver ? 'Licence age · 16+' : kid.enrolled ? 'Passenger' : 'Under driving age'}</span><small>${kid.turns16 ? `Passenger → licence age on ${dateLabel(kid.birthday16)}` : kid.enrolled ? (kid.driver ? 'Can drive for the school run' : 'Needs a ride to school') : 'Outside the K–12 school run'}</small></td></tr>`).join('')}
    </tbody></table></div>
    <p class="school-year-note">${dateLabel(start)} – ${dateLabel(end)}. Driving assumes a licence at 16. School-run drivers count only children still in K–12; older siblings are shown separately in their own rows.</p>`;
}

document
  .getElementById('schoolYearSelect')
  .addEventListener('change', (event) => {
    showSchoolYear(Number(event.target.value));
  });

const schoolYearModal = document.getElementById('schoolYearModal');
document.getElementById('openSchoolYear').addEventListener('click', () => {
  schoolYearModal.showModal();
});
schoolYearModal.addEventListener('click', (event) => {
  if (event.target !== schoolYearModal) return;
  const bounds = schoolYearModal.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  ) {
    schoolYearModal.close();
  }
});
