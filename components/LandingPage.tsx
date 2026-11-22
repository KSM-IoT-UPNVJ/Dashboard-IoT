"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import OurProjectSection from "./OurProjectSection";

const TEAM = [
  { name: "Moh Goesny Isnady",            role: "Vice Chairman",              img: "/team/Vice_Chairman.webp" },
  { name: "Khalil Farel Fauzan",          role: "Head of Software Division",  img: "/team/Software_Ketua.webp" },
  { name: "Ramadhani Putra Yuditama",     role: "Staff of Software Division", img: "/team/Software_Staff_1.webp" },
  { name: "Abdurrahman Al Ghilari",       role: "Staff of Software Division", img: "/team/Software_Staff_2.webp" },
  { name: "Fahri Pratama",                role: "Staff of Software Division", img: "/team/Software_Staff_3.webp" },
  { name: "Kaka Ramadhan",                role: "Staff of Software Division", img: "/team/Software_Staff_4.webp" },
  { name: "Maleakhi Adriel Anindya D.S.", role: "Head of UI/UX Division",     img: "/team/UiUx_Ketua.webp" },
  { name: "Sion Lukas Elkana Panjaitan",  role: "Staff of UI/UX Division",    img: "/team/UiUx_Staff_1.webp" },
  { name: "Nasya Kalia Shalemina",        role: "Staff of UI/UX Division",    img: "/team/UiUx_Staff_2.webp" },
  { name: "Daniel Hendriko Sirait",       role: "Head of Network Division",   img: "/team/Network_Ketua.webp" },
  { name: "Aura Adillah",                 role: "Staff of Network Division",  img: "/team/Network_Staff_1.webp" },
  { name: "Agrieva Hindaru R.",           role: "Staff of Network Division",  img: "/team/Network_Staff_2.webp" },
  { name: "Ilham Surya Rizqullah",        role: "Head of Firmware Division",  img: "/team/Firmware_Ketua.webp" },
  { name: "Muhammad Fajar Sodik",         role: "Staff of Firmware Division", img: "/team/Firmware_Staff_1.webp" },
  { name: "Daffa Muhammad Rizki",         role: "Staff of Firmware Division", img: "/team/Firmware_Staff_2.webp" },
  { name: "Raden Dimas Sayyidina A.",     role: "Staff of Firmware Division", img: "/team/Firmware_Staff_3.webp" },
];

export default function LandingPage() {
  const router = useRouter();
  const [showTeamEasterEgg, setShowTeamEasterEgg] = useState(false);

  // Close easter egg on Escape key
  useEffect(() => {
    if (!showTeamEasterEgg) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowTeamEasterEgg(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTeamEasterEgg]);

  return (
    <div className="lp-root">
      {/* ────── HERO ────── */}
      <section className="lp-hero">
        {/* decorative circles */}
        <span className="lp-deco lp-dot lp-dot-1" />
        <span className="lp-deco lp-dot lp-dot-2" />
        <span className="lp-deco lp-ring lp-ring-1" />
        <span className="lp-deco lp-ring lp-ring-2" />
        <span className="lp-deco lp-ring lp-ring-3" />

        {/* nav */}
        <nav className="lp-nav">
          <div className="lp-brand">
            <img src="/Logo_IoT.png" alt="KSM IoT logo" className="lp-brand-img" />
            <div className="lp-brand-text">
              <span className="lp-brand-name">KSM Internet Of Things</span>
              <span className="lp-brand-sub">UPN &quot;Veteran&quot; Jakarta</span>
            </div>
          </div>
          <button className="lp-nav-icon" aria-label="Profile" onClick={() => router.push("/login")}>
            <img src="/icons/profile-circle.svg" alt="Profile" style={{ width: 26, height: 26 }} />
          </button>
        </nav>

        {/* hero content */}
        <div className="lp-hero-body">
          <h1 className="lp-headline">
            <span className="lp-headline-accent">EMPOWERING</span> NEXT-GEN
            <br />
            through the internet of things
          </h1>
          <p className="lp-subtext">
            Building connected smart hardware, resilient mesh sensor networks, bare-metal firmware
            architectures, and edge intelligence prototypes directly from the student workbench.
          </p>
          <div className="lp-cta-row">
            <button className="lp-btn lp-btn-primary lp-btn-signin-only" onClick={() => router.push("/login")}>
              SIGN IN
            </button>
          </div>
        </div>
      </section>

      {/* ────── OUR PROJECT SECTION (Menggantikan Our Team di halaman awal) ────── */}
      <OurProjectSection />

      {/* ────── FOOTER DENGAN EASTER EGG ────── */}
      <footer className="lp-footer">
        <button
          type="button"
          className="lp-footer-easter-egg-btn"
          onClick={() => setShowTeamEasterEgg(true)}
          title="Klik rahasia: Temukan tim kami! ✨"
        >
          © {new Date().getFullYear()} KSM Internet Of Things — UPN &quot;Veteran&quot; Jakarta
        </button>
      </footer>

      {/* ────── MODAL EASTER EGG: OUR TEAM ────── */}
      {showTeamEasterEgg && (
        <div
          className="lp-easter-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTeamEasterEgg(false);
          }}
        >
          <div className="lp-easter-modal-box" role="dialog" aria-modal="true">
            {/* Modal Header */}
            <div className="lp-easter-modal-header">
              <div className="lp-easter-header-title-wrap">
                <span className="lp-easter-badge">Easter Egg Found!</span>
                <h2 className="lp-easter-title">Meet Our Team</h2>
                <p className="lp-easter-subtitle">
                  The talented builders, engineers, and designers behind KSM Internet Of Things
                </p>
              </div>
              <button
                type="button"
                className="lp-easter-close-btn"
                onClick={() => setShowTeamEasterEgg(false)}
                aria-label="Tutup popup"
              >
                ✕
              </button>
            </div>

            {/* Modal Team Grid */}
            <div className="lp-easter-modal-body">
              <div className="lp-team-grid lp-easter-team-grid">
                {TEAM.map((member) => (
                  <div key={member.name} className="lp-card lp-easter-card">
                    <img
                      src={member.img}
                      alt={member.name}
                      className="lp-card-img"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/logo-placeholder.svg";
                      }}
                    />
                    <div className="lp-card-overlay">
                      <span className="lp-card-name">{member.name}</span>
                      <span className="lp-card-role">{member.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="lp-easter-modal-footer">
              <span className="lp-easter-footer-note">
                KSM Internet of Things 2026
              </span>
              <button
                type="button"
                className="lp-easter-done-btn"
                onClick={() => setShowTeamEasterEgg(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
