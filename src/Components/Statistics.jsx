import axios from "axios";
import React, { useEffect, useState } from "react";

/* ============================================================================
 * Statistics page — Men's/Women's + per-category leaderboards.
 *
 * Backed by GET /api/get_leaderboard?category=<key>&gender=<men|women>
 * which returns:
 *   {
 *     category, label, gender,
 *     columns: [...],   // subset of ["points","errors","attempts","assists",
 *                        //   "average","success_pct","total"]
 *     rows: [{ rank, player_id, player_name, team_id, team_name, team_logo,
 *              matches_played, points, errors, attempts, assists, total,
 *              average, success_pct }]
 *   }
 *
 * `columns` differs by category — e.g. Setters return assists/average/total
 * (assists is their primary tracked stat, same as "points" is for
 * Scorers/Attackers), Blockers/Diggers only return points/average/total since
 * we don't track attempts for those skills, while Scorers/Attackers/Servers/
 * Receivers include the full errors/attempts/success% set. The table renders
 * whatever columns the backend sends back, so it stays correct even if that
 * set changes.
 *
 * NOTE: `total` and `success_pct` are NOT taken from the backend response —
 * they are derived on the frontend from points/errors/attempts:
 *   total        = points + errors + attempts
 *   success_pct  = points / (points + errors) * 100
 * For Setters, `assists` is used in place of `points` for these derivations
 * (assists is the setter's primary stat and has no separate errors/attempts
 * tracked against it), so total falls back to assists alone and success_pct
 * is not shown.
 * ==========================================================================*/

const CATEGORIES = [
  { key: "scorers", label: "Best Scorers" },
  { key: "attackers", label: "Best Attackers" },
  { key: "blockers", label: "Best Blockers" },
  { key: "servers", label: "Best Servers" },
  { key: "setters", label: "Best Setters" },
  { key: "diggers", label: "Best Diggers" },
  { key: "receivers", label: "Best Receivers" },
];

const COLUMN_LABELS = {
  points: "Points",
  errors: "Errors",
  attempts: "Attempts",
  assists: "Assists",
  average: "Average per match",
  success_pct: "Success %",
  total: "Total",
};

const imgUrl = "https://shangala.pythonanywhere.com/static/images/";

// Derive total and success_pct from points/errors/attempts instead of
// trusting whatever the backend sends for those two fields.
//
// Setters don't have a "points" stat — their primary tracked stat is
// assists — so when a row carries `assists` instead of `points` (no
// `points` field present), fall back to treating assists as the scoring
// stat for the total. Setters also don't have errors/attempts tracked
// against assists, so success_pct is left as null (rendered as "—") for
// those rows.
const computeDerived = (row) => {
  const hasPoints = row.points !== undefined && row.points !== null;
  const points = hasPoints ? row.points : row.assists ?? 0;
  const errors = row.errors ?? 0;
  const attempts = row.attempts ?? 0;

  const total = Number(points) + Number(+errors) + Number(+attempts);
  const denom = points + errors;
  const success_pct = hasPoints && denom > 0 ? (points / denom) * 100 : null;

  return { total, success_pct };
};

const Statistics = () => {
  const [gender, setGender] = useState("men");
  const [category, setCategory] = useState("scorers");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const getLeaderboard = async (currentGender, currentCategory) => {
    try {
      setLoading("Loading statistics...");
      setError("");
      const response = await axios.get(
        "https://shangala.pythonanywhere.com/api/get_leaderboard",
        { params: { gender: currentGender, category: currentCategory } }
      );
      setData(response.data);
      setLoading("");
    } catch (err) {
      setLoading("");
      setData(null);
      setError(err.response?.data?.message || err.message);
    }
  };

  useEffect(() => {
    getLeaderboard(gender, category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, category]);

  const columns = data?.columns || [];
  const rows = data?.rows || [];

  return (
    <div className="container-fluid  mt-4">
      <h3 className="mb-3">Statistics</h3>

      {/* Men's / Women's toggle */}
      <ul className="nav nav-pills mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${gender === "men" ? "active" : ""}`}
            onClick={() => setGender("men")}
          >
            Men's
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${gender === "women" ? "active" : ""}`}
            onClick={() => setGender("women")}
          >
            Women's
          </button>
        </li>
      </ul>

      {/* Category tabs */}
      <ul className="nav nav-tabs mb-3 flex-wrap">
        {CATEGORIES.map((c) => (
          <li className="nav-item" key={c.key}>
            <button
              className={`nav-link ${category === c.key ? "active" : ""}`}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>

      {loading && <div className="alert alert-info py-2">{loading}</div>}
      {error && <div className="alert alert-danger py-2">{error}</div>}

      {!loading && !error && (
        <div className="table-responsive">
          <table className="table table-striped table-hover align-middle">
            <thead className="table-secondary">
              <tr>
                <th>Rank</th>
                <th>Player Name</th>
                <th>Team</th>
                {columns.map((col) => (
                  <th key={col}>{COLUMN_LABELS[col] || col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => {
                  const { total, success_pct } = computeDerived(row);

                  return (
                    <tr key={row.player_id}>
                      <td>{row.rank}</td>
                      <td>{row.player_name}</td>
                      <td className="d-flex align-items-center gap-2">
                        {row.team_logo && (
                          <img
                            src={`${imgUrl}/${row.team_logo}`}
                            alt={row.team_name}
                            width="24"
                            height="24"
                            style={{ objectFit: "contain" }}
                          />
                        )}
                        {row.team_name}
                      </td>
                      {columns.map((col) => {
                        if (col === "total") {
                          return <td key={col}>{total}</td>;
                        }
                        if (col === "success_pct") {
                          return (
                            <td key={col}>
                              {success_pct != null
                                ? `${success_pct.toFixed(1)}%`
                                : "—"}
                            </td>
                          );
                        }
                        return <td key={col}>{row[col] ?? "—"}</td>;
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3 + columns.length} className="text-center">
                    No stats recorded yet for this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Statistics;