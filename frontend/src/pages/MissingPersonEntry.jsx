import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Save, FileCheck, Search, User, MapPin, Award, CheckSquare, AlertTriangle, Shield, ShieldOff } from "lucide-react";
import { DISTRICTS_AND_STATIONS } from "../utils/policeData.js";
import useAuthStore from "../store/authStore.js";
import api from "../utils/api.js";
import toast from "react-hot-toast";
import DateInput from "../components/ui/DateInput.jsx";
import { formatDMY } from "../utils/dateFormat.js";

export default function MissingPersonEntry() {
  const { onSubmitReport, addNotification } = useOutletContext();
  const { user } = useAuthStore();
  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState({
    uid: "",
    district: "New Delhi District (NDD)",
    policeStation: "Parliament Street",
    ddNumber: "",
    dateTime: `${formatDMY(new Date())} 00:00`,
    missingDate: formatDMY(new Date()),
    missingPlace: "",
    name: "",
    age: "",
    gender: "",
    majorMinor: "",
    personalDescription: "",
    dutyOfficer: "",
    ioName: "",
    informedBy: "",
    contactNumber: "",
    trackChildNumber: "",
    trackChildDate: "",
    zipnetNumber: "",
    status: "",
    foundPlace: "",
    tracedDdNumber: "",
    firNumber: "",
    firDate: ""
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
          <p>Missing Person entry forms are only accessible to Police Station Operators. Switch to a PS Operator view using the Console Scope selector to enter data.</p>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "Report & Informant" },
    { num: 2, label: "Missing Person Details" },
    { num: 3, label: "Tracking & Recovery" }
  ];

  const handleQuickFill = () => {
    setFormData({
      district: "New Delhi District (NDD)",
      policeStation: "Parliament Street",
      ddNumber: "DD-30A",
      dateTime: "12/06/2026 14:10",
      missingDate: "12/06/2026",
      missingPlace: "Near Block-C Park, Karol Bagh, Delhi",
      name: "Aditya Verma",
      age: "14",
      gender: "Male",
      majorMinor: "Minor",
      personalDescription: "Height approx 4'11\", slim built, wearing blue school uniform (Karol Bagh Public School), black shoes. Carrying red school bag. Birthmark near left ear.",
      dutyOfficer: "ASI Krishan Dutt",
      ioName: "Inspector Ravindra Singh",
      informedBy: "Rajesh Verma (Father)",
      contactNumber: "9876598765",
      trackChildNumber: "TC-M-2026-90412",
      trackChildDate: "12/06/2026",
      zipnetNumber: "ZIP-MIS-28891A",
      status: "Traced & Recovered",
      foundPlace: "New Delhi Railway Station Platform 1 (with GRP)",
      tracedDdNumber: "DD-08B",
      firNumber: "FIR-228/2026",
      firDate: "13/06/2026"
    });
    setErrors({});
    addNotification("Missing person mock data injected.", "info");
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

  const validate = () => {
    const tempErrors = {};
    if (!formData.district) tempErrors.district = "District is required";
    if (!formData.policeStation) tempErrors.policeStation = "Police Station is required";
    if (!formData.ddNumber) tempErrors.ddNumber = "DD Number is required";
    if (!formData.name) tempErrors.name = "Person Name is required";
    if (!formData.age) tempErrors.age = "Age is required";
    if (!formData.missingPlace) tempErrors.missingPlace = "Missing Place is required";
    if (!formData.informedBy) tempErrors.informedBy = "Reporting source name is required";

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSaveDraft = () => {
    addNotification("Missing report draft entry saved.", "success");
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
        record_type: 'MISSING',
        record_date: formData.missingDate || formData.dateTime?.split(' ')[0] || formatDMY(new Date()),
        data: formData
      });
      const uid = res.data.data?.uid;
      const savedData = { ...formData, uid: uid || formData.uid };
      onSubmitReport("Missing person search docket", savedData, "missing");
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
          <h1>Missing Person Registration & Recovery</h1>
          <p className="page-desc">Record missing citizen reports, update Track Child portals, and log recovery status.</p>
        </div>
        <button 
          type="button" 
          className="btn btn-secondary transition-standard"
          onClick={handleQuickFill}
          aria-label="Pre-fill missing person fields with mock search data"
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
              aria-label="Save draft missing person record"
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
                aria-label="Submit missing person docket entry"
                disabled={isSubmitting}
              >
                <FileCheck size={16} aria-hidden="true" className="menu-icon" />
                <span>{isSubmitting ? 'Saving…' : 'Submit Entry'}</span>
              </button>
            )}
          </div>
        </div>

        {/* STEP 1: REPORT & INFORMANT */}
        {activeStep === 1 && (
          <>
            {/* SECTION 1: MISSING REPORT METADATA */}
            <div className="card transition-standard">
              <div className="card-title">
                <Search size={18} aria-hidden="true" />
                <span>Missing Report Registration</span>
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
                  <label className="form-label required" htmlFor="ddNumber">DD Number</label>
                  <input
                    type="text"
                    id="ddNumber"
                    name="ddNumber"
                    className={`form-control ${errors.ddNumber ? "border-red-500" : ""}`}
                    value={formData.ddNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. DD-30A…"
                    required
                    autocomplete="off"
                  />
                  {errors.ddNumber && <span className="text-red-500 text-xs mt-1">{errors.ddNumber}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="dateTime">Report Date & Time</label>
                  <div className="flex gap-2">
                    <DateInput
                      id="dateTime"
                      inputClassName="form-control"
                      className="flex-1"
                      value={(formData.dateTime || '').split(' ')[0] || ''}
                      onChange={(val) => {
                        const time = (formData.dateTime || '').split(' ')[1] || '00:00';
                        handleInputChange({ target: { name: 'dateTime', value: val ? `${val} ${time}` : '' } });
                      }}
                    />
                    <input
                      type="time"
                      className="form-control w-32"
                      value={(formData.dateTime || '').split(' ')[1] || ''}
                      onChange={(e) => {
                        const datePart = (formData.dateTime || '').split(' ')[0] || '';
                        handleInputChange({ target: { name: 'dateTime', value: datePart ? `${datePart} ${e.target.value}` : '' } });
                      }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="missingDate">Missing Since Date</label>
                  <DateInput
                    id="missingDate"
                    inputClassName="form-control"
                    value={formData.missingDate}
                    onChange={(val) => handleInputChange({ target: { name: 'missingDate', value: val } })}
                  />
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label required" htmlFor="missingPlace">Last Seen Place / Missing Place</label>
                  <input
                    type="text"
                    id="missingPlace"
                    name="missingPlace"
                    className={`form-control ${errors.missingPlace ? "border-red-500" : ""}`}
                    value={formData.missingPlace}
                    onChange={handleInputChange}
                    placeholder="e.g. Near Block-C Park, Karol Bagh…"
                    required
                    autocomplete="off"
                  />
                  {errors.missingPlace && <span className="text-red-500 text-xs mt-1">{errors.missingPlace}</span>}
                </div>
              </div>
            </div>

            {/* SECTION 3: REPORTING OFFICER & SOURCE */}
            <div className="card transition-standard">
              <div className="card-title">
                <Award size={18} aria-hidden="true" />
                <span>Reporting Officers & Informant Source</span>
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

                <div className="form-group required">
                  <label className="form-label" htmlFor="informedBy">Informed By (Reporter)</label>
                  <input
                    type="text"
                    id="informedBy"
                    name="informedBy"
                    className={`form-control ${errors.informedBy ? "border-red-500" : ""}`}
                    value={formData.informedBy}
                    onChange={handleInputChange}
                    placeholder="Parent or relative name…"
                    required
                    autocomplete="off"
                  />
                  {errors.informedBy && <span className="text-red-500 text-xs mt-1">{errors.informedBy}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="contactNumber">Reporter Mobile</label>
                  <input
                    type="tel"
                    id="contactNumber"
                    name="contactNumber"
                    className="form-control"
                    value={formData.contactNumber}
                    onChange={handleInputChange}
                    placeholder="Contact mobile number…"
                    inputMode="tel"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* STEP 2: MISSING PERSON DETAILS */}
        {activeStep === 2 && (
          <>
            {/* SECTION 2: MISSING PERSON DETAILS */}
            <div className="card transition-standard">
              <div className="card-title">
                <User size={18} aria-hidden="true" />
                <span>Missing Person Demographics</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required" htmlFor="name">Full Name</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    className={`form-control ${errors.name ? "border-red-500" : ""}`}
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Full name of missing citizen…"
                    required
                    autocomplete="off"
                  />
                  {errors.name && <span className="text-red-500 text-xs mt-1">{errors.name}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label required" htmlFor="age">Age</label>
                  <input
                    type="number"
                    id="age"
                    name="age"
                    className={`form-control ${errors.age ? "border-red-500" : ""}`}
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="Age in years…"
                    inputMode="numeric"
                    required
                    autocomplete="off"
                  />
                  {errors.age && <span className="text-red-500 text-xs mt-1">{errors.age}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="gender">Gender</label>
                  <select
                    id="gender"
                    name="gender"
                    className="form-control"
                    value={formData.gender}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="majorMinor">Classification</label>
                  <select
                    id="majorMinor"
                    name="majorMinor"
                    className="form-control"
                    value={formData.majorMinor}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Classification</option>
                    <option value="Major">Major (18+)</option>
                    <option value="Minor">Minor (&lt;18)</option>
                  </select>
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="personalDescription">Physical Apparel & Height Description</label>
                  <textarea
                    id="personalDescription"
                    name="personalDescription"
                    className="form-control"
                    value={formData.personalDescription}
                    onChange={handleInputChange}
                    placeholder="Height, body build, birthmarks, birth date, clothing types worn when last seen..."
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* STEP 3: TRACKING & RECOVERY */}
        {activeStep === 3 && (
          <>
            {/* SECTION 4: INTEGRATIONS TRACKING */}
            <div className="card transition-standard">
              <div className="card-title">
                <CheckSquare size={18} aria-hidden="true" />
                <span>National Integration & ZIPNET Portals</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="trackChildNumber">Track Missing Child Reference ID</label>
                  <input
                    type="text"
                    id="trackChildNumber"
                    name="trackChildNumber"
                    className="form-control"
                    value={formData.trackChildNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. TC-M-2026-90412…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="trackChildDate">Track Child Registered Date</label>
                  <DateInput
                    id="trackChildDate"
                    inputClassName="form-control"
                    value={formData.trackChildDate}
                    onChange={(val) => handleInputChange({ target: { name: 'trackChildDate', value: val } })}
                  />
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="zipnetNumber">ZIPNET Missing Person Code</label>
                  <input
                    type="text"
                    id="zipnetNumber"
                    name="zipnetNumber"
                    className="form-control"
                    value={formData.zipnetNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. ZIP-MIS-28891A…"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 5: RECOVERY DETAILS */}
            <div className="card transition-standard">
              <div className="card-title">
                <MapPin size={18} aria-hidden="true" />
                <span>Recovery & Traced Logs</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="status">Status</label>
                  <select
                    id="status"
                    name="status"
                    className="form-control"
                    value={formData.status}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Status</option>
                    <option value="Active Search">Active Search</option>
                    <option value="Traced & Recovered">Traced & Recovered</option>
                    <option value="Closed (Other)">Closed (Other)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="foundPlace">Found Place</label>
                  <input
                    type="text"
                    id="foundPlace"
                    name="foundPlace"
                    className="form-control"
                    value={formData.foundPlace}
                    onChange={handleInputChange}
                    placeholder="Recovery location details…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="tracedDdNumber">Traced DD Number</label>
                  <input
                    type="text"
                    id="tracedDdNumber"
                    name="tracedDdNumber"
                    className="form-control"
                    value={formData.tracedDdNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. DD-08B…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="firNumber">Associated FIR Number</label>
                  <input
                    type="text"
                    id="firNumber"
                    name="firNumber"
                    className="form-control"
                    value={formData.firNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. FIR-228/2026…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="firDate">Associated FIR Date</label>
                  <DateInput
                    id="firDate"
                    inputClassName="form-control"
                    value={formData.firDate}
                    onChange={(val) => handleInputChange({ target: { name: 'firDate', value: val } })}
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
