import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import './Nav.css';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/clubs', label: 'Teams' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/standing', label: 'Standing' },
  { to: '/players', label: 'Players' },
  { to: '/score', label: 'Score', adminOnly: true },
  { to: '/livescore', label: 'Livescore' },
  { to: '/viewnews', label: 'News' },
  { to: '/transfer', label: 'Transfers' },
  { to: '/admin/groups', label: 'Groups', adminOnly: true },
  { to: '/stats', label: 'Stats' },
]

const Navbar = () => {
  const navigate = useNavigate()
  const collapseRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const user = JSON.parse(localStorage.getItem("user"))

  const logout = () => {
    localStorage.removeItem("user")
    setIsOpen(false)
    navigate("/signin")
  }

  // NEW: close the mobile menu whenever a nav link is clicked / a page is viewed
  const closeMenu = () => setIsOpen(false)

  // NEW: close the menu automatically if the user clicks/taps outside of it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && collapseRef.current && !collapseRef.current.contains(e.target)) {
        // ignore clicks on the toggler button itself, it has its own handler
        if (!e.target.closest('.navbar-toggler')) {
          setIsOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // NEW: add a subtle shadow / shrink effect once the page is scrolled
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // NEW: initials for a lightweight avatar badge next to the user's name
  const initials = user?.name
    ? user.name.trim().split(/\s+/).slice(0, 2).map(n => n[0]?.toUpperCase()).join('')
    : ''

  return (
    <div>
      <nav className={`navbar navbar-expand-lg bg-secondary custom-navbar ${scrolled ? 'navbar-scrolled shadow' : ''}`}>

        <div className="container-fluid ms-2 me-2">
          <Link to="/dashboard" className='navbar-brand fs-3 fw-bold ms-2 p-2 text-white' onClick={closeMenu}>
            KVF
            <img src="mylg.jpeg" alt="" height="28" className='thumbnail logo' />
          </Link>

          {/* button to toggle */}
          <button
            className="navbar-toggler"
            type='button'
            aria-expanded={isOpen}
            aria-label="Toggle navigation"
            onClick={() => setIsOpen(prev => !prev)}
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          {/* to left */}
          <div
            className={`collapse navbar-collapse ${isOpen ? 'show' : ''}`}
            id='collapsenav'
            ref={collapseRef}
          >
            <div className="navbar-nav gap-3">
              {NAV_LINKS.filter(link => !link.adminOnly || user?.role === "admin").map(link => (
                <div className="nav-item btn btn-outline-warning" key={link.to}>
                  <NavLink
                    to={link.to}
                    onClick={closeMenu}
                    className={({ isActive }) => `nav-link text-white ${isActive ? 'active fw-bold text-decoration-underline' : ''}`}
                  >
                    {link.label}
                  </NavLink>
                </div>
              ))}
            </div>

            {/* to right */}
            <div className="navbar-nav ms-auto align-items-center">
              <div className="nav-item btn jap-2 me-3 d-flex align-items-center gap-2">
                {user && (
                  <span
                    className="rounded-circle bg-warning text-dark fw-bold d-flex align-items-center justify-content-center"
                    style={{ width: 32, height: 32, fontSize: 14 }}
                    title={user?.name}
                  >
                    {initials}
                  </span>
                )}
                <p className='text-warning position-relative mb-0'>
                  {user?.name}
                  <span className={`position-absolute border border-light top-0 p-2 rounded-circle ${user?.role === "admin" ? "bg-success" : "visually-hidden"}`}>
                    <span className='visually-hidden'>New alert</span>
                  </span>
                </p>
              </div>
              {user ? (
                <div className="nav-item btn btn-outline-warning">
                  <button onClick={logout} className="nav-link text-white" style={{ border: 'none', background: 'none' }}>Logout</button>
                </div>
              ) : (
                <div className="nav-item btn btn-outline-warning">
                  <NavLink to="/signin" className="nav-link text-white" onClick={closeMenu}>Login</NavLink>
                </div>
              )}
            </div>
          </div>

        </div>

      </nav>
    </div>
  )
}

export default Navbar