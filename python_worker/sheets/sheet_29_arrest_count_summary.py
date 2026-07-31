"""Sheet 29: Arrest Count Summary (PS x Crime Head matrix using canonical_code)."""

NUM = 29
TABLE_NAME = 'excel_29arrest_count_summary'
LABEL = 'Arrest Count Summary'
COLUMNS = [
    'ps', 'dacoity', 'murder', 'att_to_murder', 'robbery', 'riot', 'kid_for_ransom', 'rape', 'total_heinous',
    'extortion', 'snatching', 'hurt', 'burglary', 'house_theft', 'mv_theft', 'servant_theft', 'other_theft',
    'mo_women', 'kidnapping', 'abduction', 'eve_teasing', 'fatal_accident', 'simple_accident', 'other_ipc',
    'total_non_heinous', 'total_bns', 'arms_act', 'ndps_act', 'excise_act', 'gambling_act', 'pocso', 'other_act',
    'total_act', 'grand_total'
]

COLUMN_LABELS = {
    'ps': 'Police Station', 'dacoity': 'Dacoity', 'murder': 'Murder', 'att_to_murder': 'Att. Murder',
    'robbery': 'Robbery', 'riot': 'Riot', 'kid_for_ransom': 'Kid. Ransom', 'rape': 'Rape',
    'total_heinous': 'TOTAL HEINOUS', 'extortion': 'Extortion', 'snatching': 'Snatching', 'hurt': 'Hurt',
    'burglary': 'Burglary', 'house_theft': 'House Theft', 'mv_theft': 'M.V. Theft',
    'servant_theft': 'Servant Theft', 'other_theft': 'Other Theft', 'mo_women': 'M.O. Women',
    'kidnapping': 'Kidnapping', 'abduction': 'Abduction', 'eve_teasing': 'Eve Teasing',
    'fatal_accident': 'Fatal Acc.', 'simple_accident': 'Simple Acc.', 'other_ipc': 'Other IPC/BNS',
    'total_non_heinous': 'TOTAL NON HEINOUS', 'total_bns': 'TOTAL BNS', 'arms_act': 'Arms Act',
    'ndps_act': 'NDPS Act', 'excise_act': 'Excise Act', 'gambling_act': 'Gambling Act',
    'pocso': 'POCSO Act', 'other_act': 'Other Act', 'total_act': 'TOTAL ACT', 'grand_total': 'GRAND TOTAL',
}

# canonical_code → column name
_CODE_COL = {
    'DACOITY': 'dacoity', 'MURDER': 'murder', 'ATT_TO_MURDER': 'att_to_murder',
    'ROBBERY': 'robbery', 'RIOT': 'riot', 'KID_FOR_RANSOM': 'kid_for_ransom', 'RAPE': 'rape',
    'EXTORTION': 'extortion', 'SNATCHING': 'snatching', 'HURT': 'hurt',
    'BURGLARY': 'burglary', 'HOUSE_THEFT': 'house_theft', 'MV_THEFT': 'mv_theft',
    'SERVANT_THEFT': 'servant_theft', 'OTHER_THEFT': 'other_theft', 'MO_WOMEN': 'mo_women',
    'KIDNAPPING': 'kidnapping', 'ABDUCTION': 'abduction', 'EVE_TEASING': 'eve_teasing',
    'FATAL_ACCIDENT': 'fatal_accident', 'SIMPLE_ACCIDENT': 'simple_accident',
    'ARMS_ACT': 'arms_act', 'NDPS_ACT': 'ndps_act', 'EXCISE_ACT': 'excise_act',
    'GAMBLING_ACT': 'gambling_act', 'POCSO': 'pocso',
}

_HEINOUS = {'dacoity', 'murder', 'att_to_murder', 'robbery', 'riot', 'kid_for_ransom', 'rape'}
_ACT     = {'arms_act', 'ndps_act', 'excise_act', 'gambling_act', 'pocso', 'other_act'}


def summarize(classified):
    arrests = classified.get('arrests', [])
    ps_map = {}

    for r in arrests:
        ps = r.get('ps_name') or 'UNKNOWN'
        if ps not in ps_map:
            ps_map[ps] = {col: 0 for col in COLUMNS if col != 'ps'}

        d = r.get('data', {})
        code = (d.get('canonical_code') or '').upper()
        col = _CODE_COL.get(code)

        if col is None:
            # fall back to text matching for seeded data without canonical_code
            lh = (d.get('local_head') or '').lower()
            if 'dacoity' in lh:      col = 'dacoity'
            elif 'murder' in lh:     col = 'murder'
            elif 'robbery' in lh:    col = 'robbery'
            elif 'snatching' in lh:  col = 'snatching'
            elif 'burglary' in lh:   col = 'burglary'
            elif 'house theft' in lh:col = 'house_theft'
            elif 'm.v. theft' in lh or 'mv theft' in lh: col = 'mv_theft'
            elif 'theft' in lh:      col = 'other_theft'
            elif 'rape' in lh:       col = 'rape'
            elif 'kidnap' in lh:     col = 'kidnapping'
            elif 'ndps' in lh:       col = 'ndps_act'
            elif 'arms' in lh:       col = 'arms_act'
            elif 'pocso' in lh:      col = 'pocso'
            else:                    col = 'other_ipc'

        ps_map[ps][col] = ps_map[ps].get(col, 0) + 1

        if col in _HEINOUS:
            ps_map[ps]['total_heinous'] += 1
            ps_map[ps]['total_bns']     += 1
        elif col in _ACT:
            ps_map[ps]['total_act']     += 1
        else:
            ps_map[ps]['total_non_heinous'] += 1
            ps_map[ps]['total_bns']         += 1

        ps_map[ps]['grand_total'] += 1

    rows = []
    tot_row = {col: 0 for col in COLUMNS if col != 'ps'}
    tot_row['ps'] = 'TOTAL'

    for ps in sorted(ps_map.keys()):
        row = {'ps': ps, **ps_map[ps]}
        rows.append(row)
        for col in tot_row:
            if col != 'ps':
                tot_row[col] = tot_row.get(col, 0) + row.get(col, 0)

    if rows:
        rows.append(tot_row)

    return rows
