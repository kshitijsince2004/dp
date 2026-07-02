import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Save, FileCheck, Users, MapPin, Shield, HelpCircle, Plus, Trash2, AlertTriangle, ShieldOff } from "lucide-react";
import { DISTRICTS_AND_STATIONS } from "../utils/policeData.js";
import useAuthStore from "../store/authStore.js";
import api from "../utils/api.js";
import toast from "react-hot-toast";
import DateInput from "../components/ui/DateInput.jsx";
import { formatDMY } from "../utils/dateFormat.js";

export default function CaseManagement() {
  const { onSubmitReport, addNotification } = useOutletContext();
  const { user } = useAuthStore();
  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState({
    uid: "",
    localHead: "",
    firNumber: "",
    firDate: formatDMY(new Date()),
    underSection: "",
    caseType: "",
    sidNumber: "",
    cctnsNumber: "",
    district: "New Delhi District (NDD)",
    policeStation: "Parliament Street",
    beatNumber: "",
    occurrenceDate: "",
    occurrenceTime: "",
    occurrencePlace: "",
    briefFacts: "",
    propertyInvolved: "",
    propertyValue: "",
    statusRemarks: "",
    complainantName: "",
    complainantFatherName: "",
    complainantMobile: "",
    complainantAddress: "",
    accusedList: [{ name: "", alias: "", address: "" }],
    ioName: "",
    ioPisNumber: "",
    ioMobile: "",
    dateOfArrest: ""
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (user?.role === "PS") {
      setFormData(prev => ({
        ...prev,
        district: user.districtKey,
        policeStation: user.stationName
      }));
    }
  }, [user]);

  // Access guard: only PS operators can fill forms
  if (user && user.role !== "PS") {
    return (
      <div className="page-wrapper">
        <div className="access-denied-card">
          <div className="access-icon"><ShieldOff size={32} /></div>
          <h2>Access Restricted</h2>
          <p>Case entry forms are only accessible to Police Station Operators. Switch to a PS Operator view using the Console Scope selector to enter data.</p>
        </div>
      </div>
    );
  }

  // Steps definition
  const steps = [
    { num: 1, label: "Basic Info" },
    { num: 2, label: "Location & Facts" },
    { num: 3, label: "Parties" },
    { num: 4, label: "Investigation" }
  ];

  // Quick fill mock data helper
  const handleQuickFill = () => {
    setFormData({
      uid: "UID-2026/DL-4921",
      localHead: "Larceny",
      firNumber: "FIR-220/2026",
      firDate: "10/06/2026",
      underSection: "Section 379 IPC (Theft)",
      caseType: "Property Theft",
      sidNumber: "SID-889021",
      cctnsNumber: "CCTNS-202699104",
      district: "New Delhi District (NDD)",
      policeStation: "Parliament Street",
      beatNumber: "Beat No. 4",
      occurrenceDate: "09/06/2026",
      occurrenceTime: "14:30",
      occurrencePlace: "Parking Lot, Patel Chowk Metro Station",
      briefFacts: "The complainant reported that his red Honda Activa scooter (DL 3S CY 8821) was parked at the Patel Chowk Metro parking at 14:00 hours. When he returned at 16:30 hours, the scooter was missing. CCTV footage shows two suspects carrying lock picks around the parking bay.",
      propertyInvolved: "Honda Activa Scooter DL 3S CY 8821",
      propertyValue: "75000",
      statusRemarks: "CCTV footage retrieved. Suspect identification in progress.",
      complainantName: "Mohan Lal Sharma",
      complainantFatherName: "Kishori Lal Sharma",
      complainantMobile: "9876543210",
      complainantAddress: "H.No. 44, G-Block, Connaught Place, New Delhi",
      accusedList: [
        { name: "Satish Kumar", alias: "Sattu", address: "Janta Flats, Sector 15, Rohini, Delhi" },
        { name: "Unknown accomplice", alias: "Unidentified", address: "Fleeing status" }
      ],
      ioName: "Inspector Ravindra Singh",
      ioPisNumber: "28080214",
      ioMobile: "9812345678",
      dateOfArrest: "12/06/2026"
    });
    setErrors({});
    addNotification("Mock data loaded! Proceed to verify or submit.", "info");
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleDistrictChange = (e) => {
    const selectedDistrict = e.target.value;
    setFormData(prev => ({
      ...prev,
      district: selectedDistrict,
      policeStation: ""
    }));
    if (errors.district) {
      setErrors(prev => ({ ...prev, district: null, policeStation: null }));
    }
  };

  // Accused handlers
  const handleAccusedChange = (index, field, value) => {
    const updated = [...formData.accusedList];
    updated[index][field] = value;
    setFormData(prev => ({ ...prev, accusedList: updated }));
  };

  const addAccused = () => {
    setFormData(prev => ({
      ...prev,
      accusedList: [...prev.accusedList, { name: "", alias: "", address: "" }]
    }));
  };

  const removeAccused = (index) => {
    if (formData.accusedList.length === 1) return;
    const updated = formData.accusedList.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, accusedList: updated }));
  };

  // Validation
  const validateForm = () => {
    const tempErrors = {};
    if (!formData.firNumber) tempErrors.firNumber = "FIR Number is required";
    if (!formData.firDate) tempErrors.firDate = "FIR Date is required";
    if (!formData.district) tempErrors.district = "District is required";
    if (!formData.policeStation) tempErrors.policeStation = "Police Station is required";
    if (!formData.complainantName) tempErrors.complainantName = "Complainant Name is required";
    if (!formData.ioName) tempErrors.ioName = "IO Name is required";
    
    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSaveDraft = () => {
    addNotification("Case diary draft saved successfully.", "success");
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey) {
        const el = document.getElementsByName(firstErrorKey)[0];
        if (el) el.focus();
      }
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.post('/v1/records', {
        record_type: 'CASE',
        record_date: formData.firDate || formatDMY(new Date()),
        data: formData
      });
      const uid = res.data.data?.uid;
      const savedData = { ...formData, uid: uid || formData.uid };
      onSubmitReport("Case diary report docket", savedData, "case");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1>New Case Record (PRISM)</h1>
          <p className="page-desc">Enter complete Case details. Single entry propagates to District Analytics.</p>
        </div>
        <button 
          type="button" 
          className="btn btn-secondary transition-standard"
          onClick={handleQuickFill}
          aria-label="Load mock test data into form fields"
        >
          <span>Fill Test Data</span>
        </button>
      </div>

      {/* Stepper Progress Indicator */}
      <div className="stepper" aria-label="Form Steps Progress">
        {steps.map(step => (
          <button
            key={step.num}
            type="button"
            className={`stepper-step ${activeStep === step.num ? "active" : activeStep > step.num ? "completed" : ""}`}
            onClick={() => setActiveStep(step.num)}
            aria-label={`Go to step ${step.num}: ${step.label}`}
          >
            <div className="stepper-circle">{step.num}</div>
            <span className="stepper-label">{step.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Sticky Actions Toolbar */}
        <div className="form-actions-toolbar transition-standard">
          <div className="form-actions-toolbar-left">
            <span className="toolbar-step-badge" translate="no">Step {activeStep} of 4</span>
            <span className="toolbar-step-title">{steps[activeStep - 1].label}</span>
          </div>
          <div className="form-actions-toolbar-right">
            {activeStep > 1 && (
              <button 
                type="button" 
                className="btn btn-secondary transition-standard"
                onClick={() => setActiveStep(prev => prev - 1)}
                aria-label="Go to previous section"
              >
                <span>Back</span>
              </button>
            )}
            
            <button 
              type="button" 
              className="btn btn-secondary transition-standard"
              onClick={handleSaveDraft}
              aria-label="Save draft of Case Diary"
            >
              <Save size={16} aria-hidden="true" className="menu-icon" />
              <span>Save Draft</span>
            </button>
            
            {activeStep < 4 ? (
              <button 
                type="button" 
                className="btn btn-primary transition-standard"
                onClick={() => setActiveStep(prev => prev + 1)}
                aria-label="Go to next section"
              >
                <span>Next</span>
              </button>
            ) : (
              <button 
                type="submit" 
                className="btn btn-primary transition-standard"
                aria-label="Submit case and auto-generate command report"
                disabled={isSubmitting}
              >
                <FileCheck size={16} aria-hidden="true" className="menu-icon" />
                <span>{isSubmitting ? 'Saving…' : 'Submit Case'}</span>
              </button>
            )}
          </div>
        </div>

        {/* STEP 1: BASIC INFO */}
        {activeStep === 1 && (
          <div className="card transition-standard">
            <div className="card-title">
              <Shield size={18} aria-hidden="true" />
              <span>Basic Case Information</span>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="uid">System UID</label>
                <input
                  type="text"
                  id="uid"
                  name="uid"
                  className="form-control"
                  value={formData.uid || ""}
                  readOnly
                  disabled
                  placeholder="Auto-assigned upon submission"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="localHead">Local Head</label>
                <input
                  type="text"
                  id="localHead"
                  name="localHead"
                  className="form-control"
                  value={formData.localHead}
                  onChange={handleInputChange}
                  placeholder="e.g. Theft / Larceny…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label required" htmlFor="firNumber">FIR Number</label>
                <input
                  type="text"
                  id="firNumber"
                  name="firNumber"
                  className={`form-control ${errors.firNumber ? "border-red-500" : ""}`}
                  value={formData.firNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. FIR-220/2026…"
                  required
                  autocomplete="off"
                />
                {errors.firNumber && <span className="text-red-500 text-xs mt-1">{errors.firNumber}</span>}
              </div>

              <div className="form-group">
                <label className="form-label required" htmlFor="firDate">FIR Date</label>
                <DateInput
                  id="firDate"
                  inputClassName={`form-control ${errors.firDate ? "border-red-500" : ""}`}
                  value={formData.firDate}
                  onChange={(val) => handleInputChange({ target: { name: 'firDate', value: val } })}
                />
                {errors.firDate && <span className="text-red-500 text-xs mt-1">{errors.firDate}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="underSection">Under Section</label>
                <input
                  type="text"
                  id="underSection"
                  name="underSection"
                  className="form-control"
                  value={formData.underSection}
                  onChange={handleInputChange}
                  placeholder="e.g. Sec 379 IPC…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="caseType">Case Type</label>
                <input
                  type="text"
                  id="caseType"
                  name="caseType"
                  className="form-control"
                  value={formData.caseType}
                  onChange={handleInputChange}
                  placeholder="e.g. Property Theft…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="sidNumber">SID Number</label>
                <input
                  type="text"
                  id="sidNumber"
                  name="sidNumber"
                  className="form-control"
                  value={formData.sidNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. SID-889021…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cctnsNumber">CCTNS Number</label>
                <input
                  type="text"
                  id="cctnsNumber"
                  name="cctnsNumber"
                  className="form-control"
                  value={formData.cctnsNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. CCTNS-202699104…"
                  autocomplete="off"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: LOCATION & FACTS */}
        {activeStep === 2 && (
          <div className="card transition-standard">
            <div className="card-title">
              <MapPin size={18} aria-hidden="true" />
              <span>Location & Case Details</span>
            </div>
            
            {user?.role === "PS" && (
              <div className="col-span-full p-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs rounded mb-3 flex items-center gap-1.5 font-sans">
                <AlertTriangle size={14} />
                <span>Console View: Police Station Operator. Location inputs are locked to PS {user.stationName}.</span>
              </div>
            )}
            
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required" htmlFor="district">District</label>
                <select
                  id="district"
                  name="district"
                  className={`form-control ${errors.district ? "border-red-500" : ""}`}
                  value={formData.district}
                  onChange={handleDistrictChange}
                  required
                  disabled={user?.role === "PS"}
                >
                  <option value="">Select District</option>
                  {Object.keys(DISTRICTS_AND_STATIONS).map((dist) => (
                    <option key={dist} value={dist}>{dist}</option>
                  ))}
                </select>
                {errors.district && <span className="text-red-500 text-xs mt-1">{errors.district}</span>}
              </div>

              <div className="form-group">
                <label className="form-label required" htmlFor="policeStation">Police Station</label>
                <select
                  id="policeStation"
                  name="policeStation"
                  className={`form-control ${errors.policeStation ? "border-red-500" : ""}`}
                  value={formData.policeStation}
                  onChange={handleInputChange}
                  required
                  disabled={!formData.district || user?.role === "PS"}
                >
                  <option value="">Select Police Station</option>
                  {formData.district && DISTRICTS_AND_STATIONS[formData.district]?.map((ps) => (
                    <option key={ps} value={ps}>{ps}</option>
                  ))}
                </select>
                {errors.policeStation && <span className="text-red-500 text-xs mt-1">{errors.policeStation}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="beatNumber">Beat Number</label>
                <input
                  type="text"
                  id="beatNumber"
                  name="beatNumber"
                  className="form-control"
                  value={formData.beatNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. Beat No. 4…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="occurrenceDate">Occurrence Date</label>
                <DateInput
                  id="occurrenceDate"
                  inputClassName="form-control"
                  value={formData.occurrenceDate}
                  onChange={(val) => handleInputChange({ target: { name: 'occurrenceDate', value: val } })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="occurrenceTime">Occurrence Time</label>
                <input
                  type="time"
                  id="occurrenceTime"
                  name="occurrenceTime"
                  className="form-control"
                  value={formData.occurrenceTime}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="occurrencePlace">Occurrence Place</label>
                <input
                  type="text"
                  id="occurrencePlace"
                  name="occurrencePlace"
                  className="form-control"
                  value={formData.occurrencePlace}
                  onChange={handleInputChange}
                  placeholder="e.g. Patel Chowk parking bay…"
                  autocomplete="off"
                />
              </div>
              
              <div className="form-group col-span-full">
                <label className="form-label" htmlFor="briefFacts">Brief Facts of Case</label>
                <textarea
                  id="briefFacts"
                  name="briefFacts"
                  className="form-control"
                  value={formData.briefFacts}
                  onChange={handleInputChange}
                  placeholder="Describe the incident narrative here…"
                  spellCheck={true}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="propertyInvolved">Property Involved</label>
                <input
                  type="text"
                  id="propertyInvolved"
                  name="propertyInvolved"
                  className="form-control"
                  value={formData.propertyInvolved}
                  onChange={handleInputChange}
                  placeholder="e.g. Scooter details…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="propertyValue">Property Value (INR)</label>
                <input
                  type="number"
                  id="propertyValue"
                  name="propertyValue"
                  className="form-control"
                  value={formData.propertyValue}
                  onChange={handleInputChange}
                  placeholder="e.g. 75000…"
                  inputMode="numeric"
                  autocomplete="off"
                />
              </div>

              <div className="form-group col-span-full">
                <label className="form-label" htmlFor="statusRemarks">Status / Remarks</label>
                <input
                  type="text"
                  id="statusRemarks"
                  name="statusRemarks"
                  className="form-control"
                  value={formData.statusRemarks}
                  onChange={handleInputChange}
                  placeholder="Provide latest status updates…"
                  autocomplete="off"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: COMPLAINANT & ACCUSED */}
        {activeStep === 3 && (
          <div className="card transition-standard">
            <div className="card-title">
              <Users size={18} aria-hidden="true" />
              <span>Involved Parties Information</span>
            </div>

            <h3 className="text-md font-semibold mb-2 mt-4 text-slate-800">Complainant Details</h3>
            <div className="form-grid mb-6">
              <div className="form-group">
                <label className="form-label required" htmlFor="complainantName">Complainant Name</label>
                <input
                  type="text"
                  id="complainantName"
                  name="complainantName"
                  className={`form-control ${errors.complainantName ? "border-red-500" : ""}`}
                  value={formData.complainantName}
                  onChange={handleInputChange}
                  placeholder="Full name of reporter…"
                  required
                  autocomplete="off"
                />
                {errors.complainantName && <span className="text-red-500 text-xs mt-1">{errors.complainantName}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="complainantFatherName">Father Name</label>
                <input
                  type="text"
                  id="complainantFatherName"
                  name="complainantFatherName"
                  className="form-control"
                  value={formData.complainantFatherName}
                  onChange={handleInputChange}
                  placeholder="Father's name…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="complainantMobile">Mobile Number</label>
                <input
                  type="tel"
                  id="complainantMobile"
                  name="complainantMobile"
                  className="form-control"
                  value={formData.complainantMobile}
                  onChange={handleInputChange}
                  placeholder="10-digit mobile number…"
                  inputMode="tel"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="complainantAddress">Address</label>
                <input
                  type="text"
                  id="complainantAddress"
                  name="complainantAddress"
                  className="form-control"
                  value={formData.complainantAddress}
                  onChange={handleInputChange}
                  placeholder="Residential address…"
                  autocomplete="off"
                />
              </div>
            </div>

            <div className="accused-section-header flex justify-between items-center mb-4">
              <h3 className="text-md font-semibold text-slate-800">Accused Information</h3>
              <button 
                type="button" 
                className="btn btn-secondary py-1 px-3 text-xs flex items-center gap-1"
                onClick={addAccused}
                aria-label="Add another accused details field"
              >
                <Plus size={14} aria-hidden="true" />
                <span>Add Accused</span>
              </button>
            </div>

            <div className="mb-4">
              {formData.accusedList.map((accused, idx) => (
                <div key={idx} className="accused-row mb-3 p-3 bg-slate-50 border-l-4 border-blue-600 rounded flex gap-4 items-end">
                  <div className="accused-fields flex-1 grid grid-cols-3 gap-4">
                    <div className="form-group">
                      <label className="form-label" htmlFor={`acc-name-${idx}`}>Accused Name</label>
                      <input
                        type="text"
                        id={`acc-name-${idx}`}
                        className="form-control"
                        value={accused.name}
                        onChange={(e) => handleAccusedChange(idx, "name", e.target.value)}
                        placeholder="e.g. Satish Kumar…"
                        autocomplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor={`acc-alias-${idx}`}>Alias</label>
                      <input
                        type="text"
                        id={`acc-alias-${idx}`}
                        className="form-control"
                        value={accused.alias}
                        onChange={(e) => handleAccusedChange(idx, "alias", e.target.value)}
                        placeholder="e.g. Sattu…"
                        autocomplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor={`acc-addr-${idx}`}>Address</label>
                      <input
                        type="text"
                        id={`acc-addr-${idx}`}
                        className="form-control"
                        value={accused.address}
                        onChange={(e) => handleAccusedChange(idx, "address", e.target.value)}
                        placeholder="Current address details…"
                        autocomplete="off"
                      />
                    </div>
                  </div>
                  {formData.accusedList.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-danger p-2 h-10 w-10 flex items-center justify-center flex-shrink-0"
                      onClick={() => removeAccused(idx)}
                      aria-label={`Remove accused ${idx + 1}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: INVESTIGATION & SUBMISSION */}
        {activeStep === 4 && (
          <div className="card transition-standard">
            <div className="card-title">
              <HelpCircle size={18} aria-hidden="true" />
              <span>Investigation Officer & Arrest Details</span>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required" htmlFor="ioName">IO Name</label>
                <input
                  type="text"
                  id="ioName"
                  name="ioName"
                  className={`form-control ${errors.ioName ? "border-red-500" : ""}`}
                  value={formData.ioName}
                  onChange={handleInputChange}
                  placeholder="e.g. Inspector Ravindra Singh…"
                  required
                  autocomplete="off"
                />
                {errors.ioName && <span className="text-red-500 text-xs mt-1">{errors.ioName}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ioPisNumber">PIS Number</label>
                <input
                  type="text"
                  id="ioPisNumber"
                  name="ioPisNumber"
                  className="form-control"
                  value={formData.ioPisNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. 28080214…"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ioMobile">Mobile Number</label>
                <input
                  type="tel"
                  id="ioMobile"
                  name="ioMobile"
                  className="form-control"
                  value={formData.ioMobile}
                  onChange={handleInputChange}
                  placeholder="IO contact number…"
                  inputMode="tel"
                  autocomplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="dateOfArrest">Date Of Arrest</label>
                <DateInput
                  id="dateOfArrest"
                  inputClassName="form-control"
                  value={formData.dateOfArrest}
                  onChange={(val) => handleInputChange({ target: { name: 'dateOfArrest', value: val } })}
                />
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
