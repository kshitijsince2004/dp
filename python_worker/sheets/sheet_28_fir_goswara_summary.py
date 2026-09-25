from classifiers import is_burglary, is_house_theft, is_other_theft, is_mvt, is_electronic_case

NUM = 28
TABLE_NAME = 'excel_28fir_goswara_summary'
LABEL = 'FIR Goswara Summary'
COLUMNS = ['district', 'manual_fir', 'theft_efir', 'house_theft_efir', 'burglary_efir', 'mvt_motor_vehicle_theft', 'total']
COLUMN_LABELS = {
    'manual_fir': 'Manual FIR',
    'theft_efir': 'Theft E-FIR',
    'house_theft_efir': 'House Theft E-FIR',
    'burglary_efir': 'Burglary E-FIR',
    'mvt_motor_vehicle_theft': 'MVT (Motor Vehicle Theft)',
}


def summarize(classified):
    cases = classified['cases']
    records = classified['records']
    district = (records[0].get('district_name') if records else None) or 'District'
    return [{
        'district': district,
        'manual_fir': sum(1 for r in cases if not is_electronic_case(r['data'])),
        'theft_efir': sum(1 for r in cases if is_other_theft(r['data'])),
        'house_theft_efir': sum(1 for r in cases if is_house_theft(r['data'])),
        'burglary_efir': sum(1 for r in cases if is_burglary(r['data'])),
        'mvt_motor_vehicle_theft': sum(1 for r in cases if is_mvt(r['data'])),
        'total': len(cases),
    }]
