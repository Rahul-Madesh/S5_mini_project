const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN, NODE_ENV } = require('../config/env');
const { validateBody } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Constant-time dummy hash to protect against timing attacks for non-existent users
const DUMMY_HASH = '$2a$12$e8Y6lUqy/7w4JdYF2uBvse0lV5eH9p3bXF6ZfS7KqJ4sKzFq7A1Qy';

// Registration input validation schema
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').max(191),
  college_name: z.string().trim().min(2, 'College name is required').max(150),
  student_type: z.enum(['home', 'external'], {
    errorMap: () => ({ message: "Student type must be 'home' or 'external'" })
  }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

// Login input validation schema
const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
}

// POST /api/auth/register
router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, college_name, student_type, password } = req.body;

    // Check if user already exists
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({
        error: 'Registration failed',
        details: 'An account with this email address already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO users (name, email, college_name, student_type, password_hash, role)
       VALUES (?, ?, ?, ?, ?, 'student')`,
      [name, email, college_name, student_type, passwordHash]
    );

    const userId = result.insertId;
    const token = jwt.sign({ userId, role: 'student' }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    setAuthCookie(res, token);

    return res.status(201).json({
      message: 'Registration successful',
      user: {
        id: userId,
        name,
        email,
        college_name,
        student_type,
        role: 'student'
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const [users] = await db.query(
      'SELECT id, name, email, college_name, student_type, password_hash, role FROM users WHERE email = ?',
      [email]
    );

    const user = users[0];
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const match = await bcrypt.compare(password, hashToCompare);

    if (!user || !match) {
      return res.status(401).json({
        error: 'Authentication failed',
        details: 'Invalid email or password'
      });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    setAuthCookie(res, token);

    return res.json({
      message: 'Logged in successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        college_name: user.college_name,
        student_type: user.student_type,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({
    user: req.user
  });
});

module.exports = router;
