# Complete Field Comparison Report

## 1. Case Import Template Columns vs DB Fields

### Sheet: General Information

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "FIR Number" | "fir_no" | `fir_no` | ✅ Match |
| 2 | "FIR Date and time" | "fir_date" | `fir_date` | ✅ Match |
| 3 | "Disposal Type" | "" | `disposal_type` | ⚠️ Mismatch/Offset |
| 4 | "District" | "district" | `district` | ✅ Match |
| 5 | "Police Station" | "police_station" | `police_station` | ✅ Match |
| 6 | "Local Head (Crime)" | "local_head" | `local_head` | ✅ Match |
| 7 | "Case Registration Type" | "under_section" | `case_type` | ⚠️ Mismatch/Offset |
| 8 | "Beat Number" | "case_type" | `beat_number` | ⚠️ Mismatch/Offset |
| 9 | "Date of Occurrence" | "sid_number" | `occurrence_date` | ⚠️ Mismatch/Offset |
| 10 | "Occurrence Time" | "cctns_number" | `occurrence_time` | ⚠️ Mismatch/Offset |
| 11 | "Brief Facts of the Case" | "beat_number" | `brief_facts` | ⚠️ Mismatch/Offset |
| 12 | "Status " | "occurrence_date" | `status` | ⚠️ Mismatch/Offset |
| 13 | "Complainant First Name" | "occurrence_place" | `complainant_first_name` | ⚠️ Mismatch/Offset |
| 14 | "Complainant Middle Name" | "brief_facts" | `complainant_middle_name` | ⚠️ Mismatch/Offset |
| 15 | "Complainant Last Name" | "status_remarks" | `complainant_last_name` | ⚠️ Mismatch/Offset |
| 16 | "Complainant Nickname(s)" | "complainant_npr" | `complainant_nickname` | ⚠️ Mismatch/Offset |
| 17 | "Complainant Gender" | "complainant_first_name" | `complainant_gender` | ⚠️ Mismatch/Offset |
| 18 | "Complainant Marital Status" | "complainant_middle_name" | `complainant_marital_status` | ⚠️ Mismatch/Offset |
| 19 | "Complainant Relation Type" | "complainant_last_name" | `complainant_relation_type` | ⚠️ Mismatch/Offset |
| 20 | "Complainant Relative Name" | "complainant_nickname" | `complainant_relative_name` | ⚠️ Mismatch/Offset |
| 21 | "Complainant Mobile Country Code" | "complainant_gender" | `complainant_mobile_country_code` | ⚠️ Mismatch/Offset |
| 22 | "Complainant Mobile No." | "complainant_marital_status" | `complainant_mobile` | ⚠️ Mismatch/Offset |
| 23 | "Complainant Qualification" | "complainant_relation_type" | `complainant_qualification` | ⚠️ Mismatch/Offset |
| 24 | "Complainant Date of Birth" | "complainant_relative_name" | `complainant_dob` | ⚠️ Mismatch/Offset |
| 25 | "Complainant Age (Years)" | "complainant_mobile_country_code" | `complainant_age_year` | ⚠️ Mismatch/Offset |
| 26 | "Complainant Year of Birth" | "complainant_mobile" | `complainant_birth_year` | ⚠️ Mismatch/Offset |
| 27 | "Complainant House No." | "complainant_qualification" | `complainant_house_no` | ⚠️ Mismatch/Offset |
| 28 | "Complainant Street" | "complainant_dob" | `complainant_street` | ⚠️ Mismatch/Offset |
| 29 | "Complainant Colony" | "complainant_age_year" | `complainant_colony` | ⚠️ Mismatch/Offset |
| 30 | "Complainant Village / City / Town" | "complainant_birth_year" | `complainant_city_town_village` | ⚠️ Mismatch/Offset |
| 31 | "Complainant Tehsil / Block / Mandal" | "complainant_age_range_from" | `complainant_tehsil_block_mandal` | ⚠️ Mismatch/Offset |
| 32 | "Complainant Full Present Address" | "complainant_age_range_to" | `complainant_present_address` | ⚠️ Mismatch/Offset |
| 33 | "Complainant Nationality" | "complainant_house_no" | `complainant_country` | ⚠️ Mismatch/Offset |
| 34 | "Complainant State" | "complainant_street" | `complainant_state` | ⚠️ Mismatch/Offset |
| 35 | "Complainant District" | "complainant_colony" | `complainant_district` | ⚠️ Mismatch/Offset |
| 36 | "Complainant Police Station" | "complainant_city_town_village" | `complainant_police_station` | ⚠️ Mismatch/Offset |
| 37 | "Complainant Pin Code" | "complainant_tehsil_block_mandal" | `complainant_pincode` | ⚠️ Mismatch/Offset |
| 38 | "Is Permanent Address same as Present Address?" | "complainant_present_address" | `complainant_perm_same` | ⚠️ Mismatch/Offset |
| 39 | "Complainant Permanent House No." | "complainant_country" | `complainant_perm_house_no` | ⚠️ Mismatch/Offset |
| 40 | "Complainant Permanent Street" | "complainant_state" | `complainant_perm_street` | ⚠️ Mismatch/Offset |
| 41 | "Complainant Permanent Colony" | "complainant_district" | `complainant_perm_colony` | ⚠️ Mismatch/Offset |
| 42 | "Complainant Permanent Village / City / Town" | "complainant_police_station" | `complainant_perm_city_town_village` | ⚠️ Mismatch/Offset |
| 43 | "Complainant Permanent Tehsil / Block / Mandal" | "complainant_pincode" | `complainant_perm_tehsil_block_mandal` | ⚠️ Mismatch/Offset |
| 44 | "Complainant Permanent Nationality" | "complainant_perm_same" | `complainant_perm_country` | ⚠️ Mismatch/Offset |
| 45 | "Complainant Permanent State" | "complainant_perm_house_no" | `complainant_perm_state` | ⚠️ Mismatch/Offset |
| 46 | "Complainant Permanent District" | "complainant_perm_street" | `complainant_perm_district` | ⚠️ Mismatch/Offset |
| 47 | "Complainant Permanent Police Station" | "complainant_perm_colony" | `complainant_perm_police_station` | ⚠️ Mismatch/Offset |
| 48 | "Complainant Permanent Pin Code" | "complainant_perm_city_town_village" | `complainant_perm_pincode` | ⚠️ Mismatch/Offset |
| 49 | "Place of Occurrence House No." | "complainant_perm_tehsil_block_mandal" | `occurrence_house_no` | ⚠️ Mismatch/Offset |
| 50 | "Place of Occurrence Street" | "complainant_perm_country" | `occurrence_street` | ⚠️ Mismatch/Offset |
| 51 | "Place of Occurrence Colony" | "complainant_perm_state" | `occurrence_colony` | ⚠️ Mismatch/Offset |
| 52 | "Place of Occurrence Village / City / Town" | "complainant_perm_district" | `occurrence_city_town_village` | ⚠️ Mismatch/Offset |
| 53 | "Place of Occurrence Tehsil / Block / Mandal" | "complainant_perm_police_station" | `occurrence_tehsil_block_mandal` | ⚠️ Mismatch/Offset |
| 54 | "Place of Occurrence Address Nationality" | "complainant_perm_pincode" | `occurrence_country` | ⚠️ Mismatch/Offset |
| 55 | "Place of Occurrence State" | "occurrence_house_no" | `occurrence_state` | ⚠️ Mismatch/Offset |
| 56 | "Place of Occurrence District" | "occurrence_street" | `occurrence_district` | ⚠️ Mismatch/Offset |
| 57 | "Place of Occurrence Police Station" | "occurrence_colony" | `occurrence_police_station` | ⚠️ Mismatch/Offset |
| 58 | "Place of Occurrence Pin Code" | "occurrence_city_town_village" | `occurrence_pincode` | ⚠️ Mismatch/Offset |
| 59 | "IO / Officer Name" | "occurrence_tehsil_block_mandal" | `io_name` | ⚠️ Mismatch/Offset |
| 60 | "PIS No. of IO" | "occurrence_country" | `io_pis` | ⚠️ Mismatch/Offset |
| 61 | "IO Rank" | "" | `io_rank` | ⚠️ Mismatch/Offset |
| 62 | "IO Mobile No." | "occurrence_state" | `io_mobile` | ⚠️ Mismatch/Offset |
| 63 | "" | "occurrence_police_station" | `occurrence_police_station` | ✅ Match |
| 64 | "" | "occurrence_pincode" | `occurrence_pincode` | ✅ Match |
| 65 | "" | "io_name" | `io_name` | ✅ Match |
| 66 | "" | "io_pis" | `io_pis` | ✅ Match |
| 67 | "" | "io_mobile" | `io_mobile` | ✅ Match |
| 68 | "" | "date_of_arrest" | `None` | ⚠️ Mismatch/Offset |

### Sheet: Victim Information

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "FIR Number" | "fir_no" | `fir_no` | ✅ Match |
| 2 | "Victim NPR No." | "victim_npr" | `victim_npr` | ✅ Match |
| 3 | "Victim First Name" | "victim_first_name" | `victim_first_name` | ✅ Match |
| 4 | "Victim Middle Name" | "victim_middle_name" | `victim_middle_name` | ✅ Match |
| 5 | "Victim Last Name" | "victim_last_name" | `victim_last_name` | ✅ Match |
| 6 | "Victim Nickname(s)" | "victim_nickname" | `victim_nickname` | ✅ Match |
| 7 | "Victim Gender" | "victim_gender" | `victim_gender` | ✅ Match |
| 8 | "Victim Marital Status" | "victim_marital_status" | `victim_marital_status` | ✅ Match |
| 9 | "Victim Relation Type" | "victim_relation_type" | `victim_relation_type` | ✅ Match |
| 10 | "Victim Relative Name" | "victim_relative_name" | `victim_relative_name` | ✅ Match |
| 11 | "Victim Mobile No." | "victim_mobile" | `victim_mobile` | ✅ Match |
| 12 | "Victim Qualification" | "victim_qualification" | `victim_qualification` | ✅ Match |
| 13 | "Victim Date of Birth" | "victim_dob" | `victim_dob` | ✅ Match |
| 14 | "Victim Age (Years)" | "victim_age_year" | `victim_age_year` | ✅ Match |
| 15 | "Victim Year of Birth" | "victim_birth_year" | `victim_birth_year` | ✅ Match |
| 16 | "Victim House No." | "victim_house_no" | `victim_house_no` | ✅ Match |
| 17 | "Victim Street" | "victim_street" | `victim_street` | ✅ Match |
| 18 | "Victim Colony" | "victim_colony" | `victim_colony` | ✅ Match |
| 19 | "Victim Village / City / Town" | "victim_city_town_village" | `victim_city_town_village` | ✅ Match |
| 20 | "Victim Tehsil / Block / Mandal" | "victim_tehsil_block_mandal" | `victim_tehsil_block_mandal` | ✅ Match |
| 21 | "Victim Full Present Address" | "victim_present_address" | `victim_present_address` | ✅ Match |
| 22 | "Victim Nationality" | "victim_country" | `victim_country` | ✅ Match |
| 23 | "Victim State" | "victim_state" | `victim_state` | ✅ Match |
| 24 | "Victim District" | "victim_district" | `victim_district` | ✅ Match |
| 25 | "Victim Police Station" | "victim_police_station" | `victim_police_station` | ✅ Match |
| 26 | "Victim Pin Code" | "victim_pincode" | `victim_pincode` | ✅ Match |
| 27 | "Is Permanent Address same as Present Address?" | "victim_perm_same" | `complainant_perm_same` | ⚠️ Mismatch/Offset |
| 28 | "Victim Permanent House No." | "victim_perm_house_no" | `victim_perm_house_no` | ✅ Match |
| 29 | "Victim Permanent Street" | "victim_perm_street" | `victim_perm_street` | ✅ Match |
| 30 | "Victim Permanent Colony" | "victim_perm_colony" | `victim_perm_colony` | ✅ Match |
| 31 | "Victim Permanent Village / City / Town" | "victim_perm_city_town_village" | `victim_perm_city_town_village` | ✅ Match |
| 32 | "Victim Permanent Tehsil / Block / Mandal" | "victim_perm_tehsil_block_mandal" | `victim_perm_tehsil_block_mandal` | ✅ Match |
| 33 | "Victim Permanent Nationality" | "victim_perm_country" | `victim_perm_country` | ✅ Match |
| 34 | "Victim Permanent State" | "victim_perm_state" | `victim_perm_state` | ✅ Match |
| 35 | "Victim Permanent District" | "victim_perm_district" | `victim_perm_district` | ✅ Match |
| 36 | "Victim Permanent Police Station" | "victim_perm_police_station" | `victim_perm_police_station` | ✅ Match |
| 37 | "Victim Permanent Pin Code" | "victim_perm_pincode" | `victim_perm_pincode` | ✅ Match |

### Sheet: Act and Sections

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "FIR Number" | "fir_no" | `fir_no` | ✅ Match |
| 2 | "Act" | "act" | `None` | ⚠️ Mismatch/Offset |
| 3 | "Sections" | "sections" | `sections` | ✅ Match |
| 4 | "Major Head" | "crime_head" | `None` | ⚠️ Mismatch/Offset |
| 5 | "Minor Head" | "" | `None` | ✅ Match |

### Sheet: Accused Detail

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "FIR Number" | "fir_no" | `fir_no` | ✅ Match |
| 2 | "Accused First Name" | "accused_first_name" | `accused_first_name` | ✅ Match |
| 3 | "Accused Middle Name" | "accused_middle_name" | `accused_middle_name` | ✅ Match |
| 4 | "Accused Last Name" | "accused_last_name" | `accused_last_name` | ✅ Match |
| 5 | "Accused Nickname(s)" | "accused_nickname" | `accused_nickname` | ✅ Match |
| 6 | "Accused Gender" | "accused_gender" | `accused_gender` | ✅ Match |
| 7 | "Accused Marital Status" | "accused_marital_status" | `accused_marital_status` | ✅ Match |
| 8 | "Accused Relation Type" | "accused_relation_type" | `accused_relation_type` | ✅ Match |
| 9 | "Accused Relative Name" | "accused_relative_name" | `accused_relative_name` | ✅ Match |
| 10 | "Accused Mobile No." | "accused_mobile" | `accused_mobile` | ✅ Match |
| 11 | "Accused Qualification" | "accused_qualification" | `accused_qualification` | ✅ Match |
| 12 | "Accused Date of Birth" | "accused_dob" | `accused_dob` | ✅ Match |
| 13 | "Accused Age (Years)" | "accused_age_year" | `accused_age_year` | ✅ Match |
| 14 | "Accused Year of Birth" | "accused_birth_year" | `accused_birth_year` | ✅ Match |
| 15 | "Accused House No." | "accused_house_no" | `accused_house_no` | ✅ Match |
| 16 | "Accused Street" | "accused_street" | `accused_street` | ✅ Match |
| 17 | "Accused Colony" | "accused_colony" | `accused_colony` | ✅ Match |
| 18 | "Accused Village / City / Town" | "accused_city_town_village" | `accused_city_town_village` | ✅ Match |
| 19 | "Accused Tehsil / Block / Mandal" | "accused_tehsil_block_mandal" | `accused_tehsil_block_mandal` | ✅ Match |
| 20 | "Accused Full Present Address" | "accused_present_address" | `accused_present_address` | ✅ Match |
| 21 | "Accused Nationality" | "accused_country" | `accused_country` | ✅ Match |
| 22 | "Accused State" | "accused_state" | `accused_state` | ✅ Match |
| 23 | "Accused District" | "accused_district" | `accused_district` | ✅ Match |
| 24 | "Accused Police Station" | "accused_police_station" | `accused_police_station` | ✅ Match |
| 25 | "Accused Pin Code" | "accused_pincode" | `accused_pincode` | ✅ Match |
| 26 | "Is Permanent Address same as Present Address?" | "accused_perm_same" | `complainant_perm_same` | ⚠️ Mismatch/Offset |
| 27 | "Accused Permanent House No." | "accused_perm_house_no" | `accused_perm_house_no` | ✅ Match |
| 28 | "Accused Permanent Street" | "accused_perm_street" | `accused_perm_street` | ✅ Match |
| 29 | "Accused Permanent Colony" | "accused_perm_colony" | `accused_perm_colony` | ✅ Match |
| 30 | "Accused Permanent Village / City / Town" | "accused_perm_city_town_village" | `accused_perm_city_town_village` | ✅ Match |
| 31 | "Accused Permanent Tehsil / Block / Mandal" | "accused_perm_tehsil_block_mandal" | `accused_perm_tehsil_block_mandal` | ✅ Match |
| 32 | "Accused Permanent Nationality" | "accused_perm_country" | `accused_perm_country` | ✅ Match |
| 33 | "Accused Permanent State" | "accused_perm_state" | `accused_perm_state` | ✅ Match |
| 34 | "Accused Permanent District" | "accused_perm_district" | `accused_perm_district` | ✅ Match |
| 35 | "Accused Permanent Police Station" | "accused_perm_police_station" | `accused_perm_police_station` | ✅ Match |
| 36 | "Accused Permanent Pin Code" | "accused_perm_pincode" | `accused_perm_pincode` | ✅ Match |

### Sheet: Property Details

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "FIR Number" | "fir_no" | `fir_no` | ✅ Match |
| 2 | "Property  Category" | "property_major_category" | `property_major_category` | ✅ Match |
| 3 | "Property Description" | "property_details" | `property_details` | ✅ Match |
| 4 | "Property Status (stolen/recovered/involved/seized)" | "property_stolen_recovered" | `property_stolen_recovered` | ✅ Match |
| 5 | "Property Value in inr" | "" | `None` | ✅ Match |

### CASE DB Fields NOT in Case Import Template

| Field Key | Label | Section | Why it exists / Notes |
|---|---|---|---|
| `gd_no` | "GD Number, Date & Time" | `general_info` | |
| `other_sections` | "Sections (Other Act)" | `incident_details` | |
| `gambling_major_head` | "Major Head (Gambling)" | `incident_details` | |
| `murder_minor_head` | "Minor Head (Murder)" | `incident_details` | |
| `hurt_minor_head` | "Minor Head (Hurt)" | `incident_details` | |
| `cheating_minor_head` | "Minor Head (Cheating)" | `incident_details` | |
| `robbery_minor_head` | "Minor Head (Robbery)" | `incident_details` | |
| `excise_possession_minor_head` | "Minor Head (Excise - Possession)" | `incident_details` | |
| `theft_minor_head` | "Minor Head (Theft)" | `incident_details` | |
| `arms_major_head` | "Major Head (Arms)" | `incident_details` | |
| `excise_sale_minor_head` | "Minor Head (Excise - Sale)" | `incident_details` | |
| `ipc_sections` | "Sections (IPC)" | `incident_details` | |
| `excise_sections` | "Sections (Excise Act)" | `incident_details` | |
| `arms_sections` | "Sections (Arms Act)" | `incident_details` | |
| `gambling_sections` | "Sections (Gambling Act)" | `incident_details` | |
| `ipc_major_head` | "Major Head (IPC)" | `incident_details` | |
| `excise_major_head` | "Major Head (Excise)" | `incident_details` | |
| `other_major_head` | "Major Head (Other)" | `incident_details` | |
| `arms_possession_minor_head` | "Minor Head (Arms - Possession)" | `incident_details` | |
| `gambling_house_minor_head` | "Minor Head (Gambling - House)" | `incident_details` | |
| `gambling_public_minor_head` | "Minor Head (Gambling - Public)" | `incident_details` | |
| `arms_minor_head` | "Minor Head (Arms)" | `incident_details` | |
| `gambling_minor_head` | "Minor Head (Gambling)" | `incident_details` | |
| `other_minor_head` | "Minor Head (Other)" | `incident_details` | |
| `occurrence_time_type` | "Is Time of Occurrence" | `occurrence_info` | |
| `occurrence_from_date_time` | "From Date / Time" | `occurrence_info` | |
| `occurrence_to_date_time` | "To Date / Time" | `occurrence_info` | |
| `info_received_at_ps_date_time` | "Information received at P.S." | `occurrence_info` | |
| `excise_smuggling_minor_head` | "Minor Head (Excise - Smuggling)" | `incident_details` | |
| `arms_use_minor_head` | "Minor Head (Arms - Use)" | `incident_details` | |
| `excise_minor_head` | "Minor Head (Excise)" | `incident_details` | |
| `organised_crime` | "Organised Crime" | `occurrence_info` | |
| `occurrence_latitude` | "Place of Occurrence Latitude" | `occurrence_info` | |
| `occurrence_longitude` | "Place of Occurrence Longitude" | `occurrence_info` | |
| `beat_no` | "Beat No." | `general_info` | |
| `property_phone_number` | "Phone Number" | `property_details` | |
| `phone_make` | "Phone Make / Brand" | `property_details` | |
| `phone_model` | "Phone Model" | `property_details` | |
| `phone_imei` | "IMEI Number" | `property_details` | |
| `phone_color` | "Phone Color" | `property_details` | |
| `vehicle_color` | "Vehicle Color" | `vehicle_details` | |
| `vehicle_chassis_no` | "Chassis Number" | `vehicle_details` | |
| `modus_operandi` | "Modus Operandi" | `financial_fraud` | |
| `phone_status` | "Phone Recovery Status" | `property_details` | |
| `vehicle_engine_no` | "Engine Number" | `vehicle_details` | |
| `cd_uploaded_24h` | "1st CD Uploaded Within 24 Hours" | `vehicle_details` | |
| `rc_no` | "RC No." | `investigation_details` | |
| `act_name` | "Act / Law Name" | `incident_details` | |
| `occurrence_place` | "Place of Occurrence" | `incident_details` | |
| `footage_collected` | "CCTV Footage Collected" | `vehicle_details` | |
| `cheated_amount` | "Amount Cheated / Defrauded" | `financial_fraud` | |
| `property_minor_category` | "Property Minor Category" | `property_details` | |
| `vehicle_no` | "Vehicle Registration No." | `vehicle_details` | |
| `vehicle_type` | "Vehicle Type" | `vehicle_details` | |
| `vehicle_make` | "Vehicle Make / Manufacturer" | `vehicle_details` | |
| `vehicle_model` | "Vehicle Model" | `vehicle_details` | |
| `is_important` | "Mark as Important Case" | `general_info` | |
| `complainant_npr` | "Complainant NPR No." | `complainant_personal_info` | |
| `accused_mobile_country_code` | "Accused Mobile Country Code" | `accused_personal_info` | |
| `accused_npr` | "Accused NPR No." | `accused_personal_info` | |
| `victim_mobile_country_code` | "Victim Mobile Country Code" | `victim_personal_info` | |
| `complainant_same_as_victim` | "Is Complainant same as Victim?" | `complainant_personal_info` | |
| `victim_perm_same` | "Is Permanent Address same as Present Address?" | `victim_address` | |
| `accused_perm_same` | "Is Permanent Address same as Present Address?" | `accused_address` | |


## 2. Arrest Import Template Columns vs DB Fields

### Sheet: General Info

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "Linked FIR No." | "linked_fir_dd_no" | `linked_fir_dd_no` | ✅ Match |
| 2 | "FIR Date" | "fir_date" | `fir_date` | ✅ Match |
| 3 | "District" | "district" | `district` | ✅ Match |
| 4 | "Police Station" | "police_station" | `police_station` | ✅ Match |
| 5 | "Date Of Arrest" | "date_of_arrest" | `date_of_arrest` | ✅ Match |
| 6 | "Time Of Arrest" | "time_of_arrest" | `time_of_arrest` | ✅ Match |
| 7 | "Place Of Arrest" | "place_of_arrest" | `place_of_arrest` | ✅ Match |
| 8 | "IO / Officer Name" | "" | `io_name` | ⚠️ Mismatch/Offset |
| 9 | "PIS No. of IO" | "" | `io_pis` | ⚠️ Mismatch/Offset |
| 10 | "IO Rank" | "" | `io_rank` | ⚠️ Mismatch/Offset |
| 11 | "IO Mobile No." | "" | `io_mobile` | ⚠️ Mismatch/Offset |

### Sheet: Act and Sections

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "Linked FIR no." | "linked_fir_dd_no" | `linked_fir_dd_no` | ✅ Match |
| 2 | "Act" | "act" | `None` | ⚠️ Mismatch/Offset |
| 3 | "Sections" | "sections" | `sections` | ✅ Match |
| 4 | "Major Head" | "" | `None` | ✅ Match |
| 5 | "Minor Head" | "" | `None` | ✅ Match |

### Sheet: Person Arrested Detail

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "Linked FIR no." | "linked_fir_dd_no" | `linked_fir_dd_no` | ✅ Match |
| 2 | "Arrested Person NPR No." | "arrested_npr" | `arrested_npr` | ✅ Match |
| 3 | "Arrested Person First Name" | "arrested_first_name" | `arrested_first_name` | ✅ Match |
| 4 | "Arrested Person Middle Name" | "arrested_middle_name" | `arrested_middle_name` | ✅ Match |
| 5 | "Arrested Person Last Name" | "arrested_last_name" | `arrested_last_name` | ✅ Match |
| 6 | "Arrested Person Nickname(s)" | "arrested_nickname" | `arrested_nickname` | ✅ Match |
| 7 | "Arrested Person Gender" | "arrested_gender" | `arrested_gender` | ✅ Match |
| 8 | "Arrested Person Marital Status" | "arrested_marital_status" | `arrested_marital_status` | ✅ Match |
| 9 | "Arrested Person Relation Type" | "arrested_relation_type" | `arrested_relation_type` | ✅ Match |
| 10 | "Arrested Person Relative Name" | "arrested_relative_name" | `arrested_relative_name` | ✅ Match |
| 11 | "Arrested Person Mobile No." | "arrested_mobile" | `arrested_mobile` | ✅ Match |
| 12 | "Arrested Person Qualification" | "arrested_qualification" | `arrested_qualification` | ✅ Match |
| 13 | "Arrested Person Date of Birth" | "arrested_dob" | `arrested_dob` | ✅ Match |
| 14 | "Arrested Person Age (Years)" | "arrested_age_year" | `arrested_age_year` | ✅ Match |
| 15 | "Arrested Person Year of Birth" | "arrested_birth_year" | `arrested_birth_year` | ✅ Match |
| 16 | "Arrested Person House No." | "arrested_house_no" | `arrested_house_no` | ✅ Match |
| 17 | "Arrested Person Street" | "arrested_street" | `arrested_street` | ✅ Match |
| 18 | "Arrested Person Colony" | "arrested_colony" | `arrested_colony` | ✅ Match |
| 19 | "Arrested Person Village / City / Town" | "arrested_city_town_village" | `arrested_city_town_village` | ✅ Match |
| 20 | "Arrested Person Tehsil / Block / Mandal" | "arrested_tehsil_block_mandal" | `arrested_tehsil_block_mandal` | ✅ Match |
| 21 | "Arrested Person Full Present Address" | "arrested_present_address" | `arrested_present_address` | ✅ Match |
| 22 | "Arrested Person Nationality" | "arrested_country" | `arrested_country` | ✅ Match |
| 23 | "Arrested Person State" | "arrested_state" | `arrested_state` | ✅ Match |
| 24 | "Arrested Person District" | "arrested_district" | `arrested_district` | ✅ Match |
| 25 | "Arrested Person Police Station" | "arrested_police_station" | `arrested_police_station` | ✅ Match |
| 26 | "Arrested Person Pin Code" | "arrested_pincode" | `arrested_pincode` | ✅ Match |
| 27 | "Is Permanent Address same as Present Address?" | "arrested_perm_same" | `arrested_perm_same` | ✅ Match |
| 28 | "Full Permanent Address" | "arrested_perm_address" | `arrested_perm_address` | ✅ Match |
| 29 | "Arrested Person Permanent House No." | "arrested_perm_house_no" | `arrested_perm_house_no` | ✅ Match |
| 30 | "Arrested Person Permanent Street" | "arrested_perm_street" | `arrested_perm_street` | ✅ Match |
| 31 | "Arrested Person Permanent Colony" | "arrested_perm_colony" | `arrested_perm_colony` | ✅ Match |
| 32 | "Arrested Person Permanent Village / City / Town" | "arrested_perm_city_town_village" | `arrested_perm_city_town_village` | ✅ Match |
| 33 | "Arrested Person Permanent Tehsil / Block / Mandal" | "arrested_perm_tehsil_block_mandal" | `arrested_perm_tehsil_block_mandal` | ✅ Match |
| 34 | "Arrested Person Permanent Nationality" | "arrested_perm_country" | `arrested_perm_country` | ✅ Match |
| 35 | "Arrested Person Permanent State" | "arrested_perm_state" | `arrested_perm_state` | ✅ Match |
| 36 | "Arrested Person Permanent District" | "arrested_perm_district" | `arrested_perm_district` | ✅ Match |
| 37 | "Arrested Person Permanent Police Station" | "arrested_perm_police_station" | `arrested_perm_police_station` | ✅ Match |
| 38 | "Arrested Person Permanent Pin Code" | "arrested_perm_pincode" | `arrested_perm_pincode` | ✅ Match |
| 39 | "NAFIS Prepared" | "nafis_prepared" | `nafis_prepared` | ✅ Match |
| 40 | "Dossier Prepared" | "dossier_prepared" | `dossier_prepared` | ✅ Match |
| 41 | "Bad Character (BC)" | "search_slip_prepared" | `bad_character` | ⚠️ Mismatch/Offset |
| 42 | "Proclaimed Offender (PO)" | "address_verified" | `proclaimed_offender` | ⚠️ Mismatch/Offset |
| 43 | "Arresting Officer Name" | "verifying_officer_name" | `verifying_officer_name` | ✅ Match |
| 44 | "Arresting Officer Rank" | "verifying_officer_rank" | `verifying_officer_rank` | ✅ Match |
| 45 | "Custody status" | "kin_name" | `status` | ⚠️ Mismatch/Offset |
| 46 | "Scheme of arrest" | "kin_mobile" | `scheme_of_arrest` | ⚠️ Mismatch/Offset |

### Sheet: Property Details

| Col | Label (Row 3) | Hidden Key (Row 1) | Matched DB Field Key | Status |
|---|---|---|---|---|
| 1 | "Linked FIR No. " | "linked_fir_dd_no" | `linked_fir_dd_no` | ✅ Match |
| 2 | "Property  Category" | "property_major_category" | `property_major_category` | ✅ Match |
| 3 | "Property Description" | "property_minor_category" | `property_minor_category` | ✅ Match |
| 4 | "Property Status (stolen/recovered/involved/seized)" | "property_details" | `property_stolen_recovered` | ⚠️ Mismatch/Offset |
| 5 | "Property Value in inr" | "property_stolen_recovered" | `property_value` | ⚠️ Mismatch/Offset |
| 6 | "" | "property_phone_number" | `property_phone_number` | ✅ Match |
| 7 | "" | "phone_make" | `phone_make` | ✅ Match |
| 8 | "" | "phone_model" | `phone_model` | ✅ Match |
| 9 | "" | "phone_imei" | `phone_imei` | ✅ Match |
| 10 | "" | "phone_color" | `phone_color` | ✅ Match |

### ARREST DB Fields NOT in Arrest Import Template

| Field Key | Label | Section | Why it exists / Notes |
|---|---|---|---|
| `gd_no` | "GD Number, Date & Time" | `general_info` | |
| `gambling_major_head` | "Major Head (Gambling)" | `incident_details` | |
| `murder_minor_head` | "Minor Head (Murder)" | `incident_details` | |
| `hurt_minor_head` | "Minor Head (Hurt)" | `incident_details` | |
| `cheating_minor_head` | "Minor Head (Cheating)" | `incident_details` | |
| `robbery_minor_head` | "Minor Head (Robbery)" | `incident_details` | |
| `excise_possession_minor_head` | "Minor Head (Excise - Possession)" | `incident_details` | |
| `theft_minor_head` | "Minor Head (Theft)" | `incident_details` | |
| `arms_major_head` | "Major Head (Arms)" | `incident_details` | |
| `excise_sale_minor_head` | "Minor Head (Excise - Sale)" | `incident_details` | |
| `case_type` | "Case Registration Type" | `general_info` | |
| `ipc_major_head` | "Major Head (IPC)" | `incident_details` | |
| `excise_major_head` | "Major Head (Excise)" | `incident_details` | |
| `other_major_head` | "Major Head (Other)" | `incident_details` | |
| `arms_possession_minor_head` | "Minor Head (Arms - Possession)" | `incident_details` | |
| `gambling_house_minor_head` | "Minor Head (Gambling - House)" | `incident_details` | |
| `gambling_public_minor_head` | "Minor Head (Gambling - Public)" | `incident_details` | |
| `arms_minor_head` | "Minor Head (Arms)" | `incident_details` | |
| `gambling_minor_head` | "Minor Head (Gambling)" | `incident_details` | |
| `other_minor_head` | "Minor Head (Other)" | `incident_details` | |
| `excise_smuggling_minor_head` | "Minor Head (Excise - Smuggling)" | `incident_details` | |
| `arms_use_minor_head` | "Minor Head (Arms - Use)" | `incident_details` | |
| `excise_minor_head` | "Minor Head (Excise)" | `incident_details` | |
| `intimation_date_time` | "Date & Time of Intimation" | `intimation_details` | |
| `intimated_relative_name` | "Name of the Relative Intimated" | `intimation_details` | |
| `intimated_relative_relation` | "Relation with the Arrested" | `intimation_details` | |
| `intimation_mode` | "Mode of Intimation" | `intimation_details` | |
| `local_head` | "Local Head (Crime)" | `incident_details` | |
| `arresting_officer` | "Arresting Officer" | `arrest_details` | |
| `listed_criminal` | "Listed Criminal / Bad Character (BC)" | `arrest_details` | |
| `phone_status` | "Phone Recovery Status" | `property_details` | |
| `arrest_date` | "Date & Time of Arrest" | `arrestee_info` | |
| `nick_name` | "Nick Name" | `arrested_personal_info` | |
| `prev_involvement` | "Prev. Involvement (Y/N)" | `arrest_details` | |
| `arrest_place` | "Place of Arrest" | `arrestee_info` | |
| `crime_head` | "Crime Head" | `offence_info` | |
| `other_status_reason` | "Other Status Reason" | `custody_status` | |
| `act_name` | "Act / Law Name" | `incident_details` | |
| `arresting_officer_mobile` | "Contact of Arresting Officer" | `arrest_details` | |
| `property_details` | "Property Details / Description" | `property_details` | |
| `intimation_colony` | "Intimation Colony" | `intimation_address` | |
| `intimation_pincode` | "Intimation Pin Code" | `intimation_address` | |
| `arrested_mobile_country_code` | "Arrested Person Mobile Country Code" | `arrested_personal_info` | |
| `intimation_country` | "Intimation Nationality" | `intimation_address` | |
| `intimation_house_no` | "Intimation House No." | `intimation_address` | |
| `intimation_street` | "Intimation Street" | `intimation_address` | |
| `intimation_district` | "Intimation District" | `intimation_address` | |
| `intimation_city_town_village` | "Intimation Village / City / Town" | `intimation_address` | |
| `intimation_tehsil_block_mandal` | "Intimation Tehsil / Block / Mandal" | `intimation_address` | |
| `intimation_state` | "Intimation State" | `intimation_address` | |
| `intimation_police_station` | "Intimation Police Station" | `intimation_address` | |
