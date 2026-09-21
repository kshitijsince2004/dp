# PHAROS Report Engine — Layer 3 Declarative Report Specification Format

## 1. Overview
Layer 3 defines report sheets as **pure JSON declarations**. A report spec contains **zero code**, **zero inline classification**, **zero formula implementations**, and **zero direct SQL query strings**.

The generic renderer (`report_renderer.py`) reads a spec JSON file and orchestrates calls to:
- **Layer 1 (Classification & Aggregation Service)**: For count metrics, crime head breakdowns, jurisdiction rollups, and channel-scoped totals.
- **Layer 2 (Formula & Formatting Library)**: For derived metrics (Variation%, Detection%), status normalizations, person name/alias formatting, and multi-value cell rendering.

---

## 2. JSON Schema Structure

### Top-Level Fields
```json
{
  "sheet_id": "sheet_21_goswara_summary",
  "title": "FIR Goswara Summary (Daily Diary Sheet 21)",
  "row_grain": "single_jurisdiction_summary",
  "jurisdiction_scope": "PS",
  "time_period_type": "single_day",
  "date_column_convention": "COALESCE_REGISTRATION_FIR_RECORD",
  "strip_row_5_annotation": true,
  "rows": [ ... ],
  "columns": [ ... ]
}
```

#### Field Specifications
| Field | Type | Options / Values | Description |
|---|---|---|---|
| `sheet_id` | `string` | Unique identifier (e.g. `sheet_21_goswara_summary`) | Identifier for the spec file |
| `title` | `string` | Human-readable string | Title displayed in report output header |
| `row_grain` | `enum` | `single_jurisdiction_summary`, `matrix_by_crime_head`, `list_of_records` | Defines structural layout of rows |
| `jurisdiction_scope` | `enum` | `PS`, `DISTRICT`, `RANGE`, `STATE` | Defines aggregation geographic scope |
| `time_period_type` | `enum` | `single_day`, `year_to_date`, `custom_range` | Defines default query window |
| `date_column_convention` | `enum` | `COALESCE_REGISTRATION_FIR_RECORD`, `FIR_DATE`, `REGISTRATION_DATE`, `RECORD_DATE` | Date field fallback rule (Phase 1 decision) |
| `strip_row_5_annotation` | `boolean` | `true` (default) | Generic enforcement of Row 5 Excel annotation removal |

---

## 3. Row Declarations (`rows`)

### 3.1 Matrix-By-Crime-Head (`row_grain: "matrix_by_crime_head"`)
Defines crime heads and standard subtotal rows:
```json
{
  "crime_head_rows": [
    { "id": "dacoity", "local_head_cd": 1, "label": "1. Dacoity" },
    { "id": "murder", "local_head_cd": 2, "label": "2. Murder" },
    { "id": "rape", "local_head_cd": 7, "label": "7. Rape" }
  ],
  "subtotal_rows": [
    {
      "id": "heinous_subtotal",
      "label": "TOTAL HEINOUS CRIMES",
      "type": "category_subtotal",
      "crime_category": "HEINOUS",
      "heads": [1, 2, 3, 4, 5, 6, 7]
    },
    {
      "id": "non_heinous_subtotal",
      "label": "TOTAL NON-HEINOUS CRIMES",
      "type": "category_subtotal",
      "crime_category": "NON_HEINOUS",
      "heads": [8, 9, 10, ...]
    },
    {
      "id": "bns_111_subtotal",
      "label": "BNS 111 (Organized Crime Subtotal)",
      "type": "act_subtotal",
      "act_cd": "BNS_111"
    },
    {
      "id": "grand_total",
      "label": "GRAND TOTAL",
      "type": "sum_subtotals",
      "sum_row_ids": ["heinous_subtotal", "non_heinous_subtotal"]
    }
  ]
}
```

### 3.2 Single-Jurisdiction-Summary (`row_grain: "single_jurisdiction_summary"`)
Defines summary rows by channel or registration type (e.g. Sheet 21 FIR Goswara Summary):
```json
{
  "rows": [
    { "id": "manual_fir", "label": "Manual CCTNS FIRs", "channel": "MANUAL_CCTNS" },
    { "id": "e_theft", "label": "E-Theft FIRs", "channel": "E_THEFT" },
    { "id": "e_mvt", "label": "E-MVT FIRs", "channel": "E_MVT" },
    { "id": "ncrp", "label": "NCRP FIRs", "channel": "NCRP" },
    { "id": "zero_fir", "label": "Zero FIRs", "channel": "ZERO_FIR" },
    { "id": "total_goswara", "label": "Total Goswara Summary", "type": "channel_total", "sum_row_ids": ["manual_fir", "e_theft", "e_mvt", "ncrp", "zero_fir"] }
  ]
}
```

---

## 4. Column Declarations (`columns`)

Each column declares how its cell values are computed:

### 4.1 Layer 1 Aggregation Call (`source: "layer1_aggregation"`)
```json
{
  "id": "reported_cases",
  "header": "Reported Cases",
  "source": "layer1_aggregation",
  "metric": "reported"
}
```
Supported `metric` types: `reported`, `worked_out`, `arrested_count`, `channel_count`.

### 4.2 Layer 2 Formula Call (`source: "layer2_formula"`)
```json
{
  "id": "detection_pct",
  "header": "Detection %",
  "source": "layer2_formula",
  "function": "compute_detection_pct",
  "inputs": ["worked_out_cases", "reported_cases"]
}
```
```json
{
  "id": "variation_pct",
  "header": "Variation %",
  "source": "layer2_formula",
  "function": "compute_variation_pct",
  "inputs": ["current_period_reported", "previous_period_reported"]
}
```

### 4.3 Person Template Column (`source: "person_template"`)
Expresses person display formatting, age inclusion, and multi-accused numbered line patterns:
```json
{
  "id": "accused_details",
  "header": "Accused Persons & Aliases",
  "source": "person_template",
  "role": "ACCUSED",
  "include_age": true,
  "numbered_lines": true
}
```

### 4.4 Direct Field Reference (`source: "direct_field"`)
For list-of-records detail sheets:
```json
{
  "id": "fir_number",
  "header": "FIR No.",
  "source": "direct_field",
  "table": "fir_details",
  "column": "fir_no"
}
```

---

## 5. Generic Renderer Guarantees
1. **Row 5 Annotation Protection**: Automatically strips legacy Excel row 5 metadata annotations.
2. **Zero Code Escape Hatches**: The renderer evaluates only valid Layer 1 metrics and Layer 2 functions. Arbitrary Python/JS script execution is prohibited.
3. **Dual-Language Parity**: The spec can be rendered identically by the Python engine (`python_worker/`) or the Node.js engine (`backend/src/modules/report-engine/`).
