// Mock data for every screen state (invented teachers, groups, courses)

const row = (time, room, course, title, teacher, groups, status, extra = {}) => ({ time, room, course, title, teacher, groups, status, ...extra });

// ---------- Tuesday 10:47:32 (hero) ----------
export const HERO_PHASES = {
  1: { 101: 'ending', 110: 'live', 112: 'live' },
  2: { 207: 'live', 208: 'live', 210: 'live', 211: 'live', 213: 'live', 214: 'live', 215: 'live', 216: 'ending', 218: 'live' },
  3: { 301: 'live', 302: 'live', 304: 'live', 305: 'ending', 308: 'live', 310: 'live', 312: 'live', 313: 'delayed' },
  4: { 401: 'live', 403: 'live', 404: 'live', 408: 'live', 409: 'live', 411: 'live', 412: 'ending', 413: 'live' },
};

export const HERO_NOW = [
  row('10:00', '101', 'CS110', 'Programming I', 'Nurgaliyeva A.', 'ПО2401, ПО2402', 'ending', { until: '10:50' }),
  row('10:00', '305', 'MA101', 'Discrete Math', 'Smirnov P.', 'ИС2301', 'ending', { until: '10:50' }),
  row('10:00', '216', 'SE330', 'Web Development', 'Kim V.', 'ПО2310', 'ending', { until: '10:50' }),
  row('10:00', '412', 'AI320', 'Machine Learning', 'Sadykova G.', 'БДА2401', 'ending', { until: '10:50' }),
  row('10:15', '313', 'CB240', 'Network Security', 'Bekzhanov T.', 'КБ2401', 'delayed', { until: '11:05' }),
  row('10:00', '213', 'CS201', 'Databases', 'Akhmetov D.', 'ПО2308, ПО2309', 'live', { until: '11:50' }),
  row('10:00', '110', 'PH101', 'Physics', 'Ivanova E.', 'ВТ2401, ВТ2402', 'live', { until: '11:50' }),
];
export const HERO_NEXT = [
  row('11:00', '303', 'CS250', 'Algorithms', 'Orazbayev N.', 'ИС2301, ИС2302', 'upcoming', { statusLabel: 'STARTS 11:00' }),
  row('11:00', '101', 'MA101', 'Discrete Math', 'Smirnov P.', 'ПО2401, ПО2402', 'upcoming', { statusLabel: 'STARTS 11:00' }),
  row('11:00', '216', 'SE210', 'Software Design', 'Kairatova M.', 'ПО2310', 'cancelled'),
  row('11:00', '412', 'DS215', 'Statistics', 'Petrova O.', 'БДА2401', 'moved', { statusLabel: 'MOVED → 414' }),
  row('12:00', '205', 'PM200', 'Project Management', 'Zhumabekov S.', 'ПО2308', 'upcoming', { statusLabel: 'STARTS 12:00' }),
];
export const HERO_TICKER = [
  { text: '216 · SE210 Software Design at 11:00 is cancelled · Kairatova M.', warn: true },
  { text: '412 → 414 · DS215 Statistics moved to room 414 at 11:00' },
  { text: '313 · CB240 Network Security delayed +15 min · ends 11:05' },
  { text: 'Open Lecture · Assembly Hall "Aula" 110 · Thu 14:00 · guest speaker from Astana Hub' },
  { text: 'Library & Reading Room 113 open until 22:00' },
];

export const HERO = {
  clock: '10:47:32', date: 'TUE 8 SEP 2026', week: 'WEEK 3 · ODD',
  floorBusy: [28, 3, 9, 8, 8], busy: 28, total: 41,
  phases: HERO_PHASES, now: HERO_NOW, next: HERO_NEXT, nowTotal: 28, nextTotal: 14,
  nowPages: 4, nextPages: 3, ticker: HERO_TICKER, connection: 'online', timePct: 0.232,
};

// ---------- 11:08:12 — floor 2 focused, room 213 selected ----------
export const FOCUS2 = {
  ...HERO,
  clock: '11:08:12', floorBusy: [29, 3, 8, 9, 9], busy: 29, focusFloor: 2, selectedRoom: '213', timePct: 0.261,
  phases: { ...HERO_PHASES, 2: { 205: 'live', 207: 'live', 210: 'live', 213: 'live', 214: 'live', 215: 'live', 217: 'live', 219: 'live' } },
  chips: {
    205: { course: 'PM200', line: 'ends 42 min', phase: 'live', pct: 0.16 },
    207: { course: 'EN101', line: 'ends 42 min', phase: 'live', pct: 0.16 },
    208: { course: '', line: 'free · next 12:00', phase: 'free' },
    210: { course: 'IOT310', line: 'ends 42 min', phase: 'live', pct: 0.16 },
    211: { course: '', line: 'free · next 12:00', phase: 'free' },
    213: { course: 'CS201', line: 'ends 42 min', phase: 'live', pct: 0.62 },
    214: { course: 'MA101', line: 'ends 42 min', phase: 'live', pct: 0.16 },
    215: { course: 'HI101', line: 'ends 42 min', phase: 'live', pct: 0.16 },
    216: { course: '', line: 'free · next 12:00', phase: 'free' },
    217: { course: 'DS215', line: 'ends 42 min', phase: 'live', pct: 0.16 },
    218: { course: '', line: 'free · next 13:00', phase: 'free' },
    219: { course: 'EN205', line: 'ends 42 min', phase: 'live', pct: 0.16 },
  },
  now: [
    row('10:00', '213', 'CS201', 'Databases', 'Akhmetov D.', 'ПО2308, ПО2309', 'live', { until: '11:50' }),
    row('10:00', '110', 'PH101', 'Physics', 'Ivanova E.', 'ВТ2401, ВТ2402', 'live', { until: '11:50' }),
    row('11:00', '303', 'CS250', 'Algorithms', 'Orazbayev N.', 'ИС2301, ИС2302', 'live', { until: '11:50' }),
    row('11:00', '101', 'MA101', 'Discrete Math', 'Smirnov P.', 'ПО2401, ПО2402', 'live', { until: '11:50' }),
    row('11:00', '205', 'PM200', 'Project Management', 'Zhumabekov S.', 'ПО2308', 'live', { until: '11:50' }),
    row('11:00', '414', 'DS215', 'Statistics', 'Petrova O.', 'БДА2401', 'live', { until: '11:50' }),
    row('11:00', '210', 'IOT310', 'IoT Systems', 'Kim V.', 'ВТ2401', 'live', { until: '11:50' }),
  ],
  next: [
    row('12:00', '216', 'SE330', 'Web Development', 'Kim V.', 'ПО2310', 'upcoming', { statusLabel: 'STARTS 12:00' }),
    row('12:00', '208', 'KZ100', 'Kazakh Language', 'Kairatova M.', 'ПО2402', 'upcoming', { statusLabel: 'STARTS 12:00' }),
    row('12:00', '211', 'ST300', 'Startup Studio', 'Abenov Y.', 'ПО2309', 'upcoming', { statusLabel: 'STARTS 12:00' }),
    row('12:00', '309', 'CS330', 'Computer Networks', 'Tleuberdiyev A.', 'ИС2302', 'cancelled'),
    row('12:00', '112', 'RB210', 'Robotics', 'Alimov R.', 'ВТ2402', 'upcoming', { statusLabel: 'STARTS 12:00' }),
  ],
  nowTotal: 29, nextTotal: 11, nowPages: 5, nextPages: 3,
  detail: {
    code: '213', name: 'Lecture Hall "Gamma"', meta: 'Lecture hall · 100 seats · Floor 2 · South wing',
    now: { type: 'LECTURE', course: 'CS201', title: 'Databases', time: '10:00 – 11:50', groups: 'ПО2308, ПО2309', elapsed: '68 min elapsed · 62%', left: 'ends in 42 min', pct: 0.62, initials: 'DA', teacher: 'Akhmetov D.', dept: 'Dept. of Computer Science' },
    next: [
      { time: '12:00', course: 'CS305', title: 'Operating Systems', sub: 'Alimov R. · ИС2301 · until 12:50' },
      { time: '14:00', course: 'CS405', title: 'Distributed Systems', sub: 'Akhmetov D. · ПО2308 · until 14:50' },
      { time: '16:00', course: 'SE320', title: 'Mobile Development', sub: 'Kim V. · ПО2310 · until 16:50' },
    ],
  },
};

// ---------- 10:47:32 — search "ПО2308" ----------
export const SEARCH = {
  ...HERO,
  highlight: {
    213: { kind: 'now', label: 'NOW', sub: 'CS201 Databases · until 11:50' },
    205: { kind: 'next', label: 'NEXT 12:00', sub: 'PM200 Project Mgmt' },
  },
  query: 'ПО2308',
  results: [
    { title: 'GROUPS', items: [{ code: 'ПО2308', title: 'Software Engineering · year 3', sub: 'now 213 Databases · next 12:00 205 Project Management', tag: 'ON MAP', active: true }] },
    { title: 'TEACHERS', items: [{ code: 'Akhmetov D.', title: 'Dept. of Computer Science', sub: 'teaches ПО2308 today · 213 at 10:00, 14:00' }] },
    { title: 'ROOMS', items: [{ code: '213', title: 'Lecture Hall "Gamma"', sub: 'ПО2308 here now · until 11:50' }, { code: '205', title: 'Faculty Meeting Room', sub: 'ПО2308 at 12:00' }] },
  ],
  now: [row('10:00', '213', 'CS201', 'Databases', 'Akhmetov D.', 'ПО2308, ПО2309', 'live', { until: '11:50' })],
  next: [
    row('12:00', '205', 'PM200', 'Project Management', 'Zhumabekov S.', 'ПО2308', 'upcoming', { statusLabel: 'STARTS 12:00' }),
    row('14:00', '213', 'CS405', 'Distributed Systems', 'Akhmetov D.', 'ПО2308', 'upcoming', { statusLabel: 'STARTS 14:00' }),
  ],
  nowTotal: 1, nextTotal: 2, nowPages: 1, nextPages: 1, filter: 'ПО2308',
};

// ---------- 14:05:00 SIMULATED — time travel ----------
export const TRAVEL = {
  ...HERO,
  clock: '14:05:00', simulated: true, timePct: 0.507,
  floorBusy: [31, 4, 10, 9, 8], busy: 31,
  phases: {
    1: { 101: 'live', 110: 'live', 111: 'live', 112: 'live' },
    2: { 205: 'live', 207: 'live', 208: 'live', 210: 'live', 211: 'live', 213: 'live', 214: 'live', 216: 'live', 217: 'live', 219: 'live' },
    3: { 301: 'live', 302: 'live', 303: 'live', 304: 'live', 305: 'live', 308: 'live', 309: 'live', 312: 'live', 313: 'live' },
    4: { 401: 'live', 402: 'live', 403: 'live', 408: 'live', 409: 'live', 410: 'live', 412: 'live', 414: 'live' },
  },
  now: [
    row('14:00', '213', 'CS405', 'Distributed Systems', 'Akhmetov D.', 'ПО2308', 'live', { until: '14:50' }),
    row('14:00', '101', 'CS110', 'Programming I', 'Nurgaliyeva A.', 'ПО2401, ПО2402', 'live', { until: '14:50' }),
    row('14:00', '110', 'OL100', 'Open Lecture', 'Guest speaker', 'all groups', 'live', { until: '15:30' }),
    row('14:00', '313', 'CB310', 'Cryptography', 'Bekzhanov T.', 'КБ2401, КБ2402', 'live', { until: '14:50' }),
    row('14:00', '412', 'ML410', 'Deep Learning', 'Sadykova G.', 'БДА2401', 'live', { until: '14:50' }),
    row('14:00', '210', 'IOT310', 'IoT Systems', 'Kim V.', 'ВТ2401', 'live', { until: '14:50' }),
    row('14:00', '219', 'EN205', 'Academic Writing', 'Petrova O.', 'ИС2302', 'live', { until: '14:50' }),
  ],
  next: [
    row('15:00', '303', 'CS250', 'Algorithms', 'Orazbayev N.', 'ИС2301', 'upcoming', { statusLabel: 'STARTS 15:00' }),
    row('15:00', '216', 'SE330', 'Web Development', 'Kim V.', 'ПО2310', 'upcoming', { statusLabel: 'STARTS 15:00' }),
    row('15:00', '207', 'KZ100', 'Kazakh Language', 'Kairatova M.', 'ПО2402', 'cancelled'),
    row('15:00', '215', 'PH101', 'Physics', 'Ivanova E.', 'ВТ2402', 'upcoming', { statusLabel: 'STARTS 15:00' }),
    row('15:00', '311', 'MA201', 'Linear Algebra', 'Smirnov P.', 'ИС2302', 'moved', { statusLabel: 'MOVED → 310' }),
  ],
  nowTotal: 31, nextTotal: 12, nowPages: 5, nextPages: 3,
  ticker: [
    { text: 'Simulated time 14:05 · live feed paused · press LIVE to return', warn: true },
    { text: '207 · KZ100 Kazakh Language at 15:00 is cancelled · Kairatova M.' },
    { text: '311 → 310 · MA201 Linear Algebra moved to room 310 at 15:00' },
    { text: 'Open Lecture in Aula 110 runs until 15:30' },
  ],
};

// ---------- 21:30:00 — after hours ----------
export const AFTER = {
  ...HERO,
  clock: '21:30:00', floorBusy: [0, 0, 0, 0, 0], busy: 0, phases: {}, lit: true, timePct: 1,
  now: [], next: [], nowTotal: 0, nextTotal: 0, nowPages: 1, nextPages: 1,
  ticker: [
    { text: 'No classes right now · building closes at 22:00' },
    { text: 'Library & Reading Room 113 open until 22:00' },
    { text: 'Next class tomorrow 08:00 · 101 · MA101 Discrete Math · Smirnov P.' },
  ],
  empty: { title: 'No classes right now', next: { time: '08:00', room: '101', course: 'MA101', title: 'Discrete Math', sub: 'Smirnov P. · ПО2401, ПО2402 · tomorrow, Wed 9 Sep' } },
};

// ---------- reconnecting / API down ----------
export const RECONNECT = { ...HERO, connection: 'reconnecting', lastUpdate: '10:46:58', staleFor: '34 s' };
export const APIDOWN = {
  ...HERO, connection: 'offline', lastUpdate: '10:46:58', mapDim: true, clock: '10:49:10',
  ticker: [{ text: 'OFFLINE · schedule service unreachable · showing last known state from 10:46:58 · retrying in 12 s', warn: true }],
};

// ---------- kiosk (auto-rotating floor focus: floor 3) ----------
export const KIOSK = {
  ...HERO, kiosk: true, focusFloor: 3, kioskProgress: 0.4,
  chips: {
    301: { course: 'CS330', line: 'ends 11:50', phase: 'live', pct: 0.43 },
    302: { course: 'KZ100', line: 'ends 11:50', phase: 'live', pct: 0.43 },
    303: { course: '', line: 'free · next 11:00', phase: 'free' },
    304: { course: 'HI101', line: 'ends 11:50', phase: 'live', pct: 0.43 },
    305: { course: 'MA101', line: 'ends 3 min', phase: 'ending', pct: 0.94 },
    308: { course: 'SE210', line: 'ends 11:50', phase: 'live', pct: 0.43 },
    309: { course: '', line: 'free · next 12:00', phase: 'free' },
    310: { course: 'CS250', line: 'ends 11:50', phase: 'live', pct: 0.43 },
    311: { course: '', line: 'free · next 15:00', phase: 'free' },
    312: { course: 'SE330', line: 'ends 11:50', phase: 'live', pct: 0.43 },
    313: { course: 'CB240', line: 'ends 11:05 · +15', phase: 'delayed', pct: 0.64 },
    314: { course: '', line: 'free today', phase: 'free' },
  },
};
