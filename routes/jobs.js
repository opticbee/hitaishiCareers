// routes/jobs.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const { query } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// --- Authentication Middleware ---
// This ensures only a logged-in company can post a job.
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ error: "No token provided." });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid or expired token." });
        }
        req.user = user; // The decoded user payload (e.g., { id: 'company-id', role: 'company' })
        next();
    });
};


// --- Database Table Initialization with New Salary Fields ---
(async function initJobsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id CHAR(36) PRIMARY KEY,
        company_id CHAR(36) NOT NULL,
        posted_by_name VARCHAR(255) NOT NULL,
        posted_by_email VARCHAR(255) NOT NULL,
        job_title VARCHAR(255) NOT NULL,
        required_experience VARCHAR(255),
        job_description TEXT NOT NULL,
        required_skills TEXT NOT NULL,
        additional_skills TEXT,
        country VARCHAR(100),
        state VARCHAR(100),
        city VARCHAR(100),
        zip_code VARCHAR(20),
        salary_min INT,
        salary_max INT,
        salary_currency VARCHAR(10),
        salary_period VARCHAR(20),
        job_data JSON,
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    console.log("✅ jobs table is ready with new salary fields.");
  } catch (err) {
    console.error("❌ Error creating jobs table:", err.message);
  }
})();

// Post a new job (Updated and Secured)
router.post("/post", authenticateToken, async (req, res) => {
  try {
    const company_id = req.user.id; // Get company_id from the authenticated token
    const { 
        posted_by_name, posted_by_email, job_title, required_experience, 
        job_description, required_skills, additional_skills, country, 
        state, city, zip_code, salary_min, salary_max, 
        salary_currency, salary_period, job_data 
    } = req.body;
    
    const id = uuidv4();
    await query(
      `INSERT INTO jobs (
          id, company_id, posted_by_name, posted_by_email, job_title, 
          required_experience, job_description, required_skills, 
          additional_skills, country, state, city, zip_code, 
          salary_min, salary_max, salary_currency, salary_period, 
          job_data, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
          id, company_id, posted_by_name, posted_by_email, job_title, 
          required_experience, job_description, required_skills, 
          additional_skills, country, state, city, zip_code, 
          salary_min || null, salary_max || null, salary_currency, salary_period, 
          job_data ? JSON.stringify(job_data) : null
      ]
    );
    res.json({ success: true, job_id: id });
  } catch (err) {
    console.error("Job posting failed:", err);
    res.status(500).json({ error: "Job posting failed" });
  }
});

// Get all active jobs (for public job boards)
router.get("/active", async (_req, res) => {
  try {
    const rows = await query(`SELECT * FROM jobs WHERE status='active' ORDER BY created_at DESC`);
    res.json({ jobs: rows });
  } catch (err) {
    console.error("Failed to fetch jobs:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// GET all jobs for a specific company (for the dashboard)
router.get("/company/:companyId", authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.params;
        // Security check: ensure the logged-in user is requesting their own jobs
        if (req.user.id !== companyId) {
            return res.status(403).json({ error: "Forbidden: You can only view your own company's jobs." });
        }
        const rows = await query(
            `SELECT * FROM jobs WHERE company_id = ? ORDER BY created_at DESC`,
            [companyId]
        );
        res.json({ jobs: rows });
    } catch (err) {
        console.error("Failed to fetch company jobs:", err);
        res.status(500).json({ error: "Failed to fetch company jobs" });
    }
});

module.exports = router;
