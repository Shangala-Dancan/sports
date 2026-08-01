import axios from "axios";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";



const REGISTRATION_FEE_PER_PLAYER = 1;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

const Players = () => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const user = JSON.parse(localStorage.getItem("user")||"null");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [position, setPosition] = useState("");
  const [nationality, setNationality] = useState("");
  const [height, setHeight] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [clubId, setClubId] = useState("");
  const [profileImage, setProfileImage] = useState(null);

  // Pending-approval queue: players that have been submitted but not yet
  // approved by an admin, so they aren't in `players` (the live roster) yet.
  const [pendingPlayers, setPendingPlayers] = useState([]);
  const [pendingLoading, setPendingLoading] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [showPending, setShowPending] = useState(false);
  // id of the pending player currently being approved/rejected
  const [actioningId, setActioningId] = useState(null);
  // id of the pending player whose inline "reason for rejecting" field is open
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");


  
  const [clubPayments, setClubPayments] = useState({});
  const pollTimers = useRef({}); // clubId -> { interval, timeout }

  const [toast, setToast] = useState("");

  const imgUrl = "https://shangala.pythonanywhere.com/static/images/";

  // Fetch Players (live/approved roster only)
  const getPlayers = async () => {
    try {
      setLoading("Loading players...");
      const response = await axios.get("https://shangala.pythonanywhere.com/api/get_player");
      setPlayers(response.data);
      setLoading("");
    } catch (err) {
      setLoading("");
      setError(err.message);
    }
  };

  const POSITIONS = [
    "Setter",
    "Outside Hitter",
    "Opposite Hitter",
    "Middle Blocker",
    "Libero",
    "Defensive Specialist",
  ];

  // Fetch Clubs
  const getClubs = async () => {
    try {
      const response = await axios.get("https://shangala.pythonanywhere.com/api/get_club");
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
        "https://shangala.pythonanywhere.com/api/get_pending_players"
      );
      setPendingPlayers(response.data || []);
      setPendingLoading("");
    } catch (err) {
      setPendingLoading("");
      setPendingError(err.response?.data?.message || err.message);
    }
  };

  // Add Player — submits into the pending queue. No fee required at this
  // step; the club pays once per unpaid batch, later, to unlock approval.
  const addPlayer = async (e) => {
    e.preventDefault();
    try {
      setLoading("Submitting player for approval...");
      setError("");

      const formData = new FormData();
      formData.append("name", name);
      formData.append("age", age);
      formData.append("position", position);
      formData.append("nationality", nationality);
      formData.append("height", height);
      formData.append("date_of_birth", dateOfBirth);
      formData.append("club_id", clubId);
      formData.append("image", profileImage);

      await axios.post("https://shangala.pythonanywhere.com/api/add_player", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setName("");
      setAge("");
      setPosition("");
      setNationality("");
      setHeight("");
      setDateOfBirth("");
      setClubId("");
      setProfileImage(null);

      setShowForm(false);
      setToast(
        `Player submitted — your club will need to pay the KSH ${REGISTRATION_FEE_PER_PLAYER} registration fee for this player before it's approved.`
      );

      await getPendingPlayers();
      setLoading("");
    } catch (err) {
      setLoading("");
      setError(err.response?.data?.message || err.message);
    }
  };

  // Group pending players by club so we can show one fee total per club.
  const pendingByClub = pendingPlayers.reduce((acc, p) => {
    const key = p.club_id ?? "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const clubName = (clubIdKey, samplePlayer) =>
    samplePlayer?.club_name ||
    clubs.find((c) => String(c.id) === String(clubIdKey))?.name ||
    "Unknown Club";

  // Players in `group` NOT yet covered by a successful payment — neither the
  // server's fee_paid flag nor this session's paidPlayerIds (the specific
  // batch a completed STK push actually covered). This is the key fix: a
  // newly submitted player for an already-paid club will correctly show up
  // here as unpaid, rather than silently inheriting a stale club-level
  // "paid" status.
  const unpaidPlayers = (clubIdKey, group) => {
    const paidIds = clubPayments[clubIdKey]?.paidPlayerIds || [];
    return group.filter((p) => !p.fee_paid && !paidIds.includes(p.id));
  };

  // Source of truth for "has this club's CURRENT pending batch been paid
  // for": true only when every player presently in `group` is covered,
  // either by the backend's fee_paid flag or by this session's
  // paidPlayerIds. We deliberately never short-circuit on a club-level
  // "paid" flag alone — that was the bug that let newly-added unpaid
  // players slip through as approvable.
  const isClubPaid = (clubIdKey, group) =>
    group.length > 0 && unpaidPlayers(clubIdKey, group).length === 0;

  // `patch` can be a plain object to merge in, or a function
  // (prevClubState) => patchObject for updates that need to read the
  // current per-club state first (e.g. merging pendingPlayerIds into
  // paidPlayerIds only once payment is confirmed).
  const setClubPaymentState = (clubIdKey, patch) => {
    setClubPayments((prev) => {
      const prevClub = prev[clubIdKey] || {
        phone: "",
        status: "idle",
        paidPlayerIds: [],
        pendingPlayerIds: [],
      };
      const resolvedPatch = typeof patch === "function" ? patch(prevClub) : patch;
      return {
        ...prev,
        [clubIdKey]: { ...prevClub, ...resolvedPatch },
      };
    });
  };

  const clearPollTimers = (clubIdKey) => {
    const t = pollTimers.current[clubIdKey];
    if (t) {
      clearInterval(t.interval);
      clearTimeout(t.timeout);
      delete pollTimers.current[clubIdKey];
    }
  };

  // Kick off an STK push for the total fee owed by this club's currently
  // UNPAID pending players (not the whole group — players already covered
  // by a prior payment must not be charged again).
  const requestClubPayment = async (clubIdKey) => {
    const group = pendingByClub[clubIdKey] || [];
    const owed = unpaidPlayers(clubIdKey, group);
    const phone = clubPayments[clubIdKey]?.phone?.trim();

    if (!phone) {
      setClubPaymentState(clubIdKey, {
        status: "failed",
        message: "Enter the club's M-Pesa phone number first.",
      });
      return;
    }
    if (owed.length === 0) return;

    const amount = REGISTRATION_FEE_PER_PLAYER * owed.length;
    const owedIds = owed.map((p) => p.id);

    // NOTE: pendingPlayerIds records which ids THIS push is *for*, purely so
    // the success handler later knows what to mark as paid. It must NOT be
    // treated as paid — only paidPlayerIds (set on confirmed success) counts
    // toward isClubPaid/unpaidPlayers. Setting paidPlayerIds here, before
    // the STK push is even confirmed, was the bug: it enabled Approve the
    // instant the push was sent, before the customer entered their PIN.
    setClubPaymentState(clubIdKey, {
      status: "initiating",
      message: "",
      pendingPlayerIds: owedIds,
    });

    try {
      const response = await axios.post(
        "https://shangala.pythonanywhere.com/api/mpesa/initiate",
        {
          club_id: clubIdKey,
          phone,
          amount,
          player_ids: owedIds,
        }
      );

      const checkoutRequestId = response.data?.checkout_request_id;
      setClubPaymentState(clubIdKey, {
        status: "pending",
        checkoutRequestId,
        message: "Check the club's phone and enter the M-Pesa PIN to confirm.",
      });

      pollClubPaymentStatus(clubIdKey, checkoutRequestId);
    } catch (err) {
      setClubPaymentState(clubIdKey, {
        status: "failed",
        message: err.response?.data?.message || err.message,
      });
    }
  };

  const pollClubPaymentStatus = (clubIdKey, checkoutRequestId) => {
    clearPollTimers(clubIdKey);
    if (!checkoutRequestId) return;

    const interval = setInterval(async () => {
      try {
        const response = await axios.get(
          `https://shangala.pythonanywhere.com/api/mpesa/status/${checkoutRequestId}`
        );
        const status = response.data?.status;

        if (status === "success") {
          clearPollTimers(clubIdKey);
          // Only NOW — after the server confirms the transaction — do the
          // covered ids actually count as paid.
          setClubPaymentState(clubIdKey, (prev) => ({
            status: "paid",
            message: "Payment confirmed. You can now approve this club's players.",
            paidPlayerIds: [
              ...(prev?.paidPlayerIds || []),
              ...(prev?.pendingPlayerIds || []),
            ],
            pendingPlayerIds: [],
          }));
          // Refresh from the server so fee_paid reflects the confirmed
          // payment too — keeps isClubPaid correct even after a remount,
          // and is the eventual source of truth once it lands.
          getPendingPlayers();
        } else if (status === "failed") {
          clearPollTimers(clubIdKey);
          setClubPaymentState(clubIdKey, {
            status: "failed",
            message: "Payment failed or was cancelled. Try again.",
            pendingPlayerIds: [],
          });
        }
        // status === "pending" -> keep polling
      } catch (err) {
        // transient errors while polling shouldn't kill the flow silently;
        // surface on next successful poll or timeout below.
      }
    }, POLL_INTERVAL_MS);

    const timeout = setTimeout(() => {
      clearPollTimers(clubIdKey);
      setClubPayments((prev) => {
        const current = prev[clubIdKey];
        if (current && current.status === "pending") {
          return {
            ...prev,
            [clubIdKey]: {
              ...current,
              status: "failed",
              message: "Payment timed out waiting for confirmation. Try again.",
              pendingPlayerIds: [],
            },
          };
        }
        return prev;
      });
    }, POLL_TIMEOUT_MS);

    pollTimers.current[clubIdKey] = { interval, timeout };
  };

 useEffect(() => {
  const timers = pollTimers.current;

  return () => {
    Object.keys(timers).forEach((key) => {
      const t = timers[key];

      if (t) {
        clearInterval(t.interval);
        clearTimeout(t.timeout);
      }
    });
  };
}, []);

  // Admin approves a pending player: only allowed once this player's fee has
  // been paid (checked via the club's current pending batch coverage).
  const approvePlayer = async (playerId, clubIdKey) => {
    const group = pendingByClub[clubIdKey] || [];
    if (!isClubPaid(clubIdKey, group)) {
      setPendingError(
        "This club hasn't completed the registration fee payment for all pending players yet."
      );
      return;
    }

    setActioningId(playerId);
    setPendingError("");
    try {
      await axios.put(
        `https://shangala.pythonanywhere.com/api/approve_player/${playerId}`
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

  // Approve every pending player for a club in one go, once paid.
  const approveAllForClub = async (clubIdKey) => {
    const group = pendingByClub[clubIdKey] || [];
    for (const player of group) {
      // eslint-disable-next-line no-await-in-loop
      await approvePlayer(player.id, clubIdKey);
    }
  };

  // Admin rejects a pending player: no fee required, discarded permanently.
  const rejectPlayer = async (playerId) => {
    setActioningId(playerId);
    setPendingError("");
    try {
      const payload = new URLSearchParams();
      if (rejectReason.trim()) payload.append("reason", rejectReason.trim());

      await axios.put(
        `https://shangala.pythonanywhere.com/api/reject_player/${playerId}`,
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
    <div className="container-fluid mt-4">
      {loading && <div className="alert alert-info">{loading}</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {toast && (
        <div className="alert alert-success" role="status">
          {toast}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Players</h4>
        {user?.role === "admin" && (
          <button
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
          </button>
        )}
      </div>

      <div className="table-responsive">
        <table className="table table-striped table-hover">
          <thead className="table-secondary">
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Age</th>
              <th>Position</th>
              <th>Nationality</th>
              <th>Height</th>
              <th>Date of Birth</th>
              <th>Club</th>
            </tr>
          </thead>
          <tbody>
            {players.length > 0 ? (
              players.map((player) => (
                <tr key={player.id} onClick={() => navigate(`/player/${player.id}`)}>
                  <td>
                    <img
                      src={`${imgUrl}/${player.profile_image}`}
                      alt={player.name}
                      width="60"
                      height="60"
                      style={{ objectFit: "cover", borderRadius: "50%" }}
                    />
                  </td>
                  <td>{player.name}</td>
                  <td>{player.age}</td>
                  <td>{player.position}</td>
                  <td>{player.nationality}</td>
                  <td>{player.height}</td>
                  <td>{player.date_of_birth}</td>
                  <td>{player.club_name}</td>
                  <td>
                    <p className="text-primary">More+</p>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="text-center">
                  No players found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Button */}
      {user?.role==="admin"&&(
      <button
        className="btn btn-primary rounded-circle position-fixed"
        style={{ right: "30px", bottom: "30px", width: "60px", height: "60px", fontSize: "28px" }}
        onClick={() => setShowForm(true)}
      >
        +
      </button>
      )}

      {/* Add Player Modal */}
      {showForm && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={addPlayer}>
                <div className="modal-header">
                  <h4>Add Player</h4>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowForm(false)}
                  />
                </div>

                <div className="modal-body">
                  <p className="text-muted small">
                    New players are submitted for admin approval. Your club
                    pays a KSH {REGISTRATION_FEE_PER_PLAYER} registration fee
                    per player (collected once per unpaid batch) before
                    they're approved onto the roster.
                  </p>

                  <input
                    type="text"
                    className="form-control mb-3"
                    placeholder="Player Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    className="form-control mb-3"
                    placeholder="Age"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                  />
                  <select
                    className="form-select mb-3"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    required
                  >
                    <option value="">Select Position</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="form-control mb-3"
                    placeholder="Nationality"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className="form-control mb-3"
                    placeholder="Height (e.g. 1.92m)"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    required
                  />
                  <label className="form-label small text-muted mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    className="form-control mb-3"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    required
                  />
                  <select
                    className="form-select mb-3"
                    value={clubId}
                    onChange={(e) => setClubId(e.target.value)}
                    required
                  >
                    <option value="">Select Club</option>
                    {clubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="file"
                    className="form-control"
                    accept="image/*"
                    onChange={(e) => setProfileImage(e.target.files[0])}
                    required
                  />
                </div>

                <div className="modal-footer">
                  <button type="submit" className="btn btn-success">
                    Submit For Approval
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Pending Approval Modal, grouped by club with per-player fee gating */}
      {showPending && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
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
                  Object.entries(pendingByClub).map(([clubIdKey, group]) => {
                    const payment = clubPayments[clubIdKey] || { phone: "", status: "idle", paidPlayerIds: [] };
                    const owed = unpaidPlayers(clubIdKey, group);
                    const totalFee = REGISTRATION_FEE_PER_PLAYER * owed.length;
                    const isPaid = isClubPaid(clubIdKey, group);

                    return (
                      <div className="card mb-3" key={clubIdKey}>
                        <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                          <div>
                            <strong>{clubName(clubIdKey, group[0])}</strong>
                            <span className="text-muted ms-2 small">
                              {group.length} player{group.length > 1 ? "s" : ""} pending ·
                              {isPaid
                                ? " all fees paid"
                                : ` Fee owed: KSH ${totalFee} (${owed.length} unpaid)`}
                            </span>
                          </div>

                          {isPaid ? (
                            <span className="badge bg-success">Fee Paid</span>
                          ) : (
                            <div className="d-flex align-items-center gap-2">
                              <input
                                type="tel"
                                className="form-control form-control-sm"
                                style={{ width: 170 }}
                                placeholder="M-Pesa phone e.g. 2547XXXXXXXX"
                                value={payment.phone}
                                onChange={(e) =>
                                  setClubPaymentState(clubIdKey, { phone: e.target.value })
                                }
                                disabled={payment.status === "initiating" || payment.status === "pending"}
                              />
                              <button
                                className="btn btn-sm btn-warning"
                                disabled={payment.status === "initiating" || payment.status === "pending"}
                                onClick={() => requestClubPayment(clubIdKey)}
                              >
                                {payment.status === "initiating"
                                  ? "Sending…"
                                  : payment.status === "pending"
                                  ? "Awaiting confirmation…"
                                  : `Pay KSH ${totalFee} via M-Pesa`}
                              </button>
                            </div>
                          )}
                        </div>

                        {payment.message && (
                          <div
                            className={`px-3 pt-2 small ${
                              payment.status === "failed" ? "text-danger" : "text-muted"
                            }`}
                          >
                            {payment.message}
                          </div>
                        )}

                        <div className="table-responsive">
                          <table className="table table-sm align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Photo</th>
                                <th>Name</th>
                                <th>Age</th>
                                <th>Position</th>
                                <th>Nationality</th>
                                <th>Height</th>
                                <th>Date of Birth</th>
                                <th>Fee</th>
                                <th style={{ minWidth: 220 }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.map((player) => {
                                const isActioning = actioningId === player.id;
                                const isRejecting = rejectingId === player.id;
                                const paidIds = payment.paidPlayerIds || [];
                                const playerPaid = !!player.fee_paid || paidIds.includes(player.id);

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
                                    <td className="small text-muted">{player.nationality || "—"}</td>
                                    <td className="small text-muted">{player.height || "—"}</td>
                                    <td className="small text-muted">{player.date_of_birth || "—"}</td>
                                    <td>
                                      {playerPaid ? (
                                        <span className="badge bg-success">Paid</span>
                                      ) : (
                                        <span className="badge bg-secondary">Unpaid</span>
                                      )}
                                    </td>
                                    <td>
                                      {!isRejecting ? (
                                        <div className="d-flex gap-2">
                                          <button
                                            className="btn btn-sm btn-success"
                                            disabled={!playerPaid || isActioning}
                                            title={!playerPaid ? "This player's registration fee must be paid first" : ""}
                                            onClick={() => approvePlayer(player.id, clubIdKey)}
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

                        {isPaid && group.length > 1 && (
                          <div className="card-footer text-end">
                            <button
                              className="btn btn-sm btn-outline-success"
                              onClick={() => approveAllForClub(clubIdKey)}
                            >
                              Approve All ({group.length})
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="modal-footer">
                <button className="btn btn-outline-secondary btn-sm" onClick={getPendingPlayers}>
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