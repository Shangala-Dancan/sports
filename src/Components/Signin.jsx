import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

const Signin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const navigate=useNavigate()
  const handleLogin = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    try {
      const res = await axios.post(
        "http://localhost:5000/api/login",
        formData
      );

      setMessage(res.data.message);


      if(res.data.user){
      // store user (optional)
      localStorage.setItem("user", JSON.stringify(res.data.user));
      navigate("/")
        }

    } catch (err) {
      if (err.response) {
        setMessage(err.response.data.message);
        
      } else {
        setMessage("Server error");
      }
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-5">
        <h2>Signin</h2>

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label>Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label>Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="btn btn-primary w-100">
            Login
          </button>
        </form>
        <p>I dont have an Account <Link to="/signup">Signup</Link></p>

        {message && <p className="mt-3">{message}</p>}
      </div>
    </div>
  );
};

export default Signin;