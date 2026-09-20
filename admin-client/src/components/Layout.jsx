import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SETTINGS_LINKS = [
  { to: "/users", label: "Users", adminOnly: true },
  { to: "/categories", label: "Categories", adminOnly: true },
  { to: "/brands", label: "Brands", adminOnly: true },
  { to: "/parties", label: "Parties", adminOnly: false },
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
  const settingsRef = useRef(null);
  const profileRef = useRef(null);

  const visibleSettingsLinks = SETTINGS_LINKS.filter((link) => !link.adminOnly || user?.role === "admin");
  const isSettingsActive = visibleSettingsLinks.some((link) => location.pathname.startsWith(link.to));

  useEffect(() => {
    function handleClickOutside(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setSettingsOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <nav className="navbar">
        <img src="/logo.png" alt="S AND S BEARINGS" className="nav-logo" title="S AND S BEARINGS" />
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
        {user?.role === "admin" && (
          <NavLink to="/purchases" className={({ isActive }) => (isActive ? "active" : "")}>
            Purchases
          </NavLink>
        )}
        {user?.role === "admin" && (
          <NavLink to="/reports" className={({ isActive }) => (isActive ? "active" : "")}>
            Reports
          </NavLink>
        )}
        {visibleSettingsLinks.length > 0 && (
          <div className="nav-dropdown" ref={settingsRef}>
            <button
              type="button"
              className={`nav-dropdown-toggle ${isSettingsActive ? "active" : ""}`}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              Settings <span className="caret">▾</span>
            </button>
            {settingsOpen && (
              <div className="nav-dropdown-menu">
                {visibleSettingsLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) => (isActive ? "active" : "")}
                    onClick={() => setSettingsOpen(false)}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
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
