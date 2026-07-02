import ExcelJS from 'exceljs';
import path from 'path';

const CUSTOM_HINTS = {
  fir_no: "e.g. FIR-220/2026",
  fir_date: "YYYY-MM-DD",
  disposal_type: "select: Challan, Untrace, Cancel",
  district: "e.g. New Delhi District (NDD)",
  police_station: "e.g. Parliament Street",
  local_head: "e.g. Theft / Larceny",
  case_type: "select: cctns(manual FIR), eTheft, eMVT, NCRP, zero FIR",
  beat_number: "e.g. Beat No. 4",
  occurrence_date: "date (YYYY-MM-DD)",
  occurrence_time: "time (HH:MM)",
  brief_facts: "Incident narrative",
  status: "e.g. Under investigation",
  
  complainant_first_name: "First Name",
  complainant_middle_name: "Middle Name",
  complainant_last_name: "Last Name",
  complainant_nickname: "Nickname or alias",
  complainant_gender: "select: Male, Female, Transgender, Unknown",
  complainant_marital_status: "select: Married, Unmarried, Divorced, Widowed, Single, Unknown",
  complainant_relation_type: "select: Father, Mother, Husband, Wife, Guardian, Other",
  complainant_relative_name: "Father's or Husband's Name",
  complainant_mobile_country_code: "e.g. +91",
  complainant_mobile: "10-digit mobile number",
  complainant_qualification: "select: Uneducated, 10th, 10+2, Graduate, Post-Graduate",
  complainant_dob: "date (YYYY-MM-DD)",
  complainant_age_year: "Age in years",
  complainant_birth_year: "e.g. 1995",
  complainant_house_no: "House Number",
  complainant_street: "Street name",
  complainant_colony: "Colony name",
  complainant_city_town_village: "Village/City",
  complainant_tehsil_block_mandal: "Tehsil",
  complainant_present_address: "Full residential address",
  complainant_country: "select: Indian, Nepalese, Bhutanese, Bangladeshi, Pakistani, Sri Lankan, Afghan, Myanmar, Tibetan, American, British, Canadian, Other",
  complainant_state: "select: Andhra Pradesh, Arunachal Pradesh, Assam, Bihar, Chhattisgarh, Delhi, Goa, Gujarat, Haryana, Himachal Pradesh, Jammu & Kashmir, Jharkhand, Karnataka, Kerala, Ladakh, Madhya Pradesh, Maharashtra, Manipur, Meghalaya, Mizoram, Nagaland, Odisha, Puducherry, Punjab, Rajasthan, Sikkim, Tamil Nadu, Telangana, Tripura, Uttar Pradesh, Uttarakhand, West Bengal, Other UT/State",
  complainant_district: "select: South District (SD), South East District (SED), New Delhi District (NDD), South West District (SWD), West District (WD), Outer District (OD), Dwarka District (DW), North West District (NWD), Rohini District (RND), Outer North District (OND), Central District (CD), North District (ND), East District (ED), North East District (NED), Shahdara District (SHD)",
  complainant_police_station: "Police Station",
  complainant_pincode: "6-digit PIN code",
  complainant_perm_same: "boolean",
  complainant_perm_house_no: "House Number",
  complainant_perm_street: "Street name",
  complainant_perm_colony: "Colony name",
  complainant_perm_city_town_village: "Village/City",
  complainant_perm_tehsil_block_mandal: "Tehsil",
  complainant_perm_country: "select: Indian, Nepalese, Bhutanese, Bangladeshi, Pakistani, Sri Lankan, Afghan, Myanmar, Tibetan, American, British, Canadian, Other",
  complainant_perm_state: "select: Andhra Pradesh, Arunachal Pradesh, Assam, Bihar, Chhattisgarh, Delhi, Goa, Gujarat, Haryana, Himachal Pradesh, Jammu & Kashmir, Jharkhand, Karnataka, Kerala, Ladakh, Madhya Pradesh, Maharashtra, Manipur, Meghalaya, Mizoram, Nagaland, Odisha, Puducherry, Punjab, Rajasthan, Sikkim, Tamil Nadu, Telangana, Tripura, Uttar Pradesh, Uttarakhand, West Bengal, Other UT/State",
  complainant_perm_district: "select: South District (SD), South East District (SED), New Delhi District (NDD), South West District (SWD), West District (WD), Outer District (OD), Dwarka District (DW), North West District (NWD), Rohini District (RND), Outer North District (OND), Central District (CD), North District (ND), East District (ED), North East District (NED), Shahdara District (SHD)",
  complainant_perm_police_station: "Police Station",
  complainant_perm_pincode: "6-digit PIN code",
  
  occurrence_house_no: "House Number",
  occurrence_street: "Street name",
  occurrence_colony: "Colony name",
  occurrence_city_town_village: "Village/City",
  occurrence_tehsil_block_mandal: "Tehsil",
  occurrence_country: "select: Indian, Nepalese, Bhutanese, Bangladeshi, Pakistani, Sri Lankan, Afghan, Myanmar, Tibetan, American, British, Canadian, Other",
  occurrence_state: "select: Andhra Pradesh, Arunachal Pradesh, Assam, Bihar, Chhattisgarh, Delhi, Goa, Gujarat, Haryana, Himachal Pradesh, Jammu & Kashmir, Jharkhand, Karnataka, Kerala, Ladakh, Madhya Pradesh, Maharashtra, Manipur, Meghalaya, Mizoram, Nagaland, Odisha, Puducherry, Punjab, Rajasthan, Sikkim, Tamil Nadu, Telangana, Tripura, Uttar Pradesh, Uttarakhand, West Bengal, Other UT/State",
  occurrence_district: "select: South District (SD), South East District (SED), New Delhi District (NDD), South West District (SWD), West District (WD), Outer District (OD), Dwarka District (DW), North West District (NWD), Rohini District (RND), Outer North District (OND), Central District (CD), North District (ND), East District (ED), North East District (NED), Shahdara District (SHD)",
  occurrence_police_station: "Police Station",
  occurrence_pincode: "6-digit PIN code",
  
  io_name: "e.g. Inspector Ravindra Singh",
  io_pis: "PIS Number",
  io_rank: "select: Constable, Head Constable, Assistant Sub Inspector, Sub Inspector, Inspector, Deputy Superintendent of Police, Superintendent of Police",
  io_mobile: "10-digit mobile number",
};

async function main() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.resolve('../CASE_Import_Template_Final.xlsx');
  console.log('Reading template:', filePath);
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.getWorksheet('General Information');
  if (!worksheet) {
    console.log('General Information sheet not found!');
    return;
  }

  const row1 = worksheet.getRow(1);
  const row3 = worksheet.getRow(3);
  const row4 = worksheet.getRow(4);

  const totalCols = Math.max(row1.cellCount, row3.cellCount);
  console.log(`Analyzing General Information columns... Total: ${totalCols}`);

  for (let c = 1; c <= totalCols; c++) {
    const key = row1.getCell(c).value ? String(row1.getCell(c).value).trim() : '';
    const label = row3.getCell(c).value ? String(row3.getCell(c).value).trim() : '';
    const oldHint = row4.getCell(c).value ? String(row4.getCell(c).value).trim() : '';

    if (!key && !label) continue;

    if (CUSTOM_HINTS[key]) {
      const newHint = CUSTOM_HINTS[key];
      if (oldHint !== newHint) {
        console.log(`Aligning Col ${c}: "${label}" (Key: "${key}")`);
        console.log(`  Old Hint: "${oldHint}"`);
        console.log(`  New Hint: "${newHint}"`);
        row4.getCell(c).value = newHint;
      }
    }
  }

  console.log('Saving modified template...');
  await workbook.xlsx.writeFile(filePath);
  console.log('Success! Template modified and saved.');
}

main().catch(console.error);
