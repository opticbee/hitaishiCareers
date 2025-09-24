// routes/auth.js
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { query } = require('../db'); // Your database connection helper
const router = express.Router();

// It's crucial to keep your client ID in environment variables in a real application
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * Verifies the Google ID token and returns the user payload.
 * @param {string} token The Google ID token.
 * @returns {Promise<object|null>} The user payload or null if verification fails.
 */
async function verifyGoogleToken(token) {
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        return ticket.getPayload();
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return null;
    }
}

// --- Google Registration Route ---
router.post('/google/register', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Google token is required.' });
    }

    const payload = await verifyGoogleToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Invalid Google token.' });
    }

    const { sub: google_id, email, name: full_name, picture: profile_image_url } = payload;

    try {
        // Check if the user already exists
        const existingUser = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            // If user exists with a password, they should log in normally
            if (existingUser[0].auth_provider === 'local') {
                return res.status(409).json({ error: 'This email is already registered with a password. Please log in.' });
            }
            // If they already exist via Google, just log them in
            req.session.user = {
                id: existingUser[0].id,
                fullName: existingUser[0].full_name,
                email: existingUser[0].email,
            };
            return res.status(200).json({ message: 'User already registered. Logged in successfully!' });
        }

        // Create a new user
        const insertResult = await query(
            'INSERT INTO users (full_name, email, google_id, profile_image_url, auth_provider) VALUES (?, ?, ?, ?, ?)',
            [full_name, email, google_id, profile_image_url, 'google']
        );

        const newUserId = insertResult.insertId;
        req.session.user = { id: newUserId, fullName: full_name, email: email };

        res.status(201).json({ message: 'User registered successfully with Google!', userId: newUserId });

    } catch (error) {
        console.error('❌ Error during Google registration:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});


// --- Google Login Route ---
router.post('/google/login', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Google token is required.' });
    }

    const payload = await verifyGoogleToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Invalid Google token.' });
    }

    const { email } = payload;

    try {
        const users = await query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(404).json({ error: 'Account not found. Please register first.' });
        }
        
        const user = users[0];
        
        // Ensure they are logging in with the correct provider
        if (user.auth_provider !== 'google') {
            return res.status(403).json({ error: 'This account was not registered with Google. Please log in with your password.' });
        }

        req.session.user = {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
        };

        res.status(200).json({ message: 'Login successful with Google!' });

    } catch (error) {
        console.error('❌ Error during Google login:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

module.exports = router;
