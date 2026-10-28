// Seeds the throwaway stack (http://localhost:18080) with a believable woodworking community. Idempotent only on a fresh DB.
const BASE = 'http://localhost:18080/api/v1';
const PASS = 'shots-pass-123';

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return json;
}

const people = [
  ['marta', 'Marta Kowal'], ['jonas', 'Jonas Pike'], ['ana', 'Ana Lopez'], ['tomas', 'Tomas Weber'],
  ['priya', 'Priya Nair'], ['leo', 'Leo Marsh'], ['sam', 'Sam Reyes'], ['ines', 'Ines Costa'], ['omar', 'Omar Haddad'], ['hana', 'Hana Sato'],
];
const U = {}; // username -> { token, id }
for (const [username, display] of people) {
  const r = await api('POST', '/auth/register', { username, email: `${username}@example.com`, password: PASS, accept_policies: true });
  await api('PATCH', '/users/@me', { display_name: display }, r.access_token);
  U[username] = { token: r.access_token, id: r.user.id, display };
}
const t = (u) => U[u].token;
const everyone = Object.keys(U);

async function place(owner, name, slug, description) {
  const p = await api('POST', '/places', { name, slug, description, visibility: 'public' }, t(owner));
  for (const u of everyone) if (u !== owner) await api('POST', `/places/${slug}/join`, undefined, t(u));
  return p;
}
const board = (owner, slug, name, bslug, description, extra = {}) =>
  api('POST', `/places/${slug}/boards`, { name, slug: bslug, description, kind: 'board', solutions_enabled: true, ...extra }, t(owner));
const channel = (owner, slug, name, kind = 'text', topic = '') =>
  api('POST', `/places/${slug}/channels`, { name, kind, topic }, t(owner));
const topic = async (user, boardId, title, content) => (await api('POST', `/boards/${boardId}/topics`, { title, content }, t(user)));
const reply = (user, topicId, content, parent_id) => api('POST', `/topics/${topicId}/posts`, { content, ...(parent_id ? { parent_id } : {}) }, t(user));
const vote = (users, topicId) => Promise.all(users.map((u) => api('PUT', `/topics/${topicId}/vote`, { value: 1 }, t(u))));
const say = (user, channelId, content, extra = {}) => api('POST', `/channels/${channelId}/messages`, { content, ...extra }, t(user));

// ---- Places -------------------------------------------------------------------------------------------------
const OW = 'open-woodworkers';
await place('jonas', 'Open Woodworkers', OW, 'Joinery, finishing, and shop talk from people who build things slowly.');
await place('priya', 'Harbor Street Cycling', 'harbor-street-cycling', 'Rides, repairs and route notes for the harbor crowd.');
await place('omar', 'Cedar Lane Staff', 'cedar-lane-staff', 'Rotas and announcements for the Cedar Lane team.');
await place('hana', 'Rust Study Group', 'rust-study-group', 'Weekly chapters of the Rust book, with notes.');

const joinery = await board('jonas', OW, 'Joinery', 'joinery', 'Dovetails, mortises, and everything that holds wood together.');
const finishing = await board('jonas', OW, 'Finishing', 'finishing', 'Oils, shellac, and getting a surface you can be proud of.');
const tools = await board('jonas', OW, 'Tools and sharpening', 'tools', 'Planes, chisels, stones and what to buy next.');
const show = await board('jonas', OW, 'Show your work', 'show-your-work', 'Finished pieces and works in progress.', { solutions_enabled: false });

const benchTalk = await channel('jonas', OW, 'bench-talk', 'text', 'Shop chatter');
const swap = await channel('jonas', OW, 'buy-sell-swap', 'text', 'Tools and offcuts');
const openShop = await channel('jonas', OW, 'Open shop', 'voice');

const maint = await board('priya', 'harbor-street-cycling', 'Maintenance', 'maintenance', 'Fixes and how-tos.');
const cycRides = await channel('priya', 'harbor-street-cycling', 'rides', 'text');
const cedarNews = await board('omar', 'cedar-lane-staff', 'Rotas', 'rotas', 'Weekly rotas.', { solutions_enabled: false });
const cedarChat = await channel('omar', 'cedar-lane-staff', 'general', 'text');
const rustNotes = await board('hana', 'rust-study-group', 'Chapter notes', 'notes', 'Notes per chapter.');
const rustChat = await channel('hana', 'rust-study-group', 'general', 'text');

// ---- Forum: Open Woodworkers ---------------------------------------------------------------------------------
const voters = ['ana', 'tomas', 'priya', 'leo', 'sam', 'ines', 'omar', 'hana', 'marta'];

const dovetail = await topic('jonas', joinery.id, 'Dovetails keep gapping at the baseline',
  'My pins fit tight at the face but open a hairline gap near the baseline. What am I missing?\n\nI saw the tails marked with a **sharp knife**, chopped to the line, and pared, but the joint still opens a hair at the bottom.');
const dovetailReplies = [
  ['tomas', 'Are you undercutting the waste at all, or chopping straight down?'],
  ['ana', 'Your baseline is probably being crushed when you chop. Chop halfway from each face and undercut the waste slightly past the line.'],
  ['priya', 'Seconding the undercut. A tiny relief behind the baseline is enough.'],
  ['leo', 'Also check that your chisel is truly square to the wall. A sloppy back bevel can wedge the cut.'],
  ['sam', 'Paring with a slightly skewed chisel got me past this.'],
  ['jonas', 'Chopping from both faces, then paring to a knifed line. Gap is gone. Thank you all.'],
];
let acceptedPost;
for (const [u, c] of dovetailReplies) {
  const p = await reply(u, dovetail.topic.id, c);
  if (u === 'ana') acceptedPost = p;
}
await api('PUT', `/topics/${dovetail.topic.id}/solution`, { post_id: acceptedPost.id }, t('jonas'));
for (const [u, e] of [['jonas', '👍'], ['tomas', '👍'], ['priya', '👍'], ['leo', '👍'], ['sam', '👍']]) await api('PUT', `/posts/${acceptedPost.id}/reactions/${encodeURIComponent(e)}`, undefined, t(u)).catch(() => {});
await vote(voters, dovetail.topic.id);

const sliding = await topic('tomas', joinery.id, 'Sliding dovetail for a shelf: router or saw?',
  'Building a bookcase and the shelves want to sit in sliding dovetails. Router jig or hand saw and chisel?');
for (const [u, c] of [['ana', 'Router for the housing, hand-cut the tail. Best of both.'], ['jonas', 'A tapered sliding dovetail is much less painful than a parallel one.'], ['leo', 'Test on scrap first. Always.']]) await reply(u, sliding.topic.id, c);
await vote(['ana', 'jonas', 'leo', 'sam', 'ines'], sliding.topic.id);

const mortise = await topic('ana', joinery.id, 'Mortise and tenon proportions that actually hold',
  'A third of the stock thickness for the tenon is the textbook answer. What do you use in practice?');
for (const [u, c] of [['jonas', 'A third, with shoulders on all four sides.'], ['tomas', 'Haunch the tenon on frame and panel.'], ['priya', 'Drawbore it and stop worrying.']]) await reply(u, mortise.topic.id, c);
await vote(['jonas', 'tomas', 'priya', 'leo', 'marta', 'sam', 'hana'], mortise.topic.id);

const clamp = await topic('marta', joinery.id, 'Glue-up clamping pressure: how much is too much?',
  'I keep starving joints when I crank the clamps. How tight is tight enough?');
for (const [u, c] of [['jonas', 'Snug, then a quarter turn. A thin bead of squeeze-out is what you want.'], ['ana', 'If the clamp bar bows, you are way past it.'], ['leo', 'Cauls help more than force.']]) await reply(u, clamp.topic.id, c);
await vote(['jonas', 'ana', 'leo', 'sam'], clamp.topic.id);

const jointer = await topic('tomas', show.id, 'First board from the new jointer, no snipe at all',
  'After a week of fiddling with the outfeed table height it finally runs flat.');
for (const [u, c] of [['ana', 'Looks great. What is the width capacity?'], ['jonas', 'Outfeed height is everything. Nicely done.'], ['sam', 'Posting a photo of the setup would help everyone.']]) await reply(u, jointer.topic.id, c);
await vote(['ana', 'jonas', 'sam', 'leo', 'priya', 'ines', 'omar', 'hana', 'marta'], jointer.topic.id);

const hones = await topic('leo', tools.id, 'What hones do you keep at the bench?',
  'Looking for a short list: one coarse, one fine, nothing fussy.');
await vote(['ana', 'jonas', 'priya', 'tomas', 'sam'], hones.topic.id);
// marta reads "hones" before the new replies below, which leaves it in the feed as "N new".
await api('PUT', `/topics/${hones.topic.id}/read`, { post_number: 1 }, t('marta')).catch(() => {});
for (const [u, c] of [['ana', 'A 1000/6000 combination stone covers almost everything.'], ['jonas', 'Plus a strop with green compound.'], ['tomas', 'I keep a coarse diamond plate for reshaping.']]) await reply(u, hones.topic.id, c);

const oil = await topic('sam', finishing.id, 'Hardwax oil over shellac: any problems?', 'Planning a tabletop with shellac sealer and a hardwax oil topcoat.');
await reply('ana', oil.topic.id, 'Works fine as long as the shellac is dewaxed.');
await vote(['ana', 'jonas'], oil.topic.id);

// ---- Forum: other places -------------------------------------------------------------------------------------
const tyres = await topic('priya', maint.id, 'Winter tyre pressure thread', 'What pressures are people running on the wet harbor roads?');
await reply('omar', tyres.topic.id, '70 psi rear, 65 front. Wider tyres let me drop it further.');
const rota = await topic('omar', cedarNews.id, 'Rota for the week of 12 Oct', 'Posted in the staff room. Swap requests go here.');
const ownership = await topic('hana', rustNotes.id, 'Ownership notes, chapter 4', 'Move semantics, borrowing and slices, with the exercises.');
await reply('sam', ownership.topic.id, 'The slice section finally made the borrow checker click for me.');

// ---- Chat: bench-talk ----------------------------------------------------------------------------------------
for (const [u, c] of [
  ['leo', 'Planer is back from the shop. Thanks everyone for the loan.'],
  ['ana', 'Does anyone have a spare 3/8 mortise chisel I can borrow?'],
  ['jonas', 'I have one. Bring a mallet and it is yours for the afternoon.'],
  ['sam', 'Finished the walnut bench top last night, oil goes on tomorrow.'],
  ['priya', 'Photos please, I want to see the grain.'],
  ['tomas', 'Anyone else seeing tearout on quartersawn oak with the new blade?'],
  ['leo', 'Skew the plane a few degrees and take a lighter cut.'],
]) await say(u, benchTalk.id, c);
const m1 = await say('jonas', benchTalk.id, "Anyone up for open shop tomorrow? I'm bringing the new #7.");
const m2 = await say('ana', benchTalk.id, "I'm in. Bringing cherry offcuts for small boxes.");
for (const u of ['jonas', 'tomas', 'priya']) await api('PUT', `/messages/${m2.id}/reactions/${encodeURIComponent('👍')}`, undefined, t(u));
const m3 = await say('tomas', benchTalk.id, 'Count me in. What time do doors open?');
const m4 = await say('jonas', benchTalk.id, 'Doors at 9. Coffee is on me.');
const thread = await api('POST', `/channels/${benchTalk.id}/threads`, { message_id: m4.id, name: 'Open shop plans' }, t('jonas'));
await say('ana', thread.id, 'I can bring biscuits too.');
await say('tomas', thread.id, 'Saving a bench for you both.');
await say('jonas', thread.id, 'See you at nine.');
// marta has read up to here; the next message is the "New" divider.
await api('PUT', `/channels/${benchTalk.id}/read`, { message_id: m4.id }, t('marta')).catch(async () => api('PUT', `/channels/${benchTalk.id}/read`, { last_read_message_id: m4.id }, t('marta')));
const m5 = await say('ana', benchTalk.id, '@marta did you want the cherry in 4/4 or thicker? I can plane some down tonight.');
await say('leo', benchTalk.id, 'Bring the jack plane, the cherry is cupped.');

await say('sam', swap.id, 'Selling a Veritas low-angle block plane, barely used.');
await say('ines', swap.id, 'Free offcuts of walnut, collect from the shop door.');

// ---- Chat: other places, so Places shows unread counts -------------------------------------------------------
for (const [u, c] of [['hana', 'Chapter 4 tonight at 7.'], ['sam', 'I will bring the slice exercises.'], ['leo', 'Anyone tried the lifetimes chapter yet?']]) await say(u, rustChat.id, c);
for (let i = 0; i < 9; i++) await say(['hana', 'sam', 'leo'][i % 3], rustChat.id, ['Ownership is the part that sticks.', 'Think of it as one owner at a time.', 'Borrowing is just a temporary lend.'][i % 3]);
for (const [u, c] of [['priya', 'Sunday ride leaves at 8 from the pier.'], ['omar', 'In. Bringing the spare pump.'], ['priya', 'Flat route, no hills this week.']]) await say(u, cycRides.id, c);
for (const [u, c] of [['omar', 'Rota is up for the week.'], ['hana', 'Swap request: can I take Tuesday?']]) await say(u, cedarChat.id, c);

// ---- Direct messages -----------------------------------------------------------------------------------------
const dm = async (from, to, lines) => {
  const ch = await api('POST', '/users/@me/channels', { recipient_ids: [U[to].id] }, t(from));
  for (const l of lines) await say(from === 'marta' ? 'marta' : from, ch.id, l);
  return ch;
};
{
  const ch = await api('POST', '/users/@me/channels', { recipient_ids: [U.marta.id] }, t('jonas'));
  const lines = [
    ['jonas', 'Are you coming to open shop tomorrow?'],
    ['marta', 'Wouldn\'t miss it. Need anything from the lumber yard?'],
    ['jonas', 'A couple of cherry boards in 4/4 would be great if you pass by.'],
    ['marta', 'On it. I will bring a moisture meter too.'],
    ['jonas', 'Perfect. Your clamping thread is getting good replies, by the way.'],
    ['marta', 'I saw. Cauls it is.'],
  ];
  let last;
  for (const [u, c] of lines) last = await say(u, ch.id, c);
  await api('PUT', `/channels/${ch.id}/read`, { message_id: last.id }, t('marta'));
  await say('jonas', ch.id, 'Sent you the photos of the #7');
}
const anaDm = await api('POST', '/users/@me/channels', { recipient_ids: [U.ana.id] }, t('marta'));
await say('marta', anaDm.id, 'Can you pin the dovetail topic? It helped a lot.');
await say('ana', anaDm.id, "Thanks, I'll add it to the pinned topic.");
const group = await api('POST', '/users/@me/channels', { name: 'Saturday build', recipient_ids: [U.ana.id, U.tomas.id, U.jonas.id] }, t('marta'));
await say('marta', group.id, 'Coffee order for Saturday?');
await say('tomas', group.id, 'Decaf for me, please.');
const tomasDm = await api('POST', '/users/@me/channels', { recipient_ids: [U.tomas.id] }, t('marta'));
await say('tomas', tomasDm.id, 'Router bit sizes are in the shop notes.');
await say('marta', tomasDm.id, 'Got it, thanks.');

console.log(JSON.stringify({ benchTalk: benchTalk.id, openShop: openShop.id, dovetail: dovetail.topic.id, hones: hones.topic.id, joinery: joinery.id, group: group.id, anaDm: anaDm.id }));
