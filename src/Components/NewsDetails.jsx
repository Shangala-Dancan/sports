import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";

const NewsDetails = () => {
  const { id } = useParams();
  const [news, setNews] = useState(null);

  const imgurl = "https://shangala.pythonanywhere.com/static/images/";

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await axios.get(
          `https://shangala.pythonanywhere.com/news/${id}`
        );
        setNews(res.data);
      } catch (error) {
        console.log(error);
      }
    };

    fetchNews();
  }, [id]);

  if (!news) return <h3 className="text-center mt-5">Loading...</h3>;

  return (
    <div className="container mt-4">
      <img
        src={imgurl + news.image}
        alt={news.title}
        style={{
          width: "100%",
          height: "500px",
          objectFit: "cover",
          borderRadius: "10px",
        }}
      />

      <h1 className="mt-4 fw-bold">{news.title}</h1>

      <div className="d-flex gap-3 text-muted mt-2">
        <span>{news.category}</span>
      </div>

      <p className="mt-4 fs-5" style={{ lineHeight: "1.8" }}>
        {news.content}
      </p>

      <p>{news.author}</p>
      <p>{new Date(news.publish_date).toLocaleString()}</p>
    </div>
  );
};

export default NewsDetails;