// routes/company.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require('multer');
const path = require('path');
const { query } = require("../db");
// Import the new employer-specific middleware
const { protectEmployerRoute } = require('../middleware/authMiddleware');

const router = express.Router();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET;

// --- Multer Configuration for Logo Uploads ---
const storage = multer.diskStorage({
    destination: './uploads/logos/',
    filename: function(req, file, cb) {
        cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 2000000 } }).single('logo');

// Initialize Company Table (no changes needed here)
(async function initCompanyTable() {
    try {
        await query(`
      CREATE TABLE IF NOT EXISTS companies (
        id CHAR(36) PRIMARY KEY, user_email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
        company_name VARCHAR(255) NOT NULL, website VARCHAR(255), description TEXT, logo_url VARCHAR(500),
        contact_person VARCHAR(255), contact_phone VARCHAR(50), address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
        console.log("✅ companies table is ready.");
    } catch (err) {
        console.error("❌ Error creating companies table:", err.message);
    }
})();

// POST /api/company/register
router.post("/register", (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message });
        try {
            const { company_name, email, password, website, description, contact_person, contact_phone, address } = req.body;
            if (!company_name || !email || !password) return res.status(400).json({ success: false, error: "Company name, email, and password are required." });
            const existingCompany = await query('SELECT id FROM companies WHERE user_email = ?', [email]);
            if (existingCompany.length > 0) return res.status(409).json({ success: false, error: "This email address is already registered." });
            
            const id = uuidv4();
            const hashed = await bcrypt.hash(password, saltRounds);
            const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : null;
            await query(`INSERT INTO companies (id, user_email, password_hash, company_name, website, description, logo_url, contact_person, contact_phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, email, hashed, company_name, website, description, logoUrl, contact_person, contact_phone, address]);
            res.status(201).json({ success: true, message: "Registration successful!" });
        } catch (dbErr) {
            console.error("Company registration failed:", dbErr);
            res.status(500).json({ success: false, error: "An internal server error occurred." });
        }
    });
});

// POST /api/company/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, error: "Email and password are required." });
        
        const rows = await query(`SELECT * FROM companies WHERE user_email = ?`, [email]);
        if (!rows.length) return res.status(401).json({ success: false, error: "Invalid credentials." });
        
        const company = rows[0];
        const match = await bcrypt.compare(password, company.password_hash);
        if (!match) return res.status(401).json({ success: false, error: "Invalid credentials." });
        
        // Create a JWT with a specific 'role' for employers
        const payload = { id: company.id, role: "company", name: company.company_name };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
        
        // Send the token back to the client to store
        res.json({
            success: true,
            message: "Login successful!",
            token: token,
        });

    } catch (err) {
        console.error("Employer Login failed:", err);
        res.status(500).json({ success: false, error: "Login failed due to a server error." });
    }
});

// GET all companies (for public employers page)
router.get("/all", async (_req, res) => {
    try {
        const companies = await query(
            `SELECT id, company_name, logo_url FROM companies ORDER BY company_name ASC`
        );
        res.json({ companies });
    } catch (err) {
        console.error("Failed to fetch all companies:", err);
        res.status(500).json({ error: "Failed to fetch companies." });
    }
});


// GET /api/company/profile
router.get("/profile", protectEmployerRoute, async (req, res) => {
    try {
        const { id } = req.company; // req.company is added by the middleware
        const rows = await query(`SELECT id, user_email, company_name, website, description, logo_url, contact_person, contact_phone, address FROM companies WHERE id = ?`, [id]);
        if (!rows.length) return res.status(404).json({ error: "Company profile not found." });
        res.json(rows[0]);
    } catch (err) {
        console.error("Failed to fetch company profile:", err);
        res.status(500).json({ error: "Failed to fetch company profile." });
    }
});

// PATCH /api/company/profile
router.patch("/profile", protectEmployerRoute, upload, async (req, res) => {
    try {
        const { id } = req.company;
        const { company_name, website, description, contact_person, contact_phone, address } = req.body;
        
        let fieldsToUpdate = [];
        let values = [];
        const addField = (name, value) => { if (value) { fieldsToUpdate.push(`${name} = ?`); values.push(value); } };
        
        addField('company_name', company_name);
        addField('website', website);
        addField('description', description);
        addField('contact_person', contact_person);
        addField('contact_phone', contact_phone);
        addField('address', address);

        if (req.file) {
            const logoUrl = `/uploads/logos/${req.file.filename}`;
            fieldsToUpdate.push('logo_url = ?');
            values.push(logoUrl);
        }

        if (fieldsToUpdate.length === 0) return res.status(400).json({ success: false, message: "No data provided for update." });

        values.push(id);
        const sql = `UPDATE companies SET ${fieldsToUpdate.join(', ')}, updated_at = NOW() WHERE id = ?`;
        await query(sql, values);
        
        const updatedProfile = await query(`SELECT id, user_email, company_name, website, description, logo_url, contact_person, contact_phone, address FROM companies WHERE id = ?`, [id]);
        res.json({ success: true, message: "Profile updated successfully!", profile: updatedProfile[0] });
    } catch (err) {
        console.error("Failed to update company profile:", err);
        res.status(500).json({ success: false, message: "Failed to update profile due to a server error." });
    }
});

module.exports = router;
