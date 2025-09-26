// routes/applicant.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");

const router = express.Router();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Applicant registration
router.post("/register", async (req, res) => {
  try {
    const { email, password, full_name, phone, resume_url, headline, skills } = req.body;
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO applicants (id, email, password_hash, full_name, phone, resume_url, headline, skills) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, hashed, full_name, phone, resume_url, headline, skills]
    );

    res.json({ success: true, applicant_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Applicant registration failed" });
  }
});

// Applicant login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query(`SELECT * FROM applicants WHERE email=?`, [email]);

    if (!rows.length) return res.status(404).json({ error: "Applicant not found" });
    const applicant = rows[0];
    const match = await bcrypt.compare(password, applicant.password_hash);

    if (!match) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ id: applicant.id, role: "applicant" }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, applicant_id: applicant.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Apply to a job
router.post("/apply", async (req, res) => {
  try {
    const { job_id, applicant_id, company_id, cover_letter, resume_url } = req.body;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO applications (id, job_id, applicant_id, company_id, cover_letter, resume_url, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'applied')`,
      [id, job_id, applicant_id, company_id, cover_letter, resume_url]
    );

    res.json({ success: true, application_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Application failed" });
  }
});

// Get applications for a specific applicant
router.get("/:applicantId/applications", async (req, res) => {
  try {
    const { applicantId } = req.params;
    const [rows] = await pool.query(`SELECT * FROM applications WHERE applicant_id=? ORDER BY applied_at DESC`, [applicantId]);
    res.json({ applications: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

module.exports = router;
