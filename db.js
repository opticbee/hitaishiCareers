// db.js
const mysql = require("mysql");

// Create a connection pool
const pool = mysql.createPool({
  host: "localhost",     // Your DB host
  user: "root",          // Your DB user
  password: "2142",          // Your DB password
  database: "careers",   // Your DB name
});

// Function to query the database
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        return reject(err);
      }
      connection.query(sql, params, (error, results) => {
        connection.release(); // Release connection back to pool
        if (error) {
          return reject(error);
        }
        resolve(results);
      });
    });
  });
};

module.exports = { pool, query };
