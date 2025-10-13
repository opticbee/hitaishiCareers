// routes/register.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken
const { query } = require('../db');
const router = express.Router();


// Basic input sanitization to prevent stored XSS
const sanitize = (str) => {
  if (typeof str !== 'string') return '';
  // Removes common HTML/scripting characters
  return str.replace(/[<>\"'()]/g, ''); 
};


const saltRounds = 10;

// --- Ensure 'uploads' directory exists ---
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage
});
router.use(express.json());
router.use(express.urlencoded({
    extended: true
}));

// --- Secure Registration Route with Auto-Login ---
router.post('/user/register', upload.single('profileImage'), async (req, res) => {
  try {
    // --- Sanitize and validate inputs ---
    const fullName = sanitize(req.body.fullName);
    const email = sanitize(req.body.email);
    const mobileNumber = sanitize(req.body.mobileNumber);
    const password = req.body.password; // Do NOT sanitize password
    const profileImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!fullName || !email || !mobileNumber || !password) {
      return res.status(400).json({ error: 'All fields except profile image are required.' });
    }

    // --- Check if user already exists ---
    const existingUser = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      if (existingUser[0].auth_provider === 'google') {
        return res.status(409).json({ error: 'This email was used to sign up with Google. Please log in with Google.' });
      }
      return res.status(409).json({ error: 'This email address is already registered.' });
    }

    // --- Hash password securely ---
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // --- Insert user into database ---
    const insertUserQuery = `
      INSERT INTO users (full_name, email, mobile_number, password_hash, profile_image_url, auth_provider)
      VALUES (?, ?, ?, ?, ?, ?);
    `;
    const result = await query(insertUserQuery, [fullName, email, mobileNumber, passwordHash, profileImageUrl, 'local']);

    console.log(`✅ User registered successfully with ID: ${result.insertId}`);

    // --- Auto-login: Generate JWT ---
    const payload = {
      id: result.insertId,
      email,
      fullName
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    // --- Set secure, httpOnly cookie (Primary security) ---
    res.cookie('token', token, {
      httpOnly: true,                    // Protect from XSS
      secure: process.env.NODE_ENV === 'production', // Use HTTPS-only in prod
      sameSite: 'strict',                // Prevent CSRF
      maxAge: 7 * 24 * 60 * 60 * 1000   // 7 days
    });

    // --- Send success response with token ---
    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      token, // Included for client to store in localStorage (as requested)
      user: {
        id: result.insertId,
        fullName,
        email,
        profileImage: profileImageUrl || null
      }
    });

  } catch (error) {
    console.error('❌ Error during registration:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This email address is already registered.' });
    }
    res.status(500).json({ error: 'An error occurred on the server.' });
  }
});

// --- Secure Login Route (Redundant, but kept if used separately from /api/auth/login) ---
router.post('/user/login', async (req, res) => {
  try {    
    const email = sanitize(req.body.email);
    const password = req.body.password; // do NOT sanitize password

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // --- Check if user exists ---
    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];

    // --- Prevent login if Google account ---
    if (user.auth_provider === 'google') {
      return res.status(403).json({
        error: 'This account was registered with Google. Please use Google to log in.'
      });
    }

    // --- Verify password ---
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // --- Generate JWT ---
    const payload = {
      id: user.id,
      email: user.email,
      fullName: user.full_name
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    // --- Set JWT in secure HttpOnly cookie (Primary security) ---
    res.cookie('token', token, {
      httpOnly: true,                    // Prevent JS access (XSS safe)
      secure: process.env.NODE_ENV === 'production', // Use HTTPS only in prod
      maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
      sameSite: 'strict'                 // Prevent CSRF
    });

    // --- Send success response ---
    res.status(200).json({
      success: true,
      message: 'Login successful!',
      token, // Included for client to store in localStorage (as requested)
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        profileImage: user.profile_image_url || null
      }
    });

  } catch (error) {
    console.error('❌ Error during login:', error);
    res.status(500).json({ error: 'An error occurred on the server.' });
  }
});

// ... (password update route remains unchanged, requires separate protectRoute middleware) ...
router.post('/user/update-password', async (req, res) => {
  try {
    // Note: protectRoute middleware should be applied to this route in server.js
    // For now, let's assume req.user is populated by the middleware.
    const email = req.user?.email;
    const newPassword = req.body?.newPassword;
    if (!newPassword) return res.status(400).json({ error: 'New password required' });

    if (!email) return res.status(401).json({ error: 'Not authenticated' });

    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (!users.length) return res.status(404).json({ error: 'User not found' });

    if (users[0].auth_provider === 'google') {
      return res.status(403).json({ error: 'Cannot change password for Google-auth accounts' });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await query('UPDATE users SET password_hash = ? WHERE email = ?', [newHashedPassword, email]);

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred on the server.' });
  }
});


// --- UPDATED Logout Route ---
router.post('/logout', (req, res) => {
    // To log out, we clear the JWT HttpOnly cookie.
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0), // Set expiry date to the past
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.status(200).json({ message: 'Logout successful!' });
});

module.exports = router;
