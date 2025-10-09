// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * Middleware for Candidates (Users). Reads JWT from an httpOnly cookie.
 */
const protectRoute = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token.' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
 * Middleware for Employers (Companies). Reads JWT from the Authorization header.
 */
const protectEmployerRoute = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer')) {
        try {
            token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            if (decoded.role !== 'company') {
                return res.status(403).json({ error: 'Forbidden: Not an employer token.' });
            }
            req.company = decoded;
            next();
        } catch (error) {
            res.status(401).json({ error: 'Not authorized, token failed.' });
        }
    } else {
        res.status(401).json({ error: 'Not authorized, no token or Bearer scheme missing.' });
    }
};

// **CRITICAL FIX**: Export BOTH functions.
module.exports = { protectRoute, protectEmployerRoute };

