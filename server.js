// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

// Import API routes from routes folder
const registerRoute = require('./routes/register');
const authRoute = require('./routes/auth'); // Import the new auth route

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware Setup ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Session Middleware ---
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'a_very_long_and_secure_default_secret_key',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: process.env.NODE_ENV === 'production' } // HTTPS only in prod
    })
);

// --- Serve Static Files ---
// Root static files (css, js, images in root)
app.use(express.static(path.join(__dirname)));

// Serve uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Routes ---
// All registration-related routes handled here
app.use('/api', registerRoute);
app.use('/api/auth', authRoute); // Use the new auth routes

// --- Frontend Routes ---
// Serve homepage (index.html) at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Optional: simple session check route
app.get('/profile', (req, res) => {
    if (req.session.user) {
        res.send(`Welcome ${req.session.user.fullName}`);
    } else {
        res.redirect('/');
    }
});

// --- Server Startup ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
