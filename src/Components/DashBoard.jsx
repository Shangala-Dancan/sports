import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import './Dash.css';

const DashBoard = () => {
  const navigate = useNavigate();
  const scrollRef = useRef(null); // Ref for the date header container
  const [clubs, setClubs] = useState([]);
  const [, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [, setLiveMatches] = useState([]);
  const [news, setNews] = useState([]);

  const imgurl = "https://shangala.pythonanywhere.com/static/images/";

   // ✅ FETCH NEWS
  const fetchNews = async () => {
    try {
      const res = await axios.get("https://shangala.pythonanywhere.com/news");
      setNews(res.data || []);
    } catch (error) {
      console.log(error);
    }
  };
  // Fetch dashboard data
  const getDashboardData = async () => {
    try {
      const clubsRes = await axios.get("https://shangala.pythonanywhere.com/api/get_club");
      const playersRes = await axios.get("https://shangala.pythonanywhere.com/api/get_player");
      const matchesRes = await axios.get("https://shangala.pythonanywhere.com/api/get_matches");
      const liveRes = await axios.get("https://shangala.pythonanywhere.com/api/live_matches");
      setClubs(clubsRes.data);
      setPlayers(playersRes.data);
      setMatches(matchesRes.data);
      setLiveMatches(liveRes.data);
    } catch (error) {
      console.log(error);
    }
  };
// ✅ ALL USEEFFECTS TOGETHER
  useEffect(() => {
    getDashboardData();
    fetchNews();

    const timer = setInterval(() => {
      axios
        .get("https://shangala.pythonanywhere.com/api/live_matches")
        .then((res) => setLiveMatches(res.data));
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
  const dateRangeEnd = new Date("2027-08-02");
  const dateRange = [];
  for (
    let dt = new Date(dateRangeStart);
    dt <= dateRangeEnd;
    dt.setDate(dt.getDate() + 1)
  ) {
    dateRange.push(new Date(dt));
  }

  // Set today's date as the initial selected date
  const todayStr = new Date().toLocaleDateString("en-us", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Function to scroll the date headers container to a specific date header
  const handleGoToDate = (dateStr) => {
    const element = document.getElementById(`date-header-${dateStr}`);
    if (element && scrollRef.current) {
      const container = scrollRef.current;
      const offsetLeft = element.offsetLeft - container.offsetLeft;
      container.scrollTo({ left: offsetLeft, behavior: "smooth" });
      setSelectedDate(dateStr);
    }
  };

  // Scroll to today's date when component loads
  useEffect(() => {
    // Delay to ensure DOM elements are rendered
    const timeoutId = setTimeout(() => {
      handleGoToDate(todayStr);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [todayStr]);

  // Handle date header click
  const handleDateClick = (date) => {
    const dateStr = date.toLocaleDateString("en-us", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    handleGoToDate(dateStr);
  };

  const matchesForSelectedDay = groupedMatches[selectedDate] || [];

  // Navigation functions for arrows
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
   // check if set is complete
            const isSetComplete = (homeScore, awayScore, setNumber) => {
  const targetScore = setNumber === 5 ? 15 : 25; // Adjust if needed
  return (
    (homeScore >= targetScore || awayScore >= targetScore) &&
    Math.abs(homeScore - awayScore) >= 2
  );
};

  // Small badge shown on each match card so it's clear at a glance which
  // competition a fixture belongs to (e.g. "KVL" vs "Kenya Cup"). Knockout
  // stages (Quarterfinal/Semifinal/Final) get their stage appended too,
  // since "Kenya Cup" alone doesn't say much about a knockout fixture.
  const competitionBadgeColor = (competition) => {
    switch (competition) {
      case "Kenya Cup": return "danger";
      case "KVL": return "warning";
      default: return "secondary";
    }
  };

  const competitionBadgeLabel = (match) => {
    if (match.competition === "Kenya Cup" && match.stage && match.stage !== "Group") {
      return `${match.competition} \u2022 ${match.stage}`;
    }
    return match.competition || "KVL";
  };

const featured = news.length > 0 ? news[0] : null;
const others = news.length > 1 ? news.slice(1, 7) : [];


const scrollContainerRef = useRef(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -200, // Adjust the scroll amount
        behavior: 'smooth',
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 200, // Adjust the scroll amount
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="container-fluid m-3">
      {/* Stats Cards */}
      <div className="row mt-4 g-3">
        {/* Example: Teams Card */}
       <div
  className="col-md-12 position-relative"
  style={{ overflow: "hidden", borderRadius: "15px" }}
>
  <img
    src="images/log2.jpg"
    alt=""
    style={{
      height: "600px",
      width: "100%",
      objectFit: "cover",
    }}
  />

  {/* Dark shadow overlay */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "linear-gradient(to right, rgba(0,0,0,0.75), rgba(0,0,0,0.35), rgba(0,0,0,0.15))",
      boxShadow: "inset 0 0 150px rgba(0,0,0,0.5)",
    }}
  ></div>

  {/* Content */}
  <div
    className="position-absolute top-50 start-0 translate-middle-y text-white px-5"style={{ zIndex: 2 }}>
    <h1 className="display-2 text-shadow fw-bold">KVL 2026</h1>
  <p className="fs-4 text-light opacity-75">Kenya's Premier Volleyball League</p>

  <button className="btn btn-warning btn-lg mt-3" onClick={()=>navigate("/schedule")}>View Fixtures</button>
   
  </div>
</div>
        {/* Add other stats cards as needed */}
      </div>

      {/* Schedule Section */}
      <div className="container-fluid">
        {/* Header & "Go to Latest" Button */}
        <div className="d-flex justify-content-between align-items-center mt-4 mb-2">
          <h2>Full Schedule</h2>
        </div>
        
        
        {/* Date Headers Scroll Container */}
        <div className="row justify-content-center">
         

        <div className="col-md-8 d-flex">
           <button className=" me-2 bg-warning border-0" onClick={handleScrollLeft} style={{borderRadius:"50%",width:"50px",height:"50px",alignItems:"center",justifyContent:"center",display:"flex",marginTop:"30px"}}>
            &lt;
          </button>
        <div className="d-flex  custom-scrollbar" style={{overflowX: "auto",scrollBehavior: "smooth", maxWidth: "640px", }} ref={scrollRef}>
          {dateRange.map((date) => {
            const dateStr = date.toLocaleDateString("en-us", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            });
            const weekday = date.toLocaleDateString("en-us", { weekday: "short" });
            const dayNumber = date.getDate();
            const monthShort = date.toLocaleDateString("en-us", { month: "short" });
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;

           
            return (
              <div  key={dateStr}id={`date-header-${dateStr}`} style={{marginRight: "10px",
                  flex: "0 0 auto",cursor: "pointer",border: isSelected? "2px solid yellow": isToday? "2px dashed #28a745": "none",borderRadius: "4px",
                  backgroundColor: isSelected ? "yellow" : "transparent",
                }}
                onClick={() => handleDateClick(date)}
              >
                <div className="text-center mb-2 p-2">
                  <div className="btn btn-outline-warning">
                    <small className="text-secondary d-block">{weekday}</small>
                    <h5 className="m-0">{dayNumber}</h5>
                    <small className="d-block">{monthShort}</small>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          <button className=" me-2 bg-warning border-0"style={{borderRadius:"50%",width:"50px",height:"50px",alignItems:"center",justifyContent:"center",display:"flex",marginTop:"30px"}} onClick={handleScrollRight}>
            &gt;
          </button>
          </div>
        </div>
      </div>

      {/* Matches for Selected Day */}
      <div className="mt-4 ">
        {matchesForSelectedDay.length > 0 ? (
          matchesForSelectedDay.map(({ match }) => (
            <div
              key={match.id}
              className="card mb-3 p-2 bg-transparent border-0 "
              style={{ minWidth: "150px" }}
            >
              <div className="row" style={{background:"transparent"}}>
                <hr />
                <div className="col-md-5 ">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className={`badge bg-${competitionBadgeColor(match.competition)}`}>
                      {competitionBadgeLabel(match)}
                    </span>
                  </div>
                  <div className="d-flex">
                    {/* home team */}
                    <div className="d-flex gap-1" style={{minWidth:"200px"}}>                    
                      <img src={imgurl+match.home_logo} alt="" style={{width:"40px",height:"40px",borderRadius:"50%"}}/>
                    <h4 className="p-2">{match.home_team}</h4>
                    </div>

                    {/* set score */}
                    {match.status==="Live"&&(
                    <div className="d-flex mx-3">
                      <p className="ms-2 me-3 p-2">{match.set1_home}</p>
                      {isSetComplete(match.set1_home,match.set1_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set2_home}</p>
                        </>

                      )}
                      {isSetComplete(match.set2_home,match.set2_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set3_home}</p>
                        </>

                      )}
                      {isSetComplete(match.set3_home,match.set3_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set4_home}</p>
                        </>

                      )}
                      {isSetComplete(match.set4_home,match.set4_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set5_home}</p>
                        </>

                      )}
                    </div>
                    )}
                  </div>
                  <div className="d-flex ">
                  <hr className="flex-grow-1"/>
                  <h4 className="fw-bold">{new Date(match.match_date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</h4>
                  </div>
                  {/* away team */}
                  <div className="d-flex">
                    <div className="d-flex gap-1" style={{minWidth:"200px"}}>
                    <img src={imgurl+match.away_logo} alt="" style={{width:"40px",height:"40px",borderRadius:"50%"}}/>
                    <h4 className="p-2">{match.away_team}</h4>
                    </div>
                    {/* set score */}
                    {match.status==="Live"&&(
                    <div className="d-flex mx-3">
                      <p className="ms-2 me-3 p-2">{match.set1_away}</p>
                      {isSetComplete(match.set1_home,match.set1_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set2_away}</p>
                        </>

                      )}
                      {isSetComplete(match.set2_home,match.set2_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set3_away}</p>
                        </>

                      )}
                      {isSetComplete(match.set3_home,match.set3_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set4_away}</p>
                        </>

                      )}
                      {isSetComplete(match.set4_home,match.set4_away,1)&&(
                        <>
                        <p className="me-3 p-2">{match.set5_away}</p>
                        </>

                      )}
                    </div>
                    )}

                  </div>


                </div>
                <div className="bg-secondary"></div>
              </div>
              
            </div>
          ))
        ) : (
          <div className="text-center text-muted">No matches</div>
        )}
      </div>
 {/* news */}
{news.length > 0 && news[0] && (
  <div className="mt-3">
    <div className="d-flex justify-content-between align-items-center mb-3">
    <h2 className="fw-bold mb-0">Latest News</h2>
    <button className="btn btn-outline-warning me-3" onClick={()=>navigate("/viewnews")}>
      View All
    </button>
  </div>
    
    

    {/* Horizontal scroll container */}
    <div  className="card border-0"  ref={scrollContainerRef}  style={{ overflowX: "auto", whiteSpace: "nowrap", scrollBehavior: "smooth",}}>
  <div className="d-flex flex-nowrap border-0">
        {news.slice(0).map((item) => (
          <div key={item.news_id} onClick={()=>navigate(`/newsdetails/${item.news_id}`)} style={{minWidth: "320px",maxWidth: "320px", flex: "0 0 auto",marginRight: "20px",borderRadius: "16px",overflow: "hidden",background: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",    cursor: "pointer",transition: "transform 0.3s ease, box-shadow 0.3s ease",}}onMouseEnter={(e) => {e.currentTarget.style.transform = "translateY(-6px)";e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.18)";}}onMouseLeave={(e) => {e.currentTarget.style.transform = "translateY(0)";e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";}}>
            <div style={{ position: "relative", height: "420px",overflow: "hidden",}}>
    <img src={imgurl + item.image}  alt={item.title} style={{width: "100%", height: "100%",objectFit: "cover",}}/>

    {/* Dark gradient */}
    <div style={{position: "absolute",inset: 0,background:"linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.1), transparent)",}}/>
    {/* Category */}
    <span style={{ position: "absolute", top: "15px", left: "15px",background: "#e30613",color: "#fff",padding: "6px 12px", borderRadius: "20px",fontSize: "12px", fontWeight: "600",textTransform: "uppercase",}}>
      {item.category}
    </span>

    {/* Title */}
    <div style={{position: "absolute",bottom: "20px",left: "20px",right: "20px",color: "#fff",}}>
      <h5 style={{  margin: 0,  fontWeight: "700", lineHeight: "1.4",fontSize: "22px",}}>{item.title}</h5>
    </div>
  </div>
</div>
        ))}
      </div>
    </div>
<div className="d-flex justify-content-center align-items-center gap-3 my-4">
  <button onClick={scrollLeft}className="btn"style={{width: "50px",height: "50px",borderRadius: "50%",background: "#fff",border: "1px solid #ddd",boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
      fontSize: "22px",fontWeight: "bold",transition: "0.3s",}}onMouseEnter={(e) => {e.currentTarget.style.background = "#ffc107";e.currentTarget.style.transform = "scale(1.1)";}}onMouseLeave={(e) => {e.currentTarget.style.background = "#fff";e.currentTarget.style.transform = "scale(1)";}}>
    &#10094;
  </button>

  <button
    onClick={scrollRight}className="btn"style={{width: "50px",height: "50px",borderRadius: "50%",background: "#fff",border: "1px solid #ddd",boxShadow: "0 4px 10px rgba(0,0,0,0.12)",fontSize: "22px",fontWeight: "bold",transition: "0.3s",}}onMouseEnter={(e) => {e.currentTarget.style.background = "#ffc107";e.currentTarget.style.transform = "scale(1.1)";}}onMouseLeave={(e) => {e.currentTarget.style.background = "#fff";e.currentTarget.style.transform = "scale(1)";}}>
    &#10095;
  </button>
</div>
       
  </div>
)}
{/* TEAMS */}

<div className="container mt-5 mb-5 ">
<h3>Teams</h3>
<div className="row">

{clubs.map(club=>(
<div className="col-md-1 col-sm-6 mb-3 me-4" key={club.id}onClick={()=>navigate(`/club/${club.id}`)}style={{cursor:"pointer"}}>
<div className="card text-center p-6 bg-transparent border-0">
<img src={imgurl+club.logo}alt={club.name}style={{height:"100px",width:"100px",objectFit:"cover",borderRadius:"50%",margin:"auto"}}/>

<h6 className="mt-3">

{club.name}

</h6>
</div>
</div>



))


}
</div>
</div>
</div>
)
}
export default DashBoard;