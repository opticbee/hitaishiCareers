// db.js
const mysql = require("mysql");

// Create a connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: "localhost",
  user: "hitaishi_user",
  password: "HitaishiCareers",
  database: "hitaishicareers_db"
});

// Query helper
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) return reject(err);
      connection.query(sql, params, (error, results) => {
        connection.release();
        if (error) return reject(error);
        resolve(results);
      });
    });
  });
};

module.exports = { pool, query };
