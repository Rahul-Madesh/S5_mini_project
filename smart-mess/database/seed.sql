-- Seed data for Smart Mess Meal Pre-Booking
-- Inserts 1 active poll for tomorrow's lunch with 4 realistic Indian mess options

INSERT INTO polls (title, description, meal_date, meal_type, is_active, closes_at)
VALUES (
    'Tomorrow Lunch Menu Preference Poll',
    'Vote for your preferred mess lunch menu option for tomorrow. Responses help the kitchen management team prepare balanced quantities.',
    CURDATE() + INTERVAL 1 DAY,
    'lunch',
    1,
    DATE_ADD(CURDATE(), INTERVAL 23 HOUR)
);

SET @poll_id = LAST_INSERT_ID();

INSERT INTO menu_items (poll_id, name, description, display_order) VALUES
(
    @poll_id,
    'South Indian Traditional Thali',
    'Steamed ponni rice, authentic spiced sambar, tangy rasam, kootu, poriyal, crispy appalam, curd, and sweet payasam.',
    1
),
(
    @poll_id,
    'North Indian Deluxe Combo',
    'Phulkas with homemade butter, paneer butter masala, dal makhani slow-cooked overnight, jeera rice, fresh salad, and gulab jamun.',
    2
),
(
    @poll_id,
    'Dum Vegetable Biryani Bowl',
    'Fragrant basmati rice layered with garden vegetables, saffron and whole spices, served with fresh mint onion raita, salan gravy, and roasted papad.',
    3
),
(
    @poll_id,
    'High-Fiber Millet & Veg Pulao',
    'Foxtail and barnyard millet tossed with seasonal vegetables, herbs and roasted cashews, paired with vegetable raita and sprout salad.',
    4
);
