// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const registerRoute = require('./routes/register');
const authRoute = require('./routes/auth');
const profileRoute = require('./routes/profile');
const jobsRoute = require('./routes/jobs');
const applicantRoute = require('./routes/applicant');
const companyRoute = require('./routes/company');
const { protectRoute, protectEmployerRoute } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CRITICAL CORS CONFIGURATION FOR PRODUCTION ---
const allowedOrigins = [
  // production web
  'https://www.winjob.in',
  'https://winjob.in',

  // common dev origins (browsers / ionic dev server)
  'http://localhost:3000',
  'http://localhost:8100',
  'http://localhost:8080',
  'http://127.0.0.1:8000',

  // Capacitor / Ionic / WebView origins (add these — app often uses one of them)
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',       // include plain localhost
  'https://localhost',      // some WebViews use https://localhost
  'file://', 
];

// Configure CORS using a dynamic origin check
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (curl, Postman, native mobile contexts)
    if (!origin) return callback(null, true);

    // If origin exactly matches an allowed origin, allow it
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Otherwise reject the origin — this will surface as a CORS error in the browser.
    const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
    return callback(new Error(msg), false);
  },

  // Allow cookies (only if you actually use cookies for auth). If you don't use cookies, you can set false.
  credentials: true,

  // Allowed HTTP methods
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],

  // Allowed headers clients may send
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
// --- END CORS CONFIGURATION ---

// 🚨 --- FIX: Increase request body size limit to avoid 413 error ---
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
app.use('/api/profile', protectRoute, profileRoute);
app.use('/api/jobs', jobsRoute); 
app.use('/api/applicant', applicantRoute);
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
  console.log(`✅ Server is running and listening on port: ${PORT}`);
});