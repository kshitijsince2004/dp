import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Save, FileCheck, PhoneCall, User, MapPin, ShieldAlert, Award, AlertTriangle, Shield, ShieldOff } from "lucide-react";
import { DISTRICTS_AND_STATIONS } from "../utils/policeData.js";
import useAuthStore from "../store/authStore.js";
import api from "../utils/api.js";
import toast from "react-hot-toast";
import DateInput from "../components/ui/DateInput.jsx";
import { formatDMY } from "../utils/dateFormat.js";

export default function PCRCallEntry() {
  const { onSubmitReport, addNotification } = useOutletContext();
  const { user } = useAuthStore();
  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState({
    uid: "",
    district: "New Delhi District (NDD)",
    policeStation: "Parliament Street",
    gdNumber: "",
    pcrDate: formatDMY(new Date()),
    pcrTime: "",
    callerName: "",
    callerMobile: "",
    callerAddress: "",
    head: "",
    pcrGist: "",
    location: "",
    ioName: "",
    eoName: "",
    actionTaken: "",
    status: "",
    arrivalDdNumber: "",
    arrivalTime: ""
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
          <p>PCR Call entry forms are only accessible to Police Station Operators. Switch to a PS Operator view using the Console Scope selector to enter data.</p>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "Call & Caller Info" },
    { num: 2, label: "Incident & Dispatch" },
    { num: 3, label: "Action Taken" }
  ];

  const handleQuickFill = () => {
    setFormData({
      district: "New Delhi District (NDD)",
      policeStation: "Parliament Street",
      gdNumber: "GD-821A/2026",
      pcrDate: "13/06/2026",
      pcrTime: "08:12",
      callerName: "Sanjay Malhotra",
      callerMobile: "9988776655",
      callerAddress: "A-12, Sector 8, Dwarka, New Delhi",
      head: "Physical Dispute / Assault",
      pcrGist: "The caller reported a physical altercation between two shopkeepers over parking space. Verbal arguments escalated to pushing. Local public gathered. Immediate police dispatch requested.",
      location: "Main Market, Dwarka Sector 8, Near Central Bank ATM",
      ioName: "ASI Devender Singh",
      eoName: "HC Satya Prakash (PCR Van Eagle-4)",
      actionTaken: "PCR Van Eagle-4 arrived at the scene within 7 minutes. The disputing parties were separated. ASI Devender Singh reached the spot and recorded statements. Both shopkeepers agreed to settle the parking dispute amicably and gave written undertakings. No injuries reported.",
      status: "Resolved",
      arrivalDdNumber: "DD-44B",
      arrivalTime: "08:19"
    });
    setErrors({});
    addNotification("PCR mock data injected.", "info");
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
    if (!formData.gdNumber) tempErrors.gdNumber = "GD Number is required";
    if (!formData.callerMobile) tempErrors.callerMobile = "Caller Mobile is required";
    if (!formData.head) tempErrors.head = "Incident Head is required";
    if (!formData.location) tempErrors.location = "Incident Location is required";

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSaveDraft = () => {
    addNotification("PCR call draft entry saved.", "success");
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
        record_type: 'PCR_CALL',
        record_date: formData.pcrDate || formatDMY(new Date()),
        data: formData
      });
      const uid = res.data.data?.uid;
      const savedData = { ...formData, uid: uid || formData.uid };
      onSubmitReport("PCR dispatch & action docket", savedData, "pcr");
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
          <h1>PCR Call Dispatch & Log</h1>
          <p className="page-desc">Record incoming distress calls, dispatch emergency vehicles, and log response actions.</p>
        </div>
        <button 
          type="button" 
          className="btn btn-secondary transition-standard"
          onClick={handleQuickFill}
          aria-label="Pre-fill PCR form with mock dispatch data"
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
              aria-label="Save draft PCR log"
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
                aria-label="Submit PCR entry and log activity"
                disabled={isSubmitting}
              >
                <FileCheck size={16} aria-hidden="true" className="menu-icon" />
                <span>{isSubmitting ? 'Saving…' : 'Submit PCR Entry'}</span>
              </button>
            )}
          </div>
        </div>

        {/* STEP 1: CALL & CALLER INFO */}
        {activeStep === 1 && (
          <>
            {/* SECTION 1: PCR DETAILS */}
            <div className="card transition-standard">
              <div className="card-title">
                <PhoneCall size={18} aria-hidden="true" />
                <span>PCR General Diary (GD) Details</span>
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
                  <label className="form-label required" htmlFor="gdNumber">GD Number</label>
                  <input
                    type="text"
                    id="gdNumber"
                    name="gdNumber"
                    className={`form-control ${errors.gdNumber ? "border-red-500" : ""}`}
                    value={formData.gdNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. GD-821A/2026…"
                    required
                    autocomplete="off"
                  />
                  {errors.gdNumber && <span className="text-red-500 text-xs mt-1">{errors.gdNumber}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="pcrDate">PCR Date</label>
                  <DateInput
                    id="pcrDate"
                    inputClassName="form-control"
                    value={formData.pcrDate}
                    onChange={(val) => handleInputChange({ target: { name: 'pcrDate', value: val } })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="pcrTime">PCR Time</label>
                  <input
                    type="time"
                    id="pcrTime"
                    name="pcrTime"
                    className="form-control"
                    value={formData.pcrTime}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: CALLER INFORMATION */}
            <div className="card transition-standard">
              <div className="card-title">
                <User size={18} aria-hidden="true" />
                <span>Caller Details</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="callerName">Caller Name</label>
                  <input
                    type="text"
                    id="callerName"
                    name="callerName"
                    className="form-control"
                    value={formData.callerName}
                    onChange={handleInputChange}
                    placeholder="Name of informant…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required" htmlFor="callerMobile">Caller Mobile</label>
                  <input
                    type="tel"
                    id="callerMobile"
                    name="callerMobile"
                    className={`form-control ${errors.callerMobile ? "border-red-500" : ""}`}
                    value={formData.callerMobile}
                    onChange={handleInputChange}
                    placeholder="Mobile number…"
                    inputMode="tel"
                    required
                    autocomplete="off"
                  />
                  {errors.callerMobile && <span className="text-red-500 text-xs mt-1">{errors.callerMobile}</span>}
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="callerAddress">Caller Address</label>
                  <input
                    type="text"
                    id="callerAddress"
                    name="callerAddress"
                    className="form-control"
                    value={formData.callerAddress}
                    onChange={handleInputChange}
                    placeholder="Address of caller…"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* STEP 2: INCIDENT & DISPATCH */}
        {activeStep === 2 && (
          <>
            {/* SECTION 3: INCIDENT INFORMATION */}
            <div className="card transition-standard">
              <div className="card-title">
                <ShieldAlert size={18} aria-hidden="true" />
                <span>Incident Classification & Location</span>
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
                  <label className="form-label required" htmlFor="head">Head (Classification)</label>
                  <input
                    type="text"
                    id="head"
                    name="head"
                    className={`form-control ${errors.head ? "border-red-500" : ""}`}
                    value={formData.head}
                    onChange={handleInputChange}
                    placeholder="e.g. Assault / Accident / Theft…"
                    required
                    autocomplete="off"
                  />
                  {errors.head && <span className="text-red-500 text-xs mt-1">{errors.head}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label required" htmlFor="location">Incident Location</label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    className={`form-control ${errors.location ? "border-red-500" : ""}`}
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="e.g. Sector 8 Market ATM…"
                    required
                    autocomplete="off"
                  />
                  {errors.location && <span className="text-red-500 text-xs mt-1">{errors.location}</span>}
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="pcrGist">PCR Gist</label>
                  <textarea
                    id="pcrGist"
                    name="pcrGist"
                    className="form-control"
                    value={formData.pcrGist}
                    onChange={handleInputChange}
                    placeholder="Brief summary of the call complaint..."
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: ASSIGNMENT */}
            <div className="card transition-standard">
              <div className="card-title">
                <Award size={18} aria-hidden="true" />
                <span>Dispatch Assignments</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="ioName">IO Name (Investigating Officer)</label>
                  <input
                    type="text"
                    id="ioName"
                    name="ioName"
                    className="form-control"
                    value={formData.ioName}
                    onChange={handleInputChange}
                    placeholder="e.g. ASI Devender Singh…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="eoName">EO Name (Enquiry Officer / PCR Staff)</label>
                  <input
                    type="text"
                    id="eoName"
                    name="eoName"
                    className="form-control"
                    value={formData.eoName}
                    onChange={handleInputChange}
                    placeholder="e.g. HC Satya Prakash…"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* STEP 3: ACTION TAKEN */}
        {activeStep === 3 && (
          <>
            {/* SECTION 5: ACTION TAKEN */}
            <div className="card transition-standard">
              <div className="card-title">
                <MapPin size={18} aria-hidden="true" />
                <span>Action Taken Report (ATR)</span>
              </div>
              <div className="form-grid">
                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="actionTaken">Action Taken</label>
                  <textarea
                    id="actionTaken"
                    name="actionTaken"
                    className="form-control"
                    value={formData.actionTaken}
                    onChange={handleInputChange}
                    placeholder="Record immediate response findings and details here..."
                  />
                </div>

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
                    <option value="Resolved">Resolved</option>
                    <option value="Transferred to PS">Transferred to PS</option>
                    <option value="Untraced">Untraced Dispute</option>
                    <option value="Active Investigation">Active Investigation</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="arrivalDdNumber">Arrival DD Number</label>
                  <input
                    type="text"
                    id="arrivalDdNumber"
                    name="arrivalDdNumber"
                    className="form-control"
                    value={formData.arrivalDdNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. DD-44B…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="arrivalTime">Arrival Time</label>
                  <input
                    type="time"
                    id="arrivalTime"
                    name="arrivalTime"
                    className="form-control"
                    value={formData.arrivalTime}
                    onChange={handleInputChange}
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
