// profile.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');

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
const upload = multer({ storage });

// Middleware
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- Ensure table has all profile fields ---
const setupProfileTable = async () => {
  const alterQueries = [
    `ALTER TABLE users ADD COLUMN gender VARCHAR(20) NULL`,
    `ALTER TABLE users ADD COLUMN experience_level VARCHAR(50) NULL`,
    `ALTER TABLE users ADD COLUMN ctc_expected DECIMAL(10,2) NULL`,
    `ALTER TABLE users ADD COLUMN professional_details JSON NULL`,
    `ALTER TABLE users ADD COLUMN projects JSON NULL`,
    `ALTER TABLE users ADD COLUMN skills JSON NULL`,
    `ALTER TABLE users ADD COLUMN education JSON NULL`,
    `ALTER TABLE users ADD COLUMN certifications JSON NULL`,
    `ALTER TABLE users ADD COLUMN languages JSON NULL`,
    `ALTER TABLE users ADD COLUMN resume_url VARCHAR(255) NULL`,
    `ALTER TABLE users ADD COLUMN profile_uuid VARCHAR(100) NULL`
  ];

  for (const sql of alterQueries) {
    try {
      await query(sql);
    } catch (err) {
      if (err.errno !== 1060) console.error("DB alter error:", err.sqlMessage);
    }
  }
};
setupProfileTable();

// --- Get profile (by session/email) ---
router.get('/api/profile', async (req, res) => {
  try {
    const userEmail = req.session.user?.email;
    if (!userEmail) return res.status(401).json({ error: 'Not logged in' });

    const rows = await query('SELECT * FROM users WHERE email=?', [userEmail]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error fetching profile:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Update profile (all fields) ---
router.post('/api/profile/update', async (req, res) => {
  try {
    const userEmail = req.session.user?.email;
    if (!userEmail) return res.status(401).json({ error: 'Not logged in' });

    const profileUUID = uuidv4(); // unique ID for this update
    const updates = {};

    // Personal
    if (req.body.fullName) updates.full_name = req.body.fullName;
    if (req.body.phone) updates.mobile_number = req.body.phone;
    if (req.body.gender) updates.gender = req.body.gender;
    if (req.body.experienceLevel) updates.experience_level = req.body.experienceLevel;
    if (req.body.ctcExpected) updates.ctc_expected = req.body.ctcExpected;

    // JSON sections
    if (req.body.professionalDetails) updates.professional_details = JSON.stringify(req.body.professionalDetails);
    if (req.body.projects) updates.projects = JSON.stringify(req.body.projects);
    if (req.body.skills) updates.skills = JSON.stringify(req.body.skills);
    if (req.body.education) updates.education = JSON.stringify(req.body.education);
    if (req.body.certifications) updates.certifications = JSON.stringify(req.body.certifications);
    if (req.body.languages) updates.languages = JSON.stringify(req.body.languages);

    updates.profile_uuid = profileUUID;

    const fields = Object.keys(updates).map(f => `${f}=?`).join(',');
    const values = Object.values(updates);
    values.push(userEmail);

    if (fields) {
      await query(`UPDATE users SET ${fields} WHERE email=?`, values);
    }

    res.json({ message: 'Profile updated successfully', profileUUID });
  } catch (err) {
    console.error("❌ Error updating profile:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/profile/update
router.post('/api/profile/update', upload.single('profilePhoto'), async (req, res) => {
  try {
    let email = req.session.user?.email;
    if (!email && req.body.email) {
      email = req.body.email;
    }
    if (!email) return res.status(401).json({ error: "Not logged in" });

    // Now use email in your update queries
    // Example:
    await query(
      "UPDATE users SET full_name=?, phone=?, gender=? WHERE email=?",
      [req.body.fullName, req.body.phone, req.body.gender, email]
    );

    res.json({ message: "Profile updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- Upload profile photo ---
router.post('/api/profile/photo', upload.single('profilePhoto'), async (req, res) => {
  try {
    const userEmail = req.session.user?.email;
    if (!userEmail) return res.status(401).json({ error: 'Not logged in' });

    const photoUrl = `/uploads/${req.file.filename}`;
    await query('UPDATE users SET profile_image_url=?, profile_uuid=? WHERE email=?', [
      photoUrl,
      uuidv4(),
      userEmail
    ]);

    res.json({ message: 'Photo uploaded', url: photoUrl });
  } catch (err) {
    console.error("❌ Photo upload error:", err);
    res.status(500).json({ error: 'Error uploading photo' });
  }
});

// --- Upload resume ---
router.post('/api/profile/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    const userEmail = req.session.user?.email;
    if (!userEmail) return res.status(401).json({ error: 'Not logged in' });

    const resumeUrl = `/uploads/${req.file.filename}`;
    await query('UPDATE users SET resume_url=?, profile_uuid=? WHERE email=?', [
      resumeUrl,
      uuidv4(),
      userEmail
    ]);

    res.json({ message: 'Resume uploaded', url: resumeUrl });
  } catch (err) {
    console.error("❌ Resume upload error:", err);
    res.status(500).json({ error: 'Error uploading resume' });
  }
});


module.exports = router;
