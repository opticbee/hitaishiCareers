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
  // Your live website domain
  'https://winjob.in',
  // Local development for your desktop environment
  'http://localhost:3000',
  
  // Capacitor Default Production Origins:
  // Android Webview (most common default)
  'http://localhost', 
  // Capacitor 6+ Android Webview / for secure setups
  'https://localhost', 
  // iOS Webview
  'capacitor://localhost', 
];

// Configure CORS using a dynamic origin check
app.use(cors({
  origin: (origin, callback) => {
    // 1. Allow requests with no origin (e.g., Postman, native apps/plugins, same-origin)
    if (!origin) return callback(null, true); 
    
    // 2. Check if the requesting origin is in our allowed list
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      // In production, reject unauthorized origins
      return callback(new Error(msg), false);
    }
    // Allow the origin
    return callback(null, true);
  },
  // CRITICAL: Must be true to allow cookies/tokens/sessions for your protected routes
  credentials: true, 
  // To handle preflight requests (OPTIONS method) which happen for non-simple requests (like PUT/DELETE or requests with custom headers)
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
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