// routes/applicant.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");   // <-- use query() helper, not pool.getConnection()

const router = express.Router();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/**
 * Ensure the applicants & applications tables exist.
 * Uses query() so connections are automatically managed.
 */
(async function initApplicantTables() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS applicants (
        id CHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        phone VARCHAR(50),
        resume_url VARCHAR(500),
        headline VARCHAR(255),
        skills TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS applications (
        id CHAR(36) PRIMARY KEY,
        job_id CHAR(36) NOT NULL,
        applicant_id CHAR(36) NOT NULL,
        company_id CHAR(36) NOT NULL,
        cover_letter TEXT,
        resume_url VARCHAR(500),
        status ENUM('applied','shortlisted','rejected','hired') DEFAULT 'applied',
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);

    console.log("✅ applicants & applications tables ready");
  } catch (err) {
    console.error("❌ Error creating applicant tables:", err.message);
  }
})();

/**
 * POST /api/applicant/register
 * Register a new applicant
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, full_name, phone, resume_url, headline, skills } = req.body;
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, saltRounds);

    await query(
      `INSERT INTO applicants
       (id, email, password_hash, full_name, phone, resume_url, headline, skills)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, hashed, full_name, phone, resume_url, headline, skills]
    );

    res.json({ success: true, applicant_id: id });
  } catch (err) {
    console.error("Applicant registration failed:", err);
    res.status(500).json({ error: "Applicant registration failed" });
  }
});

/**
 * POST /api/applicant/login
 * Applicant login, returns JWT token
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const rows = await query(
      `SELECT * FROM applicants WHERE email=?`,
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: "Applicant not found" });

    const applicant = rows[0];
    const match = await bcrypt.compare(password, applicant.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ id: applicant.id, role: "applicant" }, JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({ success: true, token, applicant_id: applicant.id });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /api/applicant/apply
 * Applicant applies to a job
 */
router.post("/apply", async (req, res) => {
  try {
    const { job_id, applicant_id, company_id, cover_letter, resume_url } = req.body;
    const id = uuidv4();

    await query(
      `INSERT INTO applications
       (id, job_id, applicant_id, company_id, cover_letter, resume_url, status)
       VALUES (?, ?, ?, ?, ?, ?, 'applied')`,
      [id, job_id, applicant_id, company_id, cover_letter, resume_url]
    );

    res.json({ success: true, application_id: id });
  } catch (err) {
    console.error("Application failed:", err);
    res.status(500).json({ error: "Application failed" });
  }
});

/**
 * GET /api/applicant/:applicantId/applications
 * Get all applications for a specific applicant
 */
router.get("/:applicantId/applications", async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM applications WHERE applicant_id=? ORDER BY applied_at DESC`,
      [req.params.applicantId]
    );
    res.json({ applications: rows });
  } catch (err) {
    console.error("Failed to fetch applications:", err);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

module.exports = router;
