from classifiers import is_preventive_arrest
from formatters import (
    format_arrestee_person,
    format_compiled_address,
    format_custody_status,
    format_accused_history,
    format_recovery,
    format_io,
    _arrested_parent,
)

NUM = 8
TABLE_NAME = 'excel_8arrested_kalandara'
LABEL = 'Arrested - Kalandara / Preventive'
COLUMNS = ['sn', 'fir_no', 'us', 'accused_details', 'place_of_occurrence', 'io', 'pcjcbail', 'accused_history', 'recovery', 'arrest_scheme']
COLUMN_LABELS = {
    'sn': 'S.N.',
    'fir_no': 'FIR No.',
    'us': 'U/S (Act + Section)',
    'accused_details': 'Accused (Name / Age / S/O / R/O Address)',
    'place_of_occurrence': 'Place of Occurrence (House No. / Street / Colony / Village / City / Tehsil / Landmark / District)',
    'io': 'Name of IO (Rank / Name / PIS No.)',
    'pcjcbail': 'Custody Status (PC / JC / Bail)',
    'accused_history': 'Accused History (BC / PO / Prev. Cases)',
    'recovery': 'Recovery(Details of property recovered)',
    'arrest_scheme': 'Arrest Scheme (Patrolling / Prahari / Anti-Snatching)',
}


def filter_records(classified):
    return [r for r in classified['arrests'] if is_preventive_arrest(r['data'])]


def map_row(r, idx):
    d = r['data']
    scheme = d.get('scheme_of_arrest') or d.get('arrest_scheme') or d.get('scheme_of_arrest_other') or ''
    return {
        'sn': idx + 1,
        'fir_no': d.get('linked_fir_dd_no') or d.get('fir_no') or '',
        'us': d.get('sections') or '',
        'accused_details': format_arrestee_person(
            d.get('arrested_name'),
            d.get('age'),
            _arrested_parent(d),
            format_compiled_address(d.get('arrested_address') or d),
            d,
        ),
        'place_of_occurrence': format_compiled_address(d.get('arrest_place') or d),
        'io': format_io(d.get('io_name'), d.get('io_rank'), d.get('io_pis')),
        'pcjcbail': format_custody_status(d.get('status') or d.get('custody_status')),
        'accused_history': format_accused_history(d),
        'recovery': format_recovery(d.get('recovery') or d.get('recovered_property') or d.get('stolen_properties')),
        'arrest_scheme': scheme,
    }
