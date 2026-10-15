const express = require('express');
const { z } = require('zod');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const pollService = require('../services/pollService');

const router = express.Router();

const voteSchema = z.object({
  menu_item_id: z.number().int().positive('Valid menu item ID is required')
});

// Helper to calculate results for a poll
async function getPollResultsData(pollId) {
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
      id: item.id,
      name: item.name,
      description: item.description,
      display_order: item.display_order,
      vote_count: count,
      percentage
    };
  });

  return {
    totalVotes,
    items: itemsWithPercent
  };
}

// GET /api/polls/active
router.get('/active', requireAuth, async (req, res, next) => {
  try {
    const testDate = req.headers['x-test-date'] || (req.query.test_date && process.env.NODE_ENV !== 'production' ? req.query.test_date : null);
    const poll = await pollService.getActivePoll(testDate);

    if (!poll) {
      return res.json({
        poll: null,
        message: 'No active poll currently available.'
      });
    }

    const pollId = poll.id;

    // Check user's own vote
    const [myVotes] = await db.query(
      `SELECT v.id, v.menu_item_id, v.created_at, mi.name AS menu_item_name
       FROM votes v
       JOIN menu_items mi ON v.menu_item_id = mi.id
       WHERE v.poll_id = ? AND v.user_id = ?`,
      [pollId, req.user.id]
    );

    const userVote = myVotes.length > 0 ? {
      voted: true,
      menu_item_id: myVotes[0].menu_item_id,
      menu_item_name: myVotes[0].menu_item_name,
      voted_at: myVotes[0].created_at
    } : { voted: false, menu_item_id: null, menu_item_name: null };

    // Get items and results
    const results = await getPollResultsData(pollId);

    // Check if poll cutoff has passed or poll date is expired
    const todayStr = testDate || pollService.getLocalDateString();
    const isPastClosesAt = poll.closes_at ? new Date(poll.closes_at) <= new Date() : false;
    const isPastMealDate = poll.meal_date < todayStr;

    return res.json({
      poll: {
        ...poll,
        is_closed: !poll.is_active || isPastClosesAt || isPastMealDate
      },
      userVote,
      results
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/polls/:id/results
router.get('/:id/results', requireAuth, async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID', details: 'Poll ID must be an integer' });
    }

    const [polls] = await db.query('SELECT id, title, is_active, closes_at FROM polls WHERE id = ?', [pollId]);
    if (polls.length === 0) {
      return res.status(404).json({ error: 'Poll not found', details: 'No poll with this ID exists' });
    }

    const results = await getPollResultsData(pollId);

    return res.json({
      pollId,
      ...results
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/polls/:id/vote
// Atomic vote casting checking active status and closes_at
router.post('/:id/vote', requireAuth, validateBody(voteSchema), async (req, res, next) => {
  try {
    const pollId = parseInt(req.params.id, 10);
    const { menu_item_id } = req.body;
    const userId = req.user.id;

    if (isNaN(pollId)) {
      return res.status(400).json({ error: 'Invalid poll ID', details: 'Poll ID must be an integer' });
    }

    // 1. Verify poll existence and status
    const [polls] = await db.query(
      'SELECT id, is_active, closes_at, DATE_FORMAT(meal_date, "%Y-%m-%d") AS meal_date FROM polls WHERE id = ?',
      [pollId]
    );

    if (polls.length === 0) {
      return res.status(404).json({
        error: 'Poll not found',
        details: 'The specified poll does not exist.'
      });
    }

    const poll = polls[0];
    const isPastClosesAt = poll.closes_at ? new Date(poll.closes_at) <= new Date() : false;
    const todayStr = pollService.getLocalDateString();
    const isPastMealDate = poll.meal_date < todayStr;

    if (!poll.is_active || isPastClosesAt || isPastMealDate) {
      return res.status(409).json({
        error: 'Poll closed',
        details: 'This poll is no longer active or has passed its voting deadline.'
      });
    }

    // 2. Check if user already voted in this poll
    const [existingVote] = await db.query(
      'SELECT id FROM votes WHERE poll_id = ? AND user_id = ?',
      [pollId, userId]
    );

    if (existingVote.length > 0) {
      return res.status(409).json({
        error: 'Already voted',
        details: 'You have already cast your vote in this poll. Each student can vote only once.'
      });
    }

    // 3. Verify menu item belongs to this poll
    const [items] = await db.query(
      'SELECT id, name FROM menu_items WHERE id = ? AND poll_id = ?',
      [menu_item_id, pollId]
    );

    if (items.length === 0) {
      return res.status(400).json({
        error: 'Invalid menu item',
        details: 'The selected menu option does not belong to this poll.'
      });
    }

    // 4. Atomic INSERT ... SELECT enforcing active & not expired conditions
    try {
      const [insertResult] = await db.execute(
        `INSERT INTO votes (poll_id, menu_item_id, user_id)
         SELECT p.id, ?, ?
         FROM polls p
         WHERE p.id = ? 
           AND p.is_active = 1 
           AND (p.closes_at IS NULL OR p.closes_at > NOW())
           AND p.meal_date >= CURDATE()`,
        [menu_item_id, userId, pollId]
      );

      if (insertResult.affectedRows === 0) {
        return res.status(409).json({
          error: 'Poll closed',
          details: 'Unable to record vote because the poll is closed or past its deadline.'
        });
      }

      const results = await getPollResultsData(pollId);

      return res.status(201).json({
        message: 'Vote recorded successfully',
        choice: items[0].name,
        menu_item_id,
        results
      });
    } catch (insertErr) {
      if (insertErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'Already voted',
          details: 'You have already voted in this poll.'
        });
      }
      throw insertErr;
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
