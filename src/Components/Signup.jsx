import React, { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

const Signup = () => {
  // variables for each field
  const [first_name, setFirstName] = useState("");
  const [last_name, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    const formData = new FormData();

    formData.append("first_name", first_name);
    formData.append("last_name", last_name);
    formData.append("email", email);
    formData.append("phone", phone);
    formData.append("password", password);
    formData.append("pending","user"); // default role (admin approves later)

    axios
      .post("http://127.0.0.1:5000/api/register", formData)
      .then((res) => {
        setMessage(res.data.message);

        // clear form
        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
        setPassword("");
      })
      .catch((err) => {
        if (err.response) {
          setMessage(err.response.data.message);
        } else {
          setMessage("Server error");
        }
      });
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-6">
        <h1>Signup</h1>

        <form onSubmit={handleSubmit}>
          <input
            className="form-control mb-2"
            type="text"
            placeholder="First Name"
            value={first_name}
            onChange={(e) => setFirstName(e.target.value)}
          />

          <input
            className="form-control mb-2"
            type="text"
            placeholder="Last Name"
            value={last_name}
            onChange={(e) => setLastName(e.target.value)}
          />

          <input
            className="form-control mb-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="form-control mb-2"
            type="text"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            className="form-control mb-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="btn btn-success w-100">
            Sign Up
          </button>
        </form>
         <p>I dont have an Account <Link to="/signin">Signin</Link></p>

        {message && <p className="mt-3">{message}</p>}
      </div>
    </div>
  );
};

export default Signup;