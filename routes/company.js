// routes/company.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
// FIX: Import the correct middleware for employer routes
const { protectEmployerRoute } = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// --- File Upload Setup ---
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = `company-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// --- Database Table Initialization ---
(async function initCompaniesTable() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS companies (
                id CHAR(36) PRIMARY KEY,
                user_email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                company_name VARCHAR(255) NOT NULL,
                website VARCHAR(255),
                contact_person VARCHAR(255),
                contact_phone VARCHAR(50),
                address TEXT,
                description TEXT,
                logo_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log("✅ companies table is ready.");
    } catch (err) {
        console.error("❌ Error initializing companies table:", err.message);
    }
})();

// ===================================
//         PUBLIC ROUTES
// ===================================

// POST /api/company/login - Employer Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const rows = await query('SELECT * FROM companies WHERE user_email = ?', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const company = rows[0];
        const isMatch = await bcrypt.compare(password, company.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Create JWT payload
        const payload = {
            id: company.id,
            email: company.user_email,
            type: 'employer' // Differentiate from regular users
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        res.json({ success: true, token });

    } catch (err) {
        console.error("Company login failed:", err);
        res.status(500).json({ error: "Server error during login." });
    }
});

// POST /api/company/register - Employer Registration (for employerRegistration.html)
router.post('/register', async (req, res) => {
    try {
        const { companyName, email, password } = req.body;
        if (!companyName || !email || !password) {
            return res.status(400).json({ error: 'Company name, email, and password are required.' });
        }

        const existingCompany = await query('SELECT id FROM companies WHERE user_email = ?', [email]);
        if (existingCompany.length > 0) {
            return res.status(409).json({ error: 'A company with this email already exists.' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const id = uuidv4();

        await query(
            'INSERT INTO companies (id, user_email, password_hash, company_name) VALUES (?, ?, ?, ?)',
            [id, email, password_hash, companyName]
        );

        res.status(201).json({ success: true, message: 'Company registered successfully. Please log in.' });

    } catch (err) {
        console.error("Company registration failed:", err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});


// ===================================
//         PROTECTED ROUTES
// ===================================

// GET /api/company/profile - Fetch company profile for dashboard
// FIX: Use the correct middleware for employers
router.get('/profile', protectEmployerRoute, async (req, res) => {
    try {
        const companyId = req.user.id;
        const rows = await query('SELECT id, user_email, company_name, website, contact_person, contact_phone, address, description, logo_url FROM companies WHERE id = ?', [companyId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: "Company profile not found." });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("Failed to fetch company profile:", err);
        res.status(500).json({ error: "Server error while fetching profile." });
    }
});

// PATCH /api/company/profile - Update company profile
// FIX: Use the correct middleware for employers
router.patch('/profile', protectEmployerRoute, upload.single('logo'), async (req, res) => {
    try {
        const companyId = req.user.id;
        const { company_name, website, contact_person, contact_phone, address, description } = req.body;

        const updates = {};
        if (company_name) updates.company_name = company_name;
        if (website) updates.website = website;
        if (contact_person) updates.contact_person = contact_person;
        if (contact_phone) updates.contact_phone = contact_phone;
        if (address) updates.address = address;
        if (description) updates.description = description;
        if (req.file) {
            updates.logo_url = `/uploads/${req.file.filename}`;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: "No update data provided." });
        }

        const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(updates), companyId];

        await query(`UPDATE companies SET ${fields} WHERE id = ?`, values);
        
        const updatedProfileRows = await query('SELECT id, user_email, company_name, website, contact_person, contact_phone, address, description, logo_url FROM companies WHERE id = ?', [companyId]);

        res.json({ success: true, message: "Profile updated successfully!", profile: updatedProfileRows[0] });

    } catch (err) {
        console.error("Failed to update company profile:", err);
        res.status(500).json({ error: "Server error while updating profile." });
    }
});


module.exports = router;
