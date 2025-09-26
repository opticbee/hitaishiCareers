// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

// Import API routes from the 'routes' folder
const registerRoute = require('./routes/register');
const authRoute = require('./routes/auth');
const profileRoute = require('./routes/profile');
const jobsRoute = require('./routes/jobs');
const applicantRoute = require('./routes/applicant');
const companyRoute = require('./routes/company');

// Initialize Express app

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware Setup ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Session Middleware ---
app.use(
    session({
        secret: process.env.SESSION_SECRET ,
        resave: false,
        saveUninitialized: true,
        cookie: { 
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // Session lasts 24 hours
        }
    })
);

// --- Serve Static Files ---
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Routes ---
// For manual login/register: /api/user/login, /api/user/register
app.use('/api', registerRoute); 
// For Google sign-in: /api/auth/google
app.use('/api/auth', authRoute);

app.use('/api/jobs', jobsRoute); // For job postings: /api/jobs/...
app.use('/api/applicant', applicantRoute); // For applicant actions: /api/applicant/...
app.use('/api/company', companyRoute); // For company actions: /api/company/...

app.use('/api', profileRoute); // For profile management: /api/profile

// --- Frontend Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// --- Server Startup ---
app.listen(port, () => {
    console.log(`✅ Server is running on http://localhost:${port}`);
});

