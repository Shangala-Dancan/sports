import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";

const API_BASE_URL = "https://shangala.pythonanywhere.com/api";

const COMPETITIONS = ["KVL", "Kenya Cup"];
const STAGES = ["Quarterfinal", "Semifinal", "Final"];

// same set-completion logic used in Schedule.jsx, duplicated here so this
// component doesn't depend on that file.
const isSetComplete = (home, away, setNumber) => {
  const target = setNumber === 5 ? 15 : 25;
  return (home >= target || away >= target) && Math.abs(home - away) >= 2;
};

const countSetsWon = (match, side) => {
  let wins = 0;
  for (let i = 1; i <= 5; i++) {
    const home = Number(match[`set${i}_home`] || 0);
    const away = Number(match[`set${i}_away`] || 0);
    if (isSetComplete(home, away, i)) {
      if (side === "home" && home > away) wins++;
      if (side === "away" && away > home) wins++;
    }
  }
  return wins;
};

const Standing = () => {
  const [activeCompetition, setActiveCompetition] = useState("KVL");

  const [standings, setStandings] = useState([]); // KVL: flat array
  const [groupedStandings, setGroupedStandings] = useState({}); // Kenya Cup: { "Group A": [...], "Group B": [...] }
  const [bracket, setBracket] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getStandings = useCallback(async (competition) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/get_standings`, {
        params: { competition }
      });

      if (competition === "Kenya Cup") {
        setGroupedStandings(response.data || {});
        setStandings([]);
      } else {
        setStandings(response.data || []);
        setGroupedStandings({});
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load standings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const getBracket = useCallback(async (competition) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/get_bracket`, {
        params: { competition }
      });
      setBracket(response.data || []);
    } catch (err) {
      console.error(err);
      setBracket([]);
    }
  }, []);

  useEffect(() => {
    getStandings(activeCompetition);

    if (activeCompetition === "Kenya Cup") {
      getBracket(activeCompetition);
    } else {
      setBracket([]);
    }
  }, [activeCompetition, getStandings, getBracket]);

  const renderTable = (teams) => (
    <div className="table-responsive">
      <table className="table table-striped table-hover">
        <thead className="table-secondary">
          <tr>
            <th>Position</th>
            <th>Team</th>
            <th>Played</th>
            <th>Wins</th>
            <th>Losses</th>
            <th>Sets Won</th>
            <th>Sets Lost</th>
            <th>Form</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody className="bg-transparent">
          {teams.map((team, index) => (
            <tr key={team.id}>
              <td>{index + 1}</td>
              <td>{team.team_name}</td>
              <td>{team.matches_played}</td>
              <td className="text-success">{team.wins}</td>
              <td className="text-danger">{team.losses}</td>
              <td>{team.sets_won}</td>
              <td>{team.sets_lost}</td>
              <td>
                {team.team_form?.map((result, i) => (
                  <span
                    key={i}
                    className={`badge rounded-pill me-1 ${
                      result === "W" ? "bg-success" : "bg-danger"
                    }`}
                  >
                    {result}
                  </span>
                ))}
              </td>
              <td>
                <strong>{team.points}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderBracketCard = (match, key) => {
    if (!match) {
      return (
        <div
          key={key}
          className="border rounded p-2 mb-3 text-muted text-center small"
          style={{ minHeight: "64px", minWidth: "200px" }}
        >
          TBD
        </div>
      );
    }

    const homeSets = countSetsWon(match, "home");
    const awaySets = countSetsWon(match, "away");
    const isDecided = match.status === "Completed";
    const homeWon = isDecided && homeSets > awaySets;
    const awayWon = isDecided && awaySets > homeSets;

    return (
      <div key={match.id} className="border rounded p-2 mb-3" style={{ minWidth: "200px" }}>
        <div className={`d-flex justify-content-between ${homeWon ? "fw-bold" : ""}`}>
          <span>{match.home_team}</span>
          <span>{match.status === "Scheduled" ? "-" : homeSets}</span>
        </div>
        <div className={`d-flex justify-content-between ${awayWon ? "fw-bold" : ""}`}>
          <span>{match.away_team}</span>
          <span>{match.status === "Scheduled" ? "-" : awaySets}</span>
        </div>
      </div>
    );
  };

  const renderBracket = () => {
    if (bracket.length === 0) return null;

    return (
      <div className="mt-5">
        <h4 className="mb-3">Knockout Stage</h4>
        <div className="d-flex justify-content-around flex-wrap">
          {STAGES.map((stage) => {
            const stageMatches = bracket.filter((m) => m.stage === stage);
            return (
              <div
                key={stage}
                className="d-flex flex-column justify-content-around mx-3"
                style={{ minWidth: "220px" }}
              >
                <h6 className="text-center mb-3">{stage}</h6>
                {stageMatches.length > 0
                  ? stageMatches.map((m) => renderBracketCard(m, m.id))
                  : renderBracketCard(null, stage)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const groupNames = Object.keys(groupedStandings).sort();

  return (
    <div className="container mt-4">
      <h2 className="mb-3 text-center">Volleyball Standings</h2>

      <ul className="nav nav-tabs justify-content-center mb-4">
        {COMPETITIONS.map((comp) => (
          <li className="nav-item" key={comp}>
            <button
              className={`nav-link ${activeCompetition === comp ? "active" : ""}`}
              onClick={() => setActiveCompetition(comp)}
            >
              {comp}
            </button>
          </li>
        ))}
      </ul>

      {loading && <p className="text-center text-muted">Loading standings...</p>}
      {error && <p className="text-center text-danger">{error}</p>}

      {!loading && !error && activeCompetition === "KVL" && (
        standings.length > 0 ? (
          renderTable(standings)
        ) : (
          <p className="text-center text-muted">No standings available yet.</p>
        )
      )}

      {!loading && !error && activeCompetition === "Kenya Cup" && (
        <>
          {groupNames.length > 0 ? (
            <div className="row">
              {groupNames.map((group) => (
                <div className="col-md-8 mb-4" key={group}>
                  <h5>Group {group}</h5>
                  {renderTable(groupedStandings[group])}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted">No group standings available yet.</p>
          )}

          {renderBracket()}
        </>
      )}
    </div>
  );
};

export default Standing;