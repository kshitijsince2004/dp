# Phase 0 Gap Analysis & Baseline Inspection — Natural-Language Search Engine

Date: 2026-08-30

## 1. Schema & Structure Inspection
- **`record_properties` Table**:
  - Contains explicit columns: `major_category_id`, `minor_category_id`, `fire_arm_id`, `arms_subtype_id`, `details`, `phone_make`, `phone_model`, `phone_imei`, `phone_color`, `vehicle_no`, `vehicle_make`, `vehicle_model`, `vehicle_color`, `vehicle_chassis_no`, `vehicle_engine_no`, `status`, `estimated_value`, `recovery_date`, `recovery_agency`.
  - Structured fields exist for automobiles (`vehicle_make`, `vehicle_model`), phones (`phone_make`, `phone_model`), and firearms (`fire_arm_id` -> `ref.fire_arms`).
  - **Gap Identified**: Non-firearms sharp/blunt weapons (e.g. knife, dagger, sword, lathi, iron rod) are grouped under `ref.arms_categories` (category 5: `WEAPONS OTHER THAN FIRE ARMS`), but lack explicit colloquial synonym mapping for regional search terms (`chaku`, `churi`, `talwar`, `gupti`, `barcha`, `blade`, `lathi`, `sariya`).

- **Full-Text Search Infrastructure**:
  - `Installed search extensions`: None (`pg_trgm` and `tsvector` are not pre-installed).
  - Baseline text search relies on SQL `ILIKE '%term%'` scans across `record_properties.details`, `fir_details.brief_facts`, and `missing_details.physical_description`.
  - **Gap Identified**: Free-text queries without exact structured candidate matches require explicit snippet extraction and confidence tiering to prevent false-negative exclusions.

- **Existing Taxonomies & Reuse Surface**:
  - `ref.local_heads`: 237 crime heads mapped to 14 statutory canonical categories (e.g. `MURDER`, `DACOITY`, `ROBBERY`, `BURGLARY`, `MV_THEFT`, `RAPE`, `NDPS_ACT`, `ARMS_ACT`).
  - `ref.fire_arms`: 20 firearm types (`Revolver`, `Pistol`, `Carbine`, `Rifle`, `AK-Type`, `SLR`, `Local Pistol (Katta / Tamancha)`).
  - **Reuse Strategy**: The NL Search Engine will validate candidates against `ref.local_heads` and `ref.seizure_item_taxonomy`, while executing purely through the scoped Knex query builder (`resolveUserScope(req.user)`).

---

## 2. Structured Seizure Item Taxonomy Design (`ref.seizure_item_taxonomy`)

To resolve non-firearm weapons and seizure categories with colloquial terms, Phase 1 will seed `ref.seizure_item_taxonomy`:

| Seizure Code | Category | Display Label | Synonyms Array |
| :--- | :--- | :--- | :--- |
| `KNIFE` | Sharp Weapon | Knife / Blade / Dagger | `["knife", "chaku", "churi", "blade", "dagger", "gupti", "rampuri", "cutter"]` |
| `SWORD` | Sharp Weapon | Sword / Saber | `["sword", "talwar", "kirpan", "saber", "barcha"]` |
| `FIREARM` | Firearm | Firearm / Gun / Pistol | `["firearm", "gun", "pistol", "revolver", "katta", "tamancha", "rifle", "deshi katta", "bandook"]` |
| `BLUNT_OBJECT` | Blunt Weapon | Iron Rod / Lathi / Stick | `["lathi", "iron rod", "rod", "sariya", "baton", "danda", "stick", "hammer", "hathoda"]` |
| `VEHICLE` | Automobile | Vehicle / Car / Bike | `["vehicle", "car", "motorcycle", "bike", "scooter", "auto", "gadi", "truck"]` |
| `MOBILE_PHONE` | Electronic | Mobile / Smartphone / Phone | `["mobile", "phone", "cellphone", "smartphone", "iphone", "samsung", "handset"]` |
| `JEWELLERY` | Precious Metal | Jewellery / Gold / Silver | `["jewellery", "jewelry", "gold", "silver", "chain", "ring", "necklace", "jhumka", "kangan"]` |
| `CURRENCY` | Cash | Cash / Currency Notes | `["cash", "currency", "money", "rupees", "notes", "nakad"]` |
| `NARCOTICS` | Drugs | Narcotics / Drugs | `["narcotics", "drugs", "ganja", "charas", "heroin", "smack", "opium", "afeem", "pills", "mdma"]` |
