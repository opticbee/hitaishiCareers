// routes/auth.js
const express = require('express');
const {
    OAuth2Client
} = require('google-auth-library');
const {
    query
} = require('../db');
const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '62866830906-89e5aqkrpnsjs0dri6hsss239b5rpdd9.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * A single, intelligent endpoint to handle Google Sign-In.
 * It will either log in an existing user or register a new one.
 */
router.post('/google', async (req, res) => {
    const {
        token
    } = req.body;
    if (!token) {
        return res.status(400).json({
            error: 'Google token is required.'
        });
    }

    try {
        // Verify the token from Google
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        if (!payload) {
            return res.status(401).json({
                error: 'Invalid Google token.'
            });
        }

        const {
            sub: google_id,
            email,
            name: full_name,
            picture: profile_image_url
        } = payload;

        // Check if user exists in our database
        const users = await query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length > 0) {
            // --- USER EXISTS ---
            const user = users[0];

            if (user.auth_provider !== 'google') {
                // User exists but signed up with a password.
                return res.status(403).json({
                    error: 'This email is registered with a password. Please sign in using your password.'
                });
            }

            // User exists and signed up with Google, so we log them in.
            req.session.user = {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
            };
            console.log(`✅ Google user logged in: ${user.email}`);
            // FIX: Return a user object so the frontend can use it.
            return res.status(200).json({
                message: 'Login successful with Google!',
                user: {
                    id: user.id,
                    fullName: user.full_name,
                    email: user.email,
                    profileImage: user.profile_image_url
                }
            });

        } else {
            // --- USER DOES NOT EXIST, SO WE REGISTER THEM ---
            const insertResult = await query(
                'INSERT INTO users (full_name, email, google_id, profile_image_url, auth_provider) VALUES (?, ?, ?, ?, ?)',
                [full_name, email, google_id, profile_image_url, 'google']
            );

            const newUserId = insertResult.insertId;
            const newUser = {
                id: newUserId,
                fullName: full_name,
                email: email
            };
            req.session.user = newUser;

            console.log(`✅ New Google user registered: ${email}`);
            // FIX: Return a user object so the frontend can use it.
            res.status(201).json({
                message: 'Account created successfully with Google!',
                user: {
                    id: newUser.id,
                    fullName: newUser.fullName,
                    email: newUser.email,
                    profileImage: profile_image_url
                }
            });
        }

    } catch (error) {
        console.error('❌ Error during Google authentication:', error);
        res.status(500).json({
            error: 'An error occurred on the server.'
        });
    }
});

module.exports = router;
