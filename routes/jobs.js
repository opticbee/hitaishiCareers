// routes/jobs.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");

const router = express.Router();

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
        job_data JSON,
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    console.log("✅ jobs table is ready.");
  } catch (err) {
    console.error("❌ Error creating jobs table:", err.message);
  }
})();

// Post a new job
router.post("/post", async (req, res) => {
  try {
    const { company_id, posted_by_name, posted_by_email, job_title, required_experience, job_description, required_skills, additional_skills, country, state, city, zip_code, job_data } = req.body;
    const id = uuidv4();
    await query(
      `INSERT INTO jobs (id, company_id, posted_by_name, posted_by_email, job_title, required_experience, job_description, required_skills, additional_skills, country, state, city, zip_code, job_data, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [id, company_id, posted_by_name, posted_by_email, job_title, required_experience, job_description, required_skills, additional_skills, country, state, city, zip_code, job_data ? JSON.stringify(job_data) : null]
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

// --- NEW ---
// GET all jobs for a specific company
router.get("/company/:companyId", async (req, res) => {
    try {
        const { companyId } = req.params;
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
