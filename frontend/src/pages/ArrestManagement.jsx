import React, { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { Save, FileCheck, ShieldAlert, User, MapPin, CheckSquare, Phone, Upload, AlertTriangle, Shield, ShieldOff, Link2, Search, X } from "lucide-react";
import { DISTRICTS_AND_STATIONS } from "../utils/policeData.js";
import useAuthStore from "../store/authStore.js";
import api from "../utils/api.js";
import toast from "react-hot-toast";
import DateInput from "../components/ui/DateInput.jsx";
import { formatDMY } from "../utils/dateFormat.js";

export default function ArrestManagement() {
  const { onSubmitReport, addNotification } = useOutletContext();
  const { user } = useAuthStore();
  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState({
    uid: "",
    district: "New Delhi District (NDD)",
    policeStation: "Parliament Street",
    firDdNumber: "",
    firDate: formatDMY(new Date()),
    act: "",
    sections: "",
    crimeHead: "",
    fullName: "",
    fatherName: "",
    age: "",
    gender: "",
    address: "",
    dateOfArrest: "",
    timeOfArrest: "",
    placeOfArrest: "",
    nafisPrepared: false,
    dossierPrepared: false,
    searchSlipPrepared: false,
    addressVerified: false,
    verifyingOfficerName: "",
    verifyingOfficerRank: "",
    kinName: "",
    kinMobile: "",
    kinRelationship: "",
    photoPath: ""
  });

  const [errors, setErrors] = useState({});

  // Case-linkage state
  const [arrestType, setArrestType] = useState('');       // 'fir_linked' | 'standalone'
  const [caseSearchQuery, setCaseSearchQuery] = useState('');
  const [caseSearchResults, setCaseSearchResults] = useState([]);
  const [caseSearchLoading, setCaseSearchLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const caseSearchTimeout = useRef(null);

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
          <p>Arrest entry forms are only accessible to Police Station Operators. Switch to a PS Operator view using the Console Scope selector to enter data.</p>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "FIR & Spot" },
    { num: 2, label: "Demographics" },
    { num: 3, label: "Verifications" },
    { num: 4, label: "Attachments" }
  ];

  const handleQuickFill = () => {
    setFormData({
      district: "New Delhi District (NDD)",
      policeStation: "Parliament Street",
      firDdNumber: "FIR-104/2026",
      firDate: "08/06/2026",
      act: "IPC",
      sections: "Sec 379/411 (Theft & Receiving Stolen Property)",
      crimeHead: "Burglary",
      fullName: "Ramesh Kumar Yadav",
      fatherName: "Sohan Lal Yadav",
      age: "28",
      gender: "Male",
      address: "Jhuggi No. 12, Yamuna Bank Khas, Delhi",
      dateOfArrest: "12/06/2026",
      timeOfArrest: "23:45",
      placeOfArrest: "Nizamuddin Railway Station, Platform 3",
      nafisPrepared: true,
      dossierPrepared: true,
      searchSlipPrepared: true,
      addressVerified: true,
      verifyingOfficerName: "Sub-Inspector Sandeep Sharma",
      verifyingOfficerRank: "Sub-Inspector",
      kinName: "Sunita Yadav",
      kinMobile: "9899123456",
      kinRelationship: "Wife",
      photoPath: "ramesh_yadav_mugshot.jpg"
    });
    setErrors({});
    addNotification("Arrest mock data loaded successfully.", "info");
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

  const handleCaseSearch = (query) => {
    setCaseSearchQuery(query);
    clearTimeout(caseSearchTimeout.current);
    if (!query || query.length < 2) { setCaseSearchResults([]); return; }
    caseSearchTimeout.current = setTimeout(async () => {
      setCaseSearchLoading(true);
      try {
        const res = await api.get('/v1/records', { params: { type: 'CASE', search: query } });
        const cases = res.data?.data?.cases || [];
        setCaseSearchResults(cases.slice(0, 10));
      } catch {
        setCaseSearchResults([]);
      } finally {
        setCaseSearchLoading(false);
      }
    }, 350);
  };

  const handleSelectCase = (caseRecord) => {
    setSelectedCase(caseRecord);
    setCaseSearchResults([]);
    setCaseSearchQuery('');
    const firNo = caseRecord.data?.fir_no || caseRecord.data?.firNumber || '';
    setFormData(prev => ({ ...prev, firDdNumber: firNo }));
    if (errors.selectedCase) setErrors(prev => ({ ...prev, selectedCase: null }));
  };

  const handleClearCase = () => {
    setSelectedCase(null);
    setCaseSearchQuery('');
    setCaseSearchResults([]);
    setFormData(prev => ({ ...prev, firDdNumber: '' }));
  };

  const validate = () => {
    const tempErrors = {};
    if (!arrestType) tempErrors.arrestType = "Please select whether this is a case-linked arrest or standalone Kalandra";
    if (arrestType === 'fir_linked' && !selectedCase) tempErrors.selectedCase = "Please search and select the linked FIR Case";
    if (!formData.district) tempErrors.district = "District is required";
    if (!formData.policeStation) tempErrors.policeStation = "Police Station is required";
    if (arrestType === 'standalone' && !formData.firDdNumber) tempErrors.firDdNumber = "DD Number is required for Kalandra";
    if (!formData.fullName) tempErrors.fullName = "Full Name is required";
    if (!formData.age) tempErrors.age = "Age is required";
    if (!formData.dateOfArrest) tempErrors.dateOfArrest = "Date of Arrest is required";
    if (!formData.placeOfArrest) tempErrors.placeOfArrest = "Place of Arrest is required";

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSaveDraft = () => {
    addNotification("Arrest record draft saved successfully.", "success");
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
        record_type: 'ARREST',
        record_date: formData.dateOfArrest || formData.firDate || formatDMY(new Date()),
        data: { ...formData, arrest_type: arrestType }
      });
      const arrestRecordId = res.data.data?.id;
      const uid = res.data.data?.uid;

      // Phase 2: create the case → arrest link if FIR-linked
      if (arrestType === 'fir_linked' && selectedCase?.id && arrestRecordId) {
        try {
          await api.post('/v1/record-links', {
            sourceRecordId: selectedCase.id,
            targetRecordId: arrestRecordId,
            linkTypeCode: 'CASE_ARREST',
            metadata: { notes: 'Linked during arrest entry', migrated: false }
          });
        } catch (linkErr) {
          toast.error('Arrest saved but case link failed. Please re-link from the case record.');
        }
      }

      const savedData = { ...formData, uid: uid || formData.uid, arrest_type: arrestType };
      onSubmitReport("Arrest record docket", savedData, "arrest");
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
          <h1>Arrest Management & Verification</h1>
          <p className="page-desc">Register arrested suspects, verify NAFIS/Dossiers, and notify emergency contacts.</p>
        </div>
        <button 
          type="button" 
          className="btn btn-secondary transition-standard"
          onClick={handleQuickFill}
          aria-label="Pre-fill arrest form fields with mock data"
        >
          <span>Fill Test Data</span>
        </button>
      </div>

      {/* Stepper Progress bar */}
      <div className="stepper" aria-label="Arrest Steps Progress">
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
                aria-label="Go to previous step"
              >
                <span>Back</span>
              </button>
            )}
            
            <button 
              type="button" 
              className="btn btn-secondary transition-standard"
              onClick={handleSaveDraft}
              aria-label="Save draft of arrest docket"
            >
              <Save size={16} aria-hidden="true" className="menu-icon" />
              <span>Save Draft</span>
            </button>
            
            {activeStep < 4 ? (
              <button 
                type="button" 
                className="btn btn-primary transition-standard"
                onClick={() => setActiveStep(prev => prev + 1)}
                aria-label="Go to next step"
              >
                <span>Next</span>
              </button>
            ) : (
              <button 
                type="submit" 
                className="btn btn-primary transition-standard"
                aria-label="Submit arrest docket and create police docket"
                disabled={isSubmitting}
              >
                <FileCheck size={16} aria-hidden="true" className="menu-icon" />
                <span>{isSubmitting ? 'Saving…' : 'Submit Arrest'}</span>
              </button>
            )}
          </div>
        </div>

        {/* STEP 1: FIR & SPOT DETAILS */}
        {activeStep === 1 && (
          <div className="transition-standard">
            {/* CASE LINKAGE CARD */}
            <div className="card">
              <div className="card-title">
                <Link2 size={18} aria-hidden="true" />
                <span>Case Linkage</span>
              </div>
              <div className="form-grid">
                <div className="col-span-full">
                  <label className="form-label required">Is this arrest linked to a registered FIR Case?</label>
                  <div className="flex gap-6 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio" name="arrestType" value="fir_linked"
                        checked={arrestType === 'fir_linked'}
                        onChange={() => { setArrestType('fir_linked'); if (errors.arrestType) setErrors(p => ({ ...p, arrestType: null })); }}
                      />
                      <span className="text-sm font-medium">Linked to FIR / Case</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio" name="arrestType" value="standalone"
                        checked={arrestType === 'standalone'}
                        onChange={() => { setArrestType('standalone'); setSelectedCase(null); setCaseSearchResults([]); if (errors.arrestType) setErrors(p => ({ ...p, arrestType: null })); }}
                      />
                      <span className="text-sm font-medium">Standalone Kalandra (no case)</span>
                    </label>
                  </div>
                  {errors.arrestType && <span className="text-red-500 text-xs mt-1 block">{errors.arrestType}</span>}
                </div>

                {arrestType === 'fir_linked' && (
                  <div className="col-span-full">
                    {selectedCase ? (
                      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex justify-between items-start gap-3">
                        <div>
                          <p className="text-sm font-semibold text-green-400">
                            FIR: {selectedCase.data?.fir_no || selectedCase.data?.firNumber || 'N/A'} &mdash; {selectedCase.data?.uid}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{selectedCase.data?.local_head || selectedCase.data?.localHead || ''}</p>
                          <p className="text-xs text-slate-500">{selectedCase.ps_name}</p>
                        </div>
                        <button type="button" className="text-xs text-red-400 flex items-center gap-1 shrink-0" onClick={handleClearCase}>
                          <X size={12} /> Change
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <label className="form-label required">Search for Case (by FIR no., UID, or place)</label>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            className={`form-control pl-8 ${errors.selectedCase ? 'border-red-500' : ''}`}
                            placeholder="Type FIR number, UID, or place of occurrence…"
                            value={caseSearchQuery}
                            onChange={e => handleCaseSearch(e.target.value)}
                            autoComplete="off"
                          />
                        </div>
                        {errors.selectedCase && <span className="text-red-500 text-xs mt-1 block">{errors.selectedCase}</span>}
                        {caseSearchLoading && <p className="text-xs text-slate-400 mt-1">Searching…</p>}
                        {caseSearchResults.length > 0 && (
                          <div className="mt-1 border border-slate-700 rounded-lg overflow-hidden">
                            {caseSearchResults.map(c => (
                              <button
                                key={c.id} type="button"
                                className="w-full text-left p-3 hover:bg-slate-700/60 border-b border-slate-700 last:border-0"
                                onClick={() => handleSelectCase(c)}
                              >
                                <span className="text-sm font-semibold">{c.data?.fir_no || c.data?.uid}</span>
                                <span className="ml-2 text-xs text-slate-400">{c.data?.local_head || c.data?.localHead}</span>
                                <span className="ml-2 text-xs text-slate-500">{c.ps_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 1: FIR INFORMATION */}
            <div className="card">
              <div className="card-title">
                <ShieldAlert size={18} aria-hidden="true" />
                <span>FIR / Crime Classification</span>
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
                  <label className="form-label required" htmlFor="firDdNumber">FIR/DD Number</label>
                  <input
                    type="text"
                    id="firDdNumber"
                    name="firDdNumber"
                    className={`form-control ${errors.firDdNumber ? "border-red-500" : ""}`}
                    value={formData.firDdNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. FIR-104/2026…"
                    required
                    autocomplete="off"
                  />
                  {errors.firDdNumber && <span className="text-red-500 text-xs mt-1">{errors.firDdNumber}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="firDate">FIR Date</label>
                  <DateInput
                    id="firDate"
                    inputClassName="form-control"
                    value={formData.firDate}
                    onChange={(val) => handleInputChange({ target: { name: 'firDate', value: val } })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="act">Act</label>
                  <input
                    type="text"
                    id="act"
                    name="act"
                    className="form-control"
                    value={formData.act}
                    onChange={handleInputChange}
                    placeholder="e.g. IPC / BNS…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="sections">Sections</label>
                  <input
                    type="text"
                    id="sections"
                    name="sections"
                    className="form-control"
                    value={formData.sections}
                    onChange={handleInputChange}
                    placeholder="e.g. Sec 379/411…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="crimeHead">Crime Head</label>
                  <input
                    type="text"
                    id="crimeHead"
                    name="crimeHead"
                    className="form-control"
                    value={formData.crimeHead}
                    onChange={handleInputChange}
                    placeholder="e.g. Burglary / Snatching…"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: ARREST LOGISTICS */}
            <div className="card">
              <div className="card-title">
                <MapPin size={18} aria-hidden="true" />
                <span>Arrest Logistics</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required" htmlFor="dateOfArrest">Date Of Arrest</label>
                  <DateInput
                    id="dateOfArrest"
                    inputClassName={`form-control ${errors.dateOfArrest ? "border-red-500" : ""}`}
                    value={formData.dateOfArrest}
                    onChange={(val) => handleInputChange({ target: { name: 'dateOfArrest', value: val } })}
                  />
                  {errors.dateOfArrest && <span className="text-red-500 text-xs mt-1">{errors.dateOfArrest}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="timeOfArrest">Time Of Arrest</label>
                  <input
                    type="time"
                    id="timeOfArrest"
                    name="timeOfArrest"
                    className="form-control"
                    value={formData.timeOfArrest}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label required" htmlFor="placeOfArrest">Place Of Arrest</label>
                  <input
                    type="text"
                    id="placeOfArrest"
                    name="placeOfArrest"
                    className={`form-control ${errors.placeOfArrest ? "border-red-500" : ""}`}
                    value={formData.placeOfArrest}
                    onChange={handleInputChange}
                    placeholder="e.g. Nizamuddin Railway Station, Platform 3…"
                    required
                    autocomplete="off"
                  />
                  {errors.placeOfArrest && <span className="text-red-500 text-xs mt-1">{errors.placeOfArrest}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: DEMOGRAPHICS */}
        {activeStep === 2 && (
          <div className="card transition-standard">
            <div className="card-title">
              <User size={18} aria-hidden="true" />
              <span>Arrested Person Demographics</span>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required" htmlFor="fullName">Full Name</label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  className={`form-control ${errors.fullName ? "border-red-500" : ""}`}
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="Full name of suspect…"
                  required
                  autocomplete="off"
                />
                {errors.fullName && <span className="text-red-500 text-xs mt-1">{errors.fullName}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="fatherName">Father Name</label>
                <input
                  type="text"
                  id="fatherName"
                  name="fatherName"
                  className="form-control"
                  value={formData.fatherName}
                  onChange={handleInputChange}
                  placeholder="Father's name…"
                  autocomplete="off"
                />
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

              <div className="form-group col-span-full">
                <label className="form-label" htmlFor="address">Address</label>
                <textarea
                  id="address"
                  name="address"
                  className="form-control"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Permanent or temporary residential address…"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: VERIFICATIONS */}
        {activeStep === 3 && (
          <div className="card transition-standard">
            <div className="card-title">
              <CheckSquare size={18} aria-hidden="true" />
              <span>National Verification Systems (NAFIS & Dossiers)</span>
            </div>
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="form-group">
                  <span className="form-label">NAFIS Prepared</span>
                  <label className="toggle-container" htmlFor="nafis-toggle">
                    <input
                      type="checkbox"
                      id="nafis-toggle"
                      className="toggle-checkbox"
                      checked={formData.nafisPrepared}
                      onChange={() => handleToggleChange("nafisPrepared")}
                    />
                    <div className="toggle-switch" aria-hidden="true"></div>
                    <span className="text-xs font-medium">
                      {formData.nafisPrepared ? "NAFIS Verified" : "Pending Check"}
                    </span>
                  </label>
                </div>

                <div className="form-group">
                  <span className="form-label">Dossier Prepared</span>
                  <label className="toggle-container" htmlFor="dossier-toggle">
                    <input
                      type="checkbox"
                      id="dossier-toggle"
                      className="toggle-checkbox"
                      checked={formData.dossierPrepared}
                      onChange={() => handleToggleChange("dossierPrepared")}
                    />
                    <div className="toggle-switch" aria-hidden="true"></div>
                    <span className="text-xs font-medium">
                      {formData.dossierPrepared ? "Dossier Active" : "No Dossier"}
                    </span>
                  </label>
                </div>

                <div className="form-group">
                  <span className="form-label">Search Slip Prepared</span>
                  <label className="toggle-container" htmlFor="search-toggle">
                    <input
                      type="checkbox"
                      id="search-toggle"
                      className="toggle-checkbox"
                      checked={formData.searchSlipPrepared}
                      onChange={() => handleToggleChange("searchSlipPrepared")}
                    />
                    <div className="toggle-switch" aria-hidden="true"></div>
                    <span className="text-xs font-medium">
                      {formData.searchSlipPrepared ? "Slip Logged" : "Not Logged"}
                    </span>
                  </label>
                </div>
              </div>

              <hr className="border-t border-slate-200 my-2" />

              <div className="form-grid">
                <div className="form-group">
                  <span className="form-label">Address Verified</span>
                  <label className="toggle-container" htmlFor="addr-verified-toggle">
                    <input
                      type="checkbox"
                      id="addr-verified-toggle"
                      className="toggle-checkbox"
                      checked={formData.addressVerified}
                      onChange={() => handleToggleChange("addressVerified")}
                    />
                    <div className="toggle-switch" aria-hidden="true"></div>
                    <span className="text-xs font-medium">
                      {formData.addressVerified ? "Verified Spot Visit" : "Pending Verification"}
                    </span>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="verifyingOfficerName">Verifying Officer Name</label>
                  <input
                    type="text"
                    id="verifyingOfficerName"
                    name="verifyingOfficerName"
                    className="form-control"
                    value={formData.verifyingOfficerName}
                    onChange={handleInputChange}
                    placeholder="e.g. Sub-Inspector Sandeep Sharma…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="verifyingOfficerRank">Verifying Officer Rank</label>
                  <input
                    type="text"
                    id="verifyingOfficerRank"
                    name="verifyingOfficerRank"
                    className="form-control"
                    value={formData.verifyingOfficerRank}
                    onChange={handleInputChange}
                    placeholder="e.g. Sub-Inspector…"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: ATTACHMENTS & NOTIFICATION */}
        {activeStep === 4 && (
          <div className="transition-standard">
            {/* SECTION 5: INFORMATION GIVEN TO */}
            <div className="card">
              <div className="card-title">
                <Phone size={18} aria-hidden="true" />
                <span>Emergency / Next-Of-Kin Notification (Required Sec 41A CrPC)</span>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="kinName">Relative Name</label>
                  <input
                    type="text"
                    id="kinName"
                    name="kinName"
                    className="form-control"
                    value={formData.kinName}
                    onChange={handleInputChange}
                    placeholder="Name of person informed…"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="kinMobile">Mobile</label>
                  <input
                    type="tel"
                    id="kinMobile"
                    name="kinMobile"
                    className="form-control"
                    value={formData.kinMobile}
                    onChange={handleInputChange}
                    placeholder="Relative mobile number…"
                    inputMode="tel"
                    autocomplete="off"
                  />
                </div>

                <div className="form-group col-span-full">
                  <label className="form-label" htmlFor="kinRelationship">Relationship</label>
                  <input
                    type="text"
                    id="kinRelationship"
                    name="kinRelationship"
                    className="form-control"
                    value={formData.kinRelationship}
                    onChange={handleInputChange}
                    placeholder="e.g. Father / Mother / Spouse…"
                    autocomplete="off"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 6: ATTACHMENTS */}
            <div className="card">
              <div className="card-title">
                <Upload size={18} aria-hidden="true" />
                <span>Evidence & Attachments</span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="photoPath">Upload Suspect Mugshot / Photograph</label>
                <input
                  type="file"
                  id="photoPath"
                  className="file-upload-input"
                  onChange={(e) => setFormData(prev => ({ ...prev, photoPath: e.target.files[0]?.name || "" }))}
                />
                {formData.photoPath && (
                  <div className="text-xs text-green-600 font-medium mt-1">
                    Selected file: {formData.photoPath}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
