import { DataSet } from 'vis-data';
import { Timeline } from 'vis-timeline';
import 'vis-timeline/styles/vis-timeline-graph2d.css';

// Age band definitions: [startAge, endAge, label, cssClass]
const AGE_BANDS = [
  [0, 13, 'Child', 'band-0'],
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
  const data = parents.map((p) => ({ name: p.name, dob: p.dob ? p.dob.toISOString().slice(0, 10) : null }));
  localStorage.setItem(STORAGE_KEY_PARENTS, JSON.stringify(data));
}

function loadParents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PARENTS);
    if (!raw) return [];
    return JSON.parse(raw).map((p) => ({ name: p.name, dob: p.dob ? new Date(p.dob + 'T00:00:00') : null }));
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

// Build the per-parent and per-kid inputs, optionally prefilled
function buildKidForm(prefill = [], prefillParents = []) {
  const n = Math.max(1, Math.min(12, parseInt(countInput.value, 10) || 1));
  const startYear = nearestSchoolYearStart();
  const startDateLabel = new Date(startYear, SCHOOL_START.month, SCHOOL_START.day).toLocaleDateString(
    undefined,
    { month: 'long', day: 'numeric', year: 'numeric' }
  );

  const parentRows = [0, 1]
    .map((i) => {
      const p = prefillParents[i];
      const name = p ? p.name : `Parent ${i + 1}`;
      const dob = p && p.dob ? p.dob.toISOString().slice(0, 10) : '';
      return `
      <div class="kid-row">
        <input type="text" class="parent-name" placeholder="Parent ${i + 1} name" value="${name}" />
        <input type="date" class="parent-dob" value="${dob}" />
      </div>`;
    })
    .join('');

  kidInputs.innerHTML = `
    <p class="section-label">Parents (optional — for retirement markers)</p>
    ${parentRows}
    <p class="section-label">Children</p>
    <p class="grade-hint">Grade each child is entering for the <strong>${startYear}-${startYear + 1}</strong> school year (starting ${startDateLabel}). Use 0 for Kindergarten, and negative values for kids not yet started (e.g. -1 starts K next year).</p>
  `;
  for (let i = 0; i < n; i++) {
    const k = prefill[i];
    const name = k ? k.name : `Child ${i + 1}`;
    const dob = k ? k.dob.toISOString().slice(0, 10) : '';
    const grade = k && Number.isFinite(k.grade) ? k.grade : '';
    const row = document.createElement('div');
    row.className = 'kid-row';
    row.innerHTML = `
      <input type="text" class="kid-name" placeholder="Child ${i + 1} name" value="${name}" required />
      <input type="date" class="kid-dob" value="${dob}" required />
      <input type="number" class="kid-grade" min="-5" max="12" placeholder="Grade" value="${grade}" required />
    `;
    kidInputs.appendChild(row);
  }
  kidsForm.classList.remove('hidden');
}

buildFormBtn.addEventListener('click', () => buildKidForm());

editBtn.addEventListener('click', () => {
  countInput.value = currentKids.length || countInput.value;
  timelineWrap.classList.add('hidden');
  setupSection.classList.remove('hidden');
  buildKidForm(currentKids, currentParents);
});

kidsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const names = [...document.querySelectorAll('.kid-name')].map((el) => el.value.trim());
  const dobs = [...document.querySelectorAll('.kid-dob')].map((el) => el.value);
  const grades = [...document.querySelectorAll('.kid-grade')].map((el) => parseInt(el.value, 10));
  const kids = names.map((name, i) => ({
    name,
    dob: new Date(dobs[i] + 'T00:00:00'),
    grade: grades[i],
  }));

  const pNames = [...document.querySelectorAll('.parent-name')].map((el) => el.value.trim());
  const pDobs = [...document.querySelectorAll('.parent-dob')].map((el) => el.value);
  const parents = pNames
    .map((name, i) => ({ name: name || `Parent ${i + 1}`, dob: pDobs[i] ? new Date(pDobs[i] + 'T00:00:00') : null }))
    .filter((p) => p.dob);

  saveKids(kids);
  saveParents(parents);
  renderTimeline(kids, parents);
});

resetBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  timelineWrap.classList.add('hidden');
  setupSection.classList.remove('hidden');
});

function schoolSessions(minDate, maxDate, enrollWindows) {
  // Emit a background item only for school years where a kid is enrolled in K-12
  const items = [];
  const firstYear = minDate.getFullYear() - 1;
  const lastYear = maxDate.getFullYear() + 1;
  for (let y = firstYear; y <= lastYear; y++) {
    const start = new Date(y, SCHOOL_START.month, SCHOOL_START.day);
    const end = new Date(y + 1, SCHOOL_END.month, SCHOOL_END.day);
    const anyEnrolled = enrollWindows.some((w) => w.enroll < end && w.grad > start);
    if (!anyEnrolled) continue;
    items.push({
      start,
      end,
      type: 'background',
      className: 'school-session',
      content: '',
    });
  }
  return items;
}

const DRIVE_GROUP = 'drive';

// Is the date within a school session (mid-Aug to mid-May)? Summer = not in session.
function inSchoolSession(date) {
  const m = date.getMonth();
  const d = date.getDate();
  const afterStart = m > SCHOOL_START.month || (m === SCHOOL_START.month && d >= SCHOOL_START.day);
  const beforeEnd = m < SCHOOL_END.month || (m === SCHOOL_END.month && d <= SCHOOL_END.day);
  return afterStart || beforeEnd;
}

// Build the bottom lane: emit "Parent driver" ranges only during school sessions when a
// ride is needed and no child is old enough. Gaps imply a kid can drive.
function addDriveLane(items, driveData, itemId, minDate, maxDate) {
  if (driveData.length === 0) return itemId;

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
    const childDrives = driveData.some((d) => +d.canDrive <= mid && mid < +d.grad);
    const parentDrives = needsRide && !childDrives && inSchoolSession(new Date(mid));
    if (!parentDrives) continue;
    const last = segments[segments.length - 1];
    if (last && last.end === start) {
      last.end = end; // merge adjacent parent slices
    } else {
      segments.push({ start, end });
    }
  }

  segments.forEach((seg) => {
    items.add({
      id: itemId++,
      group: DRIVE_GROUP,
      start: new Date(seg.start),
      end: new Date(seg.end),
      type: 'range',
      content: 'Parent driver',
      className: 'drive-parent',
      title: 'No child old enough — parent must drive to school',
    });
  });

  return itemId;
}

const INSURE_GROUP = 'insure';
const PARENT_DRIVERS = 2;
const INSURE_FROM = 16;
const INSURE_TO = 21;

// Discrete color per insured-driver count (6+ all purple)
const COUNT_COLORS = {
  2: '#2f6fed', // blue
  3: '#5cb85c', // green
  4: '#f0c419', // yellow
  5: '#ef8354', // orange
};
function countColor(count) {
  return COUNT_COLORS[count] || '#8e44ad'; // purple for 6+
}

// Total insured drivers = 2 parents + any kid currently aged 16-21
function addInsuranceLane(items, kids, itemId, minDate, maxDate) {
  const windows = kids.map((k) => ({ from: +addYears(k.dob, INSURE_FROM), to: +addYears(k.dob, INSURE_TO) }));

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
    const count = PARENT_DRIVERS + windows.filter((w) => w.from <= mid && mid < w.to).length;
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
      style: `background-color:${color}; border-color:${color}; color:#fff;`,
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
    ...parents.map((p, i) => ({ id: `parent-${i}`, content: p.name })),
    ...kids.map((kid, i) => ({ id: i, content: kid.name })),
    { id: DRIVE_GROUP, content: 'Driving to school' },
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
    (latest, k) => (addYears(k.dob, 25) > latest ? addYears(k.dob, 25) : latest),
    addYears(kids[0].dob, 25)
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
    const bands = [
      [addYears(kid.dob, 0), addYears(kid.dob, 13), 0], // Child
      [addYears(kid.dob, 13), addYears(kid.dob, 16), 1], // Teen
      [drivingStart, collegeStart > drivingStart ? collegeStart : addYears(kid.dob, 18), 2], // Driving -> college start
      [collegeStart, collegeEnd, 3], // College
      [collegeEnd, adultEnd, 4], // Adult
    ];

    bands.forEach(([start, end, bi]) => {
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
        content: `✏️ Starts K ${kYear}`,
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
        content: `🎓 HS Grad ${gradYear}`,
        className: 'grad-event',
        title: `${kid.name} graduates high school ~${gradDate.toLocaleDateString()}`,
      });

      // Data for the driving lane: needs a ride while enrolled; can drive at 16 until own grad
      driveData.push({ enroll: kDate, grad: gradDate, canDrive: drivingStart });
    }
  });

  // School-in-session background bands (span all groups)
  schoolSessions(minDate, maxDate, driveData).forEach((s) => items.add({ id: itemId++, ...s }));

  // Bottom "Driving to school" lane
  itemId = addDriveLane(items, driveData, itemId, minDate, maxDate);
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
      (latest, p) => (addYears(p.dob, RETIRE_AGE) > latest ? addYears(p.dob, RETIRE_AGE) : latest),
      addYears(parents[0].dob, RETIRE_AGE)
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

  const options = {
    stack: false,
    orientation: 'top',
    margin: { item: 6, axis: 8 },
    zoomMin: 1000 * 60 * 60 * 24 * 30, // ~1 month
    start: new Date(),
    end: addYears(new Date(), 6),
  };

  timelineWrap.classList.remove('hidden');
  setupSection.classList.add('hidden');

  const container = document.getElementById('timeline');
  if (timeline) timeline.destroy();
  timeline = new Timeline(container, items, groups, options);

  buildLegend();
}

function buildLegend() {
  legendEl.innerHTML =
    AGE_BANDS.map(([, , label, cls]) => `<span class="legend-item ${cls}">${label}</span>`).join('') +
    `<span class="legend-item legend-school">School in session</span>` +
    `<span class="legend-item drive-parent">Parent driver (gaps = kid can drive)</span>`;
}

// Restore saved kids on load
const saved = loadKids();
if (saved) renderTimeline(saved, loadParents());
