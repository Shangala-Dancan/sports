import React, { useEffect, useState, useCallback } from "react";
import "./Nav.css";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = "http://127.0.0.1:5000/api";
const IMG_BASE_URL = "http://127.0.0.1:5000/static/images/";

const EMPTY_CLUB = {
  name: "",
  description: "",
  location: "",
  foundation_date: "",
  contact: "",
  gender: "men",
  logo: null,
};

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
};

const Clubs = () => {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter the grid by gender — defaults to showing men's teams first,
  // same as the Statistics page.
  const [genderFilter, setGenderFilter] = useState("men");

  const [club, setClub] = useState(EMPTY_CLUB);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleChange = (e) => {
    setClub({
      ...club,
      [e.target.name]:
        e.target.type === "file" ? e.target.files[0] : e.target.value,
    });
  };

  const getTeams = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/get_club`);
      setTeams(response.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getTeams();
  }, [getTeams]);

  const closeForm = () => {
    setShowForm(false);
    setClub(EMPTY_CLUB);
    setFormError(null);
  };

  const addClub = async (e) => {
    e.preventDefault();

    if (!club.name.trim()) {
      setFormError("Club name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const formData = new FormData();
    formData.append("name", club.name);
    formData.append("description", club.description);
    formData.append("location", club.location);
    formData.append("foundation_date", club.foundation_date);
    formData.append("contact", club.contact);
    formData.append("gender", club.gender);
    if (club.logo) formData.append("logo", club.logo);

    try {
      await axios.post(`${API_BASE_URL}/add_club`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      closeForm();
      getTeams();
    } catch (err) {
      console.error(err);
      setFormError("Failed to add club. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Clubs added before the gender column existed default to "men" on the
  // server, so this filter still works correctly for old data too.
  const visibleTeams = teams.filter(
    (team) => (team.gender || "men") === genderFilter
  );

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 p-3">
        <h2 className="mb-0">Teams</h2>

        <ul className="nav nav-pills">
          <li className="nav-item">
            <button
              className={`nav-link ${genderFilter === "men" ? "active" : ""}`}
              onClick={() => setGenderFilter("men")}
            >
              Men's
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${genderFilter === "women" ? "active" : ""}`}
              onClick={() => setGenderFilter("women")}
            >
              Women's
            </button>
          </li>
        </ul>
      </div>

      {loading && (
        <h1 className="text-center text-secondary">Please wait...</h1>
      )}
      {error && <h1 className="text-center text-danger">{error}</h1>}
      {!loading && !error && visibleTeams.length === 0 && (
        <p className="text-center text-muted">No teams yet.</p>
      )}

      <div className="row">
        {visibleTeams.map((team) => (
          <div
            className="col-md-2 mb-3"
            key={team.id}
            role="button"
            onClick={() => navigate(`/club/${team.id}`)}
          >
            <div className="card border-0 bg-transparent text-center">
              <div className="card-body">
                <img
                  src={IMG_BASE_URL + team.logo}
                  alt={team.name}
                  style={{
                    height: "200px",
                    objectFit: "cover",
                    width: "100%",
                    borderRadius: "20px",
                  }}
                />
                <h2>{team.name}</h2>
              </div>
            </div>
          </div>
        ))}
      </div>

      {user?.role === "admin" && (
        <button className="fab rounded" onClick={() => setShowForm(true)}>
          +
        </button>
      )}

      {showForm && (
        <div
          className="modal fade show"
          style={{ display: "block", background: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={addClub} className="popup-form card">
                <h2 className="form-label">Add Club</h2>

                <div className="modal-body">
                  {formError && (
                    <div className="alert alert-danger">{formError}</div>
                  )}

                  <input
                    name="name"
                    placeholder="Club name"
                    value={club.name}
                    onChange={handleChange}
                    className="form-control mb-3"
                  />
                  <input
                    name="description"
                    placeholder="Description"
                    value={club.description}
                    onChange={handleChange}
                    className="form-control mb-3"
                  />
                  <input
                    name="location"
                    placeholder="Location"
                    value={club.location}
                    onChange={handleChange}
                    className="form-control mb-3"
                  />
                  <input
                    type="date"
                    name="foundation_date"
                    value={club.foundation_date}
                    onChange={handleChange}
                    className="form-control mb-3"
                  />
                  <input
                    name="contact"
                    placeholder="Contact"
                    value={club.contact}
                    onChange={handleChange}
                    className="form-control mb-3"
                  />
                  <select
                    name="gender"
                    value={club.gender}
                    onChange={handleChange}
                    className="form-select mb-3"
                  >
                    <option value="men">Men's</option>
                    <option value="women">Women's</option>
                  </select>
                  <input
                    type="file"
                    name="logo"
                    onChange={handleChange}
                    className="form-control mb-3"
                  />

                  <button
                    type="submit"
                    className="btn btn-outline-primary me-3"
                    disabled={saving}
                  >
                    {saving ? "Adding..." : "Add Club"}
                  </button>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="btn btn-outline-primary ms-4"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clubs;