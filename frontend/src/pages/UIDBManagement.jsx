import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Save, FileCheck, Fingerprint, User, MapPin, CheckSquare, Sparkles, AlertTriangle, Shield, ShieldOff } from "lucide-react";
import { DISTRICTS_AND_STATIONS } from "../utils/policeData.js";
import useAuthStore from "../store/authStore.js";
import api from "../utils/api.js";
import toast from "react-hot-toast";
import DateInput from "../components/ui/DateInput.jsx";
import { formatDMY } from "../utils/dateFormat.js";

export default function UIDBManagement() {
  const { onSubmitReport, addNotification } = useOutletContext();
  const { user } = useAuthStore();
  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState({
    uid: "",
    uidbNumber: "",
    district: "New Delhi District (NDD)",
    policeStation: "Parliament Street",
    ddNumber: "",
    ddDate: formatDMY(new Date()),
    dutyOfficer: "",
    ioName: "",
    informantName: "",
    informantMobile: "",
    foundPlace: "",
    uidbDate: "",
    name: "", // Assumed or unknown
    age: "",
    gender: "",
    height: "",
    complexion: "",
    identificationMarks: "",
    description: "",
    zipnetNumber: "",
    identified: false,
    status: ""
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
          <p>UIDB entry forms are only accessible to Police Station Operators. Switch to a PS Operator view using the Console Scope selector to enter data.</p>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "Recovery & Officers" },
    { num: 2, label: "Body Description" },
    { num: 3, label: "ZIPNET & Status" }
  ];

  const handleQuickFill = () => {
    setFormData({
      uidbNumber: "UIDB-992/2026/ND",
      district: "New Delhi District (NDD)",
      policeStation: "Parliament Street",
      ddNumber: "DD-12A",
      ddDate: "12/06/2026",
      dutyOfficer: "ASI Krishan Dutt",
      ioName: "Inspector Ravindra Singh",
      informantName: "Satish Chand (Metro Sweeper)",
      informantMobile: "9812981298",
      foundPlace: "Behind electrical transformer, red-light crossing, Patel Chowk",
      uidbDate: "12/06/2026",
      name: "Unidentified Male",
      age: "35-40",
      gender: "Male",
      height: "5'7\"",
      complexion: "Shallow/Wheatish",
      identificationMarks: "Tattoo of a star on the right wrist. Scar on the left eyebrow.",
      description: "Found wearing a blue checkered shirt and black trousers. No pocket wallet or ID card retrieved. Stature medium. Hair black and short.",
      zipnetNumber: "ZIP-ND-2026-88912",
      identified: false,
      status: "Corpse under autopsy at RML Hospital mortuary. Matching missing listings."
    });
    setErrors({});
    addNotification("UIDB test data loaded.", "info");
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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

  const handleToggleChange = (name) => {
    setFormData(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const validate = () => {
    const tempErrors = {};
    if (!formData.uidbNumber) tempErrors.uidbNumber = "UIDB Number is required";
    if (!formData.policeStation) tempErrors.policeStation = "PS is required";
    if (!formData.foundPlace) tempErrors.foundPlace = "Found Place is required";
    if (!formData.gender) tempErrors.gender = "Gender is required";

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSaveDraft = () => {
    addNotification("UIDB record draft saved.", "success");
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
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
        record_type: 'UIDB',
        record_date: formData.uidbDate || formData.ddDate || formatDMY(new Date()),
        data: formData
      });
      const uid = res.data.data?.uid;
      const savedData = { ...formData, uid: uid || formData.uid };
      onSubmitReport("UIDB recovery & identification docket", savedData, "uidb");
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
          <h1>Unidentified Dead Body (UIDB) Log</h1>
          <p className="page-desc">Register recovered unidentified bodies, enter physical descriptions, and sync with ZIPNET national databases.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary transition-standard"
          onClick={handleQuickFill}
          aria-label="Pre-fill UIDB form fields with mock tracking data"
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
            <span className="toolbar-step-badge" translate="no">Step {activeStep} of 3</span>
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
              aria-label="Save draft UIDB record"
            >
              <Save size={16} aria-hidden="true" className="menu-icon" />
              <span>Save Draft</span>
            </button>

            {activeStep < 3 ? (
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
                aria-label="Submit UIDB and log to central registry"
                disabled={isSubmitting}
              >
                <FileCheck size={16} aria-hidden="true" className="menu-icon" />
                <span>{isSubmitting ? 'Saving…' : 'Submit UIDB Entry'}</span>
              </button>
            )}
          </div>
        </div>

        {/* STEP 1: RECOVERY & OFFICERS */}
        {activeStep === 1 && (
          <>
            {/* SECTION 1: BASIC INFORMATION */}
            <div className="card transition-standard">
              <div className="card-title">
                <Fingerprint size={18} aria-hidden="true" />
                <span>Basic UIDB Information</span>
              </div>
              <div className="form-grid">
                {user?.role === "PS" ? (
                  <div className="col-span-full p-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs rounded mb-3 flex items-center gap-1.5 font-sans">
                    <AlertTriangle size={14} />
                    <span>Console View: Police Station Operator. Location inputs are locked to PS {user.stationName}.</span>
                  </div>
                ) : (
                  <div className="col-span-full p-2 bg-blue-500/10 border border-blue-500/30 text-blue-500 text-xs rounded mb-3 flex items-center gap-1.5 font-sans">
                    <Shield size={14} />
                    <span>Logged in as Command Staff. Please select a District and Station.</span>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label required" htmlFor="uidbNumber">UIDB Gazette Number</label>
                  <input
                    type="text"
                    id="uidbNumber"
                    name="uidbNumber"
                    className={`form-control ${errors.uidbNumber ? "border-red-500" : ""}`}
                    value={formData.uidbNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. UIDB-992/2026/ND…"
                    required
                    autocomplete="off"
                  />
                  {errors.uidbNumber && <span className="text-red-500 text-xs mt-1">{errors.uidbNumber}</span>}
                </div>

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
                  <label className="form-label" htmlFor="ddNumber">DD Number</label>
                  <input
                    type="text"
                    id="ddNumber"
                    name="ddNumber"
                    className="form-control"
                    value={formData.ddNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. DD-12A…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ddDate">DD Date</label>
                  <DateInput
                    id="ddDate"
                    inputClassName="form-control"
                    value={formData.ddDate}
                    onChange={(val) => handleInputChange({ target: { name: 'ddDate', value: val } })}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: OFFICER & INFORMANT INFO */}
            <div className="card transition-standard">
              <div className="card-title">
                <User size={18} aria-hidden="true" />
                <span>Reporting Officers & Informant</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="dutyOfficer">Duty Officer</label>
                  <input
                    type="text"
                    id="dutyOfficer"
                    name="dutyOfficer"
                    className="form-control"
                    value={formData.dutyOfficer}
                    onChange={handleInputChange}
                    placeholder="e.g. ASI Krishan Dutt…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ioName">IO Name (Investigating Officer)</label>
                  <input
                    type="text"
                    id="ioName"
                    name="ioName"
                    className="form-control"
                    value={formData.ioName}
                    onChange={handleInputChange}
                    placeholder="e.g. Inspector Ravindra Singh…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="informantName">Informant Name</label>
                  <input
                    type="text"
                    id="informantName"
                    name="informantName"
                    className="form-control"
                    value={formData.informantName}
                    onChange={handleInputChange}
                    placeholder="e.g. Satish Chand…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="informantMobile">Informant Mobile</label>
                  <input
                    type="tel"
                    id="informantMobile"
                    name="informantMobile"
                    className="form-control"
                    value={formData.informantMobile}
                    onChange={handleInputChange}
                    placeholder="Contact details of informant…"
                    inputMode="tel"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: FOUND PERSON LOGISTICS */}
            <div className="card transition-standard">
              <div className="card-title">
                <MapPin size={18} aria-hidden="true" />
                <span>Body Discovery Details</span>
              </div>
              <div className="form-grid">
                <div className="form-group col-span-full">
                  <label className="form-label required" htmlFor="foundPlace">Place Body Found</label>
                  <input
                    type="text"
                    id="foundPlace"
                    name="foundPlace"
                    className={`form-control ${errors.foundPlace ? "border-red-500" : ""}`}
                    value={formData.foundPlace}
                    onChange={handleInputChange}
                    placeholder="Specific landmark of recovery spot…"
                    required
                    autocomplete="off"
                  />
                  {errors.foundPlace && <span className="text-red-500 text-xs mt-1">{errors.foundPlace}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="uidbDate">Discovery Date</label>
                  <DateInput
                    id="uidbDate"
                    inputClassName="form-control"
                    value={formData.uidbDate}
                    onChange={(val) => handleInputChange({ target: { name: 'uidbDate', value: val } })}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* STEP 2: PHYSICAL DESCRIPTION */}
        {activeStep === 2 && (
          <>
            {/* SECTION 4: PHYSICAL DESCRIPTION */}
            <div className="card transition-standard">
              <div className="card-title">
                <Sparkles size={18} aria-hidden="true" />
                <span>Corpse Physical Description</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="name">Assumed Name / Unknown Tag</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    className="form-control"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Unknown Male / Jane Doe…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="age">Estimated Age</label>
                  <input
                    type="text"
                    id="age"
                    name="age"
                    className="form-control"
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="e.g. 35-40 years…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group required">
                  <label className="form-label" htmlFor="gender">Gender</label>
                  <select
                    id="gender"
                    name="gender"
                    className={`form-control ${errors.gender ? "border-red-500" : ""}`}
                    value={formData.gender}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.gender && <span className="text-red-500 text-xs mt-1">{errors.gender}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="height">Height</label>
                  <input
                    type="text"
                    id="height"
                    name="height"
                    className="form-control"
                    value={formData.height}
                    onChange={handleInputChange}
                    placeholder='e.g. 5&apos;7&quot;…'
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="complexion">Complexion</label>
                  <input
                    type="text"
                    id="complexion"
                    name="complexion"
                    className="form-control"
                    value={formData.complexion}
                    onChange={handleInputChange}
                    placeholder="e.g. Shallow / Fair / Dark…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="identificationMarks">Identification Marks</label>
                  <input
                    type="text"
                    id="identificationMarks"
                    name="identificationMarks"
                    className="form-control"
                    value={formData.identificationMarks}
                    onChange={handleInputChange}
                    placeholder="e.g. Tattoos, birthmarks, physical scars…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="description">Detailed Description of Apparel & Condition</label>
                  <textarea
                    id="description"
                    name="description"
                    className="form-control"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Clothing styles, fabrics, body stature details..."
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* STEP 3: IDENTIFICATION & ZIPNET */}
        {activeStep === 3 && (
          <>
            {/* SECTION 5: IDENTIFICATION */}
            <div className="card transition-standard">
              <div className="card-title">
                <CheckSquare size={18} aria-hidden="true" />
                <span>ZIPNET Database & Status</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="zipnetNumber">ZIPNET Number</label>
                  <input
                    type="text"
                    id="zipnetNumber"
                    name="zipnetNumber"
                    className="form-control"
                    value={formData.zipnetNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. ZIP-ND-2026-88912…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <span className="form-label">Identified Status</span>
                  <label className="toggle-container" htmlFor="identified-toggle">
                    <input
                      type="checkbox"
                      id="identified-toggle"
                      className="toggle-checkbox"
                      checked={formData.identified}
                      onChange={() => handleToggleChange("identified")}
                    />
                    <div className="toggle-switch" aria-hidden="true"></div>
                    <span className="text-sm font-medium">
                      {formData.identified ? "Corpse Identified" : "Still Unidentified"}
                    </span>
                  </label>
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="status">Current Status / Mortuary Remarks</label>
                  <input
                    type="text"
                    id="status"
                    name="status"
                    className="form-control"
                    value={formData.status}
                    onChange={handleInputChange}
                    placeholder="e.g. Mortuary status, active missing record matches…"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
