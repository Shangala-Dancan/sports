import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const DashBoard = () => {
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [clubs, setClubs] = useState([]);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);

  const imgurl = "http://127.0.0.1:5000/static/images/";

  const getDashboardData = async () => {
    try {
      const clubsRes = await axios.get("http://127.0.0.1:5000/api/get_club");
      const playersRes = await axios.get("http://127.0.0.1:5000/api/get_player");
      const matchesRes = await axios.get("http://127.0.0.1:5000/api/get_matches");
      const liveRes = await axios.get("http://127.0.0.1:5000/api/live_matches");

      setClubs(clubsRes.data);
      setPlayers(playersRes.data);
      setMatches(matchesRes.data);
      setLiveMatches(liveRes.data);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getDashboardData();

    const timer = setInterval(() => {
      axios.get("http://127.0.0.1:5000/api/live_matches").then((res) => {
        setLiveMatches(res.data);
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  // Group matches by date
  const groupedMatches = matches.reduce((acc, match) => {
    const dateObj = new Date(match.match_date);
    const dateKey = dateObj.toLocaleDateString("en-us", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push({ match, dateObj });
    return acc;
  }, {});

  // Generate date range
  const dateRangeStart = new Date("2026-06-03");
  const dateRangeEnd = new Date("2026-08-02");
  const dateRange = [];
  for (
    let dt = new Date(dateRangeStart);
    dt <= dateRangeEnd;
    dt.setDate(dt.getDate() + 1)
  ) {
    dateRange.push(new Date(dt));
  }

  // Scroll functions
  const handleScrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -300, behavior: "smooth" });
    }
  };

  const handleScrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 300, behavior: "smooth" });
    }
  };

  // Get today's date string for "Go to today"
  const todayStr = new Date().toLocaleDateString("en-us", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Function to scroll to today's date
  const handleGoToToday = () => {
    const element = document.getElementById(`date-header-${todayStr}`);
    if (element && scrollRef.current) {
      element.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
  };

  return (
    
    <div className="container-fluid">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mt-4 mb-2">
        <h2>Full Schedule</h2>
        <button className="btn btn-primary" onClick={handleGoToToday}>
          Go to today
        </button>
      </div>
      {/* Date Range Info */}
      <div className="text-center my-3">
        <p>03 Jun - 02 Aug 2026</p>
      </div>

      {/* Navigation arrows */}
      <div className="d-flex justify-content-center mb-2">
        <button className="btn btn-outline-secondary me-2" onClick={handleScrollLeft}>
          &lt; {/* Left arrow */}
        </button>
        <button className="btn btn-outline-secondary" onClick={handleScrollRight}>
          &gt; {/* Right arrow */}
        </button>
      </div>

      {/* Schedule container with horizontal scroll */}
      <div
        className="d-flex"
        style={{ overflowX: "auto", scrollBehavior: "smooth" }}
        ref={scrollRef}
      >
        {dateRange.map((date) => {
          const dateStr = date.toLocaleDateString("en-us", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const dateKey = dateStr;
          const matchesForDay = groupedMatches[dateKey] || [];
          const weekday = date.toLocaleDateString("en-us", { weekday: "short" });
          const dayNumber = date.getDate();
          const monthShort = date.toLocaleDateString("en-us", { month: "short" });

          return (
            <div
              key={dateKey}
              id={`date-header-${dateStr}`}
              style={{
                minWidth: "150px",
                marginRight: "10px",
                flex: "0 0 auto",
              }}
            >
              {/* Date Header */}
              <div className="text-center mb-2">
                <div className="btn btn-outline-warning">
                  <small className="text-secondary d-block">{weekday}</small>
                  <h5 className="m-0">{dayNumber}</h5>
                  <small className="d-block">{monthShort}</small>
                </div>
              </div>
              {/* Matches for the day */}
              {matchesForDay.length > 0 ? (
                matchesForDay.map(({ match }) => (
                  <div
                    key={match.id}
                    className="card mb-3 p-2"
                    style={{ minWidth: "150px" }}
                  >
                    <div className="d-flex align-items-center mb-2">
                      {/* Home team */}
                      <img
                        src={imgurl + match.home_logo}
                        alt={match.home_team}
                        style={{
                          height: "30px",
                          width: "30px",
                          objectFit: "cover",
                          borderRadius: "50%",
                          marginRight: "8px",
                        }}
                      />
                      <div>{match.team1}</div>
                    </div>
                    <div className="d-flex align-items-center mb-2">
                      <hr className="flex-grow-1" />
                      <small className="mx-2">VS</small>
                      <hr className="flex-grow-1" />
                    </div>
                    <div className="d-flex align-items-center">
                      {/* Away team */}
                      <img
                        src={imgurl + match.away_logo}
                        alt={match.away_team}
                        style={{
                          height: "30px",
                          width: "30px",
                          objectFit: "cover",
                          borderRadius: "50%",
                          marginRight: "8px",
                        }}
                      />
                      <div>{match.away_team}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted">No matches</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rest of your components (live matches, teams, etc.) can stay as before */}
    </div>
  );
};

export default DashBoard;