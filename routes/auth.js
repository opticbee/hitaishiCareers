// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { query } = require('../db');
const router = express.Router();

// --- Security: Basic sanitization ---
const sanitize = (str) => (typeof str === 'string' ? str.replace(/[<>\"'()]/g, '') : '');

// --- Google OAuth Setup ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const saltRounds = 10;

/** Helper to generate token & send response safely */
const generateToken = (user, res, message = 'Authenticated successfully!') => {
  const payload = { id: user.id, email: user.email, fullName: user.full_name };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

  // Store token in HttpOnly cookie (for safety)
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    success: true,
    message,
    token, // frontend can store in localStorage if desired
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      profileImage: user.profile_image_url || null,
    },
  });
};

/** -------------------------
 * LOCAL REGISTER
 --------------------------*/
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, mobileNumber, password } = req.body;
    if (!fullName || !email || !mobileNumber || !password)
      return res.status(400).json({ error: 'All fields are required.' });

    const existing = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(409).json({ error: 'Email already registered. Please log in.' });

    const passwordHash = await bcrypt.hash(password, saltRounds);
    const result = await query(
      'INSERT INTO users (full_name, email, mobile_number, password_hash, auth_provider) VALUES (?, ?, ?, ?, ?)',
      [sanitize(fullName), sanitize(email), sanitize(mobileNumber), passwordHash, 'local']
    );

    const newUser = { id: result.insertId, email, full_name: fullName };
    console.log(`✅ User registered: ${email}`);
    generateToken(newUser, res, 'Registration successful!');
  } catch (err) {
    console.error('❌ Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

/** -------------------------
 * LOCAL LOGIN
 --------------------------*/
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required.' });

    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (!users.length) return res.status(401).json({ error: 'Invalid email or password.' });

    const user = users[0];
    if (user.auth_provider === 'google')
      return res.status(403).json({ error: 'Use Google login for this account.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    console.log(`✅ Local login: ${email}`);
    generateToken(user, res, 'Login successful!');
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

/** -------------------------
 * GOOGLE LOGIN / REGISTER
 --------------------------*/
router.post('/google', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Google token required.' });

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) return res.status(401).json({ error: 'Invalid Google token.' });

    const google_id = sanitize(payload.sub);
    const email = sanitize(payload.email);
    const full_name = sanitize(payload.name);
    const profile_image_url = sanitize(payload.picture);

    const existing = await query('SELECT * FROM users WHERE email = ?', [email]);

    if (existing.length > 0) {
      const user = existing[0];
      if (user.auth_provider !== 'google')
        return res.status(403).json({
          error: 'This email is registered with password. Please use email/password login.',
        });
      console.log(`✅ Google login: ${email}`);
      return generateToken(user, res, 'Login successful with Google!');
    }

    const result = await query(
      'INSERT INTO users (full_name, email, google_id, profile_image_url, auth_provider) VALUES (?, ?, ?, ?, ?)',
      [full_name, email, google_id, profile_image_url, 'google']
    );

    const newUser = { id: result.insertId, email, full_name, profile_image_url };
    console.log(`✅ Google signup: ${email}`);
    generateToken(newUser, res, 'Account created successfully with Google!');
  } catch (err) {
    console.error('❌ Google Auth error:', err);
    res.status(500).json({ error: 'Server error during Google authentication.' });
  }
});

/** -------------------------
 * LOGOUT
 --------------------------*/
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.status(200).json({ message: 'Logged out successfully.' });
});

module.exports = router;
