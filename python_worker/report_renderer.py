"""
PHAROS Generic Report Renderer (Layer 3)
Consumes Layer 3 Declarative Report Specs and orchestrates calls to:
- Layer 1 (Classification & Aggregation Service)
- Layer 2 (Formula & Formatting Library)

Contains ZERO classification, formula, or taxonomy logic.
"""

import json
from pathlib import Path
from python_worker.aggregation_service import fetch_classified_counts, fetch_channel_counts
from python_worker.formula_library import (
    compute_variation,
    compute_detection,
    person_display,
    custody_status_display,
    accused_history,
)


def load_report_spec(spec_path_or_dict):
    if isinstance(spec_path_or_dict, (str, Path)):
        with open(spec_path_or_dict, "r", encoding="utf-8") as f:
            return json.load(f)
    return spec_path_or_dict


def render_report(spec_input, from_date=None, to_date=None, jurisdiction_id=None):
    """
    Render a report from a Layer 3 Declarative Spec.
    """
    spec = load_report_spec(spec_input)
    
    headers = [col["header"] for col in spec["columns"]]
    column_ids = [col["id"] for col in spec["columns"]]
    
    rendered_rows = []
    row_data_map = {}

    for row_spec in spec["rows"]:
        row_id = row_spec["id"]
        row_type = row_spec.get("type", "standard")
        row_values = {}

        if row_type == "jurisdiction_total":
            # Sum declared row IDs
            sum_row_ids = row_spec.get("sum_row_ids", [])
            for col_id in column_ids:
                col_def = next(c for c in spec["columns"] if c["id"] == col_id)
                if col_def.get("source") == "row_label":
                    row_values[col_id] = row_spec["label"]
                else:
                    sum_val = sum(
                        row_data_map.get(target_row_id, {}).get(col_id, 0)
                        for target_row_id in sum_row_ids
                        if isinstance(row_data_map.get(target_row_id, {}).get(col_id), (int, float))
                    )
                    row_values[col_id] = sum_val
        else:
            # Standard row — execute Layer 1 queries
            ps_id = row_spec.get("ps_id")
            channel_counts = fetch_channel_counts(
                ps_id=ps_id,
                district_id=jurisdiction_id if not ps_id else None,
                from_date=from_date,
                to_date=to_date,
            )

            # Evaluate columns in order
            for col in spec["columns"]:
                col_id = col["id"]
                source = col.get("source")

                if source == "row_label":
                    row_values[col_id] = row_spec["label"]

                elif source == "layer1_aggregation":
                    channel = col.get("channel")
                    if channel in channel_counts:
                        row_values[col_id] = channel_counts[channel]
                    else:
                        row_values[col_id] = 0

                elif source == "layer2_formula":
                    func_name = col.get("function")
                    inputs = col.get("inputs", [])
                    input_vals = [row_values.get(inp, 0) for inp in inputs]

                    if func_name == "sum_columns":
                        row_values[col_id] = sum(input_vals)
                    elif func_name == "compute_variation":
                        row_values[col_id] = compute_variation(input_vals[0], input_vals[1]) if len(input_vals) >= 2 else 0.0
                    elif func_name == "compute_detection":
                        row_values[col_id] = compute_detection(input_vals[0], input_vals[1]) if len(input_vals) >= 2 else 0.0
                    else:
                        row_values[col_id] = 0

                else:
                    row_values[col_id] = None

        row_data_map[row_id] = row_values
        rendered_rows.append(row_values)

    # Generic Enforcements
    # 1. Strip Row 5 annotation rule
    strip_row_5 = spec.get("strip_row_5_annotation", True)

    # 2. A4 Print setup defaults
    print_setup = {
        "paper_size": "A4",
        "orientation": "landscape" if len(columns_ids := column_ids) > 5 else "portrait",
        "margins": {"top": 0.75, "bottom": 0.75, "left": 0.7, "right": 0.7},
        "strip_row_5_annotation": strip_row_5,
    }

    return {
        "sheet_id": spec.get("sheet_id"),
        "title": spec.get("title"),
        "headers": headers,
        "column_ids": column_ids,
        "rows": rendered_rows,
        "print_setup": print_setup,
    }
