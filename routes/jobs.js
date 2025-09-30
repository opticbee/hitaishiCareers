// routes/jobs.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const { query } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// --- Authentication Middleware ---
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
        req.user = user;
        next();
    });
};


// --- Database Table Initialization with Migrations ---
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
        required_skills TEXT,
        additional_skills TEXT,
        country VARCHAR(100),
        state VARCHAR(100),
        city VARCHAR(100),
        zip_code VARCHAR(20),
        job_data JSON, /* This is legacy, will be removed by migration */
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);

    // Migration 1: Add initial salary fields
    const salaryMinCol = await query("SHOW COLUMNS FROM jobs WHERE Field = 'salary_min'");
    if (salaryMinCol.length === 0) {
      console.log("Schema migration needed: Adding salary fields to 'jobs' table.");
      await query(`
        ALTER TABLE jobs
        ADD COLUMN salary_min INT NULL,
        ADD COLUMN salary_max INT NULL,
        ADD COLUMN salary_currency VARCHAR(10) NULL,
        ADD COLUMN salary_period VARCHAR(20) NULL
      `);
      console.log("✅ Salary fields added to 'jobs' table successfully.");
    }
    
    // Migration 2: Add modern job fields and convert skills to JSON
    const jobTypeCol = await query("SHOW COLUMNS FROM jobs WHERE Field = 'job_type'");
    if (jobTypeCol.length === 0) {
        console.log("Schema migration started: Adding new fields and converting skill data...");
        await query(`
            ALTER TABLE jobs
            ADD COLUMN job_type VARCHAR(50) NULL,
            ADD COLUMN work_location VARCHAR(50) NULL,
            ADD COLUMN responsibilities TEXT NULL
        `);
        console.log(" -> Step 1/3: Added job_type, work_location, and responsibilities columns.");

        await query(`
            UPDATE jobs SET required_skills = CONCAT('["', REPLACE(TRIM(REPLACE(required_skills, ', ', ',')), ',', '","'), '"]')
            WHERE required_skills IS NOT NULL AND TRIM(required_skills) <> '' AND JSON_VALID(required_skills) = 0;
        `);
        await query(`
            UPDATE jobs SET additional_skills = CONCAT('["', REPLACE(TRIM(REPLACE(additional_skills, ', ', ',')), ',', '","'), '"]')
            WHERE additional_skills IS NOT NULL AND TRIM(additional_skills) <> '' AND JSON_VALID(additional_skills) = 0;
        `);
        console.log(" -> Step 2/3: Converted skill data to valid JSON strings.");
       
        await query(`
            ALTER TABLE jobs
            MODIFY COLUMN required_skills JSON NULL,
            MODIFY COLUMN additional_skills JSON NULL,
            DROP COLUMN job_data
        `);
        console.log(" -> Step 3/3: Changed skill columns to JSON type and removed old job_data column.");
        console.log("✅ Schema migration (job fields) completed successfully.");
    }

    // Migration 3: Add salary_period_count field for new feature
    const periodCountCol = await query("SHOW COLUMNS FROM jobs WHERE Field = 'salary_period_count'");
    if (periodCountCol.length === 0) {
        console.log("Schema migration needed: Adding 'salary_period_count' to 'jobs' table.");
        await query(`
            ALTER TABLE jobs
            ADD COLUMN salary_period_count INT DEFAULT 1 NULL
        `);
        console.log("✅ salary_period_count field added to 'jobs' table successfully.");
    }
    
    console.log("✅ jobs table is ready.");
  } catch (err) {
    console.error("❌ Error initializing jobs table:", err.message);
  }
})();

// Post a new job (Updated and Secured)
router.post("/post", authenticateToken, async (req, res) => {
  try {
    const company_id = req.user.id;
    const { 
        posted_by_name, posted_by_email, job_title, required_experience, 
        job_description, required_skills, additional_skills, country, 
        state, city, zip_code, salary_min, salary_max, 
        salary_currency, salary_period, salary_period_count, responsibilities, 
        job_type, work_location 
    } = req.body;
    
    console.log('Received job post data:', req.body);
    
    const id = uuidv4();
    await query(
      `INSERT INTO jobs (
          id, company_id, posted_by_name, posted_by_email, job_title, 
          required_experience, job_description, required_skills, 
          additional_skills, country, state, city, zip_code, 
          salary_min, salary_max, salary_currency, salary_period, salary_period_count,
          responsibilities, job_type, work_location, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
          id, company_id, posted_by_name, posted_by_email, job_title, 
          required_experience, job_description, JSON.stringify(required_skills || []), 
          JSON.stringify(additional_skills || []), country, state, city, zip_code, 
          salary_min || null, salary_max || null, salary_currency, salary_period, salary_period_count || 1,
          responsibilities, job_type, work_location
      ]
    );
    res.json({ success: true, job_id: id });
  } catch (err) {
    console.error("Job posting failed:", err);
    res.status(500).json({ error: "Job posting failed", message: err.message });
  }
});

// Get all active jobs (for public job boards)
router.get("/active", async (_req, res) => {
  try {
    const rows = await query(`SELECT j.*, c.company_name, c.logo_url FROM jobs j JOIN companies c ON j.company_id = c.id WHERE j.status='active' ORDER BY j.created_at DESC`);
    res.json({ jobs: rows });
  } catch (err) {
    console.error("Failed to fetch active jobs:", err.message, err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});


// GET all jobs for a specific company (for the dashboard)
router.get("/company/:companyId", authenticateToken, async (req, res) => {
    try {
        const { companyId } = req.params;
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
