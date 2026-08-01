import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom';

const STAT_FIELDS = [
    { key: "aces", label: "Aces" },
    { key: "serve_errors", label: "Serve Errors" },
    { key: "kills", label: "Kills" },
    { key: "attack_errors", label: "Attack Errors" },
    { key: "blocks", label: "Blocks" },
    { key: "digs", label: "Digs" },
    { key: "faults", label: "Faults" },
];

// Derives a VNL-style "Competition Statistics" breakdown (Total Points,
// Attack/Block/Serve points with efficiency %) from the raw counting
// stats returned by /api/get_season_stats. Note: there's no tracked
// block_errors field, so a true block "success %" (points / attempts)
// isn't computable — only Attack and Serve have both a made-points and
// an errors column, so only those get an efficiency percentage.
const computeCompetitionStats = (stats) => {
    if (!stats) return null;

    const matches = Number(stats.matches_played) || 0;
    const kills = Number(stats.kills) || 0;
    const attackErrors = Number(stats.attack_errors) || 0;
    const blocks = Number(stats.blocks) || 0;
    const aces = Number(stats.aces) || 0;
    const serveErrors = Number(stats.serve_errors) || 0;

    const totalPoints = kills + blocks + aces;
    const avgByMatch = matches > 0 ? totalPoints / matches : 0;

    const attackAttempts = kills + attackErrors;
    const attackEfficiency = attackAttempts > 0 ? (kills / attackAttempts) * 100 : null;
    const attackAvg = matches > 0 ? kills / matches : 0;

    const blockAvg = matches > 0 ? blocks / matches : 0;

    const serveAttempts = aces + serveErrors;
    const serveEfficiency = serveAttempts > 0 ? (aces / serveAttempts) * 100 : null;
    const serveAvg = matches > 0 ? aces / matches : 0;

    return {
        totalPoints,
        avgByMatch,
        attackPoints: kills,
        attackEfficiency,
        attackAvg,
        blockPoints: blocks,
        blockAvg,
        servePoints: aces,
        serveEfficiency,
        serveAvg,
    };
};

const fmt = (n, decimals = 2) => (n === null || n === undefined ? "—" : Number(n).toFixed(decimals));
const fmtPct = (n) => (n === null || n === undefined ? "—" : `${n.toFixed(2)}%`);

const StatBlock = ({ title, points, pointsLabel, efficiency, avg }) => (
    <div className="col-md-4 mb-3">
        <div className="border rounded p-3 h-100 text-center">
            <h5 className="text-warning mb-3">{title}</h5>
            <div className="mb-2">
                <div className="fs-3 fw-bold">{points}</div>
                <div className="text-muted small">{pointsLabel}</div>
            </div>
            {efficiency !== undefined && (
                <div className="mb-2">
                    <div className="fw-bold">{fmtPct(efficiency)}</div>
                    <div className="text-muted small">Efficiency</div>
                </div>
            )}
            <div>
                <div className="fw-bold">{fmt(avg)}</div>
                <div className="text-muted small">Avg Points</div>
            </div>
        </div>
    </div>
);

const PlayerDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const qrRef = useRef(null);

    const [qrData, setQrData] = useState("")

    const [player, setPlayer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("")

    // Career/season totals for this player, pulled from the same
    // get_season_stats endpoint the coach's stat tracker uses, then
    // filtered down to this player's row.
    const [seasonStats, setSeasonStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState("");

    const imgurl = "https://shangala.pythonanywhere.com/static/images/";

    const getPlayer = async () => {
        setLoading(true);
        setError("");
        try {
            const response = await axios.get(`https://shangala.pythonanywhere.com/api/get_players/${id}`)

            setPlayer(response.data);
            const formattedData = `
Name: ${response.data?.name}
Team: ${response.data?.club_name}
Position: ${response.data?.position}
Nationality: ${response.data?.nationality || "N/A"}
Age: ${response.data?.age}
            `.trim();
            setQrData(formattedData)
        } catch (err) {
            console.error("Error fetching player:", err);
            setError("Couldn't load this player's profile. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }

    const getSeasonStats = async () => {
        setStatsLoading(true);
        setStatsError("");
        try {
            const response = await axios.get(`https://shangala.pythonanywhere.com/api/get_season_stats`);
            const row = (response.data || []).find((r) => String(r.player_id) === String(id));
            setSeasonStats(row || null);
        } catch (err) {
            console.error("Error fetching season stats:", err);
            setStatsError("Couldn't load season stats.");
        } finally {
            setStatsLoading(false);
        }
    }

    useEffect(() => {
        getPlayer()
        getSeasonStats()
    }, [id])

    const downloadQrCode = () => {
        const canvas = qrRef.current?.querySelector("canvas");
        if (!canvas) return;
        const url = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(player?.name || "player").replace(/\s+/g, "_")}_qr.png`;
        link.click();
    }

    const copyProfileLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            alert("Profile link copied to clipboard.");
        } catch (err) {
            console.error("Couldn't copy link:", err);
        }
    }

    const competitionStats = computeCompetitionStats(seasonStats);

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading…</span>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="d-flex flex-column justify-content-center align-items-center vh-100 gap-3">
                <div className="alert alert-danger mb-0">{error}</div>
                <button className="btn btn-outline-primary" onClick={getPlayer}>Retry</button>
            </div>
        )
    }

    return (
        <div className="card shadow p-4">
            <div className="d-flex justify-content-between align-items-center mb-3 no-print">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <div className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary" onClick={copyProfileLink}>
                        Share profile
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => window.print()}>
                        Print
                    </button>
                </div>
            </div>

            <div className="row align-items-center">

                {/* Left Side - Image */}
                <div className="col-md-4 text-center">
                    <img
                        src={`${imgurl}${player?.profile_image}`}
                        alt={player?.name}
                        className="img-fluid"
                        style={{ height: "150px", width: "150px", objectFit: "cover", borderRadius: "50%" }}
                        onError={(e) => { e.target.onerror = null; e.target.src = `${imgurl}default.png`; }}
                    />
                    <h1 className="fw-bold">{player?.name}</h1>

                    <div ref={qrRef}>
                        <QRCodeCanvas value={qrData} size={200} className='p-2' />
                    </div>
                    <button className="btn btn-sm btn-outline-secondary no-print" onClick={downloadQrCode}>
                        Download QR
                    </button>
                </div>

                {/* Right Side - Details */}
                <div className="col-md-8">
                    <div>
                        <div className="d-flex">
                            <hr className='flex-grow-1' />
                            <h3 className=''>Team</h3>
                            <hr className='flex-grow-1' />
                        </div>
                        <div className="bg-secondary rounded">
                            <h3 className='text-center p-3 text-white'>{player?.club_name}</h3>
                        </div>
                    </div>

                    <div className="row mt-3">
                        <div className='d-flex'>
                            <hr className="flex-grow-1" />
                            <h4>Player Bio</h4>
                            <hr className="flex-grow-1" />
                        </div>
                        <div className="col-3">
                            <h4 className='text-warning'>Position</h4>
                            <p> {player?.position}</p>
                        </div>
                        <div className="col-3">
                            <h4 className='text-warning'>Nationality</h4>
                            <p>{player?.nationality || "—"}</p>
                        </div>
                        <div className="col-3">
                            <h4 className='text-warning'>Age</h4>
                            <p >{player?.age}</p>
                        </div>
                        <div className="col-3">
                            <h4 className='text-warning'>Height</h4>
                            <p>{player?.height ? `${player.height}cm` : "—"}</p>
                        </div>
                        {player?.jersey_number && (
                            <div className="col-3">
                                <h4 className='text-warning'>Number</h4>
                                <p>{player.jersey_number}</p>
                            </div>
                        )}
                    </div>

                    {/* Player Competition Statistics (VNL-style breakdown) */}
                    <div className="row mt-2">
                        <div className='d-flex'>
                            <hr className="flex-grow-1" />
                            <h4>Player Competition Statistics</h4>
                            <hr className="flex-grow-1" />
                        </div>

                        {statsLoading ? (
                            <p className="text-muted fst-italic">Loading stats…</p>
                        ) : statsError ? (
                            <p className="text-danger">{statsError}</p>
                        ) : !seasonStats ? (
                            <p className="text-muted fst-italic">No season stats recorded yet.</p>
                        ) : (
                            <>
                                <p className="text-muted mb-3">
                                    Matches played: <strong>{seasonStats.matches_played}</strong>
                                </p>

                                {/* Headline: Total Points + Average by Match */}
                                <div className="row mb-3">
                                    <div className="col-6">
                                        <div className="border rounded p-3 text-center bg-warning bg-opacity-10">
                                            <div className="fs-2 fw-bold">{competitionStats.totalPoints}</div>
                                            <div className="text-muted">Total Points</div>
                                        </div>
                                    </div>
                                    <div className="col-6">
                                        <div className="border rounded p-3 text-center bg-warning bg-opacity-10">
                                            <div className="fs-2 fw-bold">{fmt(competitionStats.avgByMatch)}</div>
                                            <div className="text-muted">Average by Match</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Breakdown: Attack / Block / Serve */}
                                <div className="row">
                                    <StatBlock
                                        title="Attack"
                                        points={competitionStats.attackPoints}
                                        pointsLabel="Attack Points"
                                        efficiency={competitionStats.attackEfficiency}
                                        avg={competitionStats.attackAvg}
                                    />
                                    <StatBlock
                                        title="Block"
                                        points={competitionStats.blockPoints}
                                        pointsLabel="Block Points"
                                        avg={competitionStats.blockAvg}
                                    />
                                    <StatBlock
                                        title="Serve"
                                        points={competitionStats.servePoints}
                                        pointsLabel="Serve Points"
                                        efficiency={competitionStats.serveEfficiency}
                                        avg={competitionStats.serveAvg}
                                    />
                                </div>

                                {/* Raw counting stats, kept for coaches/admins who want the underlying numbers */}
                                <div className="d-flex">
                                    <hr className="flex-grow-1" />
                                    <h5 className="text-muted">Raw Stats</h5>
                                    <hr className="flex-grow-1" />
                                </div>
                                <div className="d-flex flex-wrap gap-3">
                                    {STAT_FIELDS.map((f) => (
                                        <div key={f.key} className="text-center border rounded px-3 py-2" style={{ minWidth: 90 }}>
                                            <div className="fw-bold fs-4">{seasonStats[f.key] ?? 0}</div>
                                            <div className="text-muted small">{f.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

            </div>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    )
}

export default PlayerDetails