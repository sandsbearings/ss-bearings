import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReportsLock from "../components/ReportsLock";
import {
  clearReportsPass,
  markReportsLeft,
  resumeReports,
  setOnReportsLocked,
  setReportsPass,
} from "../utils/reportsPass";
import OutstandingReport from "./reports/OutstandingReport";
import CollectionsReport from "./reports/CollectionsReport";
import GstReport from "./reports/GstReport";
import SalesReport from "./reports/SalesReport";
import PartyReport from "./reports/PartyReport";
import StockReport from "./reports/StockReport";

const TABS = [
  { key: "outstanding", label: "Outstanding", Component: OutstandingReport },
  { key: "collections", label: "Payments Received", Component: CollectionsReport },
  { key: "gst", label: "GST", Component: GstReport },
  { key: "sales", label: "Sales", Component: SalesReport },
  { key: "parties", label: "Parties", Component: PartyReport },
  { key: "stock", label: "Stock", Component: StockReport },
];

export default function Reports() {
  // The open tab lives in the URL (?tab=gst) so a refresh or a shared link lands on the same report.
  const [searchParams, setSearchParams] = useSearchParams();
  const active = TABS.find((t) => t.key === searchParams.get("tab")) || TABS[0];
  const { Component } = active;

  // Reports PIN lock with a 5-minute grace period (see utils/reportsPass.js): leaving this page or
  // switching to another browser tab and coming back within 5 minutes doesn't ask again. A refresh
  // or closing the tab always does.
  const [unlocked, setUnlocked] = useState(() => resumeReports());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setOnReportsLocked(() => {
      setUnlocked(false);
      setNotice("Reports locked again for safety. Enter your PIN to continue.");
    });

    function handleVisibility() {
      if (document.hidden) {
        markReportsLeft();
      } else if (!resumeReports()) {
        setUnlocked(false);
        setNotice("");
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      setOnReportsLocked(null);
      markReportsLeft();
    };
  }, []);

  function handleUnlocked(pass) {
    setReportsPass(pass);
    setNotice("");
    setUnlocked(true);
  }

  function lockNow() {
    clearReportsPass();
    setNotice("");
    setUnlocked(false);
  }

  if (!unlocked) return <ReportsLock onUnlocked={handleUnlocked} notice={notice} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <h2>Reports</h2>
        <button type="button" className="secondary" onClick={lockNow} title="Lock Reports now">
          🔒 Lock
        </button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === active.key}
            className={`tab${tab.key === active.key ? " active" : ""}`}
            onClick={() => setSearchParams({ tab: tab.key }, { replace: true })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Component key={active.key} />
    </div>
  );
}
