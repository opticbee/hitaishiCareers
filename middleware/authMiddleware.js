// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

/**
 * Middleware for Candidates (Users).
 * Reads JWT from an httpOnly cookie. Rejects employer tokens.
 */
const protectRoute = (req, res, next) => {
    const token = req.cookies.token; // Checks for the user's cookie
    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // FIX: Ensure this is NOT an employer token
        if (decoded.type === 'employer') {
            return res.status(403).json({ error: 'Forbidden: Invalid token type for this route.' });
        }
        req.user = decoded; // Attach user payload
        next();
    } catch (error) {
        res.status(401).json({ error: 'Not authorized, token failed.' });
    }
};

/**
 * Middleware for Employers (Companies).
 * Reads JWT from the 'Authorization: Bearer <token>' header.
 */
const protectEmployerRoute = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer')) {
        try {
            token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // FIX: Check for the correct 'type' in the payload to identify an employer
            if (decoded.type !== 'employer') {
                return res.status(403).json({ error: 'Forbidden: Not an employer token.' });
            }
            // FIX: Use req.user for consistency across all authenticated routes
            req.user = decoded; 
            next();
        } catch (error) {
            console.error('JWT Verification Error for Employer:', error.message);
            res.status(401).json({ error: 'Not authorized, token failed.' });
        }
    } else {
        res.status(401).json({ error: 'Not authorized, no token or Bearer scheme missing.' });
    }
};

module.exports = { protectRoute, protectEmployerRoute };
