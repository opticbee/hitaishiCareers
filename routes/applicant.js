const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db");

const router = express.Router();

// --- User Authentication Middleware (Session Based) ---
const authenticateUser = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.id && req.session.user.email) {
        req.user = req.session.user; // Attach user info from session
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
        const userId = req.user.id;
        const userEmail = req.user.email;

        if (!jobId) {
            return res.status(400).json({ error: "Job ID is required." });
        }

        const [existingApplication] = await query(
            `SELECT id FROM job_applications WHERE user_id = ? AND job_id = ?`,
            [userId, jobId]
        );
        if (existingApplication) {
            return res.status(409).json({ error: "You have already applied for this job." });
        }

        const [user] = await query('SELECT * FROM users WHERE email=?', [userEmail]);
        if (!user) {
            return res.status(404).json({ error: "Could not find your user profile to submit." });
        }
        
        const safeParse = (v) => {
          if (!v) return null;
          if (typeof v === 'object') return v;
          try { return JSON.parse(v); } catch (e) { return v; }
        };

        const profileSnapshot = {
          personalDetails: {
            fullName: user.full_name,
            email: user.email,
            phone: user.mobile_number,
            gender: user.gender,
            experienceLevel: user.experience_level,
            profilePhoto: user.profile_image_url || user.profile_image
          },
          professionalDetails: safeParse(user.professional_details),
          projects: safeParse(user.projects),
          skills: safeParse(user.skills),
          education: safeParse(user.education),
          certifications: safeParse(user.certifications),
          languages: safeParse(user.languages),
          resumeUrl: user.resume_url,
          ctc: {
            expected: user.ctc_expected
          },
          noticePeriod: user.notice_period
        };

        const [jobData] = await query(`SELECT company_id FROM jobs WHERE id = ?`, [jobId]);
        if (!jobData) {
            return res.status(404).json({ error: "Job not found. It may have been removed." });
        }
        const companyId = jobData.company_id;

        const applicationId = uuidv4();
        await query(
            `INSERT INTO job_applications (id, job_id, user_id, company_id, user_profile_snapshot) VALUES (?, ?, ?, ?, ?)`,
            [applicationId, jobId, userId, companyId, JSON.stringify(profileSnapshot)]
        );

        res.status(201).json({ success: true, message: "Application submitted successfully!", applicationId });

    } catch (err) {
        console.error("Application submission failed:", err);
        res.status(500).json({ error: "An internal server error occurred.", message: err.message });
    }
});

// --- Route to get all applications for a specific job ---
router.get("/:jobId", async (req, res) => {
    try {
        const { jobId } = req.params;
        const applications = await query(
            `SELECT user_profile_snapshot FROM job_applications WHERE job_id = ?`,
            [jobId]
        );
        
        // FIXED: The database driver is likely already parsing the JSON field.
        // We no longer need to call JSON.parse(). We just extract the object directly.
        const applicants = applications
            .map(app => app.user_profile_snapshot) // Directly use the object from the database
            .filter(Boolean); // Filter out any null or empty entries

        res.status(200).json({ success: true, applicants });

    } catch (err) {
        // This will now only catch database-level errors, not parsing errors.
        console.error("Failed to fetch applications:", err);
        res.status(500).json({ error: "An internal server error occurred.", message: err.message });
    }
});

module.exports = router;

