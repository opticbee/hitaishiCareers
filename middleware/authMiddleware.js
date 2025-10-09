// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { query } = require('../db'); // Assuming your db helper is in the root

const protectRoute = async (req, res, next) => {
    let token;

    // 1. Read the token from the http-only cookie
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token provided. Please log in.' });
    }

    try {
        // 2. Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 3. Find the user based on the token's payload (ID)
        // We fetch the latest user data to ensure the user still exists and has not been deactivated.
        const users = await query('SELECT id, full_name, email FROM users WHERE id = ?', [decoded.id]);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Not authorized, user not found.' });
        }
        
        const currentUser = users[0];

        // 4. Attach the user object to the request
        // This makes the user's information available in all subsequent protected route handlers
        req.user = {
            id: currentUser.id,
            email: currentUser.email,
            fullName: currentUser.full_name
        };
        
        next(); // Proceed to the next middleware or route handler

    } catch (error) {
        console.error('❌ Token verification error:', error);
        // Handle specific errors like token expiry
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Not authorized, invalid token.' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Not authorized, token has expired. Please log in again.' });
        }
        return res.status(500).json({ error: 'An error occurred on the server during token verification.' });
    }
};

module.exports = { protectRoute };
