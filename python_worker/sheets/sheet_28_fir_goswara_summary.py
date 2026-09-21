from classifiers import is_burglary, is_house_theft, is_other_theft, is_mvt, is_electronic_case

NUM = 28
TABLE_NAME = 'excel_28fir_goswara_summary'
LABEL = 'FIR Goswara Summary'
COLUMNS = ['district', 'manual_fir', 'theft_efir', 'house_theft_efir', 'burglary_efir', 'mvt_motor_vehicle_theft', 'total']
COLUMN_LABELS = {
    'district': 'District',
    'manual_fir': 'Total arrest in Manual FIR',
    'theft_efir': 'total arrest in Theft E-FIR (ALL e-theft cases - house theft(e-theft) - burglary(e-theft))',
    'house_theft_efir': 'TOTAL ARREST IN House Theft E-FIR (house theft registered as e-theft)',
    'burglary_efir': 'TAOTAL ARREST IN Burglary E-FIR(burglary registered as e-theft)',
    'mvt_motor_vehicle_theft': 'TOTAL ARREST IN M.V. Theft (Motor Vehicle Theft)',
    'total': 'Total',
}


def summarize(classified):
    cases = classified['cases']
    records = classified['records']
    district = (records[0].get('district_name') if records else None) or (records[0].get('ps_name') if records else None) or ''
    
    manual = sum(1 for r in cases if not is_electronic_case(r['data']))
    theft = sum(1 for r in cases if is_other_theft(r['data']))
    house = sum(1 for r in cases if is_house_theft(r['data']))
    burglary = sum(1 for r in cases if is_burglary(r['data']))
    mvt = sum(1 for r in cases if is_mvt(r['data']))
    tot = manual + theft + house + burglary + mvt

    return [{
        'district': district,
        'manual_fir': manual,
        'theft_efir': theft,
        'house_theft_efir': house,
        'burglary_efir': burglary,
        'mvt_motor_vehicle_theft': mvt,
        'total': tot,
    }]
