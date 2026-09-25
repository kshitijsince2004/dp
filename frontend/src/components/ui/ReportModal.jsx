import React, { useEffect } from "react";
import { Printer, ShieldCheck, X } from "lucide-react";
import { motion } from "framer-motion";
import useAuthStore from "../../store/authStore.js";

export default function ReportModal({ isOpen, onClose, title, data, type }) {
  const { user } = useAuthStore();
  
  // Close on Escape key press as per accessibility rules
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Render fields helper
  const renderMetaItem = (label, value) => (
    <div className="report-meta-item" key={label}>
      <span className="report-meta-label" translate="no">{label}:</span>
      <span className="report-meta-value">{value || "—"}</span>
    </div>
  );

  const getSystemDate = () => {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
    }).format(new Date());
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15, filter: "blur(3px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 95, damping: 14 }}
        className="modal-content report-modal transition-standard" 
        onClick={(e) => e.stopPropagation()}
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="modal-header">
          <h2 id="report-modal-title" className="flex items-center gap-2 font-display text-slate-800">
            <ShieldCheck size={20} className="badge-icon text-amber-500" aria-hidden="true" />
            <span translate="no">Auto-Generated Official Docket</span>
          </h2>
          <button 
            type="button" 
            className="nav-icon-btn active:scale-95 transition-all duration-150" 
            onClick={onClose} 
            aria-label="Close report preview"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="report-document text-black shadow-lg rounded-xl border border-slate-100 p-8">
            <div className="report-watermark" aria-hidden="true">DELHI POLICE</div>
            
            <div className="report-header-section text-center mb-6 border-b-2 border-double border-black pb-4">
              <div className="report-emblem text-3xl mb-2" aria-hidden="true">⚖️</div>
              <h1 className="report-title-main text-2xl font-serif font-bold tracking-wider" translate="no">DELHI POLICE</h1>
              <p className="report-subtitle font-semibold text-sm">{title.toUpperCase()}</p>
              <p className="text-xs mt-1">
                Generated on {getSystemDate()} | Confidential Command Document
              </p>
            </div>

            {type === "case" && (
              <>
                <div className="report-section-title">Case Metadata</div>
                <div className="report-meta-grid">
                  {renderMetaItem("FIR / DD Number", data.firNumber)}
                  {renderMetaItem("FIR Date", data.firDate)}
                  {renderMetaItem("UID", data.uid)}
                  {renderMetaItem("Local Head", data.localHead)}
                  {renderMetaItem("Under Section", data.underSection)}
                  {renderMetaItem("Case Type", data.caseType)}
                  {renderMetaItem("SID Number", data.sidNumber)}
                  {renderMetaItem("CCTNS Number", data.cctnsNumber)}
                </div>

                <div className="report-section-title">Location & Occurrence</div>
                <div className="report-meta-grid">
                  {renderMetaItem("District", data.district)}
                  {renderMetaItem("Police Station", data.policeStation)}
                  {renderMetaItem("Beat Number", data.beatNumber)}
                  {renderMetaItem("Occurrence Date", data.occurrenceDate)}
                  {renderMetaItem("Occurrence Time", data.occurrenceTime)}
                  {renderMetaItem("Place of Occurrence", data.occurrencePlace)}
                </div>

                <div className="report-section-title">Complainant Details</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Name", data.complainantName)}
                  {renderMetaItem("Father's Name", data.complainantFatherName)}
                  {renderMetaItem("Contact No", data.complainantMobile)}
                  {renderMetaItem("Address", data.complainantAddress)}
                </div>

                <div className="report-section-title">Accused Details</div>
                {data.accusedList && data.accusedList.length > 0 ? (
                  data.accusedList.map((acc, idx) => (
                    <div key={idx} className="mb-2 text-sm">
                      <strong>Accused {idx + 1}:</strong> {acc.name} {acc.alias ? `(alias ${acc.alias})` : ""} | Address: {acc.address || "—"}
                    </div>
                  ))
                ) : (
                  <div className="report-text-block">No accused registered.</div>
                )}

                <div className="report-section-title">Case Description & Remarks</div>
                <div className="report-text-block">{data.briefFacts || "No details provided."}</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Property Involved", data.propertyInvolved)}
                  {renderMetaItem("Property Value", data.propertyValue)}
                  {renderMetaItem("Case Status / Remarks", data.statusRemarks)}
                </div>

                <div className="report-section-title">Investigation Details</div>
                <div className="report-meta-grid">
                  {renderMetaItem("IO Name", data.ioName)}
                  {renderMetaItem("IO PIS Number", data.ioPisNumber)}
                  {renderMetaItem("IO Contact No", data.ioMobile)}
                  {renderMetaItem("Arrest Date", data.dateOfArrest)}
                </div>
              </>
            )}

            {type === "arrest" && (
              <>
                <div className="report-section-title">FIR Details</div>
                <div className="report-meta-grid">
                  {renderMetaItem("System UID", data.uid)}
                  {renderMetaItem("District", data.district)}
                  {renderMetaItem("Police Station", data.policeStation)}
                  {renderMetaItem("FIR / DD Number", data.firDdNumber)}
                  {renderMetaItem("FIR Date", data.firDate)}
                  {renderMetaItem("Act Involved", data.act)}
                  {renderMetaItem("Sections", data.sections)}
                  {renderMetaItem("Crime Head", data.crimeHead)}
                </div>

                <div className="report-section-title">Arrested Person Information</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Full Name", data.fullName)}
                  {renderMetaItem("Father's Name", data.fatherName)}
                  {renderMetaItem("Age / Gender", `${data.age || "—"} / ${data.gender || "—"}`)}
                  {renderMetaItem("Address", data.address)}
                </div>

                <div className="report-section-title">Arrest Details & Spot Info</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Date of Arrest", data.dateOfArrest)}
                  {renderMetaItem("Time of Arrest", data.timeOfArrest)}
                  {renderMetaItem("Place of Arrest", data.placeOfArrest)}
                </div>

                <div className="report-section-title">Verification & Records Checks</div>
                <div className="report-meta-grid">
                  {renderMetaItem("NAFIS Check", data.nafisPrepared ? "COMPLETED" : "PENDING")}
                  {renderMetaItem("Dossier Prep", data.dossierPrepared ? "COMPLETED" : "PENDING")}
                  {renderMetaItem("Search Slip Check", data.searchSlipPrepared ? "COMPLETED" : "PENDING")}
                  {renderMetaItem("Address Verified", data.addressVerified ? "YES" : "NO")}
                  {renderMetaItem("Verifying Officer", `${data.verifyingOfficerName || "—"} (${data.verifyingOfficerRank || "—"})`)}
                </div>

                <div className="report-section-title">Next of Kin Notified</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Relative Name", data.kinName)}
                  {renderMetaItem("Mobile Number", data.kinMobile)}
                  {renderMetaItem("Relationship", data.kinRelationship)}
                </div>
              </>
            )}

            {type === "pcr" && (
              <>
                <div className="report-section-title">PCR Dispatch Details</div>
                <div className="report-meta-grid">
                  {renderMetaItem("System UID", data.uid)}
                  {renderMetaItem("District", data.district)}
                  {renderMetaItem("Police Station", data.policeStation)}
                  {renderMetaItem("GD Number", data.gdNumber)}
                  {renderMetaItem("GD Date", data.pcrDate)}
                  {renderMetaItem("GD Time", data.pcrTime)}
                </div>

                <div className="report-section-title">Caller Details</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Caller Name", data.callerName)}
                  {renderMetaItem("Caller Mobile", data.callerMobile)}
                  {renderMetaItem("Caller Address", data.callerAddress)}
                </div>

                <div className="report-section-title">Incident Gist</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Crime Head", data.head)}
                  {renderMetaItem("Location", data.location)}
                </div>
                <div className="report-text-block">
                  <strong>PCR Gist / Dispatch Details:</strong><br />
                  {data.pcrGist || "No gist details captured."}
                </div>

                <div className="report-section-title">Officer Assignment</div>
                <div className="report-meta-grid">
                  {renderMetaItem("IO Assigned", data.ioName)}
                  {renderMetaItem("EO Assigned", data.eoName)}
                </div>

                <div className="report-section-title">Action Taken Report</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Action Status", data.status)}
                  {renderMetaItem("Arrival DD Number", data.arrivalDdNumber)}
                  {renderMetaItem("Arrival Time", data.arrivalTime)}
                </div>
                <div className="report-text-block">
                  <strong>Action Taken Gist:</strong><br />
                  {data.actionTaken || "No action taken reported yet."}
                </div>
              </>
            )}

            {type === "uidb" && (
              <>
                <div className="report-section-title">Unidentified Body Entry Metadata</div>
                <div className="report-meta-grid">
                  {renderMetaItem("System UID", data.uid)}
                  {renderMetaItem("UIDB Gazette Number", data.uidbNumber)}
                  {renderMetaItem("District", data.district)}
                  {renderMetaItem("Police Station", data.policeStation)}
                  {renderMetaItem("DD Number", data.ddNumber)}
                  {renderMetaItem("DD Date", data.ddDate)}
                </div>

                <div className="report-section-title">Staff Details & Informant</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Duty Officer", data.dutyOfficer)}
                  {renderMetaItem("IO Assigned", data.ioName)}
                  {renderMetaItem("Informant Name", data.informantName)}
                  {renderMetaItem("Informant Mobile", data.informantMobile)}
                </div>

                <div className="report-section-title">Body Recovery Spot Details</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Recovery Spot", data.foundPlace)}
                  {renderMetaItem("Recovery Date", data.uidbDate)}
                </div>

                <div className="report-section-title">Corpse Description & Demographics</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Name/Assumed Name", data.name || "UNIDENTIFIED")}
                  {renderMetaItem("Estimated Age", data.age)}
                  {renderMetaItem("Gender", data.gender)}
                  {renderMetaItem("Height", data.height)}
                  {renderMetaItem("Complexion", data.complexion)}
                </div>
                <div className="report-text-block">
                  <strong>Identification Marks:</strong> {data.identificationMarks || "None visible."}<br />
                  <strong>Corpse Condition & Description:</strong> {data.description || "No description."}
                </div>

                <div className="report-section-title">ZIPNET Tracking Status</div>
                <div className="report-meta-grid">
                  {renderMetaItem("ZIPNET Entry Ref", data.zipnetNumber)}
                  {renderMetaItem("Identified Status", data.identified ? "YES - CORPSE IDENTIFIED" : "NO - ACTIVE SEARCH")}
                  {renderMetaItem("Status", data.status)}
                </div>
              </>
            )}

            {type === "missing" && (
              <>
                <div className="report-section-title">Missing Report Metadata</div>
                <div className="report-meta-grid">
                  {renderMetaItem("System UID", data.uid)}
                  {renderMetaItem("District", data.district)}
                  {renderMetaItem("Police Station", data.policeStation)}
                  {renderMetaItem("DD Number", data.ddNumber)}
                  {renderMetaItem("Report Time/Date", data.dateTime)}
                  {renderMetaItem("Date Missing", data.missingDate)}
                  {renderMetaItem("Last Seen Place", data.missingPlace)}
                </div>

                <div className="report-section-title">Missing Person Demographics</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Full Name", data.name)}
                  {renderMetaItem("Age / Gender", `${data.age || "—"} / ${data.gender || "—"}`)}
                  {renderMetaItem("Classification", data.majorMinor)}
                </div>
                <div className="report-text-block">
                  <strong>Personal Description:</strong><br />
                  {data.personalDescription || "No specific details reported."}
                </div>

                <div className="report-section-title">Duty Officers</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Duty Officer", data.dutyOfficer)}
                  {renderMetaItem("Investigating Officer", data.ioName)}
                  {renderMetaItem("Informed By", data.informedBy)}
                  {renderMetaItem("Reporter Mobile", data.contactNumber)}
                </div>

                <div className="report-section-title">National Portal & ZIPNET Tracing</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Track Child Ref", data.trackChildNumber)}
                  {renderMetaItem("Track Child Registered", data.trackChildDate)}
                  {renderMetaItem("ZIPNET Number", data.zipnetNumber)}
                </div>

                <div className="report-section-title">Recovery & Traced Details</div>
                <div className="report-meta-grid">
                  {renderMetaItem("Traced Status", data.status)}
                  {renderMetaItem("Found Place", data.foundPlace)}
                  {renderMetaItem("Traced DD Number", data.tracedDdNumber)}
                  {renderMetaItem("Associated FIR No", data.firNumber)}
                  {renderMetaItem("FIR Date", data.firDate)}
                </div>
              </>
            )}

            <div className="report-sign-area flex justify-between gap-8 mt-12">
              <div className="report-signature border-t border-black pt-2 w-[220px] text-xs text-center">
                <span>Prepared & Submitted By:</span><br />
                <strong className="report-signature-title" translate="no">
                  {data.ioName || user?.username || "HC Ramesh Kumar"}
                </strong><br />
                <span>
                  {user?.rank || "Station Operator"}, PS {data.policeStation || user?.stationName || "Parliament St."}
                </span>
              </div>
              
              <div className="report-signature border-t border-black pt-2 w-[220px] text-xs text-center">
                <span>Approved & Verified:</span><br />
                <strong className="report-signature-title" translate="no">
                  {user?.role === 'HQ' ? "Dr. Vikram Singh, IPS" : (user?.role === 'DISTRICT' ? user?.username : "Dr. Vikram Singh, IPS")}
                </strong><br />
                <span>
                  {user?.role === 'HQ' ? "DGP Delhi Police" : `DCP ${data.district || user?.districtKey || "New Delhi District"}`}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            type="button" 
            className="btn btn-secondary flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98]" 
            onClick={handlePrint}
            aria-label="Print official report copy"
          >
            <Printer size={15} aria-hidden="true" />
            <span>Print Docket</span>
          </button>
          
          <button 
            type="button" 
            className="btn btn-primary flex items-center gap-1.5 transition-all duration-200 active:scale-[0.98]" 
            onClick={() => {
              alert("Dispatching report to District Analytics Server…");
              onClose();
            }}
            aria-label="Approve and dispatch report"
          >
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Approve & Dispatch</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
