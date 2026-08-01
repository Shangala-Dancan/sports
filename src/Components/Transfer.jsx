import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:5000";

const Transfer = () => {

  const imgurl = `${API_BASE}/static/images/`;

  const [transfers, setTransfers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // check user
  const user=JSON.parse(localStorage.getItem("user"))

  const [form, setForm] = useState({
    player_id: "",
    to_club_id: "",
    transfer_date: "",
    fee: ""
  });

  // --- fee payment modal state ------------------------------------------
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTargetTransfer, setPayTargetTransfer] = useState(null);
  const [payPhone, setPayPhone] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [paying, setPaying] = useState(false);

  // logged-in user, saved to localStorage at login (see api/login response)
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const isAdmin = currentUser?.role === "admin";

  // --- data fetching -------------------------------------------------

  const getTransfers = async () => {
    setLoading("Loading transfers...");
    try {
      const res = await axios.get(`${API_BASE}/api/get_transfers`);
      const sorted = (res.data || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setTransfers(sorted);
      setLoading("");
    }
    catch (error) {
      console.log(error);
      setLoading("Failed loading transfers");
    }
  };

  const getPlayers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/get_player`);
      setPlayers(res.data || []);
    }
    catch (error) {
      console.log(error);
    }
  };

  const getClubs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/get_club`);
      setClubs(res.data || []);
    }
    catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getTransfers();
    getPlayers();
    getClubs();
  }, []);

  // --- helpers ---------------------------------------------------------

  const selectedPlayer = players.find(p => String(p.id) === String(form.player_id));

  const statusColor = (status) => {
    switch (status) {
      case "Completed": return "success";
      case "Approved": return "primary";
      case "Rejected": return "danger";
      default: return "warning";
    }
  };

  // A fee counts as "paid" if there's no fee at all, or if fee_paid has
  // been flipped to true (by the M-Pesa callback once payment succeeds).
  const feeIsPaid = (t) => !t.fee || Number(t.fee) <= 0 || !!t.fee_paid;
  const hasUnpaidFee = (t) => t.fee > 0 && !feeIsPaid(t);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // --- actions -----------------------------------------------------------

  const addTransfer = async (e) => {
    e.preventDefault();

    if (!form.player_id || !form.to_club_id || !form.transfer_date) {
      setError("Please select a player, destination club and transfer date");
      return;
    }

    const formData = new FormData();
    formData.append("player_id", form.player_id);
    formData.append("to_club_id", form.to_club_id);
    formData.append("transfer_date", form.transfer_date);
    formData.append("fee", form.fee || 0);

    try {
      const res = await axios.post(`${API_BASE}/api/add_transfer`, formData);
      alert(res.data.message);
      setForm({ player_id: "", to_club_id: "", transfer_date: "", fee: "" });
      setError("");
      setShowForm(false);
      getTransfers();
      getPlayers();
    }
    catch (error) {
      console.log(error);
      setError(error.response?.data?.message || "Failed to create transfer");
    }
  };

  const updateStatus = async (id, status) => {
    const formData = new FormData();
    formData.append("status", status);
    formData.append("user_id", currentUser?.id);

    try {
      const res = await axios.put(`${API_BASE}/api/update_transfer_status/${id}`, formData);
      alert(res.data.message);
      getTransfers();
      getPlayers();
    }
    catch (error) {
      console.log(error);
      alert(error.response?.data?.message || "Failed to update transfer");
    }
  };

  const deleteTransfer = async (id) => {
    if (!window.confirm("Delete this transfer request?")) return;

    try {
      await axios.delete(`${API_BASE}/api/delete_transfer/${id}`);
      getTransfers();
    }
    catch (error) {
      console.log(error);
    }
  };

  // --- fee payment ---------------------------------------------------------

  const openPayModal = (transfer) => {
    setPayTargetTransfer(transfer);
    setPayPhone("");
    setPayStatus("");
    setPaying(false);
    setShowPayModal(true);
  };

  const pollPaymentStatus = (checkoutId) => {
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;

      try {
        const res = await axios.get(`${API_BASE}/api/mpesa/status/${checkoutId}`);
        const status = res.data.status;

        if (status === "success") {
          clearInterval(interval);
          setPaying(false);
          setPayStatus("Payment successful — fee marked as paid.");
          getTransfers();
          setTimeout(() => setShowPayModal(false), 1500);
        }
        else if (status === "failed") {
          clearInterval(interval);
          setPaying(false);
          setPayStatus("Payment failed or was cancelled. Please try again.");
        }
        else if (attempts >= 20) { // ~60 seconds of polling
          clearInterval(interval);
          setPaying(false);
          setPayStatus("Still waiting for confirmation. Close this and check back shortly.");
        }
      }
      catch (error) {
        console.log(error);
      }
    }, 3000);
  };

  const initiateTransferPayment = async () => {
    if (!payPhone) {
      setPayStatus("Please enter a phone number");
      return;
    }

    setPaying(true);
    setPayStatus("Sending payment request to your phone...");

    try {
      const res = await axios.post(`${API_BASE}/api/mpesa/initiate_transfer`, {
        transfer_id: payTargetTransfer.id,
        phone: payPhone,
        amount: payTargetTransfer.fee
      });

      setPayStatus("Check your phone and enter your M-Pesa PIN to confirm...");
      pollPaymentStatus(res.data.checkout_request_id);
    }
    catch (error) {
      console.log(error);
      setPaying(false);
      setPayStatus(error.response?.data?.message || "Failed to start payment");
    }
  };

  // --- render ------------------------------------------------------------

  return (
    <div className="container-fluid mt-4">

      <p>{loading}</p>

      <div className="row bg-white justify-content-center mt-3">
        <div className="col-md-9 d-flex justify-content-between align-items-center">
          <h2>Player Transfers</h2>
          
          {user?.role==="admin"&&(
          <button className="btn btn-warning" onClick={() => setShowForm(true)}>+ New Transfer</button>)}
        </div>

        {transfers.map(t => (
          <div className="col-md-9 mb-3 mt-3" key={t.id}>
            <div className="border rounded p-3">

              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted">
                  {new Date(t.transfer_date).toLocaleDateString()}
                </span>
                <div className="d-flex gap-2">
                  {t.fee > 0 && (
                    <span className={`badge bg-${feeIsPaid(t) ? "success" : "secondary"}`}>
                      {feeIsPaid(t) ? "Fee Paid" : "Fee Unpaid"}
                    </span>
                  )}
                  <span className={`badge bg-${statusColor(t.status)}`}>{t.status}</span>
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-center gap-3">

                <div className="text-center" style={{ width: "200px" }}>
                  <img src={imgurl + t.from_club_logo} alt="" style={{ width: "40px", height: "40px", borderRadius: "50%" }} />
                  <p className="mb-0">{t.from_club_name}</p>
                </div>

                <div className="text-center flex-grow-1">
                  <img src={imgurl + t.player_photo} alt="" style={{ width: "50px", height: "50px", borderRadius: "50%" }} />
                  <h5 className="mb-0">{t.player_name}</h5>
                  {t.fee > 0 && <small className="text-muted">Fee: {t.fee}</small>}
                  <div>&rarr;</div>
                </div>

                <div className="text-center" style={{ width: "200px" }}>
                  <img src={imgurl + t.to_club_logo} alt="" style={{ width: "40px", height: "40px", borderRadius: "50%" }} />
                  <p className="mb-0">{t.to_club_name}</p>
                </div>

              </div>

              {/*
                Fee-before-approval flow:
                  Pending + unpaid fee   -> must Pay Fee first (Reject still allowed)
                  Pending + fee paid/none -> Approve / Reject
                  Approved               -> Mark Completed (fee is guaranteed paid
                                             by this point, enforced server-side too)
              */}
              <div className="d-flex justify-content-end gap-2 mt-3">

                {isAdmin && t.status === "Pending" && hasUnpaidFee(t) && (
                  <>
                    <button className="btn btn-sm btn-warning" onClick={() => openPayModal(t)}>
                      Pay Fee ({t.fee})
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => updateStatus(t.id, "Rejected")}>Reject</button>
                  </>
                )}

                {isAdmin && t.status === "Pending" && !hasUnpaidFee(t) && (
                  <>
                    <button className="btn btn-sm btn-success" onClick={() => updateStatus(t.id, "Approved")}>Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={() => updateStatus(t.id, "Rejected")}>Reject</button>
                  </>
                )}

                {isAdmin && t.status === "Approved" && (
                  <button className="btn btn-sm btn-primary" onClick={() => updateStatus(t.id, "Completed")}>
                    Mark Completed
                  </button>
                )}

                {isAdmin && (t.status === "Pending" || t.status === "Rejected") && (
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => deleteTransfer(t.id)}>Delete</button>
                )}

                {!isAdmin && t.status === "Pending" && hasUnpaidFee(t) && (
                  <span className="text-muted small">Awaiting transfer fee payment</span>
                )}
                {!isAdmin && t.status === "Pending" && !hasUnpaidFee(t) && (
                  <span className="text-muted small">Awaiting admin approval</span>
                )}
              </div>

            </div>
          </div>
        ))}

        {transfers.length === 0 && !loading && (
          <div className="col-md-9 text-center text-muted mt-4">No transfers yet.</div>
        )}
      </div>

      {/* ADD TRANSFER MODAL */}
      {showForm && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={addTransfer}>
                <div className="modal-header">
                  <h4>New Transfer</h4>
                  <button type="button" className="btn-close" onClick={() => setShowForm(false)}></button>
                </div>

                <div className="modal-body">

                  {error && <div className="alert alert-danger">{error}</div>}

                  <div className="mb-3">
                    <label className="form-label">Player</label>
                    <select className="form-select" name="player_id" value={form.player_id} onChange={handleChange}>
                      <option value="">Select Player</option>
                      {players.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.club_name})</option>
                      ))}
                    </select>
                  </div>

                  {selectedPlayer && (
                    <p className="text-muted">
                      Current club: <strong>{selectedPlayer.club_name}</strong>
                    </p>
                  )}

                  <div className="mb-3">
                    <label className="form-label">Destination Club</label>
                    <select className="form-select" name="to_club_id" value={form.to_club_id} onChange={handleChange}>
                      <option value="">Select Club</option>
                      {clubs.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Transfer Date</label>
                    <input type="date" name="transfer_date" value={form.transfer_date} onChange={handleChange} className="form-control" />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Fee (optional)</label>
                    <input type="number" name="fee" value={form.fee} onChange={handleChange} className="form-control" min="0" />
                    <small className="text-muted">
                      If a fee is set, it must be paid via M-Pesa before this transfer can be approved.
                    </small>
                  </div>

                  <button type="submit" className="btn btn-warning w-50 text-white">Submit Transfer</button>

                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PAY FEE MODAL */}
      {showPayModal && payTargetTransfer && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h4>Pay Transfer Fee</h4>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPayModal(false)}
                  disabled={paying}
                ></button>
              </div>

              <div className="modal-body">
                <p>
                  Transfer fee of <strong>{payTargetTransfer.fee}</strong> for{" "}
                  <strong>{payTargetTransfer.player_name}</strong> ({payTargetTransfer.from_club_name} &rarr; {payTargetTransfer.to_club_name})
                </p>

                <div className="mb-3">
                  <label className="form-label">M-Pesa Phone Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="07XXXXXXXX"
                    value={payPhone}
                    onChange={(e) => setPayPhone(e.target.value)}
                    disabled={paying}
                  />
                </div>

                {payStatus && (
                  <div className={`alert ${payStatus.includes("successful") ? "alert-success" : payStatus.includes("failed") ? "alert-danger" : "alert-info"}`}>
                    {payStatus}
                  </div>
                )}

                <button
                  className="btn btn-warning w-100"
                  onClick={initiateTransferPayment}
                  disabled={paying}
                >
                  {paying ? "Processing..." : "Send Payment Request"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Transfer;