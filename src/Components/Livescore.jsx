import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";

const API_BASE = "http://127.0.0.1:5000/api";

// Spectator view polls instead of pushing changes, since there's nothing to
// edit here — just three independent refresh loops for the three things
// that can change while someone's watching: the match list, the lineup
// (rotation/libero/serve), and the per-set stat lines.
const MATCHES_POLL_MS = 5000;
const DETAIL_POLL_MS = 4000;

const LINEUP_SIZE = 6;

const STAT_FIELDS = [
  { key: "aces", label: "Ace" },
  { key: "serveErrors", label: "S.Err" },
  { key: "kills", label: "Kill" },
  { key: "attackErrors", label: "A.Err" },
  { key: "blocks", label: "Block" },
  { key: "digs", label: "Dig" },
  { key: "faults", label: "Fault" },
];

const emptyStatLine = () => ({
  aces: 0,
  serveErrors: 0,
  kills: 0,
  attackErrors: 0,
  blocks: 0,
  digs: 0,
  faults: 0,
});

// ---------------------------------------------------------------------------
// Read-only rotation display — same visual layout as the coach's tracker
// (back row / front row, server highlighted, libero badge) but with no
// rotate/fix-lineup controls, since a spectator can't change anything here.
// ---------------------------------------------------------------------------
function RotationCourt({ label, rotation, playersById, isServing, liberoId }) {
  const order = [3, 2, 1, 4, 5, 0];
  return (
    <div className="mb-2">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <strong>{label}</strong>
        {isServing && <span className="badge bg-warning text-dark">Serving</span>}
      </div>
      <div className="row g-1 text-center">
        {order.map((idx) => {
          const occupantId = rotation[idx];
          const player = playersById[occupantId];
          const isServer = idx === 0;
          const isLibero = liberoId && occupantId === liberoId;
          return (
            <div className="col-4" key={idx}>
              <div
                className={`border rounded p-1 small ${
                  isServer && isServing
                    ? "bg-warning-subtle border-warning"
                    : isLibero
                    ? "bg-info-subtle border-info"
                    : "bg-light"
                }`}
              >
                <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                  P{idx + 1} {isLibero && <span className="badge bg-info text-dark">L</span>}
                </div>
                <div className="text-truncate">{player?.name || "—"}</div>
                <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                  {player?.position || ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only stat table — same columns as the coach's tracker, just numbers
// instead of tap-to-increment buttons.
// ---------------------------------------------------------------------------
function PlayerStatTable({ playerIds, playersById, statsByPlayer, liberoId }) {
  if (!playerIds || playerIds.length === 0) {
    return <p className="text-muted small fst-italic">No stats recorded yet.</p>;
  }
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Player</th>
            {STAT_FIELDS.map((f) => (
              <th key={f.key} className="text-center" style={{ minWidth: 56 }}>
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {playerIds.map((id) => {
            const player = playersById[id];
            const stats = statsByPlayer[id] || emptyStatLine();
            return (
              <tr key={id}>
                <td>
                  {player?.name || "—"} {player?.position ? `(${player.position})` : ""}
                  {liberoId && id === liberoId && <span className="badge bg-info text-dark ms-1">L</span>}
                </td>
                {STAT_FIELDS.map((f) => (
                  <td key={f.key} className="text-center text-muted">
                    {stats[f.key] || 0}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const LiveScore = () => {
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [matchesError, setMatchesError] = useState("");

  const [selectedMatchId, setSelectedMatchId] = useState(null);
  // The freshest copy of the selected match, pulled straight out of `matches`
  // every time the list refreshes — no separate fetch-by-id endpoint needed.
  const [matchDetail, setMatchDetail] = useState(null);

  const [lineup, setLineup] = useState(null); // null until a lineup has been entered for this match
  const [playerStats, setPlayerStats] = useState({}); // keyed by set number, then player id
  const [detailError, setDetailError] = useState("");

  const [clubRosters, setClubRosters] = useState({});
  const clubRostersRef = useRef(clubRosters);
  clubRostersRef.current = clubRosters;

  // Keep a ref to the live current-set number so the polling callbacks
  // (which are memoized with useCallback and don't get recreated every
  // render) always know which set to file newly-fetched stats under,
  // instead of hardcoding set 1.
  const currentSetRef = useRef(1);
  useEffect(() => {
    currentSetRef.current = matchDetail?.current_set || 1;
  }, [matchDetail?.current_set]);

  // null = follow the live set; a number pins the view to a past set
  // (read-only either way, but this flags it so the "viewing" label is
  // accurate); "total" sums every set played so far.
  const [statsViewSet, setStatsViewSet] = useState(null);

  const [toast, setToast] = useState("");
  const prevSnapshotRef = useRef({});

  // ---- live matches list --------------------------------------------------
  const fetchMatches = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/get_matches`);
      setMatches((res.data || []).filter((m) => m.status === "Live"));
      setMatchesError("");
    } catch (err) {
      console.error("Error fetching live matches:", err);
      setMatchesError("Couldn't load live matches. Check your connection.");
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    const t = setInterval(fetchMatches, MATCHES_POLL_MS);
    return () => clearInterval(t);
  }, [fetchMatches]);

  // Keep matchDetail in sync with the list as it refreshes. If the match
  // drops off the live list (finished, postponed, etc.) keep the last known
  // detail on screen rather than yanking the view out from under the viewer.
  useEffect(() => {
    if (!selectedMatchId) return;
    const found = matches.find((m) => m.id === selectedMatchId);
    if (found) setMatchDetail(found);
  }, [matches, selectedMatchId]);

  // ---- lineup + stats for the selected match ------------------------------
  const fetchLineup = useCallback(async (matchId) => {
    try {
      const res = await axios.get(`${API_BASE}/get_match_lineup/${matchId}`);
      const l = res.data;
      // Only replace the lineup on a genuinely complete response. The
      // lineup endpoint returns one ongoing rotation object (not scoped
      // per set) that the coach's tracker is continuously saving —
      // rotations get rewritten on every side-out and reset at the start
      // of each new set. A poll landing mid-save, or a brief hiccup, can
      // catch a momentarily incomplete snapshot; if we null the lineup out
      // on that alone, the whole rotation/stats UI disappears for a cycle
      // even though a perfectly good lineup was showing a second ago. So:
      // update on a good read, otherwise just keep whatever we already have.
      if (l && l.home_rotation && l.away_rotation) {
        setLineup(l);
        setDetailError("");
      }
    } catch (err) {
      console.error("Error fetching lineup:", err);
    }
  }, []);

  // Same per-set shape as the coach's tracker: { "1": { playerId: {...} }, ... }.
  // Some backend responses only ever return the CURRENT set's flat stats
  // (i.e. { playerId: statLine }) rather than the full per-set history. We
  // detect that shape and merge it into the right set bucket by set number,
  // instead of overwriting the whole playerStats object every poll (which
  // was wiping out earlier sets' stats and always re-filing under set 1).
  const fetchPlayerStats = useCallback(async (matchId) => {
    try {
      const res = await axios.get(`${API_BASE}/get_player_stats/${matchId}`);
      const data = res.data || {};
      const looksPerSet =
        Object.keys(data).length > 0 &&
        Object.keys(data).every((k) => /^\d+$/.test(k) && Number(k) <= 5) &&
        Object.values(data).every((v) => v && typeof v === "object" && !("aces" in v));

      if (looksPerSet) {
        // Backend already gave us the full per-set history — trust it wholesale.
        setPlayerStats(data);
      } else {
        // Backend gave us a flat, current-set-only stat line. File it under
        // whichever set is actually live right now, and merge rather than
        // replace so earlier sets survive.
        setPlayerStats((prev) => ({ ...prev, [currentSetRef.current]: data }));
      }
    } catch (err) {
      console.error("Error fetching player stats:", err);
    }
  }, []);

  const fetchClubRoster = useCallback(async (clubId) => {
    if (clubId === undefined || clubId === null) return;
    if (clubRostersRef.current[clubId]) return; // roster lineups don't change mid-match
    try {
      const res = await axios.get(`${API_BASE}/club_players/${clubId}`);
      setClubRosters((prev) => ({ ...prev, [clubId]: res.data || [] }));
    } catch (err) {
      console.error("Error fetching club roster:", err);
    }
  }, []);

  useEffect(() => {
    if (!selectedMatchId) return;
    fetchLineup(selectedMatchId);
    fetchPlayerStats(selectedMatchId);
    const t = setInterval(() => {
      fetchLineup(selectedMatchId);
      fetchPlayerStats(selectedMatchId);
    }, DETAIL_POLL_MS);
    return () => clearInterval(t);
  }, [selectedMatchId, fetchLineup, fetchPlayerStats]);

  useEffect(() => {
    if (!matchDetail) return;
    fetchClubRoster(matchDetail.team_home_id);
    fetchClubRoster(matchDetail.team_away_id);
  }, [matchDetail, fetchClubRoster]);

  // Snap the stats view back to "follow the live set" whenever the match
  // moves on to a new set, so nobody's stranded looking at a finished set.
  useEffect(() => {
    setStatsViewSet(null);
  }, [matchDetail?.current_set, selectedMatchId]);

  // ---- toast on score / set / match changes (poll-detected) --------------
  useEffect(() => {
    if (!matchDetail) return;
    const prev = prevSnapshotRef.current[matchDetail.id];
    const currentSet = matchDetail.current_set || 1;
    const setKey = `set${currentSet}`;
    const homeScore = matchDetail[`${setKey}_home`] || 0;
    const awayScore = matchDetail[`${setKey}_away`] || 0;
    const homeSetsWon = matchDetail.home_sets_won || 0;
    const awaySetsWon = matchDetail.away_sets_won || 0;

    if (prev) {
      if (matchDetail.status === "Completed" && prev.status !== "Completed") {
        const winner = homeSetsWon > awaySetsWon ? matchDetail.home_team : matchDetail.away_team;
        setToast(`Match complete — ${winner} won!`);
      } else if (homeSetsWon > prev.homeSetsWon) {
        setToast(`${matchDetail.home_team} wins the set!`);
      } else if (awaySetsWon > prev.awaySetsWon) {
        setToast(`${matchDetail.away_team} wins the set!`);
      } else if (prev.currentSet === currentSet) {
        if (homeScore > prev.homeScore) setToast(`${matchDetail.home_team} scores!`);
        else if (awayScore > prev.awayScore) setToast(`${matchDetail.away_team} scores!`);
      }
    }

    prevSnapshotRef.current[matchDetail.id] = {
      homeScore,
      awayScore,
      currentSet,
      homeSetsWon,
      awaySetsWon,
      status: matchDetail.status,
    };
  }, [matchDetail]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSelectMatch = (match) => {
    setSelectedMatchId(match.id);
    setMatchDetail(match);
    setLineup(null);
    setPlayerStats({});
    setDetailError("");
    setStatsViewSet(null);
  };

  // Sums every set played so far into one stat line per player, for the
  // "Match Total" view.
  const totalStatsByPlayer = () => {
    const totals = {};
    Object.values(playerStats).forEach((setStats) => {
      Object.entries(setStats || {}).forEach(([playerId, line]) => {
        const existing = totals[playerId] || emptyStatLine();
        const merged = { ...existing };
        STAT_FIELDS.forEach((f) => {
          merged[f.key] = (existing[f.key] || 0) + (line[f.key] || 0);
        });
        totals[playerId] = merged;
      });
    });
    return totals;
  };

  const homeRoster = matchDetail ? clubRosters[matchDetail.team_home_id] || [] : [];
  const awayRoster = matchDetail ? clubRosters[matchDetail.team_away_id] || [] : [];
  const playersById = {};
  homeRoster.forEach((p) => (playersById[p.id] = p));
  awayRoster.forEach((p) => (playersById[p.id] = p));

  const lineupReady = !!(lineup && lineup.home_rotation && lineup.away_rotation);
  const matchComplete = matchDetail?.status === "Completed";
  const currentSet = matchDetail?.current_set || 1;
  const currentSetKey = `set${currentSet}`;
  const currentHomeScore = matchDetail ? matchDetail[`${currentSetKey}_home`] || 0 : 0;
  const currentAwayScore = matchDetail ? matchDetail[`${currentSetKey}_away`] || 0 : 0;

  const setOptions = matchDetail
    ? Array.from({ length: matchComplete ? 5 : currentSet }, (_, i) => i + 1)
    : [];
  const isTotalView = statsViewSet === "total";
  const effectiveView = statsViewSet ?? currentSet;
  const isLiveView = !isTotalView && effectiveView === currentSet;
  const viewedStats = isTotalView ? totalStatsByPlayer() : playerStats[effectiveView] || {};

  // Match Total needs whoever actually recorded a stat line this match
  // (so a subbed-out player still shows up); per-set views use whoever was
  // on court for that set, i.e. the live rotation.
  const homeStatIds = homeRoster.map((p) => p.id).filter((id) => id in viewedStats);
  const awayStatIds = awayRoster.map((p) => p.id).filter((id) => id in viewedStats);
  const homePlayerIds = isTotalView
    ? homeStatIds.length
      ? homeStatIds
      : lineup?.home_rotation || []
    : lineup?.home_rotation || [];
  const awayPlayerIds = isTotalView
    ? awayStatIds.length
      ? awayStatIds
      : lineup?.away_rotation || []
    : lineup?.away_rotation || [];

  return (
    <div className="container py-4">
      <style>{`
        @keyframes livescore-pulse {
          0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.55); }
          70% { box-shadow: 0 0 0 6px rgba(220, 53, 69, 0); }
          100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
        }
        .livescore-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #dc3545;
          margin-right: 6px;
          animation: livescore-pulse 1.8s infinite;
        }
      `}</style>

      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2 className="mb-0">🔴 Live Scores</h2>
        {!loadingMatches && (
          <span className="text-muted small">
            {matches.length} match{matches.length === 1 ? "" : "es"} live
          </span>
        )}
      </div>

      {toast && (
        <div className="alert alert-success py-2" role="status">
          {toast}
        </div>
      )}
      {matchesError && (
        <div className="alert alert-danger py-2">
          {matchesError}{" "}
          <button className="btn btn-sm btn-outline-danger ms-2" onClick={fetchMatches}>
            Retry
          </button>
        </div>
      )}
      {detailError && <div className="alert alert-warning py-2">{detailError}</div>}

      {/* Live match list */}
      <div className="list-group mb-4" style={{ maxHeight: 260, overflowY: "auto" }}>
        {loadingMatches ? (
          <div className="list-group-item text-muted">Loading live matches…</div>
        ) : matches.length === 0 ? (
          <div className="list-group-item text-muted">No live matches right now.</div>
        ) : (
          matches.map((match) => (
            <button
              key={match.id}
              className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                selectedMatchId === match.id ? "active" : ""
              }`}
              onClick={() => handleSelectMatch(match)}
            >
              <span>
                <span className="livescore-dot" />
                {match.home_team} vs {match.away_team}
              </span>
              <span className={selectedMatchId === match.id ? "" : "text-muted small"}>
                Set {match.current_set || 1} · {match.home_sets_won || 0}-{match.away_sets_won || 0}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Match detail */}
      {matchDetail && (
        <div className={`card ${matchComplete ? "border-success" : "border-danger"}`}>
          <div className={`card-header text-white ${matchComplete ? "bg-success" : "bg-danger"}`}>
            <h4 className="mb-1">
              {matchDetail.home_team} vs {matchDetail.away_team}
            </h4>
            <p className="mb-1">
              {matchComplete ? "Final" : (
                <>
                  <span className="livescore-dot" style={{ background: "#fff" }} /> Live — Set {currentSet}
                </>
              )}
            </p>
            <p className="mb-0">
              Sets — {matchDetail.home_team}: {matchDetail.home_sets_won || 0} | {matchDetail.away_team}:{" "}
              {matchDetail.away_sets_won || 0}
            </p>
          </div>
          <div className="card-body">
            {matchComplete ? (
              <div className="text-center py-3">
                <h5>
                  🏆{" "}
                  {(matchDetail.home_sets_won || 0) > (matchDetail.away_sets_won || 0)
                    ? matchDetail.home_team
                    : matchDetail.away_team}{" "}
                  wins the match!
                </h5>
              </div>
            ) : (
              <>
                {/* Current set score, spectator view — numbers only */}
                <div className="row mb-3">
                  <div className="col-6 text-center">
                    <h5>{matchDetail.home_team}</h5>
                    <p className="display-4 mb-0">{currentHomeScore}</p>
                  </div>
                  <div className="col-6 text-center">
                    <h5>{matchDetail.away_team}</h5>
                    <p className="display-4 mb-0">{currentAwayScore}</p>
                  </div>
                </div>

                {/* Rotation courts, if the coach has entered a lineup */}
                {lineupReady ? (
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <RotationCourt
                        label={matchDetail.home_team}
                        rotation={lineup.home_rotation}
                        playersById={playersById}
                        isServing={lineup.serve_team === "home"}
                        liberoId={lineup.home_libero_id}
                      />
                    </div>
                    <div className="col-md-6">
                      <RotationCourt
                        label={matchDetail.away_team}
                        rotation={lineup.away_rotation}
                        playersById={playersById}
                        isServing={lineup.serve_team === "away"}
                        liberoId={lineup.away_libero_id}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-muted fst-italic">Lineup not tracked for this match yet.</p>
                )}

                {/* Stats */}
                {lineupReady && (
                  <div className="mb-2">
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-2 small">
                      <span className="text-muted">Viewing stats for:</span>
                      <div className="btn-group">
                        {setOptions.map((n) => (
                          <button
                            key={n}
                            className={`btn btn-sm ${
                              !isTotalView && effectiveView === n ? "btn-primary" : "btn-outline-primary"
                            }`}
                            onClick={() => setStatsViewSet(n === currentSet ? null : n)}
                          >
                            Set {n}
                          </button>
                        ))}
                        <button
                          className={`btn btn-sm ${isTotalView ? "btn-primary" : "btn-outline-primary"}`}
                          onClick={() => setStatsViewSet("total")}
                        >
                          Match Total
                        </button>
                      </div>
                      {isLiveView && <span className="text-muted fst-italic">updates live</span>}
                    </div>
                    <div className="row mb-2">
                      <div className="col-md-6">
                        <h6>{matchDetail.home_team} — player stats</h6>
                        <PlayerStatTable
                          playerIds={homePlayerIds}
                          playersById={playersById}
                          statsByPlayer={viewedStats}
                          liberoId={lineup.home_libero_id}
                        />
                      </div>
                      <div className="col-md-6">
                        <h6>{matchDetail.away_team} — player stats</h6>
                        <PlayerStatTable
                          playerIds={awayPlayerIds}
                          playersById={playersById}
                          statsByPlayer={viewedStats}
                          liberoId={lineup.away_libero_id}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Set-by-set history */}
            <table className="table table-sm table-bordered text-center mt-3 mb-0">
              <thead>
                <tr>
                  <th>Team</th>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <th key={n}>Set {n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-start">{matchDetail.home_team}</td>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <td key={n}>
                      {n <= currentSet || matchComplete ? matchDetail[`set${n}_home`] || 0 : "-"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="text-start">{matchDetail.away_team}</td>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <td key={n}>
                      {n <= currentSet || matchComplete ? matchDetail[`set${n}_away`] || 0 : "-"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveScore;