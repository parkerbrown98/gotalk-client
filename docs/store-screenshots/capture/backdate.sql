BEGIN;
-- Topics: [created, last activity] relative to now.
UPDATE topics t SET created_at = now() - v.c::interval, last_post_at = now() - v.l::interval, updated_at = now() - v.l::interval
FROM (VALUES
  ('Dovetails keep gapping at the baseline', '5 hours', '2 hours'),
  ('Sliding dovetail for a shelf: router or saw?', '27 hours', '65 minutes'),
  ('Mortise and tenon proportions that actually hold', '3 days', '26 hours'),
  ('Glue-up clamping pressure: how much is too much?', '2 days', '40 hours'),
  ('First board from the new jointer, no snipe at all', '4 hours 30 minutes', '4 hours'),
  ('What hones do you keep at the bench?', '7 hours', '6 hours'),
  ('Hardwax oil over shellac: any problems?', '10 hours', '9 hours'),
  ('Winter tyre pressure thread', '26 hours', '20 hours'),
  ('Rota for the week of 12 Oct', '3 days', '3 days'),
  ('Ownership notes, chapter 4', '2 days', '30 hours')
) AS v(title, c, l) WHERE t.title = v.title;

-- Posts spread between their topic's creation and last activity, in post order.
UPDATE posts p SET created_at = t.created_at + (t.last_post_at - t.created_at) * ((p.post_number - 1)::float8 / greatest(m.maxn - 1, 1)),
                   updated_at = t.created_at + (t.last_post_at - t.created_at) * ((p.post_number - 1)::float8 / greatest(m.maxn - 1, 1))
FROM topics t JOIN (SELECT topic_id, max(post_number) AS maxn FROM posts GROUP BY topic_id) m ON m.topic_id = t.id
WHERE p.topic_id = t.id;

-- bench-talk: clock times earlier today (UTC), matching the mockups' story.
WITH d AS (SELECT date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' AS day)
UPDATE messages m SET created_at = d.day + v.t::interval, updated_at = d.day + v.t::interval
FROM d, (VALUES
  ('Anyone up for open shop tomorrow%', '10 hours 12 minutes'),
  ('I''m in. Bringing cherry offcuts%', '10 hours 14 minutes'),
  ('Count me in. What time do doors open%', '10 hours 21 minutes'),
  ('Doors at 9. Coffee is on me.', '10 hours 23 minutes'),
  ('I can bring biscuits too.', '10 hours 25 minutes'),
  ('Saving a bench for you both.', '10 hours 31 minutes'),
  ('See you at nine.', '10 hours 40 minutes'),
  ('@marta did you want the cherry%', '10 hours 52 minutes'),
  ('Bring the jack plane%', '10 hours 55 minutes')
) AS v(pat, t) WHERE m.content LIKE v.pat;

-- Direct messages and the group.
UPDATE messages SET created_at = now() - interval '45 minutes' WHERE content LIKE 'Sent you the photos%';
UPDATE messages SET created_at = now() - interval '27 hours' WHERE content LIKE 'Can you pin the dovetail%';
UPDATE messages SET created_at = now() - interval '26 hours' WHERE content LIKE 'Thanks, I''ll add it%';
UPDATE messages SET created_at = now() - interval '50 hours' WHERE content LIKE 'Coffee order for Saturday%';
UPDATE messages SET created_at = now() - interval '49 hours' WHERE content LIKE 'Decaf for me%';
UPDATE messages SET created_at = now() - interval '30 days' WHERE content LIKE 'Router bit sizes%';
UPDATE messages SET created_at = now() - interval '30 days' + interval '5 minutes' WHERE content = 'Got it, thanks.';

-- Remaining channels: spread over the morning, newest last.
WITH ranked AS (
  SELECT m.id, count(*) OVER (PARTITION BY m.channel_id) AS n, row_number() OVER (PARTITION BY m.channel_id ORDER BY m.id) AS rn
  FROM messages m JOIN channels c ON c.id = m.channel_id
  WHERE c.name IN ('buy-sell-swap', 'general', 'rides')
)
UPDATE messages m SET created_at = now() - interval '5 hours' + (interval '8 minutes' * r.rn) - (interval '8 minutes' * r.n) + interval '4 hours'
FROM ranked r WHERE m.id = r.id;


-- bench-talk history from yesterday.
WITH d AS (SELECT date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' AS day)
UPDATE messages m SET created_at = d.day - interval '1 day' + v.t::interval, updated_at = d.day - interval '1 day' + v.t::interval
FROM d, (VALUES
  ('Planer is back from the shop%', '15 hours 2 minutes'),
  ('Does anyone have a spare 3/8%', '15 hours 20 minutes'),
  ('I have one. Bring a mallet%', '15 hours 24 minutes'),
  ('Finished the walnut bench top%', '16 hours 40 minutes'),
  ('Photos please, I want to see%', '16 hours 52 minutes'),
  ('Anyone else seeing tearout%', '18 hours 5 minutes'),
  ('Skew the plane a few degrees%', '18 hours 11 minutes')
) AS v(pat, t) WHERE m.content LIKE v.pat;

-- Notifications: spread over the last day instead of all landing "now".
WITH r AS (SELECT id, row_number() OVER (ORDER BY id DESC) AS rn FROM notifications)
UPDATE notifications n SET created_at = now() - interval '23 minutes' * r.rn FROM r WHERE n.id = r.id;

-- Jonas and Marta: yesterday evening into today.
UPDATE messages SET created_at = date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' - interval '1 day' + interval '17 hours 20 minutes' WHERE content LIKE 'Are you coming to open shop tomorrow%';
UPDATE messages SET created_at = date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' - interval '1 day' + interval '17 hours 26 minutes' WHERE content LIKE 'Wouldn''t miss it%';
UPDATE messages SET created_at = date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' - interval '1 day' + interval '17 hours 31 minutes' WHERE content LIKE 'A couple of cherry boards%';
UPDATE messages SET created_at = date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' - interval '1 day' + interval '17 hours 40 minutes' WHERE content LIKE 'On it. I will bring%';
UPDATE messages SET created_at = date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' + interval '8 hours 5 minutes' WHERE content LIKE 'Perfect. Your clamping thread%';
UPDATE messages SET created_at = date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' + interval '8 hours 12 minutes' WHERE content LIKE 'I saw. Cauls it is%';

UPDATE channels c SET last_message_at = (SELECT max(created_at) FROM messages m WHERE m.channel_id = c.id) WHERE EXISTS (SELECT 1 FROM messages m WHERE m.channel_id = c.id);
COMMIT;
