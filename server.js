// server.js
require('dotenv').config();

// NOTE: This application now uses the 'cors' package.
// Please install it by running: npm install cors
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors'); // <-- ADD THIS LINE

// Import API routes
const registerRoute = require('./routes/register');
const authRoute = require('./routes/auth');
const profileRoute = require('./routes/profile');
const jobsRoute = require('./routes/jobs');
const applicantRoute = require('./routes/applicant');
const companyRoute = require('./routes/company');

// Import the dual authentication middleware
const { protectRoute, protectEmployerRoute } = require('./middleware/authMiddleware');

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware Setup ---
// Use CORS to ensure headers like 'Authorization' are not stripped by the browser
app.use(cors()); // <-- AND THIS LINE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Static Files ---
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Routes ---
// Public user routes
app.use('/api', registerRoute);
app.use('/api/auth', authRoute);

// User-protected routes (cookie-based)
app.use('/api/profile', protectRoute, profileRoute);

// Public and Employer-protected routes
app.use('/api/jobs', jobsRoute);
app.use('/api/applicant', protectEmployerRoute, applicantRoute);
app.use('/api/company', companyRoute);


// --- Frontend Route ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// --- Server Startup ---
app.listen(port, () => {
    console.log(`✅ Server is running on http://localhost:${port}`);
});

