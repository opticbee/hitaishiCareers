// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { query } = require('../db');
const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '62866830906-89e5aqkrpnsjs0dri6hsss239b5rpdd9.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * A helper function to generate a JWT and send it as a cookie.
 */
const generateTokenAndSendResponse = (user, statusCode, res, message) => {
    // --- FIX: Add a check for the JWT_SECRET ---
    if (!process.env.JWT_SECRET) {
        console.error('❌ FATAL ERROR: JWT_SECRET is not defined in your .env file.');
        return res.status(500).json({ error: 'Internal Server Error: Missing JWT secret configuration.' });
    }

    const payload = {
        id: user.id,
        email: user.email,
        fullName: user.full_name
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '7d'
    });

    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
    });

    res.status(statusCode).json({
        message,
        user: {
            id: user.id,
            fullName: user.full_name,
            email: user.email,
            profileImage: user.profile_image_url
        }
    });
};

/**
 * A single, intelligent endpoint to handle Google Sign-In.
 */
router.post('/google', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Google token is required.' });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            return res.status(401).json({ error: 'Invalid Google token.' });
        }

        const { sub: google_id, email, name: full_name, picture: profile_image_url } = payload;

        const users = await query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length > 0) {
            const user = users[0];
            if (user.auth_provider !== 'google') {
                return res.status(403).json({ error: 'This email is registered with a password. Please sign in using your password.' });
            }
            console.log(`✅ Google user logging in: ${user.email}`);
            generateTokenAndSendResponse(user, 200, res, 'Login successful with Google!');

        } else {
            const insertResult = await query(
                'INSERT INTO users (full_name, email, google_id, profile_image_url, auth_provider) VALUES (?, ?, ?, ?, ?)',
                [full_name, email, google_id, profile_image_url, 'google']
            );
            
            const newUserId = insertResult.insertId;
            const newUser = { id: newUserId, email, full_name, profile_image_url };
            
            console.log(`✅ New Google user registered: ${email}`);
            generateTokenAndSendResponse(newUser, 201, res, 'Account created successfully with Google!');
        }

    } catch (error) {
        console.error('❌ Error during Google authentication:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

module.exports = router;

