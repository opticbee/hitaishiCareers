// routes/register.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Import jsonwebtoken
const { query } = require('../db');
const router = express.Router();

const saltRounds = 10;

// ... (Multer setup and database setup code remains unchanged) ...
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

// --- Registration API Endpoint (remains mostly the same) ---
router.post('/user/register', upload.single('profileImage'), async (req, res) => {
    try {
        const { fullName, email, mobileNumber, password } = req.body;
        const profileImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        if (!fullName || !email || !mobileNumber || !password) {
            return res.status(400).json({ error: 'All fields except profile image are required.' });
        }

        const existingUser = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            if (existingUser[0].auth_provider === 'google') {
                return res.status(409).json({ error: 'This email was used to sign up with Google. Please log in with Google.' });
            }
            return res.status(409).json({ error: 'This email address is already registered.' });
        }

        const passwordHash = await bcrypt.hash(password, saltRounds);
        const insertUserQuery = `
            INSERT INTO users (full_name, email, mobile_number, password_hash, profile_image_url, auth_provider)
            VALUES (?, ?, ?, ?, ?, ?);
        `;
        const result = await query(insertUserQuery, [fullName, email, mobileNumber, passwordHash, profileImageUrl, 'local']);

        console.log(`✅ User registered successfully with ID: ${result.insertId}`);
        res.status(201).json({ message: 'User registered successfully!', userId: result.insertId });

    } catch (error) {
        console.error('❌ Error during registration:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'This email address is already registered.' });
        }
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

// --- UPDATED Login Route ---
router.post('/user/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const users = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];
        if (user.auth_provider === 'google') {
            return res.status(403).json({ error: 'This account was registered with Google. Please use Google to log in.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // --- JWT Generation and Cookie Setting ---
        // 1. Create JWT payload
        const payload = {
            id: user.id,
            email: user.email,
            fullName: user.full_name
        };

        // 2. Sign the token
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '7d' // Token will expire in 7 days
        });

        // 3. Set the token in an HTTP-Only, Secure cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: 'strict'
        });

        // 4. Send success response
        res.status(200).json({
            message: 'Login successful!',
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('❌ Error during login:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

// ... (password update route remains unchanged, but now requires a valid JWT cookie to work via protectRoute middleware) ...
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
    // To log out, we clear the JWT cookie.
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0), // Set expiry date to the past
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.status(200).json({ message: 'Logout successful!' });
});

module.exports = router;
