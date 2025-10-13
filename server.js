// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');

const registerRoute = require('./routes/register');
const authRoute = require('./routes/auth');
const profileRoute = require('./routes/profile');
const jobsRoute = require('./routes/jobs');
const applicantRoute = require('./routes/applicant');
const companyRoute = require('./routes/company');
const { protectRoute } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Security Middleware ---
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// --- CORS (adjust domains if needed) ---
app.use(cors({
  origin: ['https://winjob.in', 'http://localhost:3000'],
  credentials: true
}));

// --- JSON, URL & Cookie Parsers ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Static Files ---
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API Routes ---
app.use('/api', registerRoute);
app.use('/api/auth', authRoute);
app.use('/api/profile', protectRoute, profileRoute);
app.use('/api/jobs', protectRoute, jobsRoute);
app.use('/api/applicant', protectRoute, applicantRoute);
app.use('/api/company', protectRoute, companyRoute);

// --- Frontend Routes ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('❌ Unhandled Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
