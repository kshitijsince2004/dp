"""
Sheet 29: Arrest Count Summary (PS x Crime Head Person Arrest Count Matrix)
Calculates distinct person arrest counts grouped by Police Station and linked FIR Crime Head.
"""

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
    'ps': 'Police Station',
    'dacoity': 'Dacoity',
    'murder': 'Murder',
    'att_to_murder': 'Att. Murder',
    'robbery': 'Robbery',
    'riot': 'Riot',
    'kid_for_ransom': 'Kid. Ransom',
    'rape': 'Rape',
    'total_heinous': 'TOTAL HEINOUS',
    'extortion': 'Extortion',
    'snatching': 'Snatching',
    'hurt': 'Hurt',
    'burglary': 'Burglary',
    'house_theft': 'House Theft',
    'mv_theft': 'M.V. Theft',
    'servant_theft': 'Servant Theft',
    'other_theft': 'Other Theft',
    'mo_women': 'M.O. Women',
    'kidnapping': 'Kidnapping',
    'abduction': 'Abduction',
    'eve_teasing': 'Eve Teasing',
    'fatal_accident': 'Fatal Acc.',
    'simple_accident': 'Simple Acc.',
    'other_ipc': 'Other IPC/BNS',
    'total_non_heinous': 'TOTAL NON HEINOUS',
    'total_bns': 'TOTAL BNS',
    'arms_act': 'Arms Act',
    'ndps_act': 'NDPS Act',
    'excise_act': 'Excise Act',
    'gambling_act': 'Gambling Act',
    'pocso': 'POCSO Act',
    'other_act': 'Other Act',
    'total_act': 'TOTAL ACT',
    'grand_total': 'GRAND TOTAL',
}

HEINOUS_HEADS = {1: 'dacoity', 2: 'murder', 3: 'att_to_murder', 4: 'robbery', 5: 'riot', 6: 'kid_for_ransom', 7: 'rape'}
NON_HEINOUS_HEADS = {
    8: 'extortion', 9: 'snatching', 10: 'hurt', 11: 'hurt', 12: 'burglary', 13: 'burglary', 209: 'burglary', 210: 'burglary',
    18: 'house_theft', 16: 'mv_theft', 17: 'servant_theft', 19: 'other_theft', 28: 'mo_women', 29: 'kidnapping', 30: 'abduction',
    54: 'eve_teasing', 31: 'fatal_accident', 32: 'simple_accident', 99: 'other_ipc', 215: 'other_ipc'
}
ACT_HEADS = {
    51: 'arms_act', 52: 'excise_act', 53: 'ndps_act', 55: 'gambling_act', 56: 'pocso', 999: 'other_act'
}


def summarize(classified):
    arrests = classified.get('arrests', [])
    ps_map = {}

    for r in arrests:
        ps = r.get('ps_name') or 'UNKNOWN'
        if ps not in ps_map:
            ps_map[ps] = {col: 0 for col in COLUMNS if col != 'ps'}

        d = r.get('data', {})
        head_cd = d.get('local_head_id') or d.get('local_head_cd') or 99

        if head_cd in HEINOUS_HEADS:
            col = HEINOUS_HEADS[head_cd]
            ps_map[ps][col] += 1
            ps_map[ps]['total_heinous'] += 1
            ps_map[ps]['total_bns'] += 1
            ps_map[ps]['grand_total'] += 1
        elif head_cd in NON_HEINOUS_HEADS:
            col = NON_HEINOUS_HEADS[head_cd]
            ps_map[ps][col] += 1
            ps_map[ps]['total_non_heinous'] += 1
            ps_map[ps]['total_bns'] += 1
            ps_map[ps]['grand_total'] += 1
        elif head_cd in ACT_HEADS:
            col = ACT_HEADS[head_cd]
            ps_map[ps][col] += 1
            ps_map[ps]['total_act'] += 1
            ps_map[ps]['grand_total'] += 1
        else:
            ps_map[ps]['other_ipc'] += 1
            ps_map[ps]['total_non_heinous'] += 1
            ps_map[ps]['total_bns'] += 1
            ps_map[ps]['grand_total'] += 1

    rows = []
    tot_row = {col: 0 for col in COLUMNS if col != 'ps'}
    tot_row['ps'] = 'TOTAL'

    for ps in sorted(ps_map.keys()):
        row = {'ps': ps, **ps_map[ps]}
        rows.append(row)
        for col in tot_row:
            if col != 'ps':
                tot_row[col] += row[col]

    if rows:
        rows.append(tot_row)

    return rows
