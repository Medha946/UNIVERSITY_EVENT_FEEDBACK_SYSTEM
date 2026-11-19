// Mock data: 30 users, 6 categories, 25 events, ~350 registrations (MySQL) + feedback docs (MongoDB)
// Login after seeding:  admin@pesu.example.edu / Admin@123   |   any student email / Student@123
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(2026);
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTs = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

const firstNames = ['Aarav','Ananya','Rohan','Diya','Karthik','Meera','Vikram','Sneha','Arjun','Priya','Rahul','Kavya','Nikhil','Isha','Siddharth','Pooja','Harsh','Nandini','Varun','Shreya','Aditya','Lakshmi','Manoj','Tanvi','Rishi','Sanjana','Dev','Ritika'];
const lastNames = ['Sharma','Reddy','Iyer','Nair','Gowda','Patel','Rao','Menon','Kulkarni','Bhat','Joshi','Hegde','Shetty','Naidu'];
const departments = ['Computer Science','Electronics','Mechanical','Biotechnology','Management','Architecture'];
const categories = ['Technical','Cultural','Sports','Workshop','Career','Social Impact'];

// [title, description, venue, categoryIndex, dayOffset, capacity]
const events = [
  ['Hack the Campus 2026','24-hour hackathon on campus sustainability tools with mentors from industry.','Innovation Lab',0,-58,60],
  ['Intro to Machine Learning Bootcamp','Hands-on workshop covering regression, classification and model evaluation in Python.','Seminar Hall A',3,-50,40],
  ['Inter-Department Cricket League','Knockout cricket tournament between all departments.','Main Ground',2,-45,80],
  ['Classical Music Evening','An evening of Carnatic and Hindustani performances by student artists.','Auditorium',1,-41,120],
  ['Resume and LinkedIn Clinic','Alumni reviewers give one-on-one feedback on resumes and profiles.','Placement Cell',4,-36,30],
  ['Robotics Hands-on Lab','Build and program a line-following robot in small teams.','Robotics Lab',3,-31,24],
  ['Blood Donation Camp','Annual blood donation drive in partnership with a city hospital.','Health Centre',5,-27,100],
  ['Open Mic Night','Poetry, stand-up and music open mic hosted by the literary club.','Amphitheatre',1,-22,90],
  ['Cloud Computing with AWS','Workshop on deploying a web app using core AWS services.','Seminar Hall B',3,-18,45],
  ['Startup Pitch Day','Student founders pitch ideas to a panel of angel investors.','Entrepreneurship Cell',4,-13,50],
  ['Basketball 3v3 Tournament','Fast-paced 3-on-3 basketball tournament, open to all years.','Indoor Court',2,-9,32],
  ['Women in Tech Panel','Panel discussion with engineers and founders on building careers in technology.','Auditorium',4,-4,110],
  ['Capture the Flag: Cyber Security','Beginner-friendly cyber security CTF with web and cryptography challenges.','Computer Lab 3',0,3,40],
  ['Full-Stack Web Dev Workshop','Build a Next.js and MySQL application from scratch in one day.','Seminar Hall A',3,5,35],
  ['Tree Plantation Drive','Plant saplings across campus and neighbouring village schools.','Campus Gate 2',5,6,70],
  ['Annual Dance Showcase','Group and solo dance performances across classical and contemporary styles.','Auditorium',1,8,150],
  ['Drone Flying Basics','Introduction to drone mechanics, safety rules and supervised flying.','Open Quadrangle',0,10,8],
  ['Campus Placement Prep Series','Aptitude, group discussion and interview preparation sessions.','Seminar Hall B',4,12,100],
  ['Table Tennis Open','Singles and doubles table tennis tournament.','Sports Complex',2,14,24],
  ['Data Visualization Masterclass','Learn storytelling with data using dashboards and charts.','Computer Lab 1',3,17,30],
  ['Photography Walk','Guided campus photography walk followed by an exhibition of the best shots.','Campus Gardens',1,20,25],
  ['Teach for a Day','Volunteers teach science experiments at a government school.','Community Outreach Centre',5,23,40],
  ['Quantum Computing Seminar','Introductory seminar on qubits, gates and near-term quantum algorithms.','Seminar Hall A',0,27,80],
  ['Alumni Networking Mixer','Meet alumni from product, research and consulting roles.','Convention Centre',4,31,120],
  ['Rotaract Charity Marathon','5K and 10K charity run with proceeds supporting local education projects.','Main Ground',5,38,200],
];

const comments = {
  1: ['Poorly organised and started late.', 'Too crowded, could not follow.'],
  2: ['Content was okay but the venue was uncomfortable.', 'Needed better time management.'],
  3: ['Decent event, a few things could improve.', 'Good overall, sound system was weak.'],
  4: ['Really enjoyed it, well organised.', 'Great speakers and a smooth schedule.', 'Learned a lot, would attend again.'],
  5: ['Fantastic event, one of the best this year!', 'Brilliant organisation and very engaging.', 'Loved every minute, please host more like this.'],
};
const tagPool = ['well-organised','engaging','too-crowded','great-speakers','learned-a-lot','late-start','good-food','fun','needs-better-venue'];
function survey(cat) {
  if (cat === 'Technical' || cat === 'Workshop') return { contentDepth: int(2, 5), handsOnWasUseful: rand() > 0.2, difficulty: pick(['easy', 'just right', 'hard']) };
  if (cat === 'Cultural') return { ambience: int(3, 5), wouldAttendAgain: rand() > 0.1 };
  if (cat === 'Sports') return { fairPlay: int(3, 5), scheduleOnTime: rand() > 0.3 };
  return { venueRating: int(2, 5), wouldRecommend: rand() > 0.2 };
}

(async () => {
  const db = await mysql.createPool({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['EventAuditLog', 'Registrations', 'Events', 'Categories', 'Users']) await db.query(`TRUNCATE TABLE ${t}`);
  await db.query('SET FOREIGN_KEY_CHECKS = 1');

  const adminHash = await bcrypt.hash('Admin@123', 10);
  const studentHash = await bcrypt.hash('Student@123', 10);

  const users = [
    ['Dr. Nagasundari S', 'admin@pesu.example.edu', adminHash, 'Admin', 'Computer Science'],
    ['Event Coordinator', 'coordinator@pesu.example.edu', adminHash, 'Admin', 'Management'],
  ];
  const studentNames = [];
  for (let i = 0; i < 28; i++) {
    const name = `${firstNames[i]} ${pick(lastNames)}`;
    studentNames.push(name);
    users.push([name, `${firstNames[i].toLowerCase()}.${i + 1}@pesu.example.edu`, studentHash, 'Student', pick(departments)]);
  }
  await db.query('INSERT INTO Users (Name, Email, PasswordHash, Role, Department) VALUES ?', [users]);
  await db.query('INSERT INTO Categories (CategoryName) VALUES ?', [categories.map((c) => [c])]);
  await db.query(
    'INSERT INTO Events (Title, Description, Venue, EventDate, Capacity, CategoryID, OrganizerID) VALUES ?',
    [events.map((e) => [e[0], e[1], e[2], fmtDate(addDays(e[4])), e[5], e[3] + 1, pick([1, 2])])]
  );

  // Registrations (respect capacity so the DB trigger is never tripped)
  const regs = [];
  const registrantsByEvent = {};
  events.forEach((e, idx) => {
    const eventId = idx + 1;
    const target = e[5] <= 10 ? e[5] : int(8, Math.min(e[5], 26));
    const chosen = shuffle(Array.from({ length: 28 }, (_, i) => i + 3)).slice(0, target);
    registrantsByEvent[eventId] = chosen;
    chosen.forEach((uid) => {
      const when = new Date(Math.min(addDays(e[4]).getTime() - int(3, 30) * 86400000 + int(0, 80000) * 1000, Date.now() - 3600000));
      regs.push([uid, eventId, fmtTs(when)]);
    });
  });
  await db.query('INSERT INTO Registrations (UserID, EventID, RegDate) VALUES ?', [regs]);

  // MongoDB feedback for past events only
  const mongo = await new MongoClient(process.env.MONGODB_URI).connect();
  const fb = mongo.db(process.env.MONGODB_DB).collection('feedback');
  await fb.deleteMany({});
  const docs = [];
  events.forEach((e, idx) => {
    if (e[4] >= 0) return;
    registrantsByEvent[idx + 1].forEach((uid) => {
      if (rand() > 0.65) return;
      const rating = pick([2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 1]);
      docs.push({
        eventId: idx + 1, userId: uid, userName: studentNames[uid - 3], rating,
        comment: pick(comments[rating]),
        tags: shuffle(tagPool).slice(0, int(1, 3)),
        survey: survey(categories[e[3]]),
        submittedAt: new Date(addDays(e[4]).getTime() + int(1, 5) * 86400000),
      });
    });
  });
  await fb.insertMany(docs);
  await fb.createIndex({ eventId: 1, userId: 1 }, { unique: true });

  console.log(`Seeded: ${users.length} users, ${categories.length} categories, ${events.length} events, ${regs.length} registrations, ${docs.length} feedback docs`);
  console.log('Admin   : admin@pesu.example.edu / Admin@123');
  console.log('Student : aarav.1@pesu.example.edu / Student@123');
  await mongo.close(); await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
