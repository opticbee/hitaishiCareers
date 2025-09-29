// routes/company.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const multer = require('multer');
const path = require('path');
const { query } = require("../db"); // Assuming your db connection helper is in ../db

const router = express.Router();
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// --- Multer Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: './uploads/logos/',
    filename: function(req, file, cb) {
        cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2000000 }, // 2MB limit
    fileFilter: function(req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Error: Only image files are allowed!'));
        }
    }
}).single('logo');

(async function initCompanyTable() {
    try {
        await query(`
      CREATE TABLE IF NOT EXISTS companies (
        id CHAR(36) PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        website VARCHAR(255),
        description TEXT,
        logo_url VARCHAR(500),
        contact_person VARCHAR(255),
        contact_phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
        console.log("✅ companies table is ready.");
    } catch (err) {
        console.error("❌ Error creating companies table:", err.message);
    }
})();

// Register a new company
router.post("/register", (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message });
        }
        try {
            const { company_name, email, password, website, description, contact_person, contact_phone, address } = req.body;
            if (!company_name || !email || !password) {
                return res.status(400).json({ success: false, error: "Company name, email, and password are required." });
            }
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({ success: false, error: "Password does not meet the complexity requirements." });
            }
            const existingCompany = await query('SELECT id FROM companies WHERE user_email = ?', [email]);
            if (existingCompany.length > 0) {
                return res.status(409).json({ success: false, error: "This email address is already registered." });
            }
            const id = uuidv4();
            const hashed = await bcrypt.hash(password, saltRounds);
            const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : null;
            await query(
                `INSERT INTO companies (id, user_email, password_hash, company_name, website, description, logo_url, contact_person, contact_phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, email, hashed, company_name, website, description, logoUrl, contact_person, contact_phone, address]
            );
            res.status(201).json({ success: true, message: "Registration successful!", company_id: id });
        } catch (dbErr) {
            console.error("Company registration failed:", dbErr);
            if (dbErr.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, error: "This email address is already registered." });
            }
            res.status(500).json({ success: false, error: "An internal server error occurred." });
        }
    });
});

// Company login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }
        const rows = await query(`SELECT * FROM companies WHERE user_email = ?`, [email]);
        if (!rows.length) return res.status(404).json({ error: "No account found with that email." });
        const company = rows[0];
        const match = await bcrypt.compare(password, company.password_hash);
        if (!match) return res.status(401).json({ error: "Invalid credentials." });
        
        const token = jwt.sign({ id: company.id, role: "company" }, JWT_SECRET, { expiresIn: "7d" });
        
        // --- UPDATED RESPONSE ---
        // Now includes company name and logo URL for the frontend
        res.json({
            success: true,
            token,
            company_id: company.id,
            company_name: company.company_name,
            logo_url: company.logo_url
        });

    } catch (err) {
        console.error("Login failed:", err);
        res.status(500).json({ error: "Login failed due to a server error." });
    }
});

// GET a specific company's profile by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await query(
            `SELECT id, user_email, company_name, website, description, logo_url, contact_person, contact_phone, address FROM companies WHERE id = ?`,
            [id]
        );
        if (!rows.length) {
            return res.status(404).json({ error: "Company not found." });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("Failed to fetch company profile:", err);
        res.status(500).json({ error: "Failed to fetch company profile." });
    }
});

// UPDATE a company's profile
router.patch("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { company_name, website, description, contact_person, contact_phone, address } = req.body;
        if (!company_name) {
            return res.status(400).json({ error: "Company name is required." });
        }
        await query(
            `UPDATE companies SET company_name = ?, website = ?, description = ?, contact_person = ?, contact_phone = ?, address = ?, updated_at = NOW() WHERE id = ?`,
            [company_name, website, description, contact_person, contact_phone, address, id]
        );
        res.json({ success: true, message: "Profile updated successfully!" });
    } catch (err) {
        console.error("Failed to update company profile:", err);
        res.status(500).json({ error: "Failed to update profile." });
    }
});


module.exports = router;

