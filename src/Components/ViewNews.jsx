import React, { useEffect, useState } from "react";
import axios from "axios";
import './Dash.css';
import { useNavigate } from "react-router-dom";

const ViewNews = () => {
  const [news, setNews] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const imgurl = "http://127.0.0.1:5000/static/images/";
  const navigate=useNavigate();

  useEffect(() => {
    fetchNews();
  }, []);
  // check user
  const user=JSON.parse(localStorage.getItem("user"))

  const fetchNews = async () => {
    try {
      const res = await axios.get("http://127.0.0.1:5000/news");
      setNews(res.data || []);
    } catch (error) {
      console.log(error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();

    formData.append("title", e.target.title.value);
    formData.append("summary", e.target.summary.value);
    formData.append("content", e.target.content.value);
    formData.append("category", e.target.category.value);
    formData.append("author", e.target.author.value);
    formData.append("publish_date", e.target.publish_date.value);
    formData.append("status", e.target.status.value);

    if (e.target.image.files[0]) {
      formData.append("image", e.target.image.files[0]);
    }

    try {
      await axios.post("http://127.0.0.1:5000/add_news", formData);

      alert("News added successfully");

      fetchNews();

      e.target.reset();

      setShowForm(false); // ✅ close modal like Schedule
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="container-fluid mt-4">
      <div className="row">

  <div className="col-12 position-relative p-0">

    {/* Image */}
    <img
      src="/images/cor.png"
      alt=""
      className="img-cor w-100"
      style={{
        height: "550px",
        objectFit: "cover",
        borderRadius: "10px"
      }}
    />

    {/* Overlay */}
    <div
      className="img-cor-overlay d-flex flex-column justify-content-end justify-content-center align-items-center text-center"
      style={{position: "absolute", top: 0,left: 0,right: 0,bottom: 0,padding: "20px",color: "white",borderRadius: "10px",background:
        "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.1))",}}>
      <span className="badge bg-danger mb-2">KVL 2026</span>

      <h4 className="fw-bold"> KVL league hits semi finals best of 3 series</h4>
    </div>

  </div>

</div>

      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center">
        <h2>Latest Volleyball News</h2>
      </div>

      {/* NEWS LIST */}
      <div className="row justify-content-center">

      {news.length === 0 ? (
        <p>No news available</p>
      ) : (
        news.map((article) => (
          
           
          <div className="col-md-3" key={article.news_id} onClick={()=>navigate(`/newsdetails/${article.news_id}`)}>
         <div className="card text-white border-0 mb-4 position-relative overflow-hidden">

      {/* Image */}
      <img
        src={imgurl+article.image} className="card-img" alt={article.title} style={{ height: "600px", objectFit: "cover" }}/>

      {/* Gradient overlay */}
      <div className="card-img-overlay d-flex flex-column justify-content-end" style={{background:"linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.1))",}}
      >
        <span className="badge bg-danger mb-2">{article.category}</span>

        <h4 className="fw-bold">{article.title}</h4>

        <p className="small mb-1">{article.summary}</p>

        <small>{article.author} • {article.publish_date}</small>
      </div>
    </div>
    </div>
  
   
        ))
      )}



      {/* FLOATING + BUTTON (same as Schedule) */}

      {user?.role==="admin"&&(
      <button
        className="btn btn-primary rounded-circle position-fixed"
        style={{
          right: "30px",
          bottom: "30px",
          width: "60px",
          height: "60px",
          fontSize: "30px",
        }}
        onClick={() => setShowForm(true)}
      >
        +
      </button>
      )}

      {/* MODAL (same style as Schedule) */}
      {showForm && (
        <div
          className="modal fade show"
          style={{
            display: "block",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content">

              <form onSubmit={handleSubmit} encType="multipart/form-data">

                <div className="modal-header">
                  <h4>Add News</h4>

                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowForm(false)}
                  ></button>
                </div>

                <div className="modal-body">

                  <input
                    type="text"
                    name="title"
                    className="form-control mb-3"
                    placeholder="Title"
                    required
                  />

                  <textarea
                    name="summary"
                    className="form-control mb-3"
                    placeholder="Summary"
                  ></textarea>

                  <textarea
                    name="content"
                    className="form-control mb-3"
                    placeholder="Content"
                    rows="5"
                    required
                  ></textarea>

                  <input
                    type="text"
                    name="category"
                    className="form-control mb-3"
                    placeholder="Category"
                  />

                  <input
                    type="text"
                    name="author"
                    className="form-control mb-3"
                    placeholder="Author"
                  />

                  <input
                    type="datetime-local"
                    name="publish_date"
                    className="form-control mb-3"
                  />

                  <select
                    name="status"
                    className="form-select mb-3"
                  >
                    <option value="Published">Published</option>
                    <option value="Draft">Draft</option>
                  </select>

                  <input
                    type="file"
                    name="image"
                    className="form-control"
                    accept="image/*"
                  />

                </div>

                <div className="modal-footer">

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowForm(false)}
                  >
                    Close
                  </button>

                  <button
                    type="submit"
                    className="btn btn-success"
                  >
                    Save News
                  </button>

                </div>

              </form>

            </div>
          </div>
          
        </div>
      )}
    </div>
    </div>
  );
};

export default ViewNews;