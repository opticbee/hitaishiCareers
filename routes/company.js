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
// Note: Ensure the './uploads/logos' directory exists in your project root.
// Also, in your main server file (e.g., app.js or server.js), you must serve this folder statically, like so:
// app.use('/uploads', express.static('uploads'));
const storage = multer.diskStorage({
    destination: './uploads/logos/',
    filename: function(req, file, cb) {
        cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2000000 }, // Limit file size to 2MB
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
}).single('logo'); // 'logo' matches the name attribute of the file input in the HTML form

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

/**
 * POST /api/company/register
 * Register a new company account, now with file upload and validation.
 */
router.post("/register", (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            // Handle upload errors (e.g., file type mismatch, file size)
            return res.status(400).json({ success: false, error: err.message });
        }

        try {
            const {
                company_name,
                email,
                password,
                website,
                description,
                contact_person,
                contact_phone,
                address
            } = req.body;

            // --- Server-side Validations ---
            if (!company_name || !email || !password) {
                return res.status(400).json({ success: false, error: "Company name, email, and password are required." });
            }

            // Password validation: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({ success: false, error: "Password does not meet the complexity requirements." });
            }

            // Check if email already exists
            const existingCompany = await query('SELECT id FROM companies WHERE user_email = ?', [email]);
            if (existingCompany.length > 0) {
                return res.status(409).json({ success: false, error: "This email address is already registered." });
            }

            // --- Process Data ---
            const id = uuidv4();
            const hashed = await bcrypt.hash(password, saltRounds);
            const logoUrl = req.file ? `/uploads/logos/${req.file.filename}` : null;

            await query(
                `INSERT INTO companies
                 (id, user_email, password_hash, company_name, website, description, logo_url,
                  contact_person, contact_phone, address)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, email, hashed, company_name, website, description, logoUrl,
                 contact_person, contact_phone, address]
            );

            res.status(201).json({ success: true, message: "Registration successful!", company_id: id });

        } catch (dbErr) {
            console.error("Company registration failed:", dbErr);
            // Check for specific database errors, like another potential unique constraint violation
            if (dbErr.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, error: "This email address is already registered." });
            }
            res.status(500).json({ success: false, error: "An internal server error occurred during registration." });
        }
    });
});


/**
 * POST /api/company/login
 * Company login, returns JWT token
 */
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const rows = await query(
            `SELECT * FROM companies WHERE user_email = ?`,
            [email]
        );
        if (!rows.length) return res.status(404).json({ error: "No account found with that email address." });

        const company = rows[0];
        const match = await bcrypt.compare(password, company.password_hash);
        if (!match) return res.status(401).json({ error: "Invalid credentials." });

        const token = jwt.sign({ id: company.id, role: "company" }, JWT_SECRET, {
            expiresIn: "7d"
        });

        res.json({ success: true, token, company_id: company.id });
    } catch (err) {
        console.error("Login failed:", err);
        res.status(500).json({ error: "Login failed due to a server error." });
    }
});

module.exports = router;
