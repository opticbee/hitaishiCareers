// routes/company.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");   // <-- use the query helper, not pool.getConnection()

const router = express.Router();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";


(async function initCompanyTable() {
  try {
    await query(`
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
    console.log("✅ companies table ready");
  } catch (err) {
    console.error("❌ Error creating companies table:", err.message);
  }
})();

/**
 * POST /api/company/register
 * Register a new company account
 */
router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      company_name,
      website,
      description,
      contact_person,
      contact_phone,
      address
    } = req.body;

    const id = uuidv4();
    const hashed = await bcrypt.hash(password, saltRounds);

    await query(
      `INSERT INTO companies
       (id, user_email, password_hash, company_name, website, description,
        contact_person, contact_phone, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, hashed, company_name, website, description,
       contact_person, contact_phone, address]
    );

    res.json({ success: true, company_id: id });
  } catch (err) {
    console.error("Company registration failed:", err);
    res.status(500).json({ success: false, error: "Company registration failed" });
  }
});

/**
 * POST /api/company/login
 * Company login, returns JWT token
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const rows = await query(
      `SELECT * FROM companies WHERE user_email = ?`,
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: "Company not found" });

    const company = rows[0];
    const match = await bcrypt.compare(password, company.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ id: company.id, role: "company" }, JWT_SECRET, {
      expiresIn: "7d"
    });

    res.json({ success: true, token, company_id: company.id });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
