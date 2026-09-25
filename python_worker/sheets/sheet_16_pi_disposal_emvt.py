from classifiers import is_mvt, is_disposed
from formatters import fmt_date

NUM = 16
TABLE_NAME = 'excel_16pi_disposal_emvt'
LABEL = 'PI Disposal - E-MVT'
COLUMNS = ['s_no', 'fir_no', 'date', 'us', 'rc', 'challan_untrace_cancel']
COLUMN_LABELS = {'rc': 'RC No.'}


def filter_records(classified):
    return [r for r in classified['cases'] if is_mvt(r['data']) and is_disposed(r['data'])]


def map_row(r, idx):
    d = r['data']
    return {
        's_no': idx + 1,
        'fir_no': d.get('fir_no') or '',
        'date': fmt_date(d.get('fir_date') or r.get('record_date')),
        'us': d.get('sections') or '',
        'rc': d.get('rc_no') or 'RC-1',
        'challan_untrace_cancel': d.get('disposal_type') or 'Challan',
    }
