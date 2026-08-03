export function renderStat24(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_24') || workbook.getWorksheet('STAT 24') || workbook.getWorksheet('STAT24');
  if (!ws) return;

  // Template STAT_24 = MISSING PERSONS/CHILDREN
  // Columns: B=Missing FN Male, C=Missing FN Female, D=Missing Upto Male, E=Missing Upto Female,
  //          F=Traced FN Male, G=Traced FN Female, H=Traced Upto Male, I=Traced Upto Female,
  //          J=Pending FN Male (formula), K=Pending FN Female (formula), L-M=Pending Upto (formula)
  // Rows 6-10 = age groups (Upto 8 yrs, 8-12, 12-16, 16-18, Above 18); Row 11 = TOTAL
  //
  // DB schema: missing_details has missing_type ('Missing'/'Found') and missing_status
  // ('Traced'/'Un-traced'/'Referred'/'Closed') but NO gender or age — only aggregate totals available.
  const rows   = calcData.missingRowsY  || [];
  const rowsY1 = calcData.missingRowsY1 || [];

  let missingFnY = 0, tracedFnY = 0;
  for (const r of rows) {
    if (r.missing_type === 'Missing') {
      missingFnY += Number(r.cnt);
      if (r.missing_status === 'Traced') tracedFnY += Number(r.cnt);
    }
  }

  let missingFnY1 = 0, tracedFnY1 = 0;
  for (const r of rowsY1) {
    if (r.missing_type === 'Missing') {
      missingFnY1 += Number(r.cnt);
      if (r.missing_status === 'Traced') tracedFnY1 += Number(r.cnt);
    }
  }

  // Fill TOTAL row (row 11) — gender split not available, all in Male column
  ws.getCell('B11').value = missingFnY;
  ws.getCell('C11').value = missingFnY1;
  ws.getCell('F11').value = tracedFnY;
  ws.getCell('G11').value = tracedFnY1;
}
