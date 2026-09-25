from formatters import format_person, _arrested_parent

NUM = 13
TABLE_NAME = 'excel_13arrested_24_hrs_list'
LABEL = 'Arrested - Last 24 Hrs'
COLUMNS = ['s_no', 'accused_details', 'firdd_no', 'us', 'police_station', 'name_of_io', 'rank_of_io', 'mobile_no_of_io', 'remarks_pc_remand_formal_arrest_bail_etc']
COLUMN_LABELS = {
    'police_station': 'Police Station',
    'remarks_pc_remand_formal_arrest_bail_etc': 'Remarks (PC Remand / Formal Arrest / Bail etc.)',
}


def filter_records(classified):
    return classified['arrests']


def map_row(r, idx):
    d = r['data']
    return {
        's_no': idx + 1,
        'accused_details': format_person(
            d.get('arrested_name'), d.get('age'),
            _arrested_parent(d),
            d.get('arrested_address'), d,
        ),
        'firdd_no': d.get('linked_fir_dd_no') or d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'police_station': r.get('ps_name') or '',
        'name_of_io': d.get('io_name') or '',
        'rank_of_io': d.get('io_rank') or d.get('rank_of_io') or '',
        'mobile_no_of_io': d.get('io_mobile') or '',
        'remarks_pc_remand_formal_arrest_bail_etc': d.get('status') or 'JC',
    }
