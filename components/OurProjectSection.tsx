"use client";

import { useEffect, useState } from "react";
import RealtimeChart from "./RealtimeChart";

export interface PublicProject {
  id: string;
  uid: string;
  name: string;
  owner: string;
  ownerEmail?: string;
  ownerName?: string;
  board: string;
  isOnline: boolean;
  widgets: any[];
  devices?: Record<string, any>;
  updatedAt?: number;
}

export default function OurProjectSection() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [activeProject, setActiveProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"Live" | "1h" | "1d" | "1w" | "1mo">("1d");
  const [showMoreModal, setShowMoreModal] = useState(false);

  // Simulated live fluctuating data for sample project "Smart Greenhouse & Environmental IoT"
  const [dummyTemp, setDummyTemp] = useState<number>(28.4);
  const [dummyHistory, setDummyHistory] = useState<{ value: number; timestamp: number }[]>(() => {
    const now = Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const initial: { value: number; timestamp: number }[] = [];
    let cur = 28.1;
    for (let i = 24; i >= 0; i--) {
      cur = Math.round((cur + (Math.random() * 0.4 - 0.2)) * 10) / 10;
      cur = Math.max(27.2, Math.min(29.8, cur));
      initial.push({ value: cur, timestamp: now - i * FIVE_MINUTES_MS });
    }
    return initial;
  });

  useEffect(() => {
    if (!activeProject || (activeProject.id !== "sample_smart_greenhouse" && activeProject.uid !== "public_ksm")) {
      return;
    }

    // Update temperature & history every 5 minutes
    const interval = setInterval(() => {
      setDummyTemp((prev) => {
        const delta = Math.random() * 0.4 - 0.2;
        let next = Math.round((prev + delta) * 10) / 10;
        if (next < 27.2) next = 27.4;
        if (next > 29.8) next = 29.6;

        setDummyHistory((hist) => [
          ...hist.slice(-40),
          { value: next, timestamp: Date.now() },
        ]);
        return next;
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [activeProject?.id, activeProject?.uid]);

  // Fetch public projects
  useEffect(() => {
    let isMounted = true;
    async function loadProjects() {
      try {
        const res = await fetch(`/api/public-projects?_t=${Date.now()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (json.success && json.projects && json.projects.length > 0) {
          if (isMounted) {
            setProjects(json.projects);
            setActiveProject((prev) => {
              if (!prev) return json.projects[0];
              const found = json.projects.find((p: any) => p.id === prev.id);
              return found || json.projects[0];
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch public projects:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProjects();
    // Poll every 3 seconds to get updated datastream values
    const interval = setInterval(loadProjects, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    if (!showMoreModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMoreModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showMoreModal]);

  if (loading) {
    return (
      <section className="lp-projects-section">
        <h2 className="lp-projects-title">OUR PROJECT</h2>
        <div className="lp-projects-loading">
          <div className="lp-projects-spinner" />
          <p>Memuat project dashboard...</p>
        </div>
      </section>
    );
  }

  if (!activeProject) {
    return (
      <section className="lp-projects-section">
        <h2 className="lp-projects-title">OUR PROJECT</h2>
        <div className="lp-projects-empty">
          <p>Belum ada project IoT yang dipublikasikan saat ini.</p>
        </div>
      </section>
    );
  }

  // Helper to extract device datastreams for display
  const primaryDev = activeProject.devices ? Object.values(activeProject.devices)[0] : null;
  const datastreams = primaryDev?.datastreams || {};
  const cleanOwner =
    activeProject.owner && !activeProject.owner.includes("@")
      ? activeProject.owner
      : activeProject.ownerName && !activeProject.ownerName.includes("@")
      ? activeProject.ownerName
      : "KSMIoT";

  return (
    <section className="lp-projects-section">
      {/* ── Title Heading ── */}
      <div className="lp-projects-header">
        <h2 className="lp-projects-title">OUR PROJECT</h2>
        <p className="lp-projects-subtitle">
          Live IoT telemetry dashboards created and published by our community
        </p>
      </div>

      <div className="lp-projects-container">
        {/* ── Top Header Card (Mirip Gambar Device Detail) ── */}
        <div className="lp-project-card-header">
          <div className="lp-project-header-left">
            <div className="lp-project-icon-box">
              <img src="/icons/sidebar-dashboard.svg" alt="Project" className="lp-project-icon-img" />
            </div>

            <div className="lp-project-header-info">
              <div className="lp-project-name-row">
                <h3 className="lp-project-name">{activeProject.name}</h3>
                <span className={`lp-status-pill ${activeProject.isOnline ? "online" : "offline"}`}>
                  <span className={`lp-status-dot ${activeProject.isOnline ? "dot-online" : "dot-offline"}`} />
                  {activeProject.isOnline ? "Online" : "Offline"}
                </span>
              </div>
              <div className="lp-project-meta-row">
                <span className="lp-meta-owner">Owner <strong>{cleanOwner}</strong></span>
                <span className="lp-meta-dot">•</span>
                <span className="lp-meta-board">Board <strong>{activeProject.board || "ESP32"}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Time Range Filter Bar ── */}
        <div className="lp-project-timerange-bar">
          {(["Live", "1h", "1d", "1w", "1mo"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`lp-time-pill ${timeRange === r ? "active" : ""}`}
              onClick={() => setTimeRange(r)}
            >
              {r}
            </button>
          ))}
        </div>

        {/* ── Widgets Grid (Read Only - Uneditable) ── */}
        <div className="lp-project-widgets-grid">
          {(activeProject.widgets || []).map((w: any) => {
            const devId = w.deviceId || (primaryDev ? primaryDev.id : "");
            const dev = activeProject.devices?.[devId] || primaryDev;
            const ds = dev?.datastreams?.[w.vpin] || datastreams[w.vpin] || null;
            const isSampleProject = activeProject.id === "sample_smart_greenhouse" || activeProject.uid === "public_ksm";
            const currentVal = (isSampleProject && w.vpin === "V1") ? dummyTemp : (ds?.value !== undefined ? ds.value : w.value);
            const unit = ds?.unit || w.unit || "";

            return (
              <div key={w.id} className={`canvas-widget-card col-span-${w.colSpan || 1} lp-read-only-card`}>
                <div className="card-header-bar">
                  <div>
                    <span className="card-widget-title">{w.title}</span>
                    {w.vpin && <span className="card-dev-tag">[{w.vpin}]</span>}
                  </div>
                </div>

                <div className="card-widget-content">
                  {/* SWITCH (Disabled) */}
                  {w.type === "switch" && (
                    <div className="render-switch-row" style={{ pointerEvents: "none" }}>
                      <button
                        type="button"
                        className={`blynk-toggle-pill ${Number(currentVal) === 1 ? "active" : ""}`}
                        disabled
                        aria-disabled="true"
                        style={{ cursor: "not-allowed" }}
                      >
                        <span className="toggle-pill-thumb" />
                      </button>
                      <span className="toggle-status-text">
                        {Number(currentVal) === 1 ? "On" : "Off"}
                      </span>
                    </div>
                  )}

                  {/* SLIDER (Disabled) */}
                  {w.type === "slider" && (
                    <div className="render-slider-row" style={{ pointerEvents: "none" }}>
                      <input
                        type="range"
                        min={w.min ?? 0}
                        max={w.max ?? 100}
                        value={Number(currentVal) || 0}
                        disabled
                        readOnly
                        aria-disabled="true"
                        className="blynk-range-slider"
                        style={{ cursor: "not-allowed" }}
                      />
                      <span className="slider-val-badge">
                        {currentVal ?? 0} {unit}
                      </span>
                    </div>
                  )}

                  {/* LABEL */}
                  {w.type === "label" && (
                    <div className="render-label-row">
                      <span className="label-large-text">
                        {currentVal ?? "--"} {unit}
                      </span>
                    </div>
                  )}

                  {/* CHART (Realtime lines) */}
                  {w.type === "chart" && (
                    <div className="render-chart-block">
                      <div className="widget-chart-clean-view">
                        <RealtimeChart
                          uid={activeProject.uid}
                          deviceId={devId}
                          vpin={w.vpin || ""}
                          widgetId={w.id}
                          unit={unit}
                          timeRange={timeRange}
                          simulatedData={(isSampleProject && w.vpin === "V1") ? dummyHistory : undefined}
                        />
                      </div>
                    </div>
                  )}

                  {/* TABLE (With visible borders) */}
                  {w.type === "table" && (
                    <div className="render-table-block">
                      {dev?.datastreams && Object.keys(dev.datastreams).length > 0 ? (
                        <table className="blynk-data-table">
                          <thead>
                            <tr>
                              <th>Pin</th>
                              <th>Sensor</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(dev.datastreams).map(([pin, s]: [string, any]) => {
                              const cellVal = (isSampleProject && pin === "V1") ? dummyTemp : (s.value !== undefined ? String(s.value) : "—");
                              return (
                                <tr key={pin}>
                                  <td>{pin}</td>
                                  <td>{s.displayName || s.name}</td>
                                  <td>
                                    {cellVal} {s.unit || ""}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ color: "#9ca3af", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
                          Belum ada datastream.
                        </div>
                      )}
                    </div>
                  )}

                  {/* IMAGE */}
                  {w.type === "image" && (
                    <div className="render-image-block">
                      <div className="image-mock-esp32">
                        <span className="dot-pin p-tl" />
                        <span className="dot-pin p-tr" />
                        <span className="dot-pin p-bl" />
                        <span className="dot-pin p-br" />
                        <div className="esp-chip-core">{activeProject.board || "ESP32"}</div>
                      </div>
                    </div>
                  )}

                  {/* VIDEO (Live Greenhouse CCTV feed) */}
                  {w.type === "video" && (
                    <div className="render-video-block">
                      <div
                        className="video-camera-screen"
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          borderRadius: 12,
                          background: "#0a0f1d",
                          aspectRatio: "16 / 9",
                          minHeight: 180,
                        }}
                      >
                        <video
                          autoPlay
                          loop
                          muted
                          playsInline
                          poster="https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&auto=format&fit=crop&q=80"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            pointerEvents: "none",
                          }}
                        >
                          <source src="https://assets.mixkit.co/videos/preview/mixkit-vegetables-in-a-greenhouse-41315-large.mp4" type="video/mp4" />
                        </video>
                        <div
                          className="camera-live-badge"
                          style={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            zIndex: 2,
                            background: "#ef4444",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 10,
                            padding: "2px 8px",
                            borderRadius: 4,
                            letterSpacing: 0.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
                          LIVE
                        </div>
                        <div
                          className="camera-footer-info"
                          style={{
                            position: "absolute",
                            bottom: 8,
                            left: 10,
                            zIndex: 2,
                            background: "rgba(0,0,0,0.7)",
                            color: "#fff",
                            fontSize: 10,
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontFamily: "monospace",
                            letterSpacing: 0.5,
                          }}
                        >
                          CAM-01 [GREENHOUSE CCTV]
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── More Project Button ── */}
        <div className="lp-projects-more-wrap">
          <button
            type="button"
            className="lp-btn-more-project"
            onClick={() => setShowMoreModal(true)}
          >
            <span>More Project</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Pop-Up Modal: Select Another Project ── */}
      {showMoreModal && (
        <div
          className="lp-projects-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMoreModal(false);
          }}
        >
          <div className="lp-projects-modal-box" role="dialog" aria-modal="true">
            <div className="lp-projects-modal-header">
              <div>
                <h3 className="lp-projects-modal-title">Select IoT Project</h3>
                <p className="lp-projects-modal-sub">
                  Pilih salah satu dashboard IoT yang telah dipublikasikan oleh tim atau pengguna.
                </p>
              </div>
              <button
                type="button"
                className="lp-projects-modal-close"
                onClick={() => setShowMoreModal(false)}
                aria-label="Tutup modal"
              >
                ✕
              </button>
            </div>

            <div className="lp-projects-list-grid">
              {projects.map((proj) => {
                const isCurrent = proj.id === activeProject.id;
                return (
                  <div
                    key={proj.id}
                    className={`lp-project-pick-card ${isCurrent ? "is-active" : ""}`}
                    onClick={() => {
                      setActiveProject(proj);
                      setShowMoreModal(false);
                    }}
                  >
                    <div className="lp-pick-card-top">
                      <div className="lp-pick-icon-box">
                        <img src="/icons/sidebar-dashboard.svg" alt="Project" style={{ width: 18, height: 18 }} />
                      </div>
                      <span className={`lp-status-pill ${proj.isOnline ? "online" : "offline"}`}>
                        <span className={`lp-status-dot ${proj.isOnline ? "dot-online" : "dot-offline"}`} />
                        {proj.isOnline ? "Online" : "Offline"}
                      </span>
                    </div>

                    <h4 className="lp-pick-name">{proj.name}</h4>
                    <p className="lp-pick-owner">
                      Owner: <strong>{proj.owner && !proj.owner.includes("@") ? proj.owner : "KSMIoT"}</strong>
                    </p>

                    <div className="lp-pick-footer">
                      <span className="lp-pick-badge">{proj.board || "ESP32"}</span>
                      <span className="lp-pick-badge">{(proj.widgets || []).length} Widgets</span>
                      {isCurrent ? (
                        <span className="lp-pick-active-text">Sedang Dilihat ✔</span>
                      ) : (
                        <span className="lp-pick-action-text">Pilih Dashboard →</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
