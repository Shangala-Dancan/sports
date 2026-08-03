import React, { useEffect, useState } from "react";
import axios from "axios";
import { Modal } from "bootstrap";

const API_BASE = "https://shangala.pythonanywhere.com";

// list of competitions available. Add more here if needed later.
const COMPETITIONS = ["KVL", "Kenya Cup"];

// divisions each competition is split into
const GENDERS = ["Men", "Women"];

// check if a user is login
const user = JSON.parse(localStorage.getItem("user")||"null");

// order in which knockout stages should appear after the group stage
const KNOCKOUT_STAGES = ["Quarterfinal", "Semifinal", "Final"];

// ---------------------------------------------------------------------
// Knockout bracket ("tree") view.
//
// Renders Quarterfinal -> Semifinal -> Final as connected columns.
// This assumes a standard single-elimination shape (i.e. each round has
// half as many matches as the previous one - 4 -> 2 -> 1). If a stage's
// match count doesn't cleanly halve into the next stage (e.g. a bye, or
// data hasn't been fully entered yet), we skip drawing connector lines
// for that pairing and just stack the matches instead, so nothing
// breaks - it just looks like a plain list until the bracket fills in.
// ---------------------------------------------------------------------

const BracketMatchCard = ({ match, imgurl, formatTime, calculateSets, withConnector, startMatch, openScoreModal }) => {
  const isScored = match.status === "Live" || match.status === "Completed";

  return (
    <div
      className={`bracket-match position-relative bg-secondary text-white rounded p-2 my-2 ${withConnector ? "bracket-has-connector" : ""}`}
    >
      <div className="d-flex align-items-center gap-2 mb-1 flex-nowrap">
        <img
          src={imgurl + match.home_logo}
          alt=""
          style={{ width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0 }}
        />
        <small className="flex-grow-1 flex-shrink-1 text-truncate" style={{ minWidth: 0 }}>{match.home_team}</small>
        {isScored && <strong className="flex-shrink-0">{calculateSets(match, "home")}</strong>}
      </div>
      <div className="d-flex align-items-center gap-2 flex-nowrap">
        <img
          src={imgurl + match.away_logo}
          alt=""
          style={{ width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0 }}
        />
        <small className="flex-grow-1 flex-shrink-1 text-truncate" style={{ minWidth: 0 }}>{match.away_team}</small>
        {isScored && <strong className="flex-shrink-0">{calculateSets(match, "away")}</strong>}
      </div>
      <div className="text-center">
        <small className="text-white-50">{formatTime(match.match_time)}</small>
      </div>

      {match.status === "Scheduled" && (
        <div className="text-center mt-2">
          <button className="btn btn-success btn-sm" onClick={() => startMatch(match.id)}>Start Match</button>
        </div>
      )}

      {match.status === "Live" && (
        <div className="text-center mt-2">
          <button className="btn btn-warning btn-sm" onClick={() => openScoreModal(match)}>Update Score</button>
        </div>
      )}
    </div>
  );
};

// Wraps the match(es) that feed into a single match in the next round.
// Draws the merge line on the right edge of the wrapper.
const BracketPair = ({ children, showConnector }) => (
  <div
    className={`bracket-pair d-flex flex-column flex-fill position-relative ${showConnector ? "bracket-pair-connector" : ""}`}
    style={{ justifyContent: "space-around" }}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------
// Links a round's matches to the round after it by actually checking who
// is playing, not by array position. For every match in the next round,
// we look for a match in the current round whose home_team or away_team
// matches the next match's home_team, and another for its away_team -
// those are the two quarterfinal (or semifinal) results that fed into
// this fixture. Whatever's left over in the current round hasn't been
// tied to a next-round fixture yet (e.g. that side of the draw hasn't
// been scheduled), so it's rendered on its own with no merge line.
// ---------------------------------------------------------------------
const linkRoundToNext = (currentMatches, nextMatches) => {
  const usedIds = new Set();

  const findFeeder = (teamName) =>
    currentMatches.find(
      cm => !usedIds.has(cm.id) && (cm.home_team === teamName || cm.away_team === teamName)
    );

  const groups = nextMatches.map(nextMatch => {
    const feederHome = findFeeder(nextMatch.home_team);
    if (feederHome) usedIds.add(feederHome.id);

    const feederAway = findFeeder(nextMatch.away_team);
    if (feederAway) usedIds.add(feederAway.id);

    return {
      nextMatchId: nextMatch.id,
      pair: [feederHome, feederAway].filter(Boolean)
    };
  }).filter(group => group.pair.length > 0);

  const leftovers = currentMatches.filter(cm => !usedIds.has(cm.id));

  return { groups, leftovers };
};

const BracketColumn = ({ stage, matches, nextMatches, isLast, imgurl, formatTime, calculateSets, startMatch, openScoreModal }) => {
  let groups = [];
  let leftovers = matches;

  if (!isLast && nextMatches && nextMatches.length) {
    const linked = linkRoundToNext(matches, nextMatches);
    groups = linked.groups;
    leftovers = linked.leftovers;
  }

  return (
    <div className="bracket-column d-flex flex-column flex-fill px-4" style={{ justifyContent: "space-around", minWidth: "220px" }}>
      <h6 className="text-center mb-3">{stage}</h6>
      <div className="d-flex flex-column flex-fill" style={{ justifyContent: "space-around" }}>
        {groups.map(({ nextMatchId, pair }) => (
          <BracketPair key={nextMatchId} showConnector={pair.length === 2}>
            {pair.map(m => (
              <BracketMatchCard
                key={m.id}
                match={m}
                imgurl={imgurl}
                formatTime={formatTime}
                calculateSets={calculateSets}
                withConnector
                startMatch={startMatch}
                openScoreModal={openScoreModal}
              />
            ))}
          </BracketPair>
        ))}
        {leftovers.map(m => (
          <BracketMatchCard
            key={m.id}
            match={m}
            imgurl={imgurl}
            formatTime={formatTime}
            calculateSets={calculateSets}
            withConnector={!isLast}
            startMatch={startMatch}
            openScoreModal={openScoreModal}
          />
        ))}
      </div>
    </div>
  );
};

const KnockoutBracket = ({ knockoutBuckets, imgurl, formatTime, calculateSets, startMatch, openScoreModal }) => {
  const stagesWithMatches = KNOCKOUT_STAGES.filter(stage => knockoutBuckets[stage]?.length);

  if (stagesWithMatches.length === 0) return null;

  return (
    <div className="col-md-9 mt-4">
      <h3 className="mb-3">Knockout Stage</h3>
      <style>{`
        .bracket-has-connector::after,
        .bracket-pair-connector::after {
          content: "";
          position: absolute;
          top: 50%;
          right: -24px;
          width: 24px;
          height: 2px;
          background: #999;
        }
        .bracket-pair-connector::before {
          content: "";
          position: absolute;
          right: -24px;
          top: 25%;
          bottom: 25%;
          width: 2px;
          background: #999;
        }
      `}</style>
      <div className="d-flex overflow-auto" style={{ gap: "24px" }}>
        {stagesWithMatches.map((stage, i) => (
          <BracketColumn
            key={stage}
            stage={stage}
            matches={knockoutBuckets[stage]}
            nextMatches={knockoutBuckets[stagesWithMatches[i + 1]]}
            isLast={i === stagesWithMatches.length - 1}
            imgurl={imgurl}
            formatTime={formatTime}
            calculateSets={calculateSets}
            startMatch={startMatch}
            openScoreModal={openScoreModal}
          />
        ))}
      </div>
    </div>
  );
};

const Schedule = () => {

  const imgurl = `${API_BASE}/static/images/`;
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // which competition tab is currently active
  const [activeCompetition, setActiveCompetition] = useState("KVL");

  // which gender division is currently active
  const [activeGender, setActiveGender] = useState("Men");

  // check if a set is complete (target is 15 for the 5th set, 25 otherwise)
  const isSetComplete = (homeScore, awayScore, setNumber) => {
    const targetScore = setNumber === 5 ? 15 : 25;
    return (
      (homeScore >= targetScore || awayScore >= targetScore) &&
      Math.abs(homeScore - awayScore) >= 2
    );
  };

  const [scoreData, setScoreData] = useState({
    set1_home: 0,
    set1_away: 0,

    set2_home: 0,
    set2_away: 0,

    set3_home: 0,
    set3_away: 0,

    set4_home: 0,
    set4_away: 0,

    set5_home: 0,
    set5_away: 0,

    status: "Live"

  });

  const getMatches = async () => {

    setLoading("Loading matches...");
    try {

      const res = await axios.get(`${API_BASE}/api/get_matches`);
      const sortedMatches = (res.data || []).sort(
        (a, b) => new Date(b.match_date) - new Date(a.match_date)
      );

      setMatches(sortedMatches);
      setLoading("");

    }
    catch (error) {
      console.log(error);
      setLoading("Failed loading matches");

    }

  };

  useEffect(() => {
    getMatches();
  }, []);

  const startMatch = async (id) => {

    try {
      await axios.put(`${API_BASE}/api/start_match/${id}`);
      alert("Match started");
      getMatches();

    }
    catch (error) {
      console.log(error);
    }

  };

  const calculateSets = (match, team) => {
    let wins = 0;
    for (let i = 1; i <= 5; i++) {

      let home = Number(match[`set${i}_home`] || 0);
      let away = Number(match[`set${i}_away`] || 0);

      if (isSetComplete(home, away, i)) {

        if (team === "home" && home > away)
          wins++;

        if (team === "away" && away > home)
          wins++;

      }

    }
    return wins;

  };

  const getCurrentSet = (match) => {

    for (let i = 1; i <= 5; i++) {

      let home = Number(match[`set${i}_home`] || 0);
      let away = Number(match[`set${i}_away`] || 0);

      if (!isSetComplete(home, away, i)) {

        return i;

      }
    }

    return 5;

  };

  const openScoreModal = (match) => {
    setSelectedMatch({
      ...match,
      currentSet: getCurrentSet(match)

    });

    setScoreData({

      set1_home: match.set1_home || 0,
      set1_away: match.set1_away || 0,

      set2_home: match.set2_home || 0,
      set2_away: match.set2_away || 0,

      set3_home: match.set3_home || 0,
      set3_away: match.set3_away || 0,

      set4_home: match.set4_home || 0,
      set4_away: match.set4_away || 0,

      set5_home: match.set5_home || 0,
      set5_away: match.set5_away || 0,

      status: "Live"

    });

    setTimeout(() => {
      const modal = new Modal(document.getElementById("scoreModal"));
      modal.show();

    }, 100);

  };

  const updateScore = async () => {
    try {

      const formData = new FormData();

      Object.keys(scoreData).forEach(key => {
        formData.append(
          key,
          scoreData[key]
        );
      });

      const tempMatch = { ...selectedMatch, ...scoreData };

      const homeSets = calculateSets(tempMatch, "home");
      const awaySets = calculateSets(tempMatch, "away");

      if (
        homeSets === 3 ||
        awaySets === 3
      ) {

        formData.append("status", "Completed");

      }
      else {

        formData.append("status", "Live");

      }

      await axios.put(`${API_BASE}/api/update_score/${selectedMatch.id}`, formData);
      alert("Score updated");

      const modal = Modal.getInstance(document.getElementById("scoreModal"));
      modal.hide();
      getMatches();
    }
    catch (error) {

      console.log(error);

    }
  };

  const [clubs, setClubs] = useState([]);
  const [error, setError] = useState("");

  const [match, setMatch] = useState({

    team_home_id: "",
    team_away_id: "",

    match_date: "",

    location: "",

    status: "Scheduled",

    // new field: which competition this match belongs to
    competition: "KVL",

    // new field: group stage vs knockout stage (only meaningful for Kenya Cup)
    stage: "Group",

    // new field: which division this match belongs to
    gender: "Men"

  });

  // get clubs
  const getClubs = async () => {

    try {

      const response = await axios.get(`${API_BASE}/api/get_club`);

      setClubs(response.data);
    }
    catch (error) {

      console.log(error);

    }

  };

  useEffect(() => {

    getClubs();

  }, []);

  const handleChange = (e) => { setMatch({ ...match, [e.target.name]: e.target.value }); };

  const addMatch = async (e) => {
    e.preventDefault();

    if (!match.team_home_id || !match.team_away_id) {
      setError("Please select both a home team and an away team");
      return;
    }

    if (match.team_home_id === match.team_away_id) {

      setError("Please enter a valid away team");

      return;

    }

    if (!match.match_date) {
      setError("Please select a match date and time");
      return;
    }

    const formData = new FormData();

    // split datetime-local
    const [date, time] = match.match_date.split("T");

    formData.append("team_home_id", match.team_home_id);
    formData.append("team_away_id", match.team_away_id);
    formData.append("match_date", date);
    formData.append("match_time", time);
    formData.append("location", match.location);
    formData.append("status", match.status);
    formData.append("competition", match.competition);
    // Kenya Cup fixtures carry a stage (Group/Quarterfinal/Semifinal/Final).
    // Other competitions don't use stages, so just leave them as "Group".
    formData.append("stage", match.competition === "Kenya Cup" ? match.stage : "Group");
    // which division (Men/Women) this fixture belongs to
    formData.append("gender", match.gender);

    try {
      const response = await axios.post(`${API_BASE}/api/add_match`, formData);

      alert(response.data.message);
      setMatch({
        team_home_id: "",
        team_away_id: "",
        match_date: "",
        location: "",
        status: "Scheduled",
        competition: "KVL",
        stage: "Group",
        gender: "Men"

      });
      setError("");
      setShowForm(false);
      getMatches();
    }
    catch (error) {
      console.log(error);
    }
  };

  const formatTime = (time) => {
    if (!time) return "";

    const [hour, minute] = time.split(":");

    let h = Number(hour);
    const ampm = h >= 12 ? "PM" : "AM";

    h = h % 12 || 12;

    return `${h}:${minute} ${ampm}`;
  };

  // only show matches that belong to the active competition tab and the
  // active gender division. Older records without a gender field yet
  // fall back to "Men" so nothing disappears from view.
  const visibleMatches = matches.filter(
    matche =>
      (matche.competition || "KVL") === activeCompetition &&
      (matche.gender || "Men") === activeGender
  );

  // --- Kenya Cup grouping ---------------------------------------------
  // Group-stage fixtures (stage missing/undefined is treated as "Group"
  // for older records) get bucketed by the home team's group_name.
  // Knockout fixtures get bucketed by stage, in Quarterfinal -> Semifinal
  // -> Final order.
  const buildKenyaCupSections = () => {
    const groupBuckets = {};
    const knockoutBuckets = {};

    visibleMatches.forEach(matche => {
      const stage = matche.stage || "Group";

      if (stage === "Group") {
        const g = matche.group_name || "Ungrouped";
        groupBuckets[g] = groupBuckets[g] || [];
        groupBuckets[g].push(matche);
      } else {
        knockoutBuckets[stage] = knockoutBuckets[stage] || [];
        knockoutBuckets[stage].push(matche);
      }
    });

    return { groupBuckets, knockoutBuckets };
  };

  const { groupBuckets, knockoutBuckets } =
    activeCompetition === "Kenya Cup"
      ? buildKenyaCupSections()
      : { groupBuckets: {}, knockoutBuckets: {} };

  // Extracted so it can be reused for both the flat KVL list and the
  // grouped/staged Kenya Cup sections.
  //
  // Team name + set scores now live in a single flex-nowrap row: the name
  // block shrinks/truncates (text-truncate + minWidth: 0) instead of
  // wrapping, so the score badges never get pushed onto their own line.
  const renderMatchCard = (matche) => (

    <div className="col-md-9 mb-3 mt-3" key={matche.id}>
      <div className="bg-secondary text-center rounded p-2">
        <p>{matche.competition || "KVL"} 2026/2027</p>
        <p className="">{new Date(matche.match_date).toLocaleDateString()}</p>
      </div>

      <div className="row p-3">
        <div className="col-12">
          <h6>{matche.competition || "KVL"}{matche.stage && matche.stage !== "Group" ? ` - ${matche.stage}` : ""}</h6>

          {/* HOME ROW: logo + name + set scores + form badges, all on one line.
              Row scrolls horizontally instead of squeezing/truncating content. */}
          <div
            className="d-flex gap-2 flex-nowrap align-items-center pb-1"
            style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
          >
            <div className="d-flex align-items-center flex-shrink-0">
              <img src={imgurl + matche.home_logo} alt="" style={{ width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0 }} />
              <h4 className="fs-6 fs-md-4 mb-0 ms-2" style={{ whiteSpace: "nowrap" }}>{matche.home_team}</h4>
            </div>

            {(matche.status === "Live" || matche.status === "Completed") && (
              <div className="d-flex flex-nowrap flex-shrink-0">
                <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set1_home}</p>
                {isSetComplete(matche.set1_home, matche.set1_away, 1) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set2_home}</p>
                )}
                {isSetComplete(matche.set2_home, matche.set2_away, 2) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set3_home}</p>
                )}
                {isSetComplete(matche.set3_home, matche.set3_away, 3) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set4_home}</p>
                )}
                {isSetComplete(matche.set4_home, matche.set4_away, 4) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set5_home}</p>
                )}
              </div>
            )}

            {matche.home_team_form?.length > 0 && (
              <div className="d-flex flex-nowrap flex-shrink-0 ms-2">
                {matche.home_team_form.map((result, index) => (
                  <span key={index} style={{
                    display: "inline-block", width: "18px", height: "18px", lineHeight: "18px",
                    textAlign: "center", borderRadius: "4px", marginRight: "3px", backgroundColor: result === "W" ? "green" : "red",
                    color: "white", fontSize: "12px", fontWeight: "bold", flexShrink: 0
                  }}>{result === "W" ? "W" : "X"}</span>
                ))}
              </div>
            )}
          </div>

          <div className="d-flex text-dark align-items-center flex-wrap gap-2">
            <hr className="flex-grow-1" />
            <h4 className="fs-6 fs-md-4 mb-0">{formatTime(matche.match_time)}</h4>

            {
              matche.status === "Live" &&
              <button className="btn btn-warning btn-sm" onClick={() => openScoreModal(matche)}>Update Score</button>
            }
            {
              matche.status === "Scheduled" &&
              <button className="btn btn-success btn-sm" onClick={() => startMatch(matche.id)}>Start Match</button>
            }

          </div>

          {/* AWAY ROW: logo + name + set scores + form badges, all on one line.
              Row scrolls horizontally instead of squeezing/truncating content. */}
          <div
            className="d-flex gap-2 flex-nowrap align-items-center pb-1"
            style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
          >
            <div className="d-flex align-items-center flex-shrink-0">
              <img src={imgurl + matche.away_logo} alt="" style={{ width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0 }} />
              <h4 className="fs-6 fs-md-4 mb-0 ms-2" style={{ whiteSpace: "nowrap" }}>{matche.away_team}</h4>
            </div>
            {(matche.status === "Live" || matche.status === "Completed") && (
              <div className="d-flex flex-nowrap flex-shrink-0">
                <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set1_away}</p>
                {isSetComplete(matche.set1_home, matche.set1_away, 1) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set2_away}</p>
                )}
                {isSetComplete(matche.set2_home, matche.set2_away, 2) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set3_away}</p>
                )}
                {isSetComplete(matche.set3_home, matche.set3_away, 3) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set4_away}</p>
                )}
                {isSetComplete(matche.set4_home, matche.set4_away, 4) && (
                  <p className="ms-2 mb-0 fw-bold" style={{ minWidth: "1.2em", textAlign: "center" }}>{matche.set5_away}</p>
                )}
              </div>
            )}

            {matche.away_team_form?.length > 0 && (
              <div className="d-flex flex-nowrap flex-shrink-0 ms-2">
                {matche.away_team_form.map((result, index) => (
                  <span key={index} style={{
                    display: "inline-block", width: "18px", height: "18px", lineHeight: "18px",
                    textAlign: "center", borderRadius: "4px", marginRight: "3px", backgroundColor: result === "W" ? "green" : "red",
                    color: "white", fontSize: "12px", fontWeight: "bold", flexShrink: 0
                  }}>{result === "W" ? "W" : "X"}</span>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Once a match is Completed, show how many sets each team won overall */}
      {matche.status === "Completed" && (
        <div className="text-center mt-2">
          <span className="badge bg-dark fs-6">
            Sets: {matche.home_team} {calculateSets(matche, "home")} - {calculateSets(matche, "away")} {matche.away_team}
          </span>
        </div>
      )}
    </div>
  );

  return (

    <div className="container-fluid mt-4">

      <style>{`
        .schedule-side-col {
          border-top: 1px solid #444;
        }
        @media (min-width: 768px) {
          .schedule-side-col {
            border-top: none;
            border-left: 1px solid #444;
          }
        }
        @media (max-width: 767.98px) {
          .bracket-column {
            min-width: 170px !important;
            padding-left: 0.75rem !important;
            padding-right: 0.75rem !important;
          }
          .nav-tabs .nav-link,
          .nav-pills .nav-link {
            padding: 0.4rem 0.6rem;
            font-size: 0.9rem;
          }
        }
      `}</style>

      <p>{loading}</p>
      <div className="row bg-white justify-content-center mt-3">
        <div className="col-md-9">
          <h2>Match Schedule</h2>

          {/* competition tabs */}
          <ul className="nav nav-tabs mb-2">
            {COMPETITIONS.map(comp => (
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

          {/* gender division tabs */}
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
        </div>

        {activeCompetition === "Kenya Cup" ? (
          <>
            {/* Group stage, one section per group */}
            {Object.keys(groupBuckets).sort().map(groupName => (
              <React.Fragment key={groupName}>
                <div className="col-md-9">
                  <h3 className="mt-4">{groupName}</h3>
                </div>
                {groupBuckets[groupName].map(renderMatchCard)}
              </React.Fragment>
            ))}

            {/* Knockout stages, rendered as a connected bracket tree */}
            <KnockoutBracket
              knockoutBuckets={knockoutBuckets}
              imgurl={imgurl}
              formatTime={formatTime}
              calculateSets={calculateSets}
              startMatch={startMatch}
              openScoreModal={openScoreModal}
            />
          </>
        ) : (
          visibleMatches.map(renderMatchCard)
        )}
      </div>

      {/* MODAL */}

      <div className="modal fade" id="scoreModal" tabIndex="-1">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">

              <h5>Update Score</h5>
            </div>
            <div className="modal-body">

              {

                selectedMatch &&
                <>

                  <div className="alert alert-info">
                    {selectedMatch.home_team} vs {selectedMatch.away_team}
                  </div>

                  {[1, 2, 3, 4, 5].map((n) => (
                    <div className="row mb-2 align-items-center" key={n}>
                      <div className="col-12">
                        <small className="text-muted">
                          Set {n}{n === selectedMatch.currentSet ? " (current)" : ""}
                        </small>
                      </div>
                      <div className="col-12 col-sm">
                        <label>{selectedMatch.home_team}</label>
                        <input
                          type="number"
                          className="form-control"
                          value={scoreData[`set${n}_home`]}
                          onChange={(e) =>
                            setScoreData({ ...scoreData, [`set${n}_home`]: Number(e.target.value) })
                          }
                        />
                      </div>

                      <div className="col-12 col-sm">
                        <label>{selectedMatch.away_team}</label>
                        <input
                          type="number"
                          className="form-control"
                          value={scoreData[`set${n}_away`]}
                          onChange={(e) =>
                            setScoreData({ ...scoreData, [`set${n}_away`]: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  ))}

                </>

              }

            </div>

            <div className="modal-footer">

              <button className="btn btn-primary" onClick={updateScore}>Save Score</button>
            </div>
          </div>
        </div>
      </div>

      {user?.role === "admin" && (
        <button className="btn btn-primary rounded-circle position-fixed d-flex align-items-center justify-content-center"
          style={{ right: "16px", bottom: "16px", width: "52px", height: "52px", fontSize: "26px", zIndex: 1050 }} onClick={() => setShowForm(true)}
        >
          +</button>)}

      {showForm && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog ">
            <div className="modal-content">
              <form action="" onSubmit={addMatch}>
                <div className="modal-header">
                  <h4>Add match</h4>
                  <button type="button" className="btn-close" onClick={() => setShowForm(false)}></button>
                </div>

                <div className="modal-body">

                  {error && <div className="alert alert-danger">{error}</div>}

                  <div className="mb-3">
                    <label className="form-label">Competition</label>
                    <select className="form-select" name="competition" value={match.competition} onChange={handleChange}>
                      {COMPETITIONS.map(comp => (
                        <option key={comp} value={comp}>{comp}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Division</label>
                    <select className="form-select" name="gender" value={match.gender} onChange={handleChange}>
                      {GENDERS.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Stage only matters for Kenya Cup (groups + knockout) */}
                  {match.competition === "Kenya Cup" && (
                    <div className="mb-3">
                      <label className="form-label">Stage</label>
                      <select className="form-select" name="stage" value={match.stage} onChange={handleChange}>
                        <option value="Group">Group Stage</option>
                        <option value="Quarterfinal">Quarterfinal</option>
                        <option value="Semifinal">Semifinal</option>
                        <option value="Final">Final</option>
                      </select>
                    </div>
                  )}

                  <div className="mb-3">

                    <label className="form-label">Home Team</label>
                    <select className="form-select" name="team_home_id" value={match.team_home_id} onChange={handleChange}>
                      <option value="">Select Home Team</option>

                      {clubs.map(club => (<option key={club.id} value={club.id}>{club.name}</option>

                      ))}

                    </select>

                  </div>

                  <div className="mb-3">
                    <label className="form-label">Away Team</label>
                    <select className="form-select" name="team_away_id" value={match.team_away_id} onChange={handleChange}>

                      <option value="">Select Away Team</option>
                      {clubs.map(club => (<option key={club.id} value={club.id}>{club.name}</option>
                      ))}
                    </select>

                  </div>

                  <div className="mb-3">
                    <label className="form-label"> Match Date & Time</label>
                    <input type="datetime-local" name="match_date" value={match.match_date} onChange={handleChange} className="form-control" />

                  </div>

                  <div className="mb-3">
                    <label className="form-label">Location</label>

                    <input type="text" name="location" value={match.location} onChange={handleChange} className="form-control" />

                  </div>

                  <div className="mb-3">

                    <label className="form-label">Status</label>

                    <select className="form-select" name="status" value={match.status} onChange={handleChange}>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Live">Live</option>
                      <option value="Completed">Completed</option>
                      <option value="Postponed">Postponed</option>
                    </select>

                  </div>

                  {user?.role === "admin" && (
                    <button type="submit" className="btn btn-warning w-50 text-white">Add Match</button>
                  )}

                </div>

              </form>
            </div>

          </div>

        </div>

      )}

    </div>

  );

};

export default Schedule;