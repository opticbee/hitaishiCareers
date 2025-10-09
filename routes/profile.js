// routes/profile.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    v4: uuidv4
} = require('uuid');
const {
    query
} = require('../db');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer storage setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + unique + path.extname(file.originalname));
    }
});
const upload = multer({
    storage
});

// Middleware
router.use(express.json());
router.use(express.urlencoded({
    extended: true
}));

// NOTE: The database schema setup logic has been moved to register.js
// to centralize it and prevent errors. It has been removed from this file.

// --- Get profile (by session/email) ---
router.get('/profile', async (req, res) => {
    try {
        // Use the email from the session if available, otherwise check query params.
        const userEmail = req.user.email;
        if (!userEmail) return res.status(401).json({
            error: 'Not logged in or user email not provided'
        });

        const rows = await query('SELECT * FROM users WHERE email=?', [userEmail]);
        if (!rows.length) return res.status(404).json({
            error: 'User not found'
        });

        res.json(rows[0]);
    } catch (err) {
        console.error("❌ Error fetching profile:", err);
        res.status(500).json({
            error: 'Server error while fetching profile'
        });
    }
});


// GET /api/profile/full
router.get('/full', async (req, res) => {
  try {
    // The 'protectRoute' middleware has already verified the user.
    // We get the email directly from req.user.
    const userEmail = req.user.email;
    if (!userEmail) return res.status(401).json({ error: 'Authentication error' });

    const rows = await query('SELECT * FROM users WHERE email=?', [userEmail]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];

    const safeParse = (v) => {
      if (!v) return [];
      if (typeof v === 'object') return v;
      try { return JSON.parse(v); } catch (e) { return []; }
    };
    
    // Also include basic user info from req.user for consistency
    const payload = {
      personalDetails: {
        fullName: u.full_name || req.user.fullName || '',
        email: u.email || req.user.email || '',
        phone: u.mobile_number || '',
        gender: u.gender || '',
        experienceLevel: u.experience_level || '',
        ctcExpected: u.ctc_expected || '',
        profilePhoto: u.profile_image_url || null
      },
      professionalDetails: safeParse(u.professional_details),
      projects: safeParse(u.projects),
      skills: safeParse(u.skills),
      education: safeParse(u.education),
      certifications: safeParse(u.certifications),
      languages: safeParse(u.languages),
      resume: u.resume_url ? { name: path.basename(u.resume_url), url: u.resume_url } : null,
      noticePeriod: u.notice_period || null,
      profile_uuid: u.profile_uuid || null
    };

    res.json(payload);
  } catch (err) {
    console.error('❌ Error in /api/profile/full:', err);
    res.status(500).json({ error: 'Server error while fetching full profile' });
  }
});

// Unified update route (now uses req.user)
router.post('/update', upload.single('profilePhoto'), async (req, res) => {
  try {
    const email = req.user.email;
    if (!email) return res.status(401).json({ error: 'Not authenticated' });

    // ... (rest of the update logic remains the same) ...
    const updates = {};
    if (req.body.fullName) updates.full_name = req.body.fullName;
    if (req.body.phone) updates.mobile_number = req.body.phone;
    if (req.body.gender) updates.gender = req.body.gender;
    if (req.body.experienceLevel) updates.experience_level = req.body.experienceLevel;
    if (req.body.ctcExpected) updates.ctc_expected = req.body.ctcExpected;
    if (req.body.noticePeriod) updates.notice_period = req.body.noticePeriod;
    const jsonFieldToString = (val) => {
      if (!val) return null;
      return typeof val === 'string' ? val : JSON.stringify(val);
    };
    if (req.body.professionalDetails) updates.professional_details = jsonFieldToString(req.body.professionalDetails);
    if (req.body.projects) updates.projects = jsonFieldToString(req.body.projects);
    if (req.body.skills) updates.skills = jsonFieldToString(req.body.skills);
    if (req.body.education) updates.education = jsonFieldToString(req.body.education);
    if (req.body.certifications) updates.certifications = jsonFieldToString(req.body.certifications);
    if (req.body.languages) updates.languages = jsonFieldToString(req.body.languages);
    if (req.file) {
      updates.profile_image_url = `/uploads/${req.file.filename}`;
    }
    updates.profile_uuid = uuidv4();

    if (Object.keys(updates).length) {
      const fields = Object.keys(updates).map(k => `${k}=?`).join(',');
      const values = [...Object.values(updates), email];
      await query(`UPDATE users SET ${fields} WHERE email = ?`, values);
    }
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('❌ Error updating profile:', err);
    res.status(500).json({ error: 'Server error while updating profile' });
  }
});

// --- Upload resume ---
// Upload resume route (now uses req.user)
router.post('/upload-resume', upload.single('resume'), async (req, res) => {
    try {
        const userEmail = req.user.email;
        if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });

        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded.' });
        }

        const resumeUrl = `/uploads/${req.file.filename}`;
        await query('UPDATE users SET resume_url=?, profile_uuid=? WHERE email=?', [resumeUrl, uuidv4(), userEmail]);

        res.json({ message: 'Resume uploaded successfully', url: resumeUrl });
    } catch (err) {
        console.error("❌ Resume upload error:", err);
        res.status(500).json({ error: 'Error uploading resume' });
    }
});


module.exports = router;
