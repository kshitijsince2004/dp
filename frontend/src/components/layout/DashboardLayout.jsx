import { useState } from "react";
import { Outlet } from "react-router-dom";
import PoliceSidebar from "./PoliceSidebar.jsx";
import PoliceNavbar from "./PoliceNavbar.jsx";
import ReportModal from "../ui/ReportModal.jsx";
import { useNotifications } from "../../hooks/useNotifications.js";

export default function DashboardLayout() {
  const [isCollapsed, setIsCollapsed] = useState(true);

  // ── Real-time notifications from SSE + REST ──────────────────────────────
  const {
    notifications,
    unreadCount,
    isConnected,
    markRead,
    markAllRead,
    refresh: refreshNotifications,
  } = useNotifications();

  // ── Report Modal states ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalData, setModalData] = useState({});
  const [modalType, setModalType] = useState("");

  const onSubmitReport = (title, data, type) => {
    setModalTitle(title);
    setModalData(data);
    setModalType(type);
    setModalOpen(true);
  };

  return (
    <div className="app-container">
      <PoliceSidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <div className="main-content">
        <PoliceNavbar
          notifications={notifications}
          unreadCount={unreadCount}
          isConnected={isConnected}
          markRead={markRead}
          markAllRead={markAllRead}
          refreshNotifications={refreshNotifications}
        />
        <main className="page-wrapper">
          <Outlet context={{ onSubmitReport }} />
        </main>
      </div>

      <ReportModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        data={modalData}
        type={modalType}
      />
    </div>
  );
}
