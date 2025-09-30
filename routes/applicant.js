const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");

const router = express.Router();

// --- User Authentication Middleware (Session Based) ---
const authenticateUser = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.id) {
        req.user = req.session.user; // Attach user info from session to the request object
        next();
    } else {
        res.status(401).json({ error: "User not authenticated. Please log in." });
    }
};

// --- Database Table Initialization ---
(async function initApplicationsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS job_applications (
        id CHAR(36) PRIMARY KEY,
        job_id CHAR(36) NOT NULL,
        user_id INT NOT NULL,
        company_id CHAR(36) NOT NULL,
        status ENUM('applied','viewed','shortlisted', 'rejected') DEFAULT 'applied',
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_profile_snapshot JSON,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    console.log("✅ job_applications table is ready.");
  } catch (err) {
    console.error("❌ Error initializing job_applications table:", err.message);
  }
})();

// --- Route to apply for a job ---
router.post("/apply", authenticateUser, async (req, res) => {
    try {
        const { jobId } = req.body;
        const userId = req.user.id; // From authenticateUser middleware

        if (!jobId) {
            return res.status(400).json({ error: "Job ID is required." });
        }

        // 1. Check if the user has already applied for this job
        const [existingApplication] = await query(
            `SELECT id FROM job_applications WHERE user_id = ? AND job_id = ?`,
            [userId, jobId]
        );
        if (existingApplication) {
            return res.status(409).json({ error: "You have already applied for this job." });
        }

        // 2. Fetch the user's full profile to create a snapshot
        const [userProfile] = await query(`SELECT * FROM users WHERE id = ?`, [userId]);
        if (!userProfile) {
            return res.status(404).json({ error: "User profile not found." });
        }
        // Remove sensitive info like password hash from the snapshot
        const { password_hash, ...profileSnapshot } = userProfile;

        // 3. Get the job's company_id
        const [jobData] = await query(`SELECT company_id FROM jobs WHERE id = ?`, [jobId]);
         if (!jobData) {
            return res.status(404).json({ error: "Job not found." });
        }
        const companyId = jobData.company_id;

        // 4. Create and insert the new application
        const applicationId = uuidv4();
        await query(
            `INSERT INTO job_applications (id, job_id, user_id, company_id, user_profile_snapshot) VALUES (?, ?, ?, ?, ?)`,
            [applicationId, jobId, userId, companyId, JSON.stringify(profileSnapshot)]
        );

        res.status(201).json({ success: true, message: "Application submitted successfully!", applicationId });

    } catch (err) {
        console.error("Application submission failed:", err);
        res.status(500).json({ error: "An internal server error occurred during application.", message: err.message });
    }
});

module.exports = router;

// IMPORTANT: Remember to add this new router to your main server file (e.g., server.js or app.js)
// Example:
// const jobApplicationsRoutes = require('./routes/jobApplications');
// app.use('/api/applications', jobApplicationsRoutes);
