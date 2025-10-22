// routes/profile.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4} = require('uuid');
const { query } = require('../db');

// --- Basic input sanitization (XSS prevention) ---
const sanitize = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>\"'()]/g, '');
};


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


const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  const allowedDocTypes = ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  
  if (file.fieldname === 'profilePhoto' && !allowedImageTypes.includes(file.mimetype)) {
    return cb(new Error('Only JPG, PNG images are allowed for profile photos!'), false);
  }

  if (file.fieldname === 'resume' && !allowedDocTypes.includes(file.mimetype)) {
    return cb(new Error('Only PDF or Word documents are allowed for resume!'), false);
  }

  cb(null, true);
};

// 🚨 UPDATED: Increased file size limit to 20MB for larger uploads
const upload = multer({ 
    storage, 
    fileFilter, 
    limits: { 
        fileSize: 20 * 1024 * 1024, // 20 MB limit for single file
        files: 1, // Only 1 file upload per request (profilePhoto or resume)
        fields: 50 // Plenty of fields for all the form data
    } 
}); 


// Middleware
router.use(express.json());
router.use(express.urlencoded({
    extended: true
}));

// --- Get profile (by session/email) ---
// Note: These routes below still require authentication (req.user)
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

    const rows = await query('SELECT * FROM users WHERE email = ?', [userEmail]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];

    const safeParse = (v) => {
      if (!v) return [];
      if (typeof v === 'object') return v;
      // Since the data was sanitized before insertion, JSON.parse is safe.
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

    // Sanitize all textual inputs before updating the database
    const updates = {};
    if (req.body.fullName) updates.full_name = sanitize(req.body.fullName);
    if (req.body.phone) updates.mobile_number = sanitize(req.body.phone);
    if (req.body.gender) updates.gender = sanitize(req.body.gender);
    if (req.body.experienceLevel) updates.experience_level = sanitize(req.body.experienceLevel);
    if (req.body.ctcExpected) updates.ctc_expected = sanitize(req.body.ctcExpected);
    if (req.body.noticePeriod) updates.notice_period = sanitize(req.body.noticePeriod);
    
    // JSON fields are handled by stringify, which preserves structure, 
    // but the underlying content should be safe from the client side using escapeHTML before submission.
    const jsonFieldToString = (val) => {
      if (!val) return null;
      // Check if it's already a string before stringifying, as Express body-parser may convert it.
      return typeof val === 'string' ? val : JSON.stringify(val);
    };
    
    // NOTE: For deeper security, individual array/object fields (e.g., project descriptions)
    // should be sanitized within the client-side save function or when processing the JSON here.
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
    res.json({ success: true, message: 'Profile updated successfully' });
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

        res.json({ success: true, message: 'Resume uploaded successfully', url: resumeUrl });
    } catch (err) {
        console.error("❌ Resume upload error:", err);
        res.status(500).json({ error: 'Error uploading resume' });
    }
});


module.exports = router;
