import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SETTINGS_LINKS = [
  // Users is hidden for now (no extra accounts needed). To bring it back, re-add:
  // { to: "/users", label: "Users", adminOnly: true },
  { to: "/categories", label: "Categories", adminOnly: true },
  { to: "/brands", label: "Brands", adminOnly: true },
  { to: "/ws-parties", label: "WSParties", adminOnly: true },
];

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // phones/tablets: the ☰ page menu
  const profileRef = useRef(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  const visibleSettingsLinks = SETTINGS_LINKS.filter((link) => !link.adminOnly || user?.role === "admin");
  const isSettingsActive = visibleSettingsLinks.some((link) => location.pathname.startsWith(link.to));

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
        setSettingsOpen(false);
      }
      const inMenu = menuRef.current?.contains(e.target) || menuButtonRef.current?.contains(e.target);
      if (!inMenu) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setSettingsOpen(false);
    setProfileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <nav className="navbar">
        <button
          type="button"
          ref={menuButtonRef}
          className="nav-menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
        <img src="/logo.png" alt="S AND S BEARINGS" className="nav-logo" title="S AND S BEARINGS" />
        {/* Desktop: the links sit in the bar. Phones/tablets: they drop down under it from the ☰ button. */}
        <div className={`nav-links${menuOpen ? " open" : ""}`} ref={menuRef}>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/products" className={({ isActive }) => (isActive ? "active" : "")}>
            Products
          </NavLink>
          <NavLink to="/billing" className={({ isActive }) => (isActive ? "active" : "")}>
            Billing
          </NavLink>
          <NavLink to="/invoices" className={({ isActive }) => (isActive ? "active" : "")}>
            Invoices
          </NavLink>
          {/* Purchases is hidden for now (route removed in App.jsx); Parties takes its place. */}
          <NavLink to="/parties" className={({ isActive }) => (isActive ? "active" : "")}>
            Parties
          </NavLink>
          {user?.role === "admin" && (
            <NavLink to="/reports" className={({ isActive }) => (isActive ? "active" : "")}>
              Reports
            </NavLink>
          )}
        </div>
        <div className="spacer" />
        <div className="nav-dropdown profile-dropdown" ref={profileRef}>
          <button
            type="button"
            className="profile-avatar"
            onClick={() => setProfileOpen((open) => !open)}
            title={user?.name}
          >
            {getInitials(user?.name)}
          </button>
          {profileOpen && (
            <div className="nav-dropdown-menu profile-menu">
              <div className="profile-details">
                <div className="profile-name">{user?.name}</div>
                <div className="profile-email muted">{user?.email}</div>
                <span className="badge orange">{user?.role}</span>
              </div>
              {visibleSettingsLinks.length > 0 && (
                <div className="profile-settings">
                  <button
                    type="button"
                    className={`profile-settings-toggle${isSettingsActive ? " active" : ""}`}
                    onClick={() => setSettingsOpen((open) => !open)}
                    aria-expanded={settingsOpen}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Settings
                    <span className="caret">▾</span>
                  </button>
                  {/* Always rendered so it can slide open/closed; inert keeps hidden links out of Tab order. */}
                  <div className={`profile-settings-links${settingsOpen ? " open" : ""}`} inert={!settingsOpen}>
                    <div>
                      {visibleSettingsLinks.map((link) => (
                        <NavLink
                          key={link.to}
                          to={link.to}
                          className={({ isActive }) => `profile-settings-link${isActive ? " active" : ""}`}
                        >
                          {link.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <button className="secondary" onClick={logout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
