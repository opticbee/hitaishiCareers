// routes/company.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");

const router = express.Router();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// --- Table creation on server start (only once) ---
async function initCompanyTables() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id CHAR(36) PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        website VARCHAR(255),
        description TEXT,
        logo_url VARCHAR(500),
        contact_person VARCHAR(255),
        contact_phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id CHAR(36) PRIMARY KEY,
        company_id CHAR(36) NOT NULL,
        posted_by_email VARCHAR(255) NOT NULL,
        job_data JSON NOT NULL,   -- Store full job JSON from frontend
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        activated_at TIMESTAMP NULL,
        hired_at TIMESTAMP NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
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

    await conn.query(`
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

    console.log("✅ Company, Jobs, Applicants, Applications tables ensured.");
  } finally {
    conn.release();
  }
}
initCompanyTables();

// --- Routes ---

// Register company
router.post("/register", async (req, res) => {
  try {
    const { email, password, company_name, website, description, contact_person, contact_phone, address } = req.body;
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, saltRounds);

    await pool.query(
      `INSERT INTO companies (id, user_email, password_hash, company_name, website, description, contact_person, contact_phone, address) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, hashed, company_name, website, description, contact_person, contact_phone, address]
    );

    res.json({ success: true, company_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Company registration failed" });
  }
});

// Company login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query(`SELECT * FROM companies WHERE user_email = ?`, [email]);

    if (!rows.length) return res.status(404).json({ error: "Company not found" });
    const company = rows[0];
    const match = await bcrypt.compare(password, company.password_hash);

    if (!match) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ id: company.id, role: "company" }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, company_id: company.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
