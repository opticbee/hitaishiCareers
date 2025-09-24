// db.js
const mysql = require("mysql2");

// Create a connection pool with your database credentials
// It's recommended to use environment variables for these in production
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});


/**
 * A helper function to execute SQL queries with promises.
 * @param {string} sql The SQL query to execute.
 * @param {Array} params The parameters to pass to the query.
 * @returns {Promise<any>} A promise that resolves with the query results.
 */
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error("Error getting database connection:", err);
        return reject(err);
      }
      connection.query(sql, params, (error, results) => {
        connection.release(); // Always release the connection
        if (error) {
          console.error("Error executing query:", error);
          return reject(error);
        }
        resolve(results);
      });
    });
  });
};

module.exports = { pool, query };
