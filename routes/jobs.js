// routes/jobs.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");
// FIX: Import the correct middleware for employer routes
const { protectEmployerRoute } = require('../middleware/authMiddleware');

const router = express.Router();

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
        required_skills JSON,
        additional_skills JSON,
        country VARCHAR(100),
        state VARCHAR(100),
        city VARCHAR(100),
        zip_code VARCHAR(20),
        industry VARCHAR(100) NULL,
        salary_min INT NULL,
        salary_max INT NULL,
        salary_currency VARCHAR(10) NULL,
        salary_period VARCHAR(20) NULL,
        salary_period_count INT DEFAULT 1 NULL,
        job_type VARCHAR(50) NULL,
        work_location VARCHAR(50) NULL,
        responsibilities TEXT NULL,
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    // NOTE: Migrations from original file are kept for compatibility but are consolidated into the CREATE TABLE statement above for new setups.
    console.log("✅ jobs table is ready.");
  } catch (err) {
    console.error("❌ Error initializing jobs table:", err.message);
  }
})();

// Post a new job (Updated and Secured)
// FIX: Use the employer-specific middleware to protect this route
router.post("/post", protectEmployerRoute, async (req, res) => {
  try {
    // req.user is populated by the protectEmployerRoute middleware
    const company_id = req.user.id;
    const { 
        posted_by_name, posted_by_email, job_title, required_experience, 
        job_description, required_skills, additional_skills, country, 
        state, city, zip_code, salary_min, salary_max, 
        salary_currency, salary_period, salary_period_count, responsibilities, 
        job_type, work_location, industry
    } = req.body;
    
    const id = uuidv4();
    await query(
      `INSERT INTO jobs (
          id, company_id, posted_by_name, posted_by_email, job_title, 
          required_experience, job_description, required_skills, 
          additional_skills, country, state, city, zip_code, 
          salary_min, salary_max, salary_currency, salary_period, salary_period_count,
          responsibilities, job_type, work_location, status, industry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
          id, company_id, posted_by_name, posted_by_email, job_title, 
          required_experience, job_description, JSON.stringify(required_skills || []), 
          JSON.stringify(additional_skills || []), country, state, city, zip_code, 
          salary_min || null, salary_max || null, salary_currency, salary_period, salary_period_count || 1,
          responsibilities, job_type, work_location, industry
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


// NEW: Endpoint to get data for browse filters
router.get("/browse-data", async (_req, res) => {
  try {
    const skillsQuery = await query("SELECT required_skills FROM jobs WHERE status='active' AND JSON_VALID(required_skills) AND JSON_LENGTH(required_skills) > 0");
    const allSkillsArrays = skillsQuery.map(row => row.required_skills);
    const flatSkills = [].concat(...allSkillsArrays);
    const uniqueSkills = [...new Set(flatSkills)].slice(0, 20);

    const locationsQuery = await query("SELECT DISTINCT city FROM jobs WHERE status='active' AND city IS NOT NULL AND city != '' ORDER BY city ASC LIMIT 15");
    const uniqueLocations = locationsQuery.map(row => row.city);

    const industriesQuery = await query("SELECT DISTINCT industry FROM jobs WHERE status='active' AND industry IS NOT NULL AND industry != '' ORDER BY industry ASC LIMIT 15");
    const uniqueIndustries = industriesQuery.map(row => row.industry);
    
    const rolesQuery = await query("SELECT job_title, COUNT(*) as count FROM jobs WHERE status='active' AND job_title IS NOT NULL AND job_title != '' GROUP BY job_title ORDER BY count DESC LIMIT 15");
    const uniqueRoles = rolesQuery.map(row => row.job_title);

    const companiesQuery = await query("SELECT c.company_name, COUNT(j.id) as job_count FROM jobs j JOIN companies c ON j.company_id = c.id WHERE j.status='active' AND c.company_name IS NOT NULL AND c.company_name != '' GROUP BY c.company_name ORDER BY job_count DESC LIMIT 15");
    const uniqueCompanies = companiesQuery.map(row => row.company_name);

    res.json({
      skills: uniqueSkills,
      locations: uniqueLocations,
      industries: uniqueIndustries,
      roles: uniqueRoles,
      companies: uniqueCompanies
    });
  } catch (err) {
    console.error("Failed to fetch browse data:", err);
    res.status(500).json({ error: "Failed to fetch browse data" });
  }
});


// Get a single job by ID (for application page)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [job] = await query(`
      SELECT j.*, c.company_name, c.logo_url 
      FROM jobs j 
      JOIN companies c ON j.company_id = c.id 
      WHERE j.id = ? AND j.status = 'active'
    `, [id]);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found or is no longer active." });
    }
    
    res.json({ job });
  } catch (err) {
    console.error(`Failed to fetch job with id ${req.params.id}:`, err.message, err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});


// GET all jobs for a specific company (for the dashboard)
// FIX: Use the employer-specific middleware to protect this route
router.get("/company/:companyId", protectEmployerRoute, async (req, res) => {
    try {
        const { companyId } = req.params;
        // Security check: ensure the authenticated employer can only access their own jobs
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

// GET all ACTIVE jobs for a specific company (for public employers page)
router.get("/by-company/:companyId", async (req, res) => {
    try {
        const { companyId } = req.params;
        const jobs = await query(
            `SELECT * FROM jobs WHERE company_id = ? AND status = 'active' ORDER BY created_at DESC`,
            [companyId]
        );
        res.json({ jobs });
    } catch (err) {
        console.error("Failed to fetch public company jobs:", err);
        res.status(500).json({ error: "Failed to fetch company jobs" });
    }
});

module.exports = router;
