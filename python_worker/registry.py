import importlib
import glob
import os

SHEETS = []


def _load():
    pattern = os.path.join(os.path.dirname(__file__), 'sheets', 'sheet_*.py')
    for path in sorted(glob.glob(pattern)):
        name = os.path.splitext(os.path.basename(path))[0]
        mod = importlib.import_module(f'sheets.{name}')
        SHEETS.append({
            'num':          mod.NUM,
            'table_name':   mod.TABLE_NAME,
            'label':        mod.LABEL,
            'columns':      mod.COLUMNS,
            'column_labels': getattr(mod, 'COLUMN_LABELS', {}),
            'filter':       getattr(mod, 'filter_records', None),
            'map_row':      getattr(mod, 'map_row', None),
            'summarize':    getattr(mod, 'summarize', None),
        })
    SHEETS.sort(key=lambda s: s['num'])
    print(f'[Registry] Loaded {len(SHEETS)} daily-diary sheets.')


_load()


def map_all_sheets(classified, active_tables=None):
    """
    Run each sheet's filter+map_row or summarize against classified records.
    active_tables: list of table_name strings to include; None = all sheets.
    Returns { table_name: [row_dict, ...] }
    """
    result = {}
    for sheet in SHEETS:
        if active_tables is not None and sheet['table_name'] not in active_tables:
            continue
        try:
            if sheet['summarize']:
                result[sheet['table_name']] = sheet['summarize'](classified)
            else:
                rows = sheet['filter'](classified)
                result[sheet['table_name']] = [
                    sheet['map_row'](r, i) for i, r in enumerate(rows)
                ]
        except Exception as exc:
            print(f"[Registry] Sheet '{sheet['table_name']}' error: {exc}")
            result[sheet['table_name']] = []
    return result
