import React, { useEffect, useReducer, useRef, useState } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";

const API_BASE = "https://shangala.pythonanywhere.com/api";

const POINTS_TO_WIN = 25;
const DECIDER_POINTS_TO_WIN = 15;
const SETS_TO_WIN_MATCH = 3;
const LINEUP_SIZE = 6;
const MAX_SUBS_PER_SET = 6;
const TIMEOUTS_PER_SET = 2;

const STAT_FIELDS = [
  { key: "aces", label: "Ace" },
  { key: "serveErrors", label: "S.Err" },
  { key: "kills", label: "Kill" },
  { key: "attackErrors", label: "A.Err" },
  { key: "assists", label: "Ast" },
  { key: "blocks", label: "Block" },
  { key: "digs", label: "Dig" },
  { key: "receptionAttempts", label: "Rec" },
  { key: "receptionErrors", label: "R.Err" },
  { key: "faults", label: "Fault" },
];

const emptyStatLine = () => ({
  aces: 0,
  serveErrors: 0,
  kills: 0,
  attackErrors: 0,
  assists: 0,
  blocks: 0,
  digs: 0,
  receptionAttempts: 0,
  receptionErrors: 0,
  faults: 0,
});

const emptySet = () => ({ home: 0, away: 0 });

// Rotation array positions: index 0 = P1 (server, back-right) ... index 5 = P6
// (back-middle). Back row = indices 0, 4, 5 (P1, P5, P6). Front row = 1, 2, 3
// (P2, P3, P4).
//
// The libero is tied to a ROLE (the middle blocker), not a rotation slot.
// Real volleyball: the libero swaps in for the middle blocker specifically,
// whichever back-row slot that player currently occupies, and swaps back out
// the moment that player's slot would rotate to the front row. We identify
// "the middle blocker" by the roster's `position` field rather than by a
// fixed index, so the libero always follows the correct player around the
// back row instead of covering whoever happens to be standing in a given slot.
const BACK_ROW_INDICES = [0, 4, 5];
const BACK_ROW_NON_SERVER_INDICES = [4, 5];
const FRONT_ROW_INDICES = [1, 2, 3];

function isMiddleBlocker(player) {
  if (!player || !player.position) return false;
  const pos = String(player.position).trim().toLowerCase();
  return pos === "mb" || pos === "middle" || pos === "middle blocker" || pos.includes("middle blocker");
}

function applyLiberoForTeam(rotation, liberoId, active, replacedId, playersById, isServingTeam) {
  if (!liberoId || !rotation) return { rotation, active: false, replacedId: null };

  let nextRotation = [...rotation];
  let nextActive = active;
  let nextReplacedId = replacedId;

  if (nextActive) {
    const liberoIdx = nextRotation.indexOf(liberoId);
    if (liberoIdx !== -1 && FRONT_ROW_INDICES.includes(liberoIdx)) {
      nextRotation[liberoIdx] = nextReplacedId;
      nextActive = false;
      nextReplacedId = null;
    }
  }

  if (!nextActive) {
    const eligibleIndices = isServingTeam ? BACK_ROW_NON_SERVER_INDICES : BACK_ROW_INDICES;
    for (const idx of eligibleIndices) {
      const occupantId = nextRotation[idx];
      if (occupantId === liberoId) continue;
      if (isMiddleBlocker(playersById?.[occupantId])) {
        nextRotation[idx] = liberoId;
        nextActive = true;
        nextReplacedId = occupantId;
        break;
      }
    }
  }

  return { rotation: nextRotation, active: nextActive, replacedId: nextReplacedId };
}

function withLiberoRules(state, playersById) {
  const home = applyLiberoForTeam(
    state.homeRotation,
    state.homeLiberoId,
    state.homeLiberoActive,
    state.homeLiberoReplacedId,
    playersById,
    state.serveTeam === "home"
  );
  const away = applyLiberoForTeam(
    state.awayRotation,
    state.awayLiberoId,
    state.awayLiberoActive,
    state.awayLiberoReplacedId,
    playersById,
    state.serveTeam === "away"
  );
  return {
    ...state,
    homeRotation: state.homeRotation ? home.rotation : state.homeRotation,
    awayRotation: state.awayRotation ? away.rotation : state.awayRotation,
    homeLiberoActive: home.active,
    awayLiberoActive: away.active,
    homeLiberoReplacedId: home.replacedId,
    awayLiberoReplacedId: away.replacedId,
  };
}

const initialMatchState = {
  scores: {
    set1: emptySet(),
    set2: emptySet(),
    set3: emptySet(),
    set4: emptySet(),
    set5: emptySet(),
  },
  currentSet: 1,
  homeSetsWon: 0,
  awaySetsWon: 0,
  status: "",
  homeRotation: null,
  awayRotation: null,
  homeInitialRotation: null,
  awayInitialRotation: null,
  homeRosterIds: [],
  awayRosterIds: [],
  homeBench: [],
  awayBench: [],
  serveTeam: null,
  awaitingServeChoice: false,
  homeSubsUsed: 0,
  awaySubsUsed: 0,
  lineupSkipped: false,
  homeTimeoutsUsed: 0,
  awayTimeoutsUsed: 0,
  homeLiberoId: null,
  awayLiberoId: null,
  homeLiberoActive: false,
  awayLiberoActive: false,
  homeLiberoReplacedId: null,
  awayLiberoReplacedId: null,
  jerseyNumbers: {},
};

function matchReducer(state, action) {
  switch (action.type) {
    case "LOAD_MATCH": {
      const m = action.match;
      return {
        ...initialMatchState,
        scores: {
          set1: { home: m.set1_home || 0, away: m.set1_away || 0 },
          set2: { home: m.set2_home || 0, away: m.set2_away || 0 },
          set3: { home: m.set3_home || 0, away: m.set3_away || 0 },
          set4: { home: m.set4_home || 0, away: m.set4_away || 0 },
          set5: { home: m.set5_home || 0, away: m.set5_away || 0 },
        },
        currentSet: m.current_set || 1,
        homeSetsWon: m.home_sets_won || 0,
        awaySetsWon: m.away_sets_won || 0,
        status: m.status,
      };
    }

    case "LOAD_LINEUP": {
      const l = action.lineup;
      if (!l || !l.home_rotation || !l.away_rotation) {
        return state;
      }
      let jerseyNumbers = {};
      if (l.jersey_numbers) {
        try {
          jerseyNumbers = typeof l.jersey_numbers === "string" ? JSON.parse(l.jersey_numbers) : l.jersey_numbers;
        } catch (e) {
          jerseyNumbers = {};
        }
      }
      return {
        ...state,
        homeRotation: l.home_rotation,
        awayRotation: l.away_rotation,
        homeInitialRotation: l.home_initial_rotation || l.home_rotation,
        awayInitialRotation: l.away_initial_rotation || l.away_rotation,
        homeRosterIds: l.home_roster_ids || l.home_rotation,
        awayRosterIds: l.away_roster_ids || l.away_rotation,
        homeBench: l.home_bench || [],
        awayBench: l.away_bench || [],
        serveTeam: l.serve_team || null,
        awaitingServeChoice: !!l.awaiting_serve_choice,
        homeSubsUsed: l.home_subs_used || 0,
        awaySubsUsed: l.away_subs_used || 0,
        homeTimeoutsUsed: l.home_timeouts_used || 0,
        awayTimeoutsUsed: l.away_timeouts_used || 0,
        lineupSkipped: false,
        homeLiberoId: l.home_libero_id || null,
        awayLiberoId: l.away_libero_id || null,
        homeLiberoActive: !!l.home_libero_active,
        awayLiberoActive: !!l.away_libero_active,
        homeLiberoReplacedId: l.home_libero_replaced_id || null,
        awayLiberoReplacedId: l.away_libero_replaced_id || null,
        jerseyNumbers,
      };
    }

    case "SET_STARTING_LINEUP": {
      const {
        homeRotation, awayRotation, homeBench, awayBench, homeRosterIds, awayRosterIds, serveTeam,
        homeLiberoId, awayLiberoId, playersById, jerseyNumbers,
      } = action;
      return withLiberoRules({
        ...state,
        homeRotation,
        awayRotation,
        homeInitialRotation: homeRotation,
        awayInitialRotation: awayRotation,
        homeRosterIds,
        awayRosterIds,
        homeBench,
        awayBench,
        serveTeam,
        awaitingServeChoice: false,
        homeSubsUsed: 0,
        awaySubsUsed: 0,
        homeTimeoutsUsed: 0,
        awayTimeoutsUsed: 0,
        lineupSkipped: false,
        homeLiberoId: homeLiberoId || null,
        awayLiberoId: awayLiberoId || null,
        homeLiberoActive: false,
        awayLiberoActive: false,
        homeLiberoReplacedId: null,
        awayLiberoReplacedId: null,
        jerseyNumbers: jerseyNumbers || state.jerseyNumbers,
      }, playersById);
    }

    case "SKIP_LINEUP":
      return { ...state, lineupSkipped: true };

    case "CHOOSE_SET_SERVER":
      return { ...state, serveTeam: action.team, awaitingServeChoice: false };

    case "SET_JERSEY_NUMBER": {
      const { playerId, number } = action;
      const nextJerseyNumbers = { ...state.jerseyNumbers };
      if (number === "" || number === null || number === undefined) {
        delete nextJerseyNumbers[playerId];
      } else {
        nextJerseyNumbers[playerId] = number;
      }
      return { ...state, jerseyNumbers: nextJerseyNumbers };
    }

    case "SET_LIBERO": {
      const { team, playerId, playersById } = action;
      const liberoKey = team === "home" ? "homeLiberoId" : "awayLiberoId";
      const activeKey = team === "home" ? "homeLiberoActive" : "awayLiberoActive";
      const replacedKey = team === "home" ? "homeLiberoReplacedId" : "awayLiberoReplacedId";
      return withLiberoRules({
        ...state,
        [liberoKey]: playerId,
        [activeKey]: false,
        [replacedKey]: null,
      }, playersById);
    }

    case "SET_NEW_SET_LINEUP": {
      const { homeRotation, awayRotation, homeBench, awayBench, homeLiberoId, awayLiberoId, playersById } = action;
      return withLiberoRules({
        ...state,
        homeRotation,
        awayRotation,
        homeInitialRotation: homeRotation,
        awayInitialRotation: awayRotation,
        homeBench,
        awayBench,
        homeSubsUsed: 0,
        awaySubsUsed: 0,
        homeLiberoId: homeLiberoId !== undefined ? homeLiberoId : state.homeLiberoId,
        awayLiberoId: awayLiberoId !== undefined ? awayLiberoId : state.awayLiberoId,
        homeLiberoActive: false,
        awayLiberoActive: false,
        homeLiberoReplacedId: null,
        awayLiberoReplacedId: null,
      }, playersById);
    }

    case "MANUAL_ROTATE": {
      const { team, playersById } = action;
      const rotationKey = team === "home" ? "homeRotation" : "awayRotation";
      if (!state[rotationKey]) return state;
      const rotate = (arr) => [...arr.slice(1), arr[0]];
      return withLiberoRules({ ...state, [rotationKey]: rotate(state[rotationKey]) }, playersById);
    }

    case "CORRECT_LINEUP": {
      const { team, rotation, bench, liberoId, playersById } = action;
      const rotationKey = team === "home" ? "homeRotation" : "awayRotation";
      const benchKey = team === "home" ? "homeBench" : "awayBench";
      const liberoKey = team === "home" ? "homeLiberoId" : "awayLiberoId";
      const activeKey = team === "home" ? "homeLiberoActive" : "awayLiberoActive";
      const replacedKey = team === "home" ? "homeLiberoReplacedId" : "awayLiberoReplacedId";
      return withLiberoRules({
        ...state,
        [rotationKey]: rotation,
        [benchKey]: bench,
        [liberoKey]: liberoId !== undefined ? liberoId : state[liberoKey],
        [activeKey]: false,
        [replacedKey]: null,
      }, playersById);
    }

    case "SUBSTITUTE": {
      const { team, courtPlayerId, benchPlayerId, playersById } = action;
      const rotationKey = team === "home" ? "homeRotation" : "awayRotation";
      const benchKey = team === "home" ? "homeBench" : "awayBench";
      const subsKey = team === "home" ? "homeSubsUsed" : "awaySubsUsed";
      const rotation = state[rotationKey].map((id) => (id === courtPlayerId ? benchPlayerId : id));
      const bench = state[benchKey].filter((id) => id !== benchPlayerId).concat(courtPlayerId);
      return withLiberoRules({ ...state, [rotationKey]: rotation, [benchKey]: bench, [subsKey]: state[subsKey] + 1 }, playersById);
    }

    case "CALL_TIMEOUT": {
      const { team } = action;
      const usedKey = team === "home" ? "homeTimeoutsUsed" : "awayTimeoutsUsed";
      if (state[usedKey] >= TIMEOUTS_PER_SET) return state;
      return { ...state, [usedKey]: state[usedKey] + 1 };
    }

    case "ADD_POINT": {
      if (state.status === "Completed") return state;
      if (state.awaitingServeChoice && action.delta > 0) return state;

      const { team, delta, playersById } = action;
      const setKey = `set${state.currentSet}`;
      const nextSetScore = {
        ...state.scores[setKey],
        [team]: Math.max(state.scores[setKey][team] + delta, 0),
      };
      const scores = { ...state.scores, [setKey]: nextSetScore };

      const target = state.currentSet === 5 ? DECIDER_POINTS_TO_WIN : POINTS_TO_WIN;
      const { home, away } = nextSetScore;

      const homeWinsSet = home >= target && home - away >= 2;
      const awayWinsSet = away >= target && away - home >= 2;
      const hasLineup = !!state.homeRotation && !!state.awayRotation;

      if (!homeWinsSet && !awayWinsSet) {
        let serveTeam = state.serveTeam;
        let homeRotation = state.homeRotation;
        let awayRotation = state.awayRotation;
        if (hasLineup && delta > 0 && serveTeam && team !== serveTeam) {
          const rotate = (arr) => [...arr.slice(1), arr[0]];
          if (team === "home") homeRotation = rotate(homeRotation);
          else awayRotation = rotate(awayRotation);
          serveTeam = team;
        }
        return withLiberoRules({ ...state, scores, serveTeam, homeRotation, awayRotation }, playersById);
      }

      const homeSetsWon = state.homeSetsWon + (homeWinsSet ? 1 : 0);
      const awaySetsWon = state.awaySetsWon + (awayWinsSet ? 1 : 0);
      const matchOver = homeSetsWon === SETS_TO_WIN_MATCH || awaySetsWon === SETS_TO_WIN_MATCH;

      return withLiberoRules({
        ...state,
        scores,
        homeSetsWon,
        awaySetsWon,
        currentSet: matchOver ? state.currentSet : state.currentSet + 1,
        status: matchOver ? "Completed" : state.status,
        lastSetWinner: homeWinsSet ? "home" : "away",
        homeRotation: hasLineup ? [...state.homeInitialRotation] : null,
        awayRotation: hasLineup ? [...state.awayInitialRotation] : null,
        homeBench: hasLineup ? state.homeRosterIds.filter((id) => !state.homeInitialRotation.includes(id)) : state.homeBench,
        awayBench: hasLineup ? state.awayRosterIds.filter((id) => !state.awayInitialRotation.includes(id)) : state.awayBench,
        homeSubsUsed: 0,
        awaySubsUsed: 0,
        homeTimeoutsUsed: 0,
        awayTimeoutsUsed: 0,
        serveTeam: matchOver ? state.serveTeam : null,
        awaitingServeChoice: !matchOver && hasLineup,
        homeLiberoActive: false,
        awayLiberoActive: false,
        homeLiberoReplacedId: null,
        awayLiberoReplacedId: null,
      }, playersById);
    }

    default:
      return state;
  }
}

function JerseyNumberInput({ playerId, value, onChange }) {
  const [local, setLocal] = useState(value !== undefined && value !== null ? String(value) : "");

  useEffect(() => {
    setLocal(value !== undefined && value !== null ? String(value) : "");
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      className="form-control form-control-sm"
      style={{ width: 56 }}
      placeholder="#"
      maxLength={3}
      value={local}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
        setLocal(v);
      }}
      onBlur={() => onChange(playerId, local)}
    />
  );
}

function LineupSetup({ homeTeam, awayTeam, homeRoster, awayRoster, onStart }) {
  const blank = () => Array(LINEUP_SIZE).fill("");
  const [homeSel, setHomeSel] = useState(blank());
  const [awaySel, setAwaySel] = useState(blank());
  const [server, setServer] = useState("home");
  const [homeLibero, setHomeLibero] = useState("");
  const [awayLibero, setAwayLibero] = useState("");
  const [jerseyNumbers, setJerseyNumbers] = useState({});

  const setSlot = (which, idx, value) => {
    const setter = which === "home" ? setHomeSel : setAwaySel;
    const current = which === "home" ? homeSel : awaySel;
    const next = [...current];
    next[idx] = value === "" ? "" : Number(value);
    setter(next);
  };

  const setJersey = (playerId, number) => {
    setJerseyNumbers((prev) => {
      const next = { ...prev };
      if (number === "") delete next[playerId];
      else next[playerId] = number;
      return next;
    });
  };

  const homeComplete = homeSel.every((v) => v) && new Set(homeSel).size === LINEUP_SIZE;
  const awayComplete = awaySel.every((v) => v) && new Set(awaySel).size === LINEUP_SIZE;
  const canStart = homeComplete && awayComplete;

  const hasMiddleBlocker = (roster) => roster.some((p) => isMiddleBlocker(p));

  const renderTeamPicker = (label, roster, sel, which) => (
    <div className="col-md-6">
      <h6>{label} — starting six (Position 1 serves first if this team serves)</h6>
      {Array.from({ length: LINEUP_SIZE }).map((_, idx) => {
        const currentLiberoId = which === "home" ? homeLibero : awayLibero;
        return (
          <div className="input-group input-group-sm mb-2" key={idx}>
            <span className="input-group-text" style={{ width: 90 }}>
              Position {idx + 1}
            </span>
            <select
              className="form-select"
              value={sel[idx]}
              onChange={(e) => setSlot(which, idx, e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— select —</option>
              {roster.map((p) => {
                const isLiberoPlayer = currentLiberoId !== "" && Number(currentLiberoId) === p.id;
                return (
                  <option key={p.id} value={p.id} disabled={(sel.includes(p.id) && sel[idx] !== p.id) || isLiberoPlayer}>
                    {p.name} {p.position ? `(${p.position})` : ""}{isLiberoPlayer ? " — Libero" : ""}
                  </option>
                );
              })}
            </select>
            {sel[idx] !== "" && (
              <JerseyNumberInput playerId={sel[idx]} value={jerseyNumbers[sel[idx]]} onChange={setJersey} />
            )}
          </div>
        );
      })}
      <div className="input-group input-group-sm mt-2">
        <span className="input-group-text" style={{ width: 90 }}>
          Libero
        </span>
        <select
          className="form-select"
          value={which === "home" ? homeLibero : awayLibero}
          onChange={(e) => (which === "home" ? setHomeLibero(e.target.value) : setAwayLibero(e.target.value))}
        >
          <option value="">— none —</option>
          {roster
            .filter((p) => !sel.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.position ? `(${p.position})` : ""}
              </option>
            ))}
        </select>
        {(which === "home" ? homeLibero : awayLibero) !== "" && (
          <JerseyNumberInput
            playerId={Number(which === "home" ? homeLibero : awayLibero)}
            value={jerseyNumbers[Number(which === "home" ? homeLibero : awayLibero)]}
            onChange={setJersey}
          />
        )}
      </div>
      {!hasMiddleBlocker(roster) && (
        <p className="text-muted small mt-1 mb-0">
          No player on this roster is tagged as a middle blocker (position "MB"/"Middle"), so a libero set here won't
          auto-swap in for this team until a player's position is set.
        </p>
      )}
    </div>
  );

  return (
    <div className="container-fluid card mb-3 border-primary">
      <div className="card-header bg-primary text-white">Set Starting Lineup</div>
      <div className="card-body">
        <div className="row">
          {renderTeamPicker(homeTeam, homeRoster, homeSel, "home")}
          {renderTeamPicker(awayTeam, awayRoster, awaySel, "away")}
        </div>
        <p className="text-muted small mt-2 mb-0">
          A libero is optional. If set, they'll automatically swap in for the middle blocker whenever that player
          rotates into a back-row slot that isn't a serving slot for this team — including the service-point slot
          when the opponent is serving, since this team isn't serving in that case. If this team is serving and the
          middle blocker rotates into the actual serving slot, they serve that rotation out before the libero can
          take over.
        </p>
        <p className="text-muted small mt-2 mb-0">
          Jersey numbers are optional and apply to this match only — enter them next to each selected player.
        </p>
        <div className="mt-3">
          <label className="form-label d-block">Who serves first?</label>
          <div className="btn-group">
            <button
              className={`btn btn-sm ${server === "home" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setServer("home")}
            >
              {homeTeam}
            </button>
            <button
              className={`btn btn-sm ${server === "away" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setServer("away")}
            >
              {awayTeam}
            </button>
          </div>
        </div>
        <button
          className="btn btn-success mt-3"
          disabled={!canStart}
          onClick={() =>
            onStart({
              homeRotation: homeSel,
              awayRotation: awaySel,
              homeRosterIds: homeRoster.map((p) => p.id),
              awayRosterIds: awayRoster.map((p) => p.id),
              homeBench: homeRoster.map((p) => p.id).filter((id) => !homeSel.includes(id)),
              awayBench: awayRoster.map((p) => p.id).filter((id) => !awaySel.includes(id)),
              serveTeam: server,
              homeLiberoId: homeLibero ? Number(homeLibero) : null,
              awayLiberoId: awayLibero ? Number(awayLibero) : null,
              jerseyNumbers,
            })
          }
        >
          Start Match
        </button>
      </div>
    </div>
  );
}

function NewSetLineupEditor({
  homeTeam, awayTeam, homeRoster, awayRoster,
  homeRotation, awayRotation, homeLiberoId, awayLiberoId,
  onApply, onCancel,
}) {
  const [homeSel, setHomeSel] = useState([...homeRotation]);
  const [awaySel, setAwaySel] = useState([...awayRotation]);
  const [homeLibero, setHomeLibero] = useState(homeLiberoId ? String(homeLiberoId) : "");
  const [awayLibero, setAwayLibero] = useState(awayLiberoId ? String(awayLiberoId) : "");

  const setSlot = (which, idx, value) => {
    const setter = which === "home" ? setHomeSel : setAwaySel;
    const current = which === "home" ? homeSel : awaySel;
    const next = [...current];
    next[idx] = value === "" ? "" : Number(value);
    setter(next);
  };

  const homeComplete = homeSel.every((v) => v) && new Set(homeSel).size === LINEUP_SIZE;
  const awayComplete = awaySel.every((v) => v) && new Set(awaySel).size === LINEUP_SIZE;
  const canApply = homeComplete && awayComplete;

  const renderTeamPicker = (label, roster, sel, which) => (
    <div className="col-md-6">
      <h6>{label} — starting six for this set</h6>
      {Array.from({ length: LINEUP_SIZE }).map((_, idx) => {
        const currentLiberoId = which === "home" ? homeLibero : awayLibero;
        return (
          <div className="input-group input-group-sm mb-2" key={idx}>
            <span className="input-group-text" style={{ width: 90 }}>
              Position {idx + 1}
            </span>
            <select
              className="form-select"
              value={sel[idx]}
              onChange={(e) => setSlot(which, idx, e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— select —</option>
              {roster.map((p) => {
                const isLiberoPlayer = currentLiberoId !== "" && Number(currentLiberoId) === p.id;
                return (
                  <option key={p.id} value={p.id} disabled={(sel.includes(p.id) && sel[idx] !== p.id) || isLiberoPlayer}>
                    {p.name} {p.position ? `(${p.position})` : ""}{isLiberoPlayer ? " — Libero" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        );
      })}
      <div className="input-group input-group-sm mt-2">
        <span className="input-group-text" style={{ width: 90 }}>
          Libero
        </span>
        <select
          className="form-select"
          value={which === "home" ? homeLibero : awayLibero}
          onChange={(e) => (which === "home" ? setHomeLibero(e.target.value) : setAwayLibero(e.target.value))}
        >
          <option value="">— none —</option>
          {roster
            .filter((p) => !sel.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.position ? `(${p.position})` : ""}
              </option>
            ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="card mb-3 border-secondary">
      <div className="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
        <span>Edit Starting Lineup For This Set</span>
        <button className="btn btn-sm btn-light" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="card-body">
        <div className="row">
          {renderTeamPicker(homeTeam, homeRoster, homeSel, "home")}
          {renderTeamPicker(awayTeam, awayRoster, awaySel, "away")}
        </div>
        <p className="text-muted small mt-2 mb-0">
          This replaces who's on court for the set about to start (subs used resets to 0). Who serves first is still
          chosen separately above.
        </p>
        <button
          className="btn btn-success mt-3"
          disabled={!canApply}
          onClick={() =>
            onApply({
              homeRotation: homeSel,
              awayRotation: awaySel,
              homeBench: homeRoster.map((p) => p.id).filter((id) => !homeSel.includes(id)),
              awayBench: awayRoster.map((p) => p.id).filter((id) => !awaySel.includes(id)),
              homeLiberoId: homeLibero ? Number(homeLibero) : null,
              awayLiberoId: awayLibero ? Number(awayLibero) : null,
            })
          }
        >
          Apply Lineup For This Set
        </button>
      </div>
    </div>
  );
}

function LineupCorrectionEditor({ label, roster, rotation, liberoId, onApply, onCancel }) {
  const [sel, setSel] = useState([...rotation]);
  const [libero, setLibero] = useState(liberoId ? String(liberoId) : "");

  const setSlot = (idx, value) => {
    const next = [...sel];
    next[idx] = value === "" ? "" : Number(value);
    setSel(next);
  };

  const complete = sel.every((v) => v) && new Set(sel).size === LINEUP_SIZE;

  return (
    <div className="border rounded p-2 mt-2 mb-2 small bg-light-subtle">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <strong>Fix {label} lineup</strong>
        <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="text-muted mb-2">
        Overwrites who's currently on court for this team only. Substitutions used and the set's starting six stay
        as they were — use this just to correct a tracking mistake.
      </p>
      {Array.from({ length: LINEUP_SIZE }).map((_, idx) => (
        <div className="input-group input-group-sm mb-2" key={idx}>
          <span className="input-group-text" style={{ width: 90 }}>
            Position {idx + 1}
          </span>
          <select className="form-select" value={sel[idx]} onChange={(e) => setSlot(idx, e.target.value ? Number(e.target.value) : "")}>
            <option value="">— select —</option>
            {roster.map((p) => {
              const isLiberoPlayer = libero !== "" && Number(libero) === p.id;
              return (
                <option key={p.id} value={p.id} disabled={(sel.includes(p.id) && sel[idx] !== p.id) || isLiberoPlayer}>
                  {p.name} {p.position ? `(${p.position})` : ""}{isLiberoPlayer ? " — Libero" : ""}
                </option>
              );
            })}
          </select>
        </div>
      ))}
      <div className="input-group input-group-sm mb-2">
        <span className="input-group-text" style={{ width: 90 }}>
          Libero
        </span>
        <select className="form-select" value={libero} onChange={(e) => setLibero(e.target.value)}>
          <option value="">— none —</option>
          {roster
            .filter((p) => !sel.includes(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.position ? `(${p.position})` : ""}
              </option>
            ))}
        </select>
      </div>
      <button
        className="btn btn-sm btn-warning"
        disabled={!complete}
        onClick={() =>
          onApply({
            rotation: sel,
            liberoId: libero ? Number(libero) : null,
          })
        }
      >
        Apply Fix
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rotation court — 3-across / 3-across grid (front row on top, back row on
// bottom), matching the spectator LiveScore view. Controls are compact: a
// small icon-only rotate button and a "Fix sides" button per team, so the
// header doesn't take extra vertical space.
// ---------------------------------------------------------------------------
function RotationCourt({ label, rotation, playersById, isServing, liberoId, jerseyNumbers, onManualRotate, onFixLineup }) {
  const order = [3, 2, 1, 4, 5, 0];
  return (
    <div className="mb-1">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <strong>{label}</strong>
        <div className="d-flex align-items-center gap-1">
          {isServing && <span className="badge bg-warning text-dark">Serving</span>}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary py-0 px-1"
            title="Manually rotate this team one slot forward"
            onClick={onManualRotate}
          >
            ↻
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-warning py-0 px-1"
            title="Fix this team's lineup after a tracking error"
            onClick={onFixLineup}
          >
            Fix sides
          </button>
        </div>
      </div>
      <div className="row g-1 text-center">
        {order.map((idx) => {
          const occupantId = rotation[idx];
          const player = playersById[occupantId];
          const isServer = idx === 0;
          const isLibero = liberoId && occupantId === liberoId;
          const jerseyNum = jerseyNumbers ? jerseyNumbers[occupantId] : null;
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
                <div className="text-truncate">
                  {jerseyNum ? <span className="badge bg-secondary me-1">#{jerseyNum}</span> : null}
                  {player?.name || "—"}
                </div>
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

function LiberoControl({ roster, currentLiberoId, playersById, onSetLibero }) {
  const [selected, setSelected] = useState("");
  const current = playersById[currentLiberoId];
  const rosterHasMB = roster.some((p) => isMiddleBlocker(p));

  return (
    <div className="mb-2 small">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="text-muted">Libero:</span>
        {current ? (
          <span className="badge bg-info text-dark">{current.name}</span>
        ) : (
          <span className="text-muted fst-italic">none set</span>
        )}
        <select className="form-select form-select-sm w-auto" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">— change —</option>
          {roster.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sm btn-outline-secondary"
          disabled={!selected}
          onClick={() => {
            onSetLibero(Number(selected));
            setSelected("");
          }}
        >
          Set
        </button>
      </div>
      {current && !rosterHasMB && (
        <p className="text-muted fst-italic mt-1 mb-0">
          No middle blocker identified on this roster, so this libero won't auto-swap in until a player is tagged MB.
        </p>
      )}
    </div>
  );
}

function JerseyNumberPanel({ label, roster, jerseyNumbers, onChangeJersey }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Edit"} jersey numbers
      </button>
      {open && (
        <div className="border rounded p-2 mt-2 small">
          <p className="text-muted mb-2">Jersey numbers here apply to this match only.</p>
          <div className="d-flex flex-wrap gap-2">
            {roster.map((p) => (
              <div key={p.id} className="d-flex align-items-center gap-1">
                <span className="text-truncate" style={{ maxWidth: 110 }}>
                  {p.name}
                </span>
                <JerseyNumberInput
                  playerId={p.id}
                  value={jerseyNumbers[p.id]}
                  onChange={onChangeJersey}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubstitutionPanel({ label, rotation, bench, playersById, subsUsed, onSubstitute }) {
  const [open, setOpen] = useState(false);
  const [courtId, setCourtId] = useState("");
  const [benchId, setBenchId] = useState("");
  const remaining = MAX_SUBS_PER_SET - subsUsed;

  const confirm = () => {
    if (!courtId || !benchId) return;
    onSubstitute(Number(courtId), Number(benchId));
    setCourtId("");
    setBenchId("");
    setOpen(false);
  };

  return (
    <div className="mb-2">
      <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(!open)} disabled={remaining <= 0 || bench.length === 0}>
        Substitute ({remaining} left this set)
      </button>
      {open && (
        <div className="border rounded p-2 mt-2 small">
          <div className="mb-2">
            <label className="form-label mb-1">{label} player coming off</label>
            <select className="form-select form-select-sm" value={courtId} onChange={(e) => setCourtId(e.target.value)}>
              <option value="">— select —</option>
              {rotation.map((id) => (
                <option key={id} value={id}>
                  {playersById[id]?.name || "—"} {playersById[id]?.position ? `(${playersById[id].position})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-2">
            <label className="form-label mb-1">Player coming in</label>
            <select className="form-select form-select-sm" value={benchId} onChange={(e) => setBenchId(e.target.value)}>
              <option value="">— select —</option>
              {bench.map((id) => (
                <option key={id} value={id}>
                  {playersById[id]?.name || "—"} {playersById[id]?.position ? `(${playersById[id].position})` : ""}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-sm btn-primary" onClick={confirm} disabled={!courtId || !benchId}>
            Confirm sub
          </button>
        </div>
      )}
    </div>
  );
}

function PlayerStatButtons({ playerIds, playersById, statsByPlayer, onBump, liberoId, jerseyNumbers, readOnly }) {
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Player</th>
            {STAT_FIELDS.map((f) => (
              <th key={f.key} className="text-center" style={{ minWidth: 60 }}>
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {playerIds.map((id) => {
            const player = playersById[id];
            const stats = statsByPlayer[id] || emptyStatLine();
            const jerseyNum = jerseyNumbers ? jerseyNumbers[id] : null;
            return (
              <tr key={id}>
                <td>
                  {jerseyNum ? <span className="badge bg-secondary me-1">#{jerseyNum}</span> : null}
                  {player?.name || "—"} {player?.position ? `(${player.position})` : ""}
                  {liberoId && id === liberoId && <span className="badge bg-info text-dark ms-1">L</span>}
                </td>
                {STAT_FIELDS.map((f) =>
                  readOnly ? (
                    <td key={f.key} className="text-center text-muted">
                      {stats[f.key]}
                    </td>
                  ) : (
                    <td key={f.key} className="text-center">
                      <button className="btn btn-sm btn-outline-secondary px-2 py-0" onClick={() => onBump(id, f.key)}>
                        {stats[f.key]}
                      </button>
                    </td>
                  )
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CAREER_COLUMNS = [
  { key: "player_name", label: "Player" },
  { key: "club_name", label: "Club" },
  { key: "matches_played", label: "Matches" },
  { key: "aces", label: "Aces" },
  { key: "serve_errors", label: "S.Err" },
  { key: "kills", label: "Kills" },
  { key: "attack_errors", label: "A.Err" },
  { key: "assists", label: "Assists" },
  { key: "blocks", label: "Blocks" },
  { key: "digs", label: "Digs" },
  { key: "receptions", label: "Rec" },
  { key: "reception_errors", label: "R.Err" },
  { key: "faults", label: "Faults" },
];

function CareerStatsModal({ rows, loading, error, onClose, onSort, sortKey, sortDir }) {
  return (
    <div className="modal d-block" tabIndex="-1" role="dialog" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Career / Season Stats</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {loading ? (
              <p className="text-muted mb-0">Loading…</p>
            ) : error ? (
              <p className="text-danger mb-0">{error}</p>
            ) : rows.length === 0 ? (
              <p className="text-muted mb-0">No stats recorded yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-striped align-middle">
                  <thead>
                    <tr>
                      {CAREER_COLUMNS.map((c) => (
                        <th key={c.key} role="button" onClick={() => onSort(c.key)} className="text-nowrap">
                          {c.label} {sortKey === c.key ? (sortDir === "desc" ? "▼" : "▲") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.player_id}>
                        <td>{r.player_name}</td>
                        <td>{r.club_name || "—"}</td>
                        <td>{r.matches_played}</td>
                        <td>{r.aces}</td>
                        <td>{r.serve_errors}</td>
                        <td>{r.kills}</td>
                        <td>{r.attack_errors}</td>
                        <td>{r.assists || 0}</td>
                        <td>{r.blocks}</td>
                        <td>{r.digs}</td>
                        <td>{r.receptions}</td>
                        <td>{r.reception_errors}</td>
                        <td>{r.faults}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ScoreTracking = () => {
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [matchesError, setMatchesError] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [matchState, dispatch] = useReducer(matchReducer, initialMatchState);
  const [toast, setToast] = useState("");

  const [clubRosters, setClubRosters] = useState({});
  const [rosterLoading, setRosterLoading] = useState({});
  const [rosterError, setRosterError] = useState({});
  const [playerStats, setPlayerStats] = useState({});
  const [statsViewSet, setStatsViewSet] = useState(null);

  const saveIdRef = useRef(0);
  const lineupSaveIdRef = useRef(0);
  const prevLiberoRef = useRef({ homeActive: false, homeReplacedId: null, awayActive: false, awayReplacedId: null });

  const [showCareerStats, setShowCareerStats] = useState(false);
  const [careerStats, setCareerStats] = useState([]);
  const [careerLoading, setCareerLoading] = useState(false);
  const [careerError, setCareerError] = useState("");
  const [careerSortKey, setCareerSortKey] = useState("kills");
  const [careerSortDir, setCareerSortDir] = useState("desc");

  const [showNewSetLineupEditor, setShowNewSetLineupEditor] = useState(false);
  const [fixLineupTeam, setFixLineupTeam] = useState(null);
  // Which team starts on the left before the first point of set 1. This is
  // the baseline the automatic every-set swap (and the set-5 swap-at-8) then
  // alternates from. Resets to "home starts left" whenever a new match is
  // selected; it's a display preference only, not saved to the backend.
  const [initialSwapped, setInitialSwapped] = useState(false);

  useEffect(() => {
    fetchMatches();
  }, []);

  useEffect(() => {
    if (!selectedMatch) return;
    if (matchState.lastSetWinner) {
      const winnerName =
        matchState.lastSetWinner === "home" ? selectedMatch.home_team : selectedMatch.away_team;
      setToast(
        matchState.status === "Completed"
          ? `Match complete — ${winnerName} won the final set!`
          : `${winnerName} wins the set!`
      );
    }
    saveMatchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchState.scores, matchState.currentSet, matchState.homeSetsWon, matchState.awaySetsWon, matchState.status]);

  useEffect(() => {
    if (!selectedMatch || !matchState.homeRotation) return;
    saveLineupState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matchState.homeRotation,
    matchState.awayRotation,
    matchState.homeInitialRotation,
    matchState.awayInitialRotation,
    matchState.homeRosterIds,
    matchState.awayRosterIds,
    matchState.homeBench,
    matchState.awayBench,
    matchState.serveTeam,
    matchState.awaitingServeChoice,
    matchState.homeSubsUsed,
    matchState.awaySubsUsed,
    matchState.homeTimeoutsUsed,
    matchState.awayTimeoutsUsed,
    matchState.homeLiberoId,
    matchState.awayLiberoId,
    matchState.homeLiberoActive,
    matchState.awayLiberoActive,
    matchState.homeLiberoReplacedId,
    matchState.awayLiberoReplacedId,
    matchState.jerseyNumbers,
  ]);

  useEffect(() => {
    if (!selectedMatch) return;
    const prev = prevLiberoRef.current;

    if (prev.homeActive !== matchState.homeLiberoActive) {
      const replacedId = matchState.homeLiberoActive ? matchState.homeLiberoReplacedId : prev.homeReplacedId;
      logLiberoSwap("home", matchState.homeLiberoActive, replacedId, matchState.homeLiberoId);
    }
    if (prev.awayActive !== matchState.awayLiberoActive) {
      const replacedId = matchState.awayLiberoActive ? matchState.awayLiberoReplacedId : prev.awayReplacedId;
      logLiberoSwap("away", matchState.awayLiberoActive, replacedId, matchState.awayLiberoId);
    }

    prevLiberoRef.current = {
      homeActive: matchState.homeLiberoActive,
      homeReplacedId: matchState.homeLiberoReplacedId,
      awayActive: matchState.awayLiberoActive,
      awayReplacedId: matchState.awayLiberoReplacedId,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchState.homeLiberoActive, matchState.homeLiberoReplacedId, matchState.awayLiberoActive, matchState.awayLiberoReplacedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!matchState.awaitingServeChoice) setShowNewSetLineupEditor(false);
  }, [matchState.awaitingServeChoice]);

  useEffect(() => {
    setStatsViewSet(null);
  }, [matchState.currentSet]);

  const fetchMatches = async () => {
    setLoadingMatches(true);
    setMatchesError("");
    try {
      const res = await axios.get(`${API_BASE}/get_matches`);
      setMatches(res.data.filter((m) => m.status === "Live"));
    } catch (err) {
      console.error("Error fetching matches:", err);
      setMatchesError("Couldn't load live matches. Check your connection and try again.");
    } finally {
      setLoadingMatches(false);
    }
  };

  const fetchClubRoster = async (clubId) => {
    if (clubId === undefined || clubId === null) return;
    setRosterLoading((prev) => ({ ...prev, [clubId]: true }));
    setRosterError((prev) => ({ ...prev, [clubId]: "" }));
    try {
      const res = await axios.get(`${API_BASE}/club_players/${clubId}`);
      setClubRosters((prev) => ({ ...prev, [clubId]: res.data || [] }));
    } catch (err) {
      console.error("Error fetching club roster:", err);
      setClubRosters((prev) => ({ ...prev, [clubId]: prev[clubId] || [] }));
      setRosterError((prev) => ({ ...prev, [clubId]: "Couldn't load this team's players." }));
    } finally {
      setRosterLoading((prev) => ({ ...prev, [clubId]: false }));
    }
  };

  const fetchLineup = async (matchId) => {
    try {
      const res = await axios.get(`${API_BASE}/get_match_lineup/${matchId}`);
      dispatch({ type: "LOAD_LINEUP", lineup: res.data });
    } catch (err) {
      console.error("Error fetching lineup:", err);
    }
  };

  const fetchPlayerStats = async (matchId) => {
    try {
      const res = await axios.get(`${API_BASE}/get_player_stats/${matchId}`);
      const data = res.data || {};
      const looksPerSet = Object.keys(data).every((k) => /^\d+$/.test(k) && Number(k) <= 5) &&
        Object.values(data).every((v) => v && typeof v === "object" && !("aces" in v));
      setPlayerStats(looksPerSet ? data : { 1: data });
    } catch (err) {
      console.error("Error fetching player stats:", err);
      setPlayerStats({});
    }
  };

  const handleSelectMatch = (match) => {
    setSelectedMatch(match);
    setSaveError("");
    setFixLineupTeam(null);
    setInitialSwapped(false);
    prevLiberoRef.current = { homeActive: false, homeReplacedId: null, awayActive: false, awayReplacedId: null };
    dispatch({ type: "LOAD_MATCH", match });
    if (!clubRosters[match.team_home_id]) fetchClubRoster(match.team_home_id);
    if (!clubRosters[match.team_away_id]) fetchClubRoster(match.team_away_id);
    fetchLineup(match.id);
    fetchPlayerStats(match.id);
  };

  const saveMatchState = async () => {
    if (!selectedMatch) return;
    const thisSaveId = ++saveIdRef.current;
    setSaveError("");
    try {
      const payload = new URLSearchParams();
      for (let i = 1; i <= 5; i++) {
        const set = matchState.scores[`set${i}`];
        payload.append(`set${i}_home`, set.home);
        payload.append(`set${i}_away`, set.away);
      }
      payload.append("home_sets_won", matchState.homeSetsWon);
      payload.append("away_sets_won", matchState.awaySetsWon);
      payload.append("current_set", matchState.currentSet);
      payload.append("status", matchState.status);

      await axios.put(`${API_BASE}/update_score/${selectedMatch.id}`, payload);
    } catch (err) {
      console.error("Error saving scores:", err);
      if (thisSaveId === saveIdRef.current) {
        setSaveError("Last point didn't save. It will retry on the next point, or reload to check.");
      }
    }
  };

  const saveLineupState = async () => {
    if (!selectedMatch) return;
    const thisSaveId = ++lineupSaveIdRef.current;
    try {
      const payload = new URLSearchParams();
      payload.append("home_rotation", JSON.stringify(matchState.homeRotation));
      payload.append("away_rotation", JSON.stringify(matchState.awayRotation));
      payload.append("home_initial_rotation", JSON.stringify(matchState.homeInitialRotation));
      payload.append("away_initial_rotation", JSON.stringify(matchState.awayInitialRotation));
      payload.append("home_roster_ids", JSON.stringify(matchState.homeRosterIds));
      payload.append("away_roster_ids", JSON.stringify(matchState.awayRosterIds));
      payload.append("home_bench", JSON.stringify(matchState.homeBench));
      payload.append("away_bench", JSON.stringify(matchState.awayBench));
      payload.append("serve_team", matchState.serveTeam || "");
      payload.append("awaiting_serve_choice", matchState.awaitingServeChoice ? "true" : "false");
      payload.append("home_subs_used", matchState.homeSubsUsed);
      payload.append("away_subs_used", matchState.awaySubsUsed);
      payload.append("home_timeouts_used", matchState.homeTimeoutsUsed);
      payload.append("away_timeouts_used", matchState.awayTimeoutsUsed);
      payload.append("home_libero_id", matchState.homeLiberoId ?? "");
      payload.append("away_libero_id", matchState.awayLiberoId ?? "");
      payload.append("home_libero_active", matchState.homeLiberoActive ? "true" : "false");
      payload.append("away_libero_active", matchState.awayLiberoActive ? "true" : "false");
      payload.append("home_libero_replaced_id", matchState.homeLiberoReplacedId ?? "");
      payload.append("away_libero_replaced_id", matchState.awayLiberoReplacedId ?? "");
      payload.append("jersey_numbers", JSON.stringify(matchState.jerseyNumbers || {}));
      await axios.put(`${API_BASE}/update_lineup_state/${selectedMatch.id}`, payload);
    } catch (err) {
      console.error("Error saving lineup state:", err);
      if (thisSaveId === lineupSaveIdRef.current) {
        setSaveError("Last lineup/rotation change didn't save. It will retry on the next change.");
      }
    }
  };

  const startLineup = async ({
    homeRotation, awayRotation, homeRosterIds, awayRosterIds, homeBench, awayBench, serveTeam,
    homeLiberoId, awayLiberoId, jerseyNumbers,
  }) => {
    dispatch({
      type: "SET_STARTING_LINEUP",
      homeRotation, awayRotation, homeRosterIds, awayRosterIds, homeBench, awayBench, serveTeam,
      homeLiberoId, awayLiberoId, jerseyNumbers, playersById,
    });
    try {
      const payload = new URLSearchParams();
      payload.append("home_rotation", JSON.stringify(homeRotation));
      payload.append("away_rotation", JSON.stringify(awayRotation));
      payload.append("home_roster_ids", JSON.stringify(homeRosterIds));
      payload.append("away_roster_ids", JSON.stringify(awayRosterIds));
      payload.append("serve_team", serveTeam);
      payload.append("home_libero_id", homeLiberoId ?? "");
      payload.append("away_libero_id", awayLiberoId ?? "");
      payload.append("jersey_numbers", JSON.stringify(jerseyNumbers || {}));
      await axios.put(`${API_BASE}/set_starting_lineup/${selectedMatch.id}`, payload);
    } catch (err) {
      console.error("Error saving starting lineup:", err);
      setSaveError("Couldn't save the starting lineup. It's active locally but retry saving soon.");
    }
  };

  const applyNewSetLineup = ({ homeRotation, awayRotation, homeBench, awayBench, homeLiberoId, awayLiberoId }) => {
    dispatch({
      type: "SET_NEW_SET_LINEUP",
      homeRotation,
      awayRotation,
      homeBench,
      awayBench,
      homeLiberoId,
      awayLiberoId,
      playersById,
    });
    setShowNewSetLineupEditor(false);
  };

  const manualRotate = (team) => {
    dispatch({ type: "MANUAL_ROTATE", team, playersById });
  };

  const callTimeout = (team) => {
    dispatch({ type: "CALL_TIMEOUT", team });
  };

  const applyLineupCorrection = (team, { rotation, liberoId }) => {
    const roster = team === "home" ? clubRosters[selectedMatch.team_home_id] || [] : clubRosters[selectedMatch.team_away_id] || [];
    const bench = roster.map((p) => p.id).filter((id) => !rotation.includes(id));
    dispatch({ type: "CORRECT_LINEUP", team, rotation, bench, liberoId, playersById });
    setFixLineupTeam(null);
  };

  const setLibero = (team, playerId) => {
    dispatch({ type: "SET_LIBERO", team, playerId, playersById });
  };

  const setJerseyNumber = (playerId, number) => {
    dispatch({ type: "SET_JERSEY_NUMBER", playerId, number: number === "" ? "" : Number(number) });
  };

  const logLiberoSwap = async (team, enteringNow, replacedId, liberoId) => {
    if (!selectedMatch || !replacedId || !liberoId) return;
    const playerOutId = enteringNow ? replacedId : liberoId;
    const playerInId = enteringNow ? liberoId : replacedId;
    try {
      const payload = new URLSearchParams();
      payload.append("team", team);
      payload.append("player_out_id", playerOutId);
      payload.append("player_in_id", playerInId);
      payload.append("set_number", matchState.currentSet);
      payload.append("is_libero", "true");
      await axios.put(`${API_BASE}/substitute_player/${selectedMatch.id}`, payload);
    } catch (err) {
      console.error("Error logging libero swap:", err);
    }
  };

  const substitute = async (team, courtPlayerId, benchPlayerId) => {
    dispatch({ type: "SUBSTITUTE", team, courtPlayerId, benchPlayerId, playersById });
    try {
      const payload = new URLSearchParams();
      payload.append("team", team);
      payload.append("player_out_id", courtPlayerId);
      payload.append("player_in_id", benchPlayerId);
      payload.append("set_number", matchState.currentSet);
      await axios.put(`${API_BASE}/substitute_player/${selectedMatch.id}`, payload);
    } catch (err) {
      console.error("Error saving substitution:", err);
      setSaveError("Couldn't save the substitution. It's active locally but retry saving soon.");
    }
  };

  const bumpStat = async (playerId, statKey) => {
    const setNumber = matchState.currentSet;
    const setStats = playerStats[setNumber] || {};
    const current = setStats[playerId] || emptyStatLine();
    const nextValue = current[statKey] + 1;
    const nextStats = {
      ...playerStats,
      [setNumber]: { ...setStats, [playerId]: { ...current, [statKey]: nextValue } },
    };
    setPlayerStats(nextStats);
    try {
      const payload = new URLSearchParams();
      payload.append("player_id", playerId);
      payload.append("stat_key", statKey);
      payload.append("value", nextValue);
      payload.append("set_number", setNumber);
      await axios.put(`${API_BASE}/update_player_stat/${selectedMatch.id}`, payload);
    } catch (err) {
      console.error("Error saving player stat:", err);
      setSaveError("Last stat tap didn't save. It will retry on the next tap.");
    }
  };

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

  const updateScore = (team, delta) => {
    dispatch({ type: "ADD_POINT", team, delta, playersById });
  };

  const fetchCareerStats = async () => {
    setCareerLoading(true);
    setCareerError("");
    try {
      const res = await axios.get(`${API_BASE}/get_season_stats`);
      setCareerStats(res.data || []);
    } catch (err) {
      console.error("Error fetching career stats:", err);
      setCareerError("Couldn't load career stats. Try again.");
    } finally {
      setCareerLoading(false);
    }
  };

  const openCareerStats = () => {
    setShowCareerStats(true);
    fetchCareerStats();
  };

  const handleCareerSort = (key) => {
    if (careerSortKey === key) {
      setCareerSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setCareerSortKey(key);
      setCareerSortDir("desc");
    }
  };

  const sortedCareerStats = [...careerStats].sort((a, b) => {
    const dir = careerSortDir === "desc" ? -1 : 1;
    const av = a[careerSortKey];
    const bv = b[careerSortKey];
    if (typeof av === "string") return av.localeCompare(bv || "") * dir;
    return ((av || 0) - (bv || 0)) * dir;
  });

  const matchComplete = matchState.status === "Completed";
  const currentSetScore = matchState.scores[`set${matchState.currentSet}`];

  const homeRoster = selectedMatch ? clubRosters[selectedMatch.team_home_id] || [] : [];
  const awayRoster = selectedMatch ? clubRosters[selectedMatch.team_away_id] || [] : [];
  const homeRosterLoading = selectedMatch ? !!rosterLoading[selectedMatch.team_home_id] : false;
  const awayRosterLoading = selectedMatch ? !!rosterLoading[selectedMatch.team_away_id] : false;
  const homeRosterReady = homeRoster.length >= LINEUP_SIZE;
  const awayRosterReady = awayRoster.length >= LINEUP_SIZE;
  const rostersLoaded = !homeRosterLoading && !awayRosterLoading;

  const playersById = {};
  homeRoster.forEach((p) => (playersById[p.id] = p));
  awayRoster.forEach((p) => (playersById[p.id] = p));

  const lineupReady = !!matchState.homeRotation && !!matchState.awayRotation;
  const needsLineupSetup = !matchComplete && !lineupReady && !matchState.lineupSkipped;

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h2 className="mb-0">🏐 Volleyball Live Score Tracking</h2>
        <button className="btn btn-outline-primary btn-sm" onClick={openCareerStats}>
          View Career Stats
        </button>
      </div>

      {showCareerStats && (
        <CareerStatsModal
          rows={sortedCareerStats}
          loading={careerLoading}
          error={careerError}
          onClose={() => setShowCareerStats(false)}
          onSort={handleCareerSort}
          sortKey={careerSortKey}
          sortDir={careerSortDir}
        />
      )}

      {toast && (
        <div className="alert alert-success py-2" role="status">
          {toast}
        </div>
      )}
      {saveError && (
        <div className="alert alert-warning py-2" role="alert">
          {saveError}
        </div>
      )}

      <div className="list-group mb-4" style={{ maxHeight: "300px", overflowY: "auto" }}>
        {loadingMatches ? (
          <div className="list-group-item text-muted">Loading live matches…</div>
        ) : matchesError ? (
          <div className="alert alert-danger mb-0">
            {matchesError}{" "}
            <button className="btn btn-sm btn-outline-danger ms-2" onClick={fetchMatches}>
              Retry
            </button>
          </div>
        ) : matches.length === 0 ? (
          <div className="alert alert-info mb-0">No live matches available.</div>
        ) : (
          matches.map((match) => (
            <button
              key={match.id}
              className={`list-group-item list-group-item-action ${
                selectedMatch && selectedMatch.id === match.id ? "active" : ""
              }`}
              onClick={() => handleSelectMatch(match)}
            >
              {match.home_team} vs {match.away_team} — {new Date(match.match_date).toLocaleString()}
            </button>
          ))
        )}
      </div>

      {selectedMatch && !matchComplete && rostersLoaded && (!homeRosterReady || !awayRosterReady) && (
        <div className="alert alert-warning">
          <p className="mb-2">
            Lineup tracking needs at least {LINEUP_SIZE} registered players per team. Add players from the club
            management screen, then come back here.
          </p>
          <ul className="mb-2">
            {!homeRosterReady && (
              <li>
                {selectedMatch.home_team}: {homeRoster.length}/{LINEUP_SIZE} players
                {rosterError[selectedMatch.team_home_id] && ` — ${rosterError[selectedMatch.team_home_id]}`}
              </li>
            )}
            {!awayRosterReady && (
              <li>
                {selectedMatch.away_team}: {awayRoster.length}/{LINEUP_SIZE} players
                {rosterError[selectedMatch.team_away_id] && ` — ${rosterError[selectedMatch.team_away_id]}`}
              </li>
            )}
          </ul>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              fetchClubRoster(selectedMatch.team_home_id);
              fetchClubRoster(selectedMatch.team_away_id);
            }}
          >
            Refresh rosters
          </button>
          <button className="btn btn-link btn-sm" onClick={() => dispatch({ type: "SKIP_LINEUP" })}>
            Skip for now — score without lineup/rotation tracking
          </button>
        </div>
      )}

      {selectedMatch && !matchComplete && !rostersLoaded && (
        <div className="alert alert-light border">Loading team rosters…</div>
      )}

      {selectedMatch && !matchComplete && homeRosterReady && awayRosterReady && needsLineupSetup && (
        <>
          <LineupSetup
            homeTeam={selectedMatch.home_team}
            awayTeam={selectedMatch.away_team}
            homeRoster={homeRoster}
            awayRoster={awayRoster}
            onStart={startLineup}
          />
          <button className="btn btn-link btn-sm" onClick={() => dispatch({ type: "SKIP_LINEUP" })}>
            Skip for now — score without lineup/rotation tracking
          </button>
        </>
      )}

      {selectedMatch && !needsLineupSetup && (rostersLoaded || matchState.lineupSkipped) && (() => {
        // Teams change ends after every set, and additionally once during the
        // deciding 5th set as soon as either side reaches 8 points - both are
        // standard volleyball rules. `sidesSwapped` drives which team's column
        // renders on the left vs the right below, without touching who is
        // "home"/"away" in the underlying data.
        const isDeciderSet = matchState.currentSet === 5;
        const deciderSwapThreshold = 8;
        const deciderThresholdReached =
          isDeciderSet && (currentSetScore.home >= deciderSwapThreshold || currentSetScore.away >= deciderSwapThreshold);
        // initialSwapped flips which team started on the left in set 1; the
        // alternation pattern (swap every set) still runs on top of that choice.
        const baseSidesSwapped = (matchState.currentSet % 2 === 0) !== initialSwapped;
        const sidesSwapped = isDeciderSet ? baseSidesSwapped !== deciderThresholdReached : baseSidesSwapped;
        const leftTeamKey = sidesSwapped ? "away" : "home";
        const rightTeamKey = sidesSwapped ? "home" : "away";

        const teamName = (teamKey) => (teamKey === "home" ? selectedMatch.home_team : selectedMatch.away_team);

        const renderScoreColumn = (teamKey) => {
          const score = teamKey === "home" ? currentSetScore.home : currentSetScore.away;
          const timeoutsUsed = teamKey === "home" ? matchState.homeTimeoutsUsed : matchState.awayTimeoutsUsed;
          return (
            <div className="col-md-4 text-center" key={teamKey}>
              <h5>{teamName(teamKey)}</h5>
              <p className="display-6">{score}</p>
              <button className="btn btn-success m-1" onClick={() => updateScore(teamKey, +1)}>
                +1
              </button>
              <button
                className="btn btn-outline-danger m-1"
                disabled={score === 0}
                onClick={() => updateScore(teamKey, -1)}
              >
                -1
              </button>
              <div>
                <button
                  className="btn btn-sm btn-outline-warning m-1"
                  disabled={timeoutsUsed >= TIMEOUTS_PER_SET}
                  onClick={() => callTimeout(teamKey)}
                >
                  Timeout ({TIMEOUTS_PER_SET - timeoutsUsed} left)
                </button>
              </div>
            </div>
          );
        };

        const renderLineupColumn = (teamKey) => {
          const isHome = teamKey === "home";
          const roster = isHome ? homeRoster : awayRoster;
          const rotation = isHome ? matchState.homeRotation : matchState.awayRotation;
          const liberoId = isHome ? matchState.homeLiberoId : matchState.awayLiberoId;
          const bench = (isHome ? matchState.homeBench : matchState.awayBench).filter((id) => id !== liberoId);
          const subsUsed = isHome ? matchState.homeSubsUsed : matchState.awaySubsUsed;

          return (
            <div className="col-md-6" key={teamKey}>
              <LiberoControl
                roster={roster}
                currentLiberoId={liberoId}
                playersById={playersById}
                onSetLibero={(playerId) => setLibero(teamKey, playerId)}
              />
              <RotationCourt
                label={teamName(teamKey)}
                rotation={rotation}
                playersById={playersById}
                isServing={matchState.serveTeam === teamKey}
                liberoId={liberoId}
                jerseyNumbers={matchState.jerseyNumbers}
                onManualRotate={() => manualRotate(teamKey)}
                onFixLineup={() => setFixLineupTeam(fixLineupTeam === teamKey ? null : teamKey)}
              />
              {fixLineupTeam === teamKey && (
                <LineupCorrectionEditor
                  label={teamName(teamKey)}
                  roster={roster}
                  rotation={rotation}
                  liberoId={liberoId}
                  onApply={(payload) => applyLineupCorrection(teamKey, payload)}
                  onCancel={() => setFixLineupTeam(null)}
                />
              )}
              <JerseyNumberPanel
                label={teamName(teamKey)}
                roster={roster}
                jerseyNumbers={matchState.jerseyNumbers}
                onChangeJersey={setJerseyNumber}
              />
              <SubstitutionPanel
                label={teamName(teamKey)}
                rotation={rotation}
                bench={bench}
                playersById={playersById}
                subsUsed={subsUsed}
                onSubstitute={(courtId, benchId) => substitute(teamKey, courtId, benchId)}
              />
            </div>
          );
        };

        const renderStatsColumn = (teamKey, playerIds, viewedStats, isLiveView) => (
          <div className="col-md-6" key={teamKey}>
            <h6>{teamName(teamKey)} — player stats</h6>
            <PlayerStatButtons
              playerIds={playerIds}
              playersById={playersById}
              statsByPlayer={viewedStats}
              onBump={bumpStat}
              liberoId={teamKey === "home" ? matchState.homeLiberoId : matchState.awayLiberoId}
              jerseyNumbers={matchState.jerseyNumbers}
              readOnly={!isLiveView}
            />
          </div>
        );

        return (
          <div className={`card ${matchComplete ? "border-success" : "border-primary"}`}>
            <div className={`card-header text-white ${matchComplete ? "bg-success" : "bg-primary"}`}>
              <h4>
                {selectedMatch.home_team} vs {selectedMatch.away_team}
              </h4>
              <p className="mb-1">Status: {matchState.status}</p>
              {!matchComplete && <p className="mb-1">Current Set: {matchState.currentSet}</p>}
              <p className="mb-0">
                Sets Won — {selectedMatch.home_team}: {matchState.homeSetsWon} | {selectedMatch.away_team}:{" "}
                {matchState.awaySetsWon}
              </p>
              {!matchComplete && lineupReady && (
                <p className="mb-0 small text-white-50">
                  Sides: {teamName(leftTeamKey)} (left) vs {teamName(rightTeamKey)} (right)
                </p>
              )}
            </div>
            <div className="card-body">
              {matchComplete ? (
                <div className="text-center py-3">
                  <h5>
                    🏆{" "}
                    {matchState.homeSetsWon === SETS_TO_WIN_MATCH
                      ? selectedMatch.home_team
                      : selectedMatch.away_team}{" "}
                    wins the match!
                  </h5>
                </div>
              ) : (
                <>
                  {matchState.currentSet === 1 && currentSetScore.home === 0 && currentSetScore.away === 0 && (
                    <div className="alert alert-light border py-2 mb-3">
                      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <span className="small text-muted">Starting side (before first point):</span>
                        <div className="btn-group btn-group-sm">
                          <button
                            className={`btn ${!initialSwapped ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setInitialSwapped(false)}
                          >
                            {selectedMatch.home_team} starts left
                          </button>
                          <button
                            className={`btn ${initialSwapped ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setInitialSwapped(true)}
                          >
                            {selectedMatch.away_team} starts left
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {matchState.awaitingServeChoice && (
                    <div className="alert alert-info py-2">
                      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <span>New set — who serves first?</span>
                        <div className="d-flex align-items-center gap-2">
                          <div className="btn-group">
                            <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: "CHOOSE_SET_SERVER", team: "home" })}>
                              {selectedMatch.home_team}
                            </button>
                            <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: "CHOOSE_SET_SERVER", team: "away" })}>
                              {selectedMatch.away_team}
                            </button>
                          </div>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setShowNewSetLineupEditor((v) => !v)}
                          >
                            {showNewSetLineupEditor ? "Hide lineup editor" : "Edit starting lineup"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {matchState.awaitingServeChoice && showNewSetLineupEditor && (
                    <NewSetLineupEditor
                      homeTeam={selectedMatch.home_team}
                      awayTeam={selectedMatch.away_team}
                      homeRoster={homeRoster}
                      awayRoster={awayRoster}
                      homeRotation={matchState.homeRotation}
                      awayRotation={matchState.awayRotation}
                      homeLiberoId={matchState.homeLiberoId}
                      awayLiberoId={matchState.awayLiberoId}
                      onApply={applyNewSetLineup}
                      onCancel={() => setShowNewSetLineupEditor(false)}
                    />
                  )}

                  {lineupReady && (
                    <div className="row mb-3">
                      {renderLineupColumn(leftTeamKey)}
                      {renderLineupColumn(rightTeamKey)}
                    </div>
                  )}

                  <div className="row mb-2">
                    {renderScoreColumn(leftTeamKey)}
                    {renderScoreColumn(rightTeamKey)}
                  </div>

                  {lineupReady && (() => {
                    const effectiveView = statsViewSet ?? matchState.currentSet;
                    const isTotalView = statsViewSet === "total";
                    const isLiveView = !isTotalView && effectiveView === matchState.currentSet;
                    const viewedStats = isTotalView ? totalStatsByPlayer() : playerStats[effectiveView] || {};
                    const setOptions = Array.from(
                      { length: matchComplete ? 5 : matchState.currentSet },
                      (_, i) => i + 1
                    );

                    // De-duplicate defensively: the roster or rotation array
                    // should never contain the same player id twice, but if
                    // it ever does (duplicate roster row, a stale libero
                    // slot, etc.) this keeps that player from rendering as
                    // two identical rows in the stats table.
                    const dedupe = (ids) => [...new Set(ids)];

                    const homeStatIds = dedupe(
                      homeRoster.map((p) => p.id).filter((id) => id in viewedStats)
                    );
                    const awayStatIds = dedupe(
                      awayRoster.map((p) => p.id).filter((id) => id in viewedStats)
                    );

                    const homePlayerIds = dedupe(
                      isTotalView
                        ? (homeStatIds.length ? homeStatIds : matchState.homeRotation)
                        : matchState.homeRotation
                    );
                    const awayPlayerIds = dedupe(
                      isTotalView
                        ? (awayStatIds.length ? awayStatIds : matchState.awayRotation)
                        : matchState.awayRotation
                    );

                    const playerIdsFor = (teamKey) => (teamKey === "home" ? homePlayerIds : awayPlayerIds);

                    return (
                      <div className="mb-2">
                        <div className="d-flex align-items-center gap-2 flex-wrap mb-2 small">
                          <span className="text-muted">Viewing stats for:</span>
                          <div className="btn-group">
                            {setOptions.map((n) => (
                              <button
                                key={n}
                                className={`btn btn-sm ${(!isTotalView && effectiveView === n) ? "btn-primary" : "btn-outline-primary"}`}
                                onClick={() => setStatsViewSet(n === matchState.currentSet ? null : n)}
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
                          {!isLiveView && (
                            <span className="text-muted fst-italic">read-only — switch to Set {matchState.currentSet} to log stats</span>
                          )}
                        </div>
                        <div className="row mb-2">
                          {renderStatsColumn(leftTeamKey, playerIdsFor(leftTeamKey), viewedStats, isLiveView)}
                          {renderStatsColumn(rightTeamKey, playerIdsFor(rightTeamKey), viewedStats, isLiveView)}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

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
                    <td className="text-start">{selectedMatch.home_team}</td>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <td key={n}>{n <= matchState.currentSet || matchComplete ? matchState.scores[`set${n}`].home : "-"}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-start">{selectedMatch.away_team}</td>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <td key={n}>{n <= matchState.currentSet || matchComplete ? matchState.scores[`set${n}`].away : "-"}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ScoreTracking;