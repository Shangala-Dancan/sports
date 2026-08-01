import React, { useEffect, useState,useCallback  } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";

const ClubDetails = () => {
  const { id } = useParams();

  const [club, setClub] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState("");

  const imgurl = "https://shangala.pythonanywhere.com/static/images/";

  // Get club details
  const getClub = useCallback(async () => {
  try {
    setLoading("Loading club details...");

    const response = await axios.get(
      `https://shangala.pythonanywhere.com/api/get_club/${id}`
    );

    setClub(response.data);
    setLoading("");
  } catch (error) {
    console.log(error);
    setLoading("");
  }
}, [id]);

  // Get club players
  const getPlayers = useCallback(async () => {
  try {
    const response = await axios.get(
      `https://shangala.pythonanywhere.com/api/club_players/${id}`
    );

    setPlayers(response.data);
  } catch (error) {
    console.log(error);
  }
}, [id]);

  useEffect(() => {
    getClub();
    getPlayers();
  }, [getClub, getPlayers]);

  if (loading) {
    return (
      <div className="container mt-5">
        <h3 className="text-center">{loading}</h3>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="container mt-5">
        <h3 className="text-center text-danger">
          Club not found
        </h3>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="card shadow">
        <div className="card-body">
          <div className="text-center mb-4">
            <img
              src={`${imgurl}${club.logo}`}
              alt={club.name}
              className="img-fluid rounded"
              style={{
                width: "200px",
                height: "200px",
                objectFit: "cover",
              }}
            />
          </div>

          <h1 className="text-center mb-4">
            {club.name}
          </h1>

          <div className="row">
            <div className="col-md-6">
              <h5>Description</h5>
              <p>{club.description}</p>
            </div>

            <div className="col-md-6">
              <h5>Location</h5>
              <p>{club.location}</p>
            </div>
          </div>

          <div className="row mt-3">
            <div className="col-md-6">
              <h5>Foundation Date</h5>
              <p>{club.foundation_date}</p>
            </div>

            <div className="col-md-6">
              <h5>Contact Information</h5>
              <p>{club.contact_info}</p>
            </div>
          </div>

          <hr />

          <h3 className="mb-3">Players</h3>

          <div className="table-responsive">
            <table className="table table-striped table-hover">
              <thead className="table-secondary">
                <tr>
                  <th>Photo</th>
                  <th>Name</th>
                  <th>Age</th>
                  <th>Position</th>
                  <th>Stats</th>
                </tr>
              </thead>

              <tbody>
                {players.length > 0 ? (
                  players.map((player) => (
                    <tr key={player.id}>
                      <td>
                        {player.profile_image && (
                          <img
                            src={`${imgurl}${player.profile_image}`}
                            alt={player.name}
                            width="50"
                            height="50"
                            style={{
                              objectFit: "cover",
                              borderRadius: "50%",
                            }}
                          />
                        )}
                      </td>

                      <td>{player.name}</td>
                      <td>{player.age}</td>
                      <td>{player.position}</td>
                      <td>{player.stats}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      className="text-center"
                    >
                      No players found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClubDetails;