// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * Middleware for Candidates (Users). Supports both JWT from HTTP Header (Mobile/API) 
 * OR HttpOnly cookie (Web).
 */
const protectRoute = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;
    
    // 1. Check for token in Authorization: Bearer header (Mobile/API flow)
    if (authHeader && authHeader.startsWith('Bearer')) {
        token = authHeader.split(' ')[1];
    } 
    
    // 2. Fallback: Check for token in HttpOnly cookie (Web flow)
    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token or session.' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Ensure it's not a company token
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
 * Middleware for Employers (Companies). Reads JWT from the Authorization header. (UNCHANGED)
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

module.exports = { protectRoute, protectEmployerRoute };
