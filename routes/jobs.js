// routes/jobs.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");   // <-- use the query helper from db.js

const router = express.Router();

/**
 * Ensure the jobs table exists.
 * Uses query() so we don't manually handle connections.
 */
(async function initJobsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id CHAR(36) PRIMARY KEY,
        company_id CHAR(36) NOT NULL,
        posted_by_email VARCHAR(255) NOT NULL,
        job_data JSON NOT NULL,
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        activated_at TIMESTAMP NULL,
        hired_at TIMESTAMP NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    console.log("✅ jobs table ready");
  } catch (err) {
    console.error("❌ Error creating jobs table:", err.message);
  }
})();

/**
 * POST /api/jobs/post
 * Company posts a new job
 */
router.post("/post", async (req, res) => {
  try {
    const { company_id, posted_by_email, job_data } = req.body;
    const id = uuidv4();

    await query(
      `INSERT INTO jobs
       (id, company_id, posted_by_email, job_data, status, activated_at)
       VALUES (?, ?, ?, ?, 'active', NOW())`,
      [id, company_id, posted_by_email, JSON.stringify(job_data)]
    );

    res.json({ success: true, job_id: id });
  } catch (err) {
    console.error("Job posting failed:", err);
    res.status(500).json({ error: "Job posting failed" });
  }
});

/**
 * GET /api/jobs/active
 * Get all active jobs
 */
router.get("/active", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM jobs WHERE status='active' ORDER BY created_at DESC`
    );
    res.json({ jobs: rows });
  } catch (err) {
    console.error("Failed to fetch jobs:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

/**
 * PATCH /api/jobs/:jobId/hire
 * Mark a job as hired (set status to inactive)
 */
router.patch("/:jobId/hire", async (req, res) => {
  try {
    await query(
      `UPDATE jobs
       SET status='inactive', hired_at=NOW(), updated_at=NOW()
       WHERE id=?`,
      [req.params.jobId]
    );
    res.json({ success: true, job_id: req.params.jobId, status: "inactive" });
  } catch (err) {
    console.error("Failed to mark job as hired:", err);
    res.status(500).json({ error: "Failed to mark job as hired" });
  }
});

/**
 * PATCH /api/jobs/:jobId/reactivate
 * Reactivate a job (set status back to active)
 */
router.patch("/:jobId/reactivate", async (req, res) => {
  try {
    await query(
      `UPDATE jobs
       SET status='active', activated_at=NOW(), updated_at=NOW(), hired_at=NULL
       WHERE id=?`,
      [req.params.jobId]
    );
    res.json({ success: true, job_id: req.params.jobId, status: "active" });
  } catch (err) {
    console.error("Failed to reactivate job:", err);
    res.status(500).json({ error: "Failed to reactivate job" });
  }
});

module.exports = router;
