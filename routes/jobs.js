// routes/jobs.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");

const router = express.Router();

// Post new job (company posts a job, include who posted via email)
router.post("/post", async (req, res) => {
  try {
    const { company_id, posted_by_email, job_data } = req.body;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO jobs (id, company_id, posted_by_email, job_data, status, activated_at) VALUES (?, ?, ?, ?, 'active', NOW())`,
      [id, company_id, posted_by_email, JSON.stringify(job_data)]
    );

    res.json({ success: true, job_id: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Job posting failed" });
  }
});

// Get all active jobs
router.get("/active", async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM jobs WHERE status = 'active' ORDER BY created_at DESC`);
    res.json({ jobs: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// Mark job as hired/inactive
router.patch("/:jobId/hire", async (req, res) => {
  try {
    const { jobId } = req.params;
    await pool.query(`UPDATE jobs SET status='inactive', hired_at=NOW(), updated_at=NOW() WHERE id=?`, [jobId]);
    res.json({ success: true, job_id: jobId, status: "inactive" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark job as hired" });
  }
});

// Reactivate job
router.patch("/:jobId/reactivate", async (req, res) => {
  try {
    const { jobId } = req.params;
    await pool.query(`UPDATE jobs SET status='active', activated_at=NOW(), updated_at=NOW(), hired_at=NULL WHERE id=?`, [jobId]);
    res.json({ success: true, job_id: jobId, status: "active" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reactivate job" });
  }
});

module.exports = router;
