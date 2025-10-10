// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

/**
 * Middleware for Candidates (Users).
 * This reads the JWT from an httpOnly cookie.
 */
const protectRoute = (req, res, next) => {
    const token = req.cookies.token; // Checks for the user's cookie
    if (!token) {
        // This is the error message you are seeing in the browser
        return res.status(401).json({ error: 'Not authorized, no token.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role === 'company') {
            return res.status(403).json({ error: 'Forbidden: Invalid token type for this route.' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Not authorized, token failed.' });
    }
};

/**
 * Middleware for Employers (Companies).
 * This reads the JWT from the 'Authorization: Bearer <token>' header.
 */
const protectEmployerRoute = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer')) {
        try {
            token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            
            if (decoded.role !== 'company') {
                return res.status(403).json({ error: 'Forbidden: Not an employer token.' });
            }
            req.company = decoded; // Use req.company to avoid conflicts with user routes
            next();
        } catch (error) {
            console.error('JWT Verification Error for Employer:', error.message);
            res.status(401).json({ error: 'Not authorized, token failed.' });
        }
    } else {
        // This is the correct error for a missing employer token
        res.status(401).json({ error: 'Not authorized, no token or Bearer scheme missing.' });
    }
};

module.exports = { protectRoute, protectEmployerRoute };

