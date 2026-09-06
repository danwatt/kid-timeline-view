// The timeline assumes driving eligibility at 16; it does not track actual licences.
export function schoolYearForDate(date) {
  const year = date.getFullYear();
  // Summer clicks select the upcoming school year.
  return date >= new Date(year, 4, 15) ? year : year - 1;
}

export function schoolYearDetails(kids, year, baseYear) {
  const start = new Date(year, 7, 15);
  const end = new Date(year + 1, 4, 15);
  return kids.map((kid) => {
    const birthday16 = new Date(kid.dob);
    birthday16.setFullYear(birthday16.getFullYear() + 16);
    const cutoff = new Date(baseYear, 8, 1);
    let cutoffAge = baseYear - kid.dob.getFullYear();
    if (cutoff < new Date(baseYear, kid.dob.getMonth(), kid.dob.getDate()))
      cutoffAge--;
    const grade =
      (Number.isFinite(kid.grade) ? kid.grade : cutoffAge - 5) +
      year -
      baseYear;
    const born = kid.dob <= start;
    const enrolled = born && grade >= 0 && grade <= 12;
    const driver = born && birthday16 <= start;
    const turns16 = birthday16 > start && birthday16 < end;
    const stage = !born
      ? kid.dob < end
        ? 'Born during this school year'
        : 'Not yet born'
      : grade < 0
        ? 'Pre-school'
        : grade === 0
          ? 'Kindergarten'
          : grade <= 12
            ? `Grade ${grade}`
            : grade <= 16
              ? `College · Year ${grade - 12}`
              : 'After college';
    return {
      name: kid.name,
      stage,
      enrolled,
      driver,
      turns16,
      birthday16,
      born,
    };
  });
}
