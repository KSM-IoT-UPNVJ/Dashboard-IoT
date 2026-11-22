"use client";

import { ReactNode, ReactElement, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { auth, rtdb } from "@/lib/firebase";

// ── Icons (Figma Design System) ────────────────────────
const IconGuide = () => (
  <svg viewBox="0 0 19 14" fill="currentColor">
    <path d="M10.8333 4.91667V3.5C11.2917 3.30556 11.7604 3.15972 12.2396 3.0625C12.7188 2.96528 13.2222 2.91667 13.75 2.91667C14.1111 2.91667 14.4653 2.94444 14.8125 3C15.1597 3.05556 15.5 3.125 15.8333 3.20833V4.54167C15.5 4.41667 15.1632 4.32292 14.8229 4.26042C14.4826 4.19792 14.125 4.16667 13.75 4.16667C13.2222 4.16667 12.7153 4.23264 12.2292 4.36458C11.7431 4.49653 11.2778 4.68056 10.8333 4.91667V4.91667M10.8333 9.5V8.08333C11.2917 7.88889 11.7604 7.74306 12.2396 7.64583C12.7188 7.54861 13.2222 7.5 13.75 7.5C14.1111 7.5 14.4653 7.52778 14.8125 7.58333C15.1597 7.63889 15.5 7.70833 15.8333 7.79167V9.125C15.5 9 15.1632 8.90625 14.8229 8.84375C14.4826 8.78125 14.125 8.75 13.75 8.75C13.2222 8.75 12.7153 8.8125 12.2292 8.9375C11.7431 9.0625 11.2778 9.25 10.8333 9.5V9.5M10.8333 7.20833V5.79167C11.2917 5.59722 11.7604 5.45139 12.2396 5.35417C12.7188 5.25694 13.2222 5.20833 13.75 5.20833C14.1111 5.20833 14.4653 5.23611 14.8125 5.29167C15.1597 5.34722 15.5 5.41667 15.8333 5.5V6.83333C15.5 6.70833 15.1632 6.61458 14.8229 6.55208C14.4826 6.48958 14.125 6.45833 13.75 6.45833C13.2222 6.45833 12.7153 6.52431 12.2292 6.65625C11.7431 6.78819 11.2778 6.97222 10.8333 7.20833V7.20833M4.58333 10C5.23611 10 5.87153 10.0729 6.48958 10.2188C7.10764 10.3646 7.72222 10.5833 8.33333 10.875V2.66667C7.76389 2.33333 7.15972 2.08333 6.52083 1.91667C5.88194 1.75 5.23611 1.66667 4.58333 1.66667C4.08333 1.66667 3.58681 1.71528 3.09375 1.8125C2.60069 1.90972 2.125 2.05556 1.66667 2.25V10.5C2.15278 10.3333 2.63542 10.2083 3.11458 10.125C3.59375 10.0417 4.08333 10 4.58333 10M10 10.875C10.6111 10.5833 11.2257 10.3646 11.8438 10.2188C12.4618 10.0729 13.0972 10 13.75 10C14.25 10 14.7396 10.0417 15.2188 10.125C15.6979 10.2083 16.1806 10.3333 16.6667 10.5V2.25C16.2083 2.05556 15.7326 1.90972 15.2396 1.8125C14.7465 1.71528 14.25 1.66667 13.75 1.66667C13.0972 1.66667 12.4514 1.75 11.8125 1.91667C11.1736 2.08333 10.5694 2.33333 10 2.66667V10.875M9.16667 13.3333C8.5 12.8056 7.77778 12.3958 7 12.1042C6.22222 11.8125 5.41667 11.6667 4.58333 11.6667C4 11.6667 3.42708 11.7431 2.86458 11.8958C2.30208 12.0486 1.76389 12.2639 1.25 12.5417C0.958333 12.6944 0.677083 12.6875 0.40625 12.5208C0.135417 12.3542 0 12.1111 0 11.7917V1.75C0 1.59722 0.0381944 1.45139 0.114583 1.3125C0.190972 1.17361 0.305556 1.06944 0.458333 1C1.09722 0.666667 1.76389 0.416667 2.45833 0.25C3.15278 0.0833333 3.86111 0 4.58333 0C5.38889 0 6.17708 0.104167 6.94792 0.3125C7.71875 0.520833 8.45833 0.833333 9.16667 1.25C9.875 0.833333 10.6146 0.520833 11.3854 0.3125C12.1562 0.104167 12.9444 0 13.75 0C14.4722 0 15.1806 0.0833333 15.875 0.25C16.5694 0.416667 17.2361 0.666667 17.875 1C18.0278 1.06944 18.1424 1.17361 18.2188 1.3125C18.2951 1.45139 18.3333 1.59722 18.3333 1.75V11.7917C18.3333 12.1111 18.1979 12.3542 17.9271 12.5208C17.6562 12.6875 17.375 12.6944 17.0833 12.5417C16.5694 12.2639 16.0312 12.0486 15.4688 11.8958C14.9062 11.7431 14.3333 11.6667 13.75 11.6667C12.9167 11.6667 12.1111 11.8125 11.3333 12.1042C10.5556 12.3958 9.83333 12.8056 9.16667 13.3333V13.3333" fill="currentColor"/>
  </svg>
);
const IconDashboard = () => (
  <svg viewBox="0 0 15 15" fill="currentColor">
    <path d="M0 6.66667V0H6.66667V6.66667H0M0 15V8.33333H6.66667V15H0M8.33333 6.66667V0H15V6.66667H8.33333M8.33333 15V8.33333H15V15H8.33333M1.66667 5H5V1.66667H1.66667V5M10 5H13.3333V1.66667H10V5M10 13.3333H13.3333V10H10V13.3333M1.66667 13.3333H5V10H1.66667V13.3333" fill="currentColor"/>
  </svg>
);
const IconDevice = () => (
  <svg viewBox="0 0 17 15" fill="currentColor">
    <path d="M1.66667 15C1.20833 15 0.815972 14.8368 0.489583 14.5104C0.163194 14.184 0 13.7917 0 13.3333V1.66667C0 1.20833 0.163194 0.815972 0.489583 0.489583C0.815972 0.163194 1.20833 0 1.66667 0H13.3333C13.7917 0 14.184 0.163194 14.5104 0.489583C14.8368 0.815972 15 1.20833 15 1.66667V3.33333H16.6667V5H15V6.66667H16.6667V8.33333H15V10H16.6667V11.6667H15V13.3333C15 13.7917 14.8368 14.184 14.5104 14.5104C14.184 14.8368 13.7917 15 13.3333 15H1.66667M1.66667 13.3333H13.3333V1.66667H1.66667V13.3333M3.33333 11.6667H7.5V8.33333H3.33333V11.6667M8.33333 5.83333H11.6667V3.33333H8.33333V5.83333M3.33333 7.5H7.5V3.33333H3.33333V7.5M8.33333 11.6667H11.6667V6.66667H8.33333V11.6667" fill="currentColor"/>
  </svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 15 15" fill="currentColor">
    <path d="M6.66667 15V10H8.33333V11.6667H15V13.3333H8.33333V15H6.66667M0 13.3333V11.6667H5V13.3333H0M3.33333 10V8.33333H0V6.66667H3.33333V5H5V10H3.33333M6.66667 8.33333V6.66667H15V8.33333H6.66667M10 5V0H11.6667V1.66667H15V3.33333H11.6667V5H10M0 3.33333V1.66667H8.33333V3.33333H0" fill="currentColor"/>
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 19 19" fill="none" stroke="currentColor">
    <path d="M14.5229 8.42284C14.5229 11.7916 11.792 14.5224 8.42333 14.5224C5.05461 14.5224 2.32373 11.7916 2.32373 8.42284C2.32373 5.05413 5.05461 2.32324 8.42333 2.32324C11.792 2.32324 14.5229 5.05413 14.5229 8.42284Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12.7358 12.7363L16.2649 16.2654" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IconChevron = () => (
  <svg viewBox="0 0 15 15" fill="none" stroke="currentColor">
    <path d="M12.0832 5.57715L7.43589 10.2245L2.78857 5.57715" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Nav items ──────────────────────────────────────────
type NavKey = "guide" | "dashboard" | "device" | "settings";
const navItems: { key: NavKey; label: string; href: string; Icon: () => ReactElement }[] = [
  { key: "guide",     label: "Guide",     href: "/guide",     Icon: IconGuide },
  { key: "dashboard", label: "Dashboard", href: "/dashboard", Icon: IconDashboard },
  { key: "device",    label: "Device",    href: "/device",    Icon: IconDevice },
  { key: "settings",  label: "Settings",  href: "/settings",  Icon: IconSettings },
];

function activeKey(pathname: string): NavKey {
  if (pathname.startsWith("/guide"))    return "guide";
  if (pathname.startsWith("/device"))   return "device";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}

// ── Shell ──────────────────────────────────────────────
export default function AppShell({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [search, setSearch] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [profileName, setProfileName] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");

  useEffect(() => {
    const theme = localStorage.getItem("ksmiot-theme");
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (!u) {
        router.replace("/landing");
        return;
      }
      setProfileName(u.displayName || "");
      setProfilePhoto(u.photoURL || "");

      // Listen realtime profile
      const profRef = ref(rtdb, `users/${u.uid}/profile`);
      return onValue(profRef, (snap) => {
        const val = snap.val();
        if (val) {
          if (val.fullName) setProfileName(val.fullName);
          if (val.photoUrl) setProfilePhoto(val.photoUrl);
        }
      });
    });
    return unsub;
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/landing");
  };

  if (checking || !user) return <main className="shell-loading">Loading...</main>;

  const initials = (user.displayName || user.email || "U").slice(0, 2).toUpperCase();
  const displayName = user.displayName || user.email?.split("@")[0] || "User";

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="shell-sidebar">
        {/* Brand */}
        <a href="/dashboard" className="shell-brand" aria-label="KSM IoT Dashboard">
          <img src="/Logo_IoT.png" alt="KSM IoT" className="shell-brand-logo" />
          <div className="shell-brand-text">
            <span className="shell-brand-name">KSM Internet Of Things</span>
            <span className="shell-brand-sub">UPN &quot;Veteran&quot; Jakarta</span>
          </div>
        </a>

        {/* Expand / collapse icon (decorative) */}
        <div className="shell-sidebar-sep" />

        {/* Nav */}
        <nav className="shell-nav" aria-label="Main navigation">
          {navItems.map(({ key, label, href, Icon }) => (
            <a
              key={key}
              href={href}
              className={`shell-nav-item${activeKey(pathname) === key ? " active" : ""}`}
            >
              <span className="shell-nav-icon"><Icon /></span>
              <span className="shell-nav-label">{label}</span>
            </a>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="shell-main">
        {/* Topbar */}
        <header className="shell-topbar">
          {/* Search */}
          <div className="shell-search">
            <span className="shell-search-icon"><IconSearch /></span>
            <input
              type="text"
              placeholder={`Search ${activeKey(pathname).charAt(0).toUpperCase() + activeKey(pathname).slice(1)}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="shell-search-input"
            />
          </div>

          {/* Right controls */}
          <div className="shell-topbar-right">
            {/* Bell */}
            <button className="shell-icon-btn" aria-label="Notifications">
              <IconBell />
            </button>

            {/* User menu */}
            <div className="shell-user-wrap">
              <button
                className="shell-user-btn"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="User menu"
              >
                <div className="shell-avatar">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile" className="shell-avatar-img" />
                  ) : (
                    (profileName || user.displayName || user.email || "U").slice(0, 2).toUpperCase()
                  )}
                </div>
                <span className="shell-user-name">
                  {profileName || user.displayName || user.email?.split("@")[0] || "User"}
                </span>
                <span className="shell-chevron"><IconChevron /></span>
              </button>
              {userMenuOpen && (
                <div className="shell-user-menu">
                  <a href="/settings" className="shell-menu-item" onClick={() => setUserMenuOpen(false)}>Settings</a>
                  <button className="shell-menu-item danger" onClick={handleLogout}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
