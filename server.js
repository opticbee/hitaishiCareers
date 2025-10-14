// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
// const helmet = require('helmet'); // REMOVED: Helmet is causing repeated MODULE_NOT_FOUND errors.
const cors = require('cors');

const registerRoute = require('./routes/register');
const authRoute = require('./routes/auth');
const profileRoute = require('./routes/profile');
const jobsRoute = require('./routes/jobs');
const applicantRoute = require('./routes/applicant');
const companyRoute = require('./routes/company');
const { protectRoute, protectEmployerRoute } = require('./middleware/authMiddleware');

const app = express();
// Ensure the application uses the port provided by the environment (e.g., Nginx/PM2) or defaults to 3000.
const PORT = process.env.PORT || 3000;

// --- Security Middleware ---
// app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })); // REMOVED

// --- CORS (adjust domains if needed) ---
app.use(cors({
  origin: ['https://winjob.in', 'http://localhost:3000'],
  credentials: true
}));

// 🚨 --- FIX: Increase request body size limit to avoid 413 error ---
// The default limit is too small for file uploads via FormData.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// --------------------------------------------------------------------

app.use(cookieParser());

// --- Static Files ---\
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Routes ---
app.use('/api', registerRoute);
app.use('/api/auth', authRoute);

// Candidate/User Protected Routes
app.use('/api/profile', protectRoute, profileRoute);
// Candidate/User Jobs (only used for job application, which is protected in applicant.js)
// We will modify jobsRoute to only handle public and employer-specific protected routes
app.use('/api/jobs', jobsRoute); 
app.use('/api/applicant', applicantRoute);

// Employer/Company Routes (Protected)
// All routes in company.js (except register/login) will be protected by this middleware.
app.use('/api/company', companyRoute);

// --- Frontend Routes ---\
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Global Error Handler ---\
app.use((err, req, res, next) => {
  console.error('❌ Unhandled Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- Start Server ---\
app.listen(PORT, () => {
  // Confirm the precise port the server is actively listening on
  console.log(`✅ Server is running and listening on port: ${PORT}`);
});
