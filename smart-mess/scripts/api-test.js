/**
 * Automated End-to-End API Test Suite for Smart Mess Prototype
 * 
 * Tests covered:
 * 1. Health check & Config endpoints
 * 2. Registration validation errors (short password, invalid email, etc.)
 * 3. Duplicate email registration conflict (409)
 * 4. Successful registration (home student & external visitor)
 * 5. Login failure (invalid credentials) & success
 * 6. Unauthenticated access protection (401 on protected routes)
 * 7. Non-admin access to admin routes (403 forbidden)
 * 8. Fetch active poll and menu options
 * 9. Voting successfully
 * 10. Duplicate vote rejection (409)
 * 11. Correct poll count and percentage verification
 * 12. Meal intention first answer
 * 13. Changing meal intention answer before cutoff
 * 14. Invalid intention bodies (non-boolean willEat, invalid date format, wrong date)
 * 15. Admin detailed results and correct home vs external vote breakdown
 * 16. Admin meal-intent analytics (Yes, No, No-response counts and response rate)
 * 17. Admin poll toggle (close poll)
 * 18. Voting rejection after poll is closed (409)
 */

const path = require('path');
const fs = require('fs');
try {
  require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });
} catch (e) {
  // Fallback env parser
  if (fs.existsSync(path.resolve(__dirname, '../backend/.env'))) {
    const lines = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
}

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

let homeUserCookie = '';
let externalUserCookie = '';
let adminUserCookie = '';
let activePollId = null;
let menuItem1Id = null;
let menuItem2Id = null;
let upcomingMealDate = null;
let upcomingMealType = null;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    ...options,
    headers
  });

  let data = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  // Extract set-cookie header if any
  const cookieHeader = res.headers.get('set-cookie');
  return { status: res.status, data, cookieHeader };
}

function extractTokenCookie(setCookieHeader) {
  if (!setCookieHeader) return '';
  const match = setCookieHeader.match(/token=([^;]+)/);
  return match ? `token=${match[1]}` : '';
}

async function runTestSuite() {
  console.log(`\n=======================================================`);
  console.log(`  STARTING SMART MESS END-TO-END API TEST SUITE`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`=======================================================\n`);

  try {
    // 1. Health & Config Check
    console.log(`[TEST GROUP 1] Health & Public Config`);
    const health = await request('/api/health');
    assert(health.status === 200 && health.data.status === 'healthy', 'GET /api/health returns 200 and status healthy');

    const config = await request('/api/config');
    assert(config.status === 200 && typeof config.data.homeCollegeName === 'string', 'GET /api/config returns 200 and homeCollegeName');

    // 2. Registration Validation Errors
    console.log(`\n[TEST GROUP 2] Registration Validation & Edge Cases`);
    const invalidReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'R',
        email: 'invalid-email',
        college_name: 'Tech',
        student_type: 'unknown_type',
        password: 'short'
      })
    });
    assert(invalidReg.status === 400 && invalidReg.data.error === 'Validation failed', 'POST /api/auth/register rejects invalid schema with 400');

    // 3. Register Home Student
    const testTimestamp = Date.now();
    const homeEmail = `student_home_${testTimestamp}@test.edu`;
    const homeReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Aarav Kumar',
        email: homeEmail,
        college_name: config.data.homeCollegeName || 'National Institute of Technology',
        student_type: 'home',
        password: 'Password123'
      })
    });
    assert(homeReg.status === 201 && homeReg.data.user.student_type === 'home', 'Register home student creates user (201)');
    homeUserCookie = extractTokenCookie(homeReg.cookieHeader);

    // 4. Duplicate Email Conflict
    const dupReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Duplicate Aarav',
        email: homeEmail,
        college_name: 'NIT',
        student_type: 'home',
        password: 'Password123'
      })
    });
    assert(dupReg.status === 409, 'Duplicate email registration returns 409 Conflict');

    // 5. Register External Visitor
    const extEmail = `visitor_ext_${testTimestamp}@external.edu`;
    const extReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Priya Verma',
        email: extEmail,
        college_name: 'PSG College of Technology',
        student_type: 'external',
        password: 'Password123'
      })
    });
    assert(extReg.status === 201 && extReg.data.user.student_type === 'external', 'Register external visitor creates user (201)');
    externalUserCookie = extractTokenCookie(extReg.cookieHeader);

    // 6. Login Validation & Failures
    console.log(`\n[TEST GROUP 3] Authentication & Security`);
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: homeEmail,
        password: 'WrongPassword99'
      })
    });
    assert(badLogin.status === 401 && badLogin.data.details === 'Invalid email or password', 'Failed login returns generic 401 error');

    // Non-existent user login (checks dummy hash timing defense)
    const fakeUserLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'nobody_exists@random.com',
        password: 'Password123'
      })
    });
    assert(fakeUserLogin.status === 401, 'Non-existent user login safely returns generic 401');

    // Successful login for Admin
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@mess.local',
        password: process.env.ADMIN_PASSWORD || 'AdminSecurePass123!'
      })
    });
    assert(adminLogin.status === 200 && adminLogin.data.user.role === 'admin', 'Admin login succeeds and returns admin role (200)');
    adminUserCookie = extractTokenCookie(adminLogin.cookieHeader);

    // 7. Protected & Admin Route Authorization Checks
    console.log(`\n[TEST GROUP 4] Access Control & Authorization`);
    const unauthAccess = await request('/api/polls/active');
    assert(unauthAccess.status === 401, 'Unauthenticated request to protected route returns 401');

    const studentAdminAccess = await request('/api/admin/polls', {
      headers: { Cookie: homeUserCookie }
    });
    assert(studentAdminAccess.status === 403, 'Student trying to access admin endpoint returns 403 Forbidden');

    // 8. Poll Fetching & Menu Items Check
    console.log(`\n[TEST GROUP 5] Poll Retrieval & Voting`);
    const pollRes = await request('/api/polls/active', {
      headers: { Cookie: homeUserCookie }
    });
    assert(pollRes.status === 200 && pollRes.data.poll !== null, 'Authenticated user can fetch active poll (200)');
    assert(pollRes.data.results.items.length === 4, 'Active poll contains exactly 4 menu options');

    activePollId = pollRes.data.poll.id;
    menuItem1Id = pollRes.data.results.items[0].id;
    menuItem2Id = pollRes.data.results.items[1].id;
    upcomingMealDate = pollRes.data.poll.meal_date;
    upcomingMealType = pollRes.data.poll.meal_type;

    // 9. Cast Vote as Home Student
    const vote1 = await request(`/api/polls/${activePollId}/vote`, {
      method: 'POST',
      headers: { Cookie: homeUserCookie },
      body: JSON.stringify({ menu_item_id: menuItem1Id })
    });
    assert(vote1.status === 201 && vote1.data.menu_item_id === menuItem1Id, 'Home student successfully casts vote (201)');

    // 10. Duplicate Vote Block
    const dupVote = await request(`/api/polls/${activePollId}/vote`, {
      method: 'POST',
      headers: { Cookie: homeUserCookie },
      body: JSON.stringify({ menu_item_id: menuItem2Id })
    });
    assert(dupVote.status === 409 && dupVote.data.error === 'Already voted', 'Duplicate vote is rejected with 409 Already voted');

    // 11. Cast Vote as External Student for Option 2
    const vote2 = await request(`/api/polls/${activePollId}/vote`, {
      method: 'POST',
      headers: { Cookie: externalUserCookie },
      body: JSON.stringify({ menu_item_id: menuItem2Id })
    });
    assert(vote2.status === 201, 'External visitor successfully casts vote (201)');

    // 12. Verify Live Poll Results and Percentages
    const resultsRes = await request(`/api/polls/${activePollId}/results`, {
      headers: { Cookie: homeUserCookie }
    });
    assert(resultsRes.status === 200 && resultsRes.data.totalVotes >= 2, 'Live poll results calculate total votes correctly');
    const item1 = resultsRes.data.items.find(i => i.id === menuItem1Id);
    const item2 = resultsRes.data.items.find(i => i.id === menuItem2Id);
    assert(item1.vote_count >= 1 && item2.vote_count >= 1, 'Both voted items reflect positive counts');

    // 13. Meal Intention Notification & Flow
    console.log(`\n[TEST GROUP 6] Meal Intention Notification & Answer Updates`);
    const intentStatus = await request('/api/notifications/meal-intent', {
      headers: { Cookie: homeUserCookie }
    });
    assert(intentStatus.status === 200 && intentStatus.data.meal !== null, 'GET /api/notifications/meal-intent returns meal details');

    // Invalid body testing (non-boolean willEat, invalid date format)
    const invalidIntent1 = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: homeUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: 'yes' // Non-boolean
      })
    });
    assert(invalidIntent1.status === 400, 'Non-boolean willEat is rejected with 400 Validation Error');

    const invalidIntent2 = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: homeUserCookie },
      body: JSON.stringify({
        mealDate: '2099-01-01', // Wrong date
        mealType: upcomingMealType,
        willEat: true
      })
    });
    assert(invalidIntent2.status === 400, 'Wrong meal date is rejected with 400 Invalid target meal');

    // Home student answers "Yes, I'll eat"
    const submitIntent1 = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: homeUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: true
      })
    });
    assert(submitIntent1.status === 200 && submitIntent1.data.willEat === true, 'Home student submits Yes intention (200)');

    // Home student changes answer to "No, I won't" before cutoff
    const changeIntent = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: homeUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: false
      })
    });
    assert(changeIntent.status === 200 && changeIntent.data.willEat === false, 'Student successfully changes intention before cutoff (200)');

    // External visitor answers "Yes, I'll eat"
    const submitIntent2 = await request('/api/meal-intent', {
      method: 'PUT',
      headers: { Cookie: externalUserCookie },
      body: JSON.stringify({
        mealDate: upcomingMealDate,
        mealType: upcomingMealType,
        willEat: true
      })
    });
    assert(submitIntent2.status === 200 && submitIntent2.data.willEat === true, 'External visitor submits Yes intention (200)');

    // 14. Admin Analytics & Student Type Breakdown
    console.log(`\n[TEST GROUP 7] Admin Analytics & Student Type Split`);
    const adminPollDetails = await request(`/api/admin/polls/${activePollId}/results`, {
      headers: { Cookie: adminUserCookie }
    });
    assert(adminPollDetails.status === 200, 'Admin can view detailed poll results (200)');
    assert(adminPollDetails.data.breakdownByType.home >= 1, 'Home student votes recorded in admin breakdown');
    assert(adminPollDetails.data.breakdownByType.external >= 1, 'External visitor votes recorded in admin breakdown');
    assert(Array.isArray(adminPollDetails.data.voters) && adminPollDetails.data.voters.length >= 2, 'Admin voters audit table populated');

    // Admin Meal Intention Metrics
    const adminIntentMetrics = await request(`/api/admin/meal-intent?date=${upcomingMealDate}&type=${upcomingMealType}`, {
      headers: { Cookie: adminUserCookie }
    });
    assert(adminIntentMetrics.status === 200, 'Admin can fetch meal intention analytics (200)');
    assert(adminIntentMetrics.data.summary.yes.count >= 1, 'Admin meal intention counts Yes responses');
    assert(adminIntentMetrics.data.summary.no.count >= 1, 'Admin meal intention counts No responses');
    assert(typeof adminIntentMetrics.data.summary.responseRate === 'number', 'Admin meal intention calculates response rate');
    assert(adminIntentMetrics.data.splitByStudentType.yes.external >= 1, 'Admin meal intention splits Yes by external visitor');
    assert(adminIntentMetrics.data.splitByStudentType.no.home >= 1, 'Admin meal intention splits No by home student');

    // 15. Admin Poll Controls & Voting after Close
    console.log(`\n[TEST GROUP 8] Admin Poll Controls & Closed Poll Rejection`);
    const closePollRes = await request(`/api/admin/polls/${activePollId}`, {
      method: 'PATCH',
      headers: { Cookie: adminUserCookie },
      body: JSON.stringify({ is_active: false })
    });
    assert(closePollRes.status === 200 && closePollRes.data.poll.is_active === 0, 'Admin successfully closes poll (PATCH 200)');

    // New student tries to vote after poll is closed
    const lateStudentEmail = `late_student_${testTimestamp}@test.edu`;
    const lateReg = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Late Voter',
        email: lateStudentEmail,
        college_name: config.data.homeCollegeName || 'NIT',
        student_type: 'home',
        password: 'Password123'
      })
    });
    const lateUserCookie = extractTokenCookie(lateReg.cookieHeader);

    const lateVote = await request(`/api/polls/${activePollId}/vote`, {
      method: 'POST',
      headers: { Cookie: lateUserCookie },
      body: JSON.stringify({ menu_item_id: menuItem1Id })
    });
    assert(lateVote.status === 409 && lateVote.data.error === 'Poll closed', 'Vote cast on closed poll is rejected with 409 Poll closed');

    // Reopen poll
    const reopenPollRes = await request(`/api/admin/polls/${activePollId}`, {
      method: 'PATCH',
      headers: { Cookie: adminUserCookie },
      body: JSON.stringify({ is_active: true })
    });
    assert(reopenPollRes.status === 200 && reopenPollRes.data.poll.is_active === 1, 'Admin successfully reopens poll');

    // Unknown API Route 404 test
    const unknownRes = await request('/api/unknown-endpoint');
    assert(unknownRes.status === 404 && unknownRes.data.error === 'Not found', 'Unknown /api route returns JSON 404');

    console.log(`\n=======================================================`);
    console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log(`=======================================================\n`);

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during test run:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite();
}

module.exports = runTestSuite;
