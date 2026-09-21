from formatters import (
    format_arrestee_person,
    format_compiled_address,
    format_occurrence,
    format_custody_status,
    format_io,
    _arrested_parent,
)

NUM = 13
TABLE_NAME = 'excel_13arrested_24_hrs_list'
LABEL = 'Arrested - Last 24 Hrs'
COLUMNS = ['s_no', 'accused_details', 'firdd_no', 'us', 'police_station', 'name_of_io', 'remarks_pc_remand_formal_arrest_bail_etc', 'arrest_scheme']
COLUMN_LABELS = {
    's_no': 'S. No.',
    'accused_details': 'Accused (Name / Age / S/O / R/O Address)',
    'firdd_no': 'FIR / DD No.',
    'us': 'U/S (Act + Section)',
    'police_station': 'Police Station',
    'name_of_io': 'Name of IO (Rank / Name / PIS No.)',
    'remarks_pc_remand_formal_arrest_bail_etc': 'Custody status',
    'arrest_scheme': 'Arrest Scheme',
}


def filter_records(classified):
    return classified['arrests']


def map_row(r, idx):
    d = r['data']
    scheme = d.get('scheme_of_arrest') or d.get('arrest_scheme') or d.get('scheme_of_arrest_other') or ''
    return {
        's_no': idx + 1,
        'accused_details': format_arrestee_person(
            d.get('arrested_name'),
            d.get('age'),
            _arrested_parent(d),
            format_compiled_address(d.get('arrested_address') or d),
            d,
        ),
        'firdd_no': d.get('linked_fir_dd_no') or d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'police_station': r.get('ps_name') or '',
        'name_of_io': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
        'remarks_pc_remand_formal_arrest_bail_etc': format_custody_status(d.get('status') or d.get('custody_status')),
        'arrest_scheme': scheme,
    }
