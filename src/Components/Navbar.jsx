import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Nav.css';

const Navbar = () => {
  const navigate=useNavigate()

  const user=JSON.parse(localStorage.getItem("user"))

  const logout=()=>{
    localStorage.removeItem("user")
    navigate("/signin")

  }
  return (
    <div>
      <nav className="navbar navbar-expand-lg bg-secondary custom-navbar ">

        <div className="container-fluid ms-2 me-2">
          <Link to="/dashboard" className='navbar-brand fs-3 fw-bold ms-2 p-2 text-white'>KVF
            <img src="mylg.jpeg" alt="" height="28" className='thumbnail logo'/>
          </Link>

          {/* button to toggle */}
          <button className="navbar-toggler" type='button' data-bs-toggle="collapse" data-bs-target="#collapsenav">
            <span className="navbar-toggler-icon"></span>
          </button>

      {/* to left */}
          <div className="collapse navbar-collapse" id='collapsenav'>
            <div className="navbar-nav gap-3">
              <div className="nav-item btn btn-outline-warning">
                <Link to="/" className="nav-link text-white ">Home</Link>
              </div>
              <div className="nav-item btn btn-outline-warning">
                <Link to="/clubs" className="nav-link text-white">Teams</Link>
              </div>
              <div className="nav-item btn btn-outline-warning">
                <Link to="/schedule" className="nav-link text-white">Schedule</Link>
              </div>
              <div className="nav-item btn btn-outline-warning">
                <Link to="/standing" className="nav-link text-white">Standing</Link>
              </div>
        

            <div className="nav-item btn btn-outline-warning">
                <Link to="/players" className="nav-link text-white">Players</Link>
              </div>

            {user?.role==="admin"&&(

            <div className="nav-item btn btn-outline-warning">
                <Link to="/score" className="nav-link text-white">Score</Link>
              </div>
              )}
             
             
              <div className="nav-item btn btn-outline-warning">
                <Link to="/livescore" className="nav-link text-white">Livescore</Link>
              </div>
              <div className="nav-item btn btn-outline-warning">
                <Link to="/viewnews" className="nav-link text-white">News</Link>
              </div>

               <div className="nav-item btn btn-outline-warning">
                <Link to="/transfer" className="nav-link text-white">Transfers</Link>
              </div>

              {user?.role==="admin"&&(
               <div className="nav-item btn btn-outline-warning">
                <Link to="/admin/groups" className="nav-link text-white">Goups</Link>
              </div>)}
                <div className="nav-item btn btn-outline-warning">
                <Link to="/stats" className="nav-link text-white">Stats</Link>
              </div>
                  </div>
            
            {/* to right */}
          <div className="navbar-nav ms-auto">
            <div className="nav-item btn jap-2 me-3">
               <p className='text-warning position-relative'>{user?.name} 

                <span className={`position-absolute border border-light  top-0 p-2 rounded-circle ${user?.role==="admin"?"bg-success":"visually-hidden"}`}>
                  <span className='visually-hidden'>New alert</span>
                </span>
               </p>
            </div>
            {user?(
             <div className="nav-item btn btn-outline-warning">
                 
                  <button onClick={logout} className="nav-link text-white" style={{ border: 'none', background: 'none' }}>Logout</button>
                </div>
            ):(
              <div className="nav-item btn btn-outline-warning">
              <Link to="/signin" className="nav-link text-white">Login</Link>
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