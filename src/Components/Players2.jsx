import axios from "axios";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ============================================================================
 * BACKEND API CONTRACT — new/changed routes needed on the Flask app.
 * get_club is unchanged.
 *
 * Players now go through an approval queue instead of landing directly in
 * the live roster: add_player creates the row with status "pending", and
 * only approve_player flips it to "approved" (which is what get_player
 * returns). reject_player discards it. This gates who gets saved/visible
 * in the real player list behind an admin action.
 *
 * 1) GET  /api/get_player
 *      -> JSON array, UNCHANGED endpoint but now filtered server-side to
 *         only players with status == "approved". This is the live roster.
 *
 * 2) POST /api/add_player
 *      multipart/form-data: name, age, position, stats, club_id, image
 *      -> UNCHANGED request shape. Server now inserts the row with
 *         status = "pending" instead of immediately live. Response body
 *         can include the created player's id/status but the client
 *         doesn't depend on it.
 *
 * 3) GET  /api/get_pending_players
 *      -> JSON array of players with status == "pending", same shape as
 *         get_player (id, name, age, position, club_name, profile_image, ...)
 *         plus a submitted_at timestamp if available.
 *
 * 4) PUT  /api/approve_player/<player_id>
 *      -> form-encoded PUT (matches existing PUT convention e.g.
 *         update_score). No body required. Sets status = "approved",
 *         after which the player shows up in get_player.
 *
 * 5) PUT  /api/reject_player/<player_id>
 *      form fields: reason (optional, free text)
 *      -> Sets status = "rejected" (or deletes the row — either way it
 *         must stop appearing in get_pending_players and never appear in
 *         get_player).
 * ==========================================================================*/

const Players = () => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const user=JSON.parse(localStorage.getItem("user"));
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [position, setPosition] = useState("");
  const [stats, setStats] = useState("");
  const [clubId, setClubId] = useState("");
  const [profileImage, setProfileImage] = useState(null);

  // Pending-approval queue: players that have been submitted but not yet
  // approved by an admin, so they aren't in `players` (the live roster) yet.
  const [pendingPlayers, setPendingPlayers] = useState([]);
  const [pendingLoading, setPendingLoading] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [showPending, setShowPending] = useState(false);
  // id of the pending player currently being approved/rejected, so its row
  // can show a spinner state and its buttons can be disabled mid-request.
  const [actioningId, setActioningId] = useState(null);
  // id of the pending player whose inline "reason for rejecting" field is
  // open, plus the text typed into it.
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const [toast, setToast] = useState("");

  const imgUrl = "http://127.0.0.1:5000/static/images/";

  // Fetch Players (live/approved roster only)
  const getPlayers = async () => {
    try {
      setLoading("Loading players...");

      const response = await axios.get(
        "http://127.0.0.1:5000/api/get_player"
      );

      setPlayers(response.data);
      setLoading("");
    } catch (err) {
      setLoading("");
      setError(err.message);
    }
  };

  // Fetch Clubs
  const getClubs = async () => {
    try {
      const response = await axios.get(
        "http://127.0.0.1:5000/api/get_club"
      );

      setClubs(response.data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch players awaiting admin approval.
  const getPendingPlayers = async () => {
    try {
      setPendingLoading("Loading pending players...");
      setPendingError("");

      const response = await axios.get(
        "http://127.0.0.1:5000/api/get_pending_players"
      );

      setPendingPlayers(response.data || []);
      setPendingLoading("");
    } catch (err) {
      setPendingLoading("");
      setPendingError(err.response?.data?.message || err.message);
    }
  };

  // Add Player — this now submits into the pending queue, not straight into
  // the live roster. It only becomes visible in the players table once an
  // admin approves it below.
  const addPlayer = async (e) => {
    e.preventDefault();

    try {
      setLoading("Submitting player for approval...");
      setError("");

      const formData = new FormData();

      formData.append("name", name);
      formData.append("age", age);
      formData.append("position", position);
      formData.append("stats", stats);
      formData.append("club_id", clubId);
      formData.append("image", profileImage);

      await axios.post(
        "http://127.0.0.1:5000/api/add_player",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      // Clear form
      setName("");
      setAge("");
      setPosition("");
      setStats("");
      setClubId("");
      setProfileImage(null);

      setShowForm(false);
      setToast("Player submitted — awaiting admin approval before it's saved to the roster.");

      // The new player isn't live yet, so refresh the pending queue (not
      // the approved roster) to reflect it.
      await getPendingPlayers();

      setLoading("");
    } catch (err) {
      setLoading("");
      setError(
        err.response?.data?.message || err.message
      );
    }
  };

  // Admin approves a pending player: it moves out of the queue and into the
  // real, saved roster.
  const approvePlayer = async (playerId) => {
    setActioningId(playerId);
    setPendingError("");
    try {
      await axios.put(
        `http://127.0.0.1:5000/api/approve_player/${playerId}`
      );
      setPendingPlayers((prev) => prev.filter((p) => p.id !== playerId));
      setToast("Player approved and saved to the roster.");
      await getPlayers();
    } catch (err) {
      setPendingError(err.response?.data?.message || err.message);
    } finally {
      setActioningId(null);
    }
  };

  // Admin rejects a pending player: it's discarded and never saved to the
  // live roster. Reason is optional.
  const rejectPlayer = async (playerId) => {
    setActioningId(playerId);
    setPendingError("");
    try {
      const payload = new URLSearchParams();
      if (rejectReason.trim()) payload.append("reason", rejectReason.trim());

      await axios.put(
        `http://127.0.0.1:5000/api/reject_player/${playerId}`,
        payload
      );
      setPendingPlayers((prev) => prev.filter((p) => p.id !== playerId));
      setToast("Player submission rejected.");
    } catch (err) {
      setPendingError(err.response?.data?.message || err.message);
    } finally {
      setActioningId(null);
      setRejectingId(null);
      setRejectReason("");
    }
  };

  useEffect(() => {
    getPlayers();
    getClubs();
    getPendingPlayers();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="container mt-4">
      {loading && (
        <div className="alert alert-info">
          {loading}
        </div>
      )}

      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {toast && (
        <div className="alert alert-success" role="status">
          {toast}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Players</h4>
        {user?.role==="admin"&&(<button
          className="btn btn-outline-warning position-relative"
          onClick={() => {
            setShowPending(true);
            getPendingPlayers();
          }}
        >
          Pending Approval
          {pendingPlayers.length > 0 && (
            <span className="badge rounded-pill bg-danger ms-2">
              {pendingPlayers.length}
            </span>
          )}
        </button>)}
      </div>

      <div className="table-responsive">
        <table className="table table-striped table-hover">
          <thead className="table-secondary">
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Age</th>
              <th>Position</th>
              <th>Club</th>
            </tr>
          </thead>

          <tbody>
            {players.length > 0 ? (
              players.map((player) => (
                <tr key={player.id} onClick={()=>navigate(`/player/${player.id}`)}>
                  <td>
                    <img
                      src={`${imgUrl}/${player.profile_image}`}
                      alt={player.name}
                      width="60"
                      height="60"
                      style={{
                        objectFit: "cover",
                        borderRadius: "50%",
                      }}
                    />
                  </td>

                  <td>{player.name}</td>
                  <td>{player.age}</td>
                  <td>{player.position}</td>
                  <td>{player.club_name}</td>
                  <td><p className="text-primary">More+</p></td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="5"
                  className="text-center"
                >
                  No players found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Button */}
      <button
        className="btn btn-primary rounded-circle position-fixed"
        style={{
          right: "30px",
          bottom: "30px",
          width: "60px",
          height: "60px",
          fontSize: "28px",
        }}
        onClick={() => setShowForm(true)}
      >
        +
      </button>

      {/* Add Player Modal */}
      {showForm && (
        <div
          className="modal fade show"
          style={{
            display: "block",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={addPlayer}>
                <div className="modal-header">
                  <h4>Add Player</h4>

                  <button type="button"  className="btn-close" onClick={() =>setShowForm(false)} /></div>

                <div className="modal-body">
                  <p className="text-muted small">
                    New players are submitted for admin approval — they won't appear on the roster until approved.
                  </p>

                  <input type="text" className="form-control mb-3"  placeholder="Player Name" value={name} onChange={(e) =>setName(e.target.value)}required/>

                  <input type="number" className="form-control mb-3" placeholder="Age" value={age} onChange={(e) =>  setAge(e.target.value) }required/>

                  <input type="text"className="form-control mb-3" placeholder="Position" value={position} onChange={(e) =>setPosition(e.target.value)}required/>

                  <textarea className="form-control mb-3"  placeholder="Stats" value={stats}onChange={(e) => setStats(e.target.value)}/>

               <select className="form-select mb-3" value={clubId} onChange={(e) => setClubId(e.target.value)}required>
                    <option value="">
                      Select Club
                    </option>

                    {clubs.map((club) => (
                      <option
                        key={club.id}
                        value={club.id}
                      >
                        {club.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="file"
                    className="form-control"
                    accept="image/*"
                    onChange={(e) =>
                      setProfileImage(
                        e.target.files[0]
                      )
                    }
                    required
                  />
                </div>

                <div className="modal-footer">
                  <button
                    type="submit"
                    className="btn btn-success"
                  >
                    Submit For Approval
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      setShowForm(false)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Pending Approval Modal */}
      {showPending && (
        <div
          className="modal fade show"
          style={{
            display: "block",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="mb-0">Players Awaiting Approval</h4>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowPending(false);
                    setRejectingId(null);
                    setRejectReason("");
                  }}
                />
              </div>

              <div className="modal-body">
                {pendingLoading && (
                  <div className="alert alert-info py-2">{pendingLoading}</div>
                )}
                {pendingError && (
                  <div className="alert alert-danger py-2">{pendingError}</div>
                )}

                {!pendingLoading && pendingPlayers.length === 0 ? (
                  <p className="text-muted mb-0">No players are waiting for approval.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Photo</th>
                          <th>Name</th>
                          <th>Age</th>
                          <th>Position</th>
                          <th>Club</th>
                          <th>Stats</th>
                          <th style={{ minWidth: 220 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingPlayers.map((player) => {
                          const clubName =
                            player.club_name ||
                            clubs.find((c) => c.id === player.club_id)?.name ||
                            "—";
                          const isActioning = actioningId === player.id;
                          const isRejecting = rejectingId === player.id;

                          return (
                            <tr key={player.id}>
                              <td>
                                {player.profile_image ? (
                                  <img
                                    src={`${imgUrl}/${player.profile_image}`}
                                    alt={player.name}
                                    width="48"
                                    height="48"
                                    style={{ objectFit: "cover", borderRadius: "50%" }}
                                  />
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td>{player.name}</td>
                              <td>{player.age}</td>
                              <td>{player.position}</td>
                              <td>{clubName}</td>
                              <td className="small text-muted">{player.stats || "—"}</td>
                              <td>
                                {!isRejecting ? (
                                  <div className="d-flex gap-2">
                                    <button
                                      className="btn btn-sm btn-success"
                                      disabled={isActioning}
                                      onClick={() => approvePlayer(player.id)}
                                    >
                                      {isActioning ? "Working…" : "Approve"}
                                    </button>
                                    <button
                                      className="btn btn-sm btn-outline-danger"
                                      disabled={isActioning}
                                      onClick={() => {
                                        setRejectingId(player.id);
                                        setRejectReason("");
                                      }}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <div className="d-flex flex-column gap-1">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm"
                                      placeholder="Reason (optional)"
                                      value={rejectReason}
                                      onChange={(e) => setRejectReason(e.target.value)}
                                    />
                                    <div className="d-flex gap-2">
                                      <button
                                        className="btn btn-sm btn-danger"
                                        disabled={isActioning}
                                        onClick={() => rejectPlayer(player.id)}
                                      >
                                        {isActioning ? "Working…" : "Confirm Reject"}
                                      </button>
                                      <button
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={isActioning}
                                        onClick={() => {
                                          setRejectingId(null);
                                          setRejectReason("");
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={getPendingPlayers}
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Players;