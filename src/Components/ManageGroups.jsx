import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "https://shangala.pythonanywhere.com";

// Same divisions used in Schedule.jsx. If your clubs table doesn't carry
// a `gender` field yet, this filter just shows every club under "All" -
// nothing breaks, it just won't split anything until that field exists.
const GENDERS = ["All", "Men", "Women"];

const ManageGroups = () => {
  const imgurl = `${API_BASE}/static/images/`;

  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState("");
  const [newGroupName, setNewGroupName] = useState({}); // { [clubId]: text being typed }
  const [activeGender, setActiveGender] = useState("All");

  const getClubs = async () => {
    setLoading("Loading clubs...");
    try {
      const res = await axios.get(`${API_BASE}/api/get_club`);
      setClubs(res.data || []);
      setLoading("");
    } catch (error) {
      console.log(error);
      setLoading("Failed loading clubs");
    }
  };

  useEffect(() => {
    getClubs();
  }, []);

  // only filter by gender if the club record actually has one, so this
  // stays backwards compatible with clubs that don't carry it yet
  const visibleClubs = clubs.filter(
    c => activeGender === "All" || !c.gender || c.gender === activeGender
  );

  // groups that already exist, derived from the visible clubs themselves,
  // so the dropdown always reflects what's actually in use for this division
  const existingGroups = [...new Set(
    visibleClubs.map(c => c.group_name).filter(Boolean)
  )].sort();

  const assignGroup = async (clubId, groupName) => {
    const formData = new FormData();
    formData.append("group_name", groupName || "");

    try {
      await axios.put(`${API_BASE}/api/update_club_group/${clubId}`, formData);
      getClubs();
    } catch (error) {
      console.log(error);
    }
  };

  const handleSelect = (clubId, value) => {
    if (value === "__new__") return; // wait for them to type + submit
    assignGroup(clubId, value);
  };

  const handleNewGroupSubmit = (clubId) => {
    const value = (newGroupName[clubId] || "").trim();
    if (!value) return;
    assignGroup(clubId, value);
    setNewGroupName({ ...newGroupName, [clubId]: "" });
  };

  return (
    <div className="container-fluid mt-4">
      <h2>Manage Kenya Cup Groups</h2>

      <ul className="nav nav-pills mb-3">
        {GENDERS.map(g => (
          <li className="nav-item" key={g}>
            <button
              className={`nav-link ${activeGender === g ? "active" : ""}`}
              onClick={() => setActiveGender(g)}
            >
              {g}
            </button>
          </li>
        ))}
      </ul>

      <p>{loading}</p>

      <table className="table">
        <thead>
          <tr>
            <th>Club</th>
            <th>Current Group</th>
            <th>Assign Group</th>
          </tr>
        </thead>
        <tbody>
          {visibleClubs.map(club => (
            <tr key={club.id}>
              <td className="d-flex align-items-center gap-2">
                <img
                  src={imgurl + club.logo}
                  alt=""
                  style={{ width: "32px", height: "32px", borderRadius: "50%" }}
                />
                {club.name}
              </td>
              <td>{club.group_name || <em className="text-muted">Ungrouped</em>}</td>
              <td>
                <div className="d-flex gap-2">
                  <select
                    className="form-select"
                    style={{ width: "180px" }}
                    value={club.group_name && existingGroups.includes(club.group_name) ? club.group_name : ""}
                    onChange={(e) => handleSelect(club.id, e.target.value)}
                  >
                    <option value="">Ungrouped</option>
                    {existingGroups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                    <option value="__new__">+ New group...</option>
                  </select>

                  <input
                    type="text"
                    className="form-control"
                    style={{ width: "160px" }}
                    placeholder="e.g. Group A"
                    value={newGroupName[club.id] || ""}
                    onChange={(e) =>
                      setNewGroupName({ ...newGroupName, [club.id]: e.target.value })
                    }
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => handleNewGroupSubmit(club.id)}
                  >
                    Set
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ManageGroups;