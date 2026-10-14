const express = require('express');
const { z } = require('zod');
const db = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');

const router = express.Router();

// Apply auth and admin check to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

const patchPollSchema = z.object({
  is_active: z.boolean({
    required_error: 'is_active is required',
    invalid_type_error: 'is_active must be a boolean'
  })
});

const mealIntentQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
  type: z.enum(['breakfast', 'lunch', 'dinner'], {
    errorMap: () => ({ message: "type must be 'breakfast', 'lunch', or 'dinner'" })
  })
});

// GET /api/admin/polls - List all polls
router.get('/polls', async (req, res, next) => {
  try {
    const [polls] = await db.query(
      `SELECT p.id, p.title, p.description, p.meal_date, p.meal_type, p.is_active, p.closes_at, p.created_at,
              COUNT(DISTINCT v.id) AS total_votes
       FROM polls p
       LEFT JOIN votes v ON p.id = v.poll_id
       GROUP BY p.id
       ORDER BY p.id DESC`
    );

    return res.json({ polls });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/polls/:id/results - Comprehensive breakdown
router.get('/polls/:id/results', async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID', details: 'Poll ID must be an integer' });
    }

    const [polls] = await db.query('SELECT * FROM polls WHERE id = ?', [pollId]);
    if (polls.length === 0) {
      return res.status(404).json({ error: 'Poll not found', details: 'Poll not found' });
    }
    const poll = polls[0];

    // Total registered students count
    const [userCountRows] = await db.query(
      "SELECT COUNT(*) AS total_students FROM users WHERE role = 'student'"
    );
    const registeredStudentCount = userCountRows[0].total_students;

    // Items breakdown
    const [items] = await db.query(
      `SELECT mi.id, mi.name, mi.description, mi.display_order,
              COUNT(v.id) AS vote_count
       FROM menu_items mi
       LEFT JOIN votes v ON mi.id = v.menu_item_id AND v.poll_id = ?
       WHERE mi.poll_id = ?
       GROUP BY mi.id, mi.name, mi.description, mi.display_order
       ORDER BY mi.display_order ASC`,
      [pollId, pollId]
    );

    const totalVotes = items.reduce((sum, item) => sum + Number(item.vote_count), 0);

    const itemsWithPercent = items.map(item => {
      const count = Number(item.vote_count);
      const percentage = totalVotes > 0 ? Number(((count / totalVotes) * 100).toFixed(1)) : 0;
      return {
        ...item,
        vote_count: count,
        percentage
      };
    });

    // Student type breakdown (home vs external)
    const [typeRows] = await db.query(
      `SELECT u.student_type, COUNT(v.id) AS count
       FROM votes v
       JOIN users u ON v.user_id = u.id
       WHERE v.poll_id = ?
       GROUP BY u.student_type`,
      [pollId]
    );

    const breakdownByType = {
      home: 0,
      external: 0
    };
    typeRows.forEach(r => {
      if (r.student_type === 'home') breakdownByType.home = Number(r.count);
      if (r.student_type === 'external') breakdownByType.external = Number(r.count);
    });

    // Detailed voters table
    const [voters] = await db.query(
      `SELECT v.id, u.name AS user_name, u.college_name, u.student_type, mi.name AS choice, v.created_at AS voted_at
       FROM votes v
       JOIN users u ON v.user_id = u.id
       JOIN menu_items mi ON v.menu_item_id = mi.id
       WHERE v.poll_id = ?
       ORDER BY v.created_at DESC`,
      [pollId]
    );

    return res.json({
      poll,
      totalVotes,
      registeredStudentCount,
      options: itemsWithPercent,
      breakdownByType,
      voters
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/polls/:id - Open or close poll (Opening one closes all others)
router.patch('/polls/:id', validateBody(patchPollSchema), async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID', details: 'Poll ID must be an integer' });
    }

    const [existing] = await db.query('SELECT id, title FROM polls WHERE id = ?', [pollId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Poll not found', details: 'Poll does not exist' });
    }

    if (is_active) {
      // Opening this poll: close all other active polls
      await db.execute('UPDATE polls SET is_active = 0 WHERE id != ?', [pollId]);
      await db.execute('UPDATE polls SET is_active = 1 WHERE id = ?', [pollId]);
    } else {
      // Closing this poll
      await db.execute('UPDATE polls SET is_active = 0 WHERE id = ?', [pollId]);
    }

    const [updated] = await db.query('SELECT * FROM polls WHERE id = ?', [pollId]);

    return res.json({
      message: `Poll has been ${is_active ? 'opened' : 'closed'} successfully.`,
      poll: updated[0]
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/meal-intent?date=YYYY-MM-DD&type=lunch
router.get('/meal-intent', validateQuery(mealIntentQuerySchema), async (req, res, next) => {
  try {
    const { date, type } = req.query;

    // Total registered students
    const [userRows] = await db.query(
      `SELECT student_type, COUNT(*) AS count
       FROM users
       WHERE role = 'student'
       GROUP BY student_type`
    );

    let totalStudents = 0;
    let homeStudentsTotal = 0;
    let externalStudentsTotal = 0;

    userRows.forEach(r => {
      const c = Number(r.count);
      totalStudents += c;
      if (r.student_type === 'home') homeStudentsTotal = c;
      if (r.student_type === 'external') externalStudentsTotal = c;
    });

    // Responses for this meal
    const [responses] = await db.query(
      `SELECT mr.will_eat, u.student_type, COUNT(*) AS count
       FROM meal_responses mr
       JOIN users u ON mr.user_id = u.id
       WHERE mr.meal_date = ? AND mr.meal_type = ?
       GROUP BY mr.will_eat, u.student_type`,
      [date, type]
    );

    let yesCount = 0;
    let noCount = 0;
    let yesHome = 0;
    let yesExternal = 0;
    let noHome = 0;
    let noExternal = 0;

    responses.forEach(r => {
      const cnt = Number(r.count);
      if (r.will_eat === 1) {
        yesCount += cnt;
        if (r.student_type === 'home') yesHome += cnt;
        if (r.student_type === 'external') yesExternal += cnt;
      } else {
        noCount += cnt;
        if (r.student_type === 'home') noHome += cnt;
        if (r.student_type === 'external') noExternal += cnt;
      }
    });

    const totalAnswered = yesCount + noCount;
    const noResponseCount = Math.max(0, totalStudents - totalAnswered);

    const yesPercent = totalStudents > 0 ? Number(((yesCount / totalStudents) * 100).toFixed(1)) : 0;
    const noPercent = totalStudents > 0 ? Number(((noCount / totalStudents) * 100).toFixed(1)) : 0;
    const noResponsePercent = totalStudents > 0 ? Number(((noResponseCount / totalStudents) * 100).toFixed(1)) : 0;
    const responseRate = totalStudents > 0 ? Number(((totalAnswered / totalStudents) * 100).toFixed(1)) : 0;

    return res.json({
      meal: { date, type },
      totalRegisteredStudents: totalStudents,
      summary: {
        yes: { count: yesCount, percentage: yesPercent },
        no: { count: noCount, percentage: noPercent },
        noResponse: { count: noResponseCount, percentage: noResponsePercent },
        responseRate
      },
      splitByStudentType: {
        yes: { home: yesHome, external: yesExternal },
        no: { home: noHome, external: noExternal },
        totalStudentsByType: { home: homeStudentsTotal, external: externalStudentsTotal }
      },
      notice: "Meal intentions are self-reported plans from students who responded. They do not constitute an attendance record or complete demand forecast."
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
