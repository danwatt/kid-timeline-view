import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolYearForDate, schoolYearDetails } from '../src/school-year.js';
const kid = (dob, grade) => ({
  name: 'Child',
  dob: new Date(dob + 'T00:00:00'),
  grade,
});
test('fall and spring share a school year; summer selects upcoming year', () => {
  assert.equal(schoolYearForDate(new Date(2030, 8, 1)), 2030);
  assert.equal(schoolYearForDate(new Date(2031, 1, 1)), 2030);
  assert.equal(schoolYearForDate(new Date(2031, 6, 1)), 2031);
});
test('manual grades progress relative to timeline base year', () => {
  const [row] = schoolYearDetails([kid('2015-01-01', 4)], 2029, 2027);
  assert.equal(row.stage, 'Grade 6');
  assert.equal(row.enrolled, true);
  assert.equal(row.driver, false);
});
test('16th birthday at start, during year, and in summer', () => {
  const rows = schoolYearDetails(
    [kid('2014-08-15', 10), kid('2015-02-10', 10), kid('2015-06-10', 10)],
    2030,
    2030,
  );
  assert.equal(rows[0].driver, true);
  assert.equal(rows[0].turns16, false);
  assert.equal(rows[1].driver, false);
  assert.equal(rows[1].turns16, true);
  assert.equal(rows[2].turns16, false);
});
test('every child has a stage, including before birth and after school', () => {
  const rows = schoolYearDetails(
    [
      kid('2032-01-01', -7),
      kid('2027-01-01', -2),
      kid('2025-01-01', 0),
      kid('2010-01-01', 13),
      kid('2006-01-01', 17),
    ],
    2030,
    2030,
  );
  assert.deepEqual(
    rows.map((r) => r.stage),
    [
      'Not yet born',
      'Pre-school',
      'Kindergarten',
      'College · Year 1',
      'After college',
    ],
  );
  assert.equal(rows[3].driver, true);
  assert.equal(rows[3].enrolled, false);
});
test('missing grades use September 1 kindergarten cutoff', () => {
  const rows = schoolYearDetails(
    [kid('2025-09-01'), kid('2025-09-02')],
    2030,
    2030,
  );
  assert.deepEqual(
    rows.map((r) => r.stage),
    ['Kindergarten', 'Pre-school'],
  );
});
