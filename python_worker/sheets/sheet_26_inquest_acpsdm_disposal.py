from formatters import format_person, fmt_date

NUM = 26
TABLE_NAME = 'excel_26inquest_acpsdm_disposal'
LABEL = 'Inquest ACP/SDM Disposal'
COLUMNS = ['sno', 'dd_no', 'date', 'us', 'deceased_details', 'sex', 'cause_of_death', 'date_of_filed_by_acpsdm']
COLUMN_LABELS = {'date_of_filed_by_acpsdm': 'Date Filed by ACP/SDM'}


def filter_records(classified):
    # UIDB records filed by ACP/SDM are disposed inquest cases
    return [r for r in classified['uidb'] if r['data'].get('filed_by_acp_sdm')]


def map_row(r, idx):
    d = r['data']
    updated_at = (r.get('updated_at') or '')
    disposal_date = d.get('filed_date') or (updated_at.split('T')[0] if 'T' in str(updated_at) else str(updated_at))
    return {
        'sno': idx + 1,
        'dd_no': d.get('gd_no') or d.get('dd_no') or '',
        'date': fmt_date(d.get('gd_date') or r.get('record_date')),
        'us': d.get('inquest_sections') or d.get('sections') or '',
        'deceased_details': format_person(
            d.get('deceased_name') or d.get('person_name'),
            d.get('age'),
            d.get('deceased_father_husband_name'),
            d.get('deceased_address'),
            d,
        ),
        'sex': d.get('gender') or d.get('sex') or '',
        'cause_of_death': d.get('cause_of_death') or '',
        'date_of_filed_by_acpsdm': fmt_date(disposal_date),
    }
