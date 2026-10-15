const db = require('../config/db');

const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

// Fallback menu options if no previous polls exist in DB
const DEFAULT_MENU_OPTIONS = [
  {
    name: 'South Indian Traditional Thali',
    description: 'Steamed ponni rice, authentic spiced sambar, tangy rasam, kootu, poriyal, crispy appalam, curd, and sweet payasam.',
    display_order: 1
  },
  {
    name: 'North Indian Deluxe Combo',
    description: 'Phulkas with homemade butter, paneer butter masala, dal makhani slow-cooked overnight, jeera rice, fresh salad, and gulab jamun.',
    display_order: 2
  },
  {
    name: 'Dum Vegetable Biryani Bowl',
    description: 'Fragrant basmati rice layered with garden vegetables, saffron and whole spices, served with fresh mint onion raita, salan gravy, and roasted papad.',
    display_order: 3
  },
  {
    name: 'High-Fiber Millet & Veg Pulao',
    description: 'Foxtail and barnyard millet tossed with seasonal vegetables, herbs and roasted cashews, paired with vegetable raita and sprout salad.',
    display_order: 4
  }
];

/**
 * Returns formatted date string (YYYY-MM-DD) in configured timezone
 */
function getLocalDateString(date = new Date(), tz = APP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Returns current timestamp string in local timezone (YYYY-MM-DD HH:mm:ss)
 */
function getLocalTimestampString(date = new Date(), tz = APP_TIMEZONE) {
  const dateStr = getLocalDateString(date, tz);
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const timeStr = timeFormatter.format(date);
  return `${dateStr} ${timeStr}`;
}

/**
 * Calculate the next calendar day string (YYYY-MM-DD) given a date string
 */
function getTomorrowDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return nextDay.toISOString().split('T')[0];
}

/**
 * Calculate the previous calendar day string (YYYY-MM-DD) given a date string
 */
function getYesterdayDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const prevDay = new Date(Date.UTC(year, month - 1, day - 1));
  return prevDay.toISOString().split('T')[0];
}

// Concurrency mutex flag for synchronization
let isSyncing = false;

/**
 * Idempotently synchronize daily polls:
 * 1. Expire outdated polls whose cutoff has passed or whose meal_date is in the past.
 * 2. Ensure an active poll exists for the upcoming scheduled meal (tomorrow's lunch).
 * 3. Clone existing configured menu items so no fake/hardcoded data is generated.
 * 4. Retain historical votes and poll associations intact.
 *
 * @param {string|null} dateOverride Optional date in YYYY-MM-DD format for testing time transitions
 */
async function syncDailyPolls(dateOverride = null) {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const todayStr = dateOverride || getLocalDateString(new Date(), APP_TIMEZONE);
    const targetMealDate = getTomorrowDateString(todayStr);
    const targetMealType = 'lunch';
    const targetClosesAt = `${todayStr} 23:00:00`;

    // 1. Deactivate outdated polls whose voting cutoff has passed
    // If closes_at <= current timestamp or meal_date < todayStr, it must no longer be active
    const nowLocalStr = dateOverride ? `${dateOverride} 12:00:00` : getLocalTimestampString(new Date(), APP_TIMEZONE);

    await db.execute(
      `UPDATE polls
       SET is_active = 0
       WHERE is_active = 1
         AND (
           (closes_at IS NOT NULL AND closes_at <= ?)
           OR meal_date < ?
         )`,
      [nowLocalStr, todayStr]
    );

    // 2. Check if a poll already exists for targetMealDate and targetMealType
    const [existingPolls] = await db.query(
      `SELECT id, title, description, meal_date, meal_type, is_active, closes_at
       FROM polls
       WHERE meal_date = ? AND meal_type = ?
       LIMIT 1`,
      [targetMealDate, targetMealType]
    );

    if (existingPolls.length > 0) {
      // Poll for this meal date already exists.
      // Ensure this poll is active if within cutoff and deactivate other active polls
      const currentPoll = existingPolls[0];
      const isPastCutoff = currentPoll.closes_at ? new Date(currentPoll.closes_at) <= new Date(nowLocalStr) : false;

      if (!isPastCutoff) {
        // Deactivate other active polls to guarantee single active poll
        await db.execute('UPDATE polls SET is_active = 0 WHERE is_active = 1 AND id != ?', [currentPoll.id]);
        await db.execute('UPDATE polls SET is_active = 1 WHERE id = ?', [currentPoll.id]);
        currentPoll.is_active = 1;
      }
      return currentPoll;
    }

    // 3. No poll exists for the scheduled meal - Create it idempotently
    // Deactivate all existing active polls
    await db.execute('UPDATE polls SET is_active = 0 WHERE is_active = 1');

    // Fetch configured menu items from the most recent poll
    let menuItemsToCopy = [];
    const [recentItems] = await db.query(
      `SELECT mi.name, mi.description, mi.display_order
       FROM menu_items mi
       JOIN polls p ON mi.poll_id = p.id
       WHERE p.meal_type = ?
       ORDER BY p.id DESC, mi.display_order ASC`,
      [targetMealType]
    );

    if (recentItems.length > 0) {
      menuItemsToCopy = recentItems;
    } else {
      const [anyRecentItems] = await db.query(
        `SELECT mi.name, mi.description, mi.display_order
         FROM menu_items mi
         JOIN polls p ON mi.poll_id = p.id
         ORDER BY p.id DESC, mi.display_order ASC
         LIMIT 4`
      );
      if (anyRecentItems.length > 0) {
        menuItemsToCopy = anyRecentItems;
      } else {
        menuItemsToCopy = DEFAULT_MENU_OPTIONS;
      }
    }

    // Insert new daily poll
    const title = 'Tomorrow Lunch Menu Preference Poll';
    const description = 'Vote for your preferred mess lunch menu option for tomorrow. Responses help the kitchen management team prepare balanced quantities.';

    const [insertResult] = await db.execute(
      `INSERT INTO polls (title, description, meal_date, meal_type, is_active, closes_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [title, description, targetMealDate, targetMealType, targetClosesAt]
    );

    const newPollId = insertResult.insertId;

    // Insert cloned menu items for the new poll
    for (const item of menuItemsToCopy) {
      await db.execute(
        `INSERT INTO menu_items (poll_id, name, description, display_order)
         VALUES (?, ?, ?, ?)`,
        [newPollId, item.name, item.description, item.display_order]
      );
    }

    const [newPollRows] = await db.query('SELECT * FROM polls WHERE id = ?', [newPollId]);
    return newPollRows[0];
  } catch (err) {
    // If unique constraint duplicate, ignore error (handled by another concurrent sync)
    if (err.code !== 'ER_DUP_ENTRY') {
      console.error('[PollService] Error syncing daily poll:', err);
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Retrieve the current active poll for external students and meal intention
 * Automatically runs syncDailyPolls() before querying.
 */
async function getActivePoll(dateOverride = null) {
  await syncDailyPolls(dateOverride);

  const todayStr = dateOverride || getLocalDateString(new Date(), APP_TIMEZONE);
  const targetMealDate = getTomorrowDateString(todayStr);

  // 1. First priority: the scheduled poll for tomorrow (active voting target for today)
  const [targetRows] = await db.query(
    `SELECT id, title, description, DATE_FORMAT(meal_date, '%Y-%m-%d') AS meal_date, meal_type, is_active, closes_at, created_at
     FROM polls
     WHERE meal_date = ?
     LIMIT 1`,
    [targetMealDate]
  );

  if (targetRows.length > 0) {
    return targetRows[0];
  }

  // 2. Second priority: active poll whose meal_date is upcoming (>= todayStr)
  const [activeRows] = await db.query(
    `SELECT id, title, description, DATE_FORMAT(meal_date, '%Y-%m-%d') AS meal_date, meal_type, is_active, closes_at, created_at
     FROM polls
     WHERE is_active = 1
       AND meal_date >= ?
     ORDER BY meal_date ASC, id DESC
     LIMIT 1`,
    [todayStr]
  );

  if (activeRows.length > 0) {
    return activeRows[0];
  }

  return null;
}

// Background scheduler handle
let schedulerInterval = null;

function startDailyPollScheduler(intervalMs = 30000) {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    syncDailyPolls().catch(err => {
      console.error('[Poll Scheduler] Error in background poll sync:', err);
    });
  }, intervalMs);
}

function stopDailyPollScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

module.exports = {
  APP_TIMEZONE,
  getLocalDateString,
  getLocalTimestampString,
  getTomorrowDateString,
  getYesterdayDateString,
  syncDailyPolls,
  getActivePoll,
  startDailyPollScheduler,
  stopDailyPollScheduler
};
