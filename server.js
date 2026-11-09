// Laser Tag multiplayer server. The server runs the game (authoritative):
// clients only send input, so nobody can cheat by editing their own client.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("./ws-lite");

const PORT = process.env.PORT || 3002;
const QUIZ_TIME = 25000;
const MAX_PLAYERS = 12;
const T0 = Date.now();
const now = () => Date.now() - T0;
const rooms = new Map();

const BOOSTS = [
    { id: "rapid",  name: "Rapid fire",    time: 8000 },
    { id: "power",  name: "Double damage", time: 8000 },
    { id: "speed",  name: "Speed boost",   time: 8000 },
    { id: "shield", name: "Shield",        time: 5000 },
    { id: "heal",   name: "Repair +50 HP" },
    { id: "ult",    name: "Ability recharged" }
];

// ---------- IGCSE question bank: [level, subject, question, correct, wrong, wrong, wrong] ----------
const BANK = [
 [1,"Computer Science","What does CPU stand for?","Central Processing Unit","Central Program Unit","Computer Processing Unit","Control Processing Utility"],
 [1,"Computer Science","Which of these is an input device?","Microphone","Monitor","Speaker","Printer"],
 [1,"Computer Science","How many bits are in one byte?","8","4","16","10"],
 [2,"Computer Science","Which type of memory is volatile?","RAM","ROM","Flash drive","Hard disk drive"],
 [2,"Computer Science","What is the purpose of the ALU?","Perform arithmetic and logic operations","Store programs permanently","Control the order of instructions","Connect to the internet"],
 [2,"Computer Science","Which protocol is used to send email?","SMTP","HTTPS","FTP","DNS"],
 [3,"Computer Science","Which logic gate outputs 1 only when both inputs are 1?","AND","OR","NOR","XOR"],
 [3,"Computer Science","What does a compiler do?","Translates the whole program into machine code before it runs","Translates and runs one line at a time","Removes viruses from a program","Compresses the source code"],
 [3,"Computer Science","Which of these is a lossless compression method?","Run-length encoding","MP3","JPEG","MP4"],
 [4,"Computer Science","What does the program counter hold?","The address of the next instruction","The result of the last calculation","The instruction being decoded","The data being processed"],
 [4,"Computer Science","Which network topology connects every device to a central switch?","Star","Bus","Ring","Mesh"],
 [4,"Computer Science","What is the output of a NOT gate when the input is 1?","0","1","2","Undefined"],
 [5,"Computer Science","Before using a binary search, the data must be:","Sorted","Encrypted","Compressed","Stored in a file"],
 [5,"Computer Science","How does symmetric encryption work?","The same key encrypts and decrypts","A public key encrypts and a private key decrypts","Data is hashed and cannot be recovered","Data is compressed before sending"],
 [5,"Computer Science","Which sorting algorithm repeatedly swaps adjacent items that are out of order?","Bubble sort","Binary sort","Hash sort","Linear sort"],

 [1,"Physics","What is the SI unit of force?","Newton","Joule","Watt","Pascal"],
 [1,"Physics","What type of wave is sound?","Longitudinal","Transverse","Electromagnetic","Standing only"],
 [2,"Physics","What is the approximate speed of light in a vacuum?","3.0 × 10⁸ m/s","3.0 × 10⁶ m/s","3.4 × 10² m/s","3.0 × 10¹⁰ m/s"],
 [2,"Physics","Which energy store increases when a ball is lifted upwards?","Gravitational potential","Kinetic","Chemical","Elastic"],
 [2,"Physics","Which electromagnetic wave has the highest frequency?","Gamma rays","Radio waves","Visible light","Microwaves"],
 [3,"Physics","What is the formula for density?","mass ÷ volume","volume ÷ mass","mass × volume","force ÷ area"],
 [3,"Physics","In a series circuit, the current is:","The same at every point","Shared between branches","Zero in the middle","Largest at the cell"],
 [3,"Physics","Which material is the best thermal conductor?","Copper","Wood","Plastic","Air"],
 [4,"Physics","What happens to the resistance of an NTC thermistor as temperature rises?","It decreases","It increases","It stays the same","It becomes infinite"],
 [4,"Physics","What is emitted in beta (β⁻) decay?","A fast-moving electron","A helium nucleus","A neutron","A proton"],
 [4,"Physics","The half-life of a radioactive isotope is the time taken for:","Half the nuclei to decay","All the nuclei to decay","The mass to halve exactly","The activity to double"],
 [5,"Physics","A transformer has 100 primary turns and 500 secondary turns. The primary voltage is 12 V. What is the secondary voltage?","60 V","2.4 V","600 V","12 V"],
 [5,"Physics","Pressure in a liquid depends on:","Depth and density","Volume only","Surface area only","Temperature only"],

 [1,"Chemistry","What is the chemical symbol for sodium?","Na","So","S","Sd"],
 [1,"Chemistry","Which gas turns limewater milky?","Carbon dioxide","Oxygen","Hydrogen","Nitrogen"],
 [1,"Chemistry","What is the pH of a neutral solution?","7","0","14","1"],
 [2,"Chemistry","Which particles are found in the nucleus of an atom?","Protons and neutrons","Protons and electrons","Electrons only","Neutrons and electrons"],
 [2,"Chemistry","Which group contains the noble gases?","Group 0 (Group 18)","Group 1","Group 7","Group 2"],
 [2,"Chemistry","Which type of bonding involves sharing pairs of electrons?","Covalent","Ionic","Metallic","Hydrogen bonding"],
 [3,"Chemistry","What is the relative formula mass (Mr) of CaCO₃? (Ca = 40, C = 12, O = 16)","100","84","68","116"],
 [3,"Chemistry","What are the products when a metal reacts with an acid?","A salt and hydrogen","A salt and water","A salt and carbon dioxide","A metal oxide and water"],
 [3,"Chemistry","Which ion makes a solution acidic?","H⁺","OH⁻","Na⁺","Cl⁻"],
 [3,"Chemistry","What forms at the cathode when molten lead(II) bromide is electrolysed?","Lead","Bromine","Hydrogen","Oxygen"],
 [4,"Chemistry","What is the formula of aluminium oxide?","Al₂O₃","AlO","Al₃O₂","AlO₂"],
 [4,"Chemistry","What is the mass of 2 moles of CO₂? (C = 12, O = 16)","88 g","44 g","28 g","56 g"],
 [4,"Chemistry","Which statement describes an exothermic reaction?","Heat is given out to the surroundings","Heat is taken in from the surroundings","The surroundings get colder","No energy is transferred"],
 [5,"Chemistry","Which catalyst is used in the Haber process?","Iron","Vanadium(V) oxide","Platinum","Nickel"],
 [5,"Chemistry","What is the empirical formula of glucose, C₆H₁₂O₆?","CH₂O","C₂H₄O₂","C₃H₆O₃","C₆H₁₂O₆"],
 [5,"Chemistry","Which method separates liquids with different boiling points?","Fractional distillation","Filtration","Chromatography","Crystallisation"],

 [1,"Mathematics","What is the value of 3⁴?","81","12","64","27"],
 [2,"Mathematics","What is the sum of the angles in a triangle?","180°","90°","360°","270°"],
 [3,"Mathematics","Expand 3(x + 4)","3x + 12","3x + 4","x + 12","3x + 7"],
 [3,"Mathematics","What is the median of 3, 9, 4, 7, 5?","5","4","6","9"],
 [4,"Mathematics","What is the circumference of a circle of radius 7 cm? (use π = 22/7)","44 cm","22 cm","154 cm","49 cm"],
 [4,"Mathematics","A fair six-sided die is rolled. What is P(number greater than 4)?","1/3","1/6","1/2","2/3"],
 [5,"Mathematics","Factorise x² − 9","(x − 3)(x + 3)","(x − 9)(x + 1)","(x − 3)²","(x + 3)²"]
];

// ---------- generated questions (random numbers, so they never repeat) ----------
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = a => a[rnd(0, a.length - 1)];
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);

const GEN = {
  "Mathematics": [
    () => { const p = pick([10, 20, 25, 50]), n = rnd(1, 10) * 20; return [`What is ${p}% of ${n}?`, p * n / 100, ""]; },
    () => { const a = rnd(2, 9), x = rnd(2, 9), b = rnd(1, 15); return [`Solve ${a}x + ${b} = ${a * x + b}. What is x?`, x, ""]; },
    () => { const m = pick([-4, -3, -2, 2, 3, 4, 5, 6]), c = rnd(-5, 5), x1 = rnd(0, 3), x2 = x1 + rnd(1, 4);
            return [`What is the gradient of the line through (${x1}, ${m * x1 + c}) and (${x2}, ${m * x2 + c})?`, m, ""]; },
    () => { const [a, b, c] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]), k = rnd(1, 3);
            return [`A right-angled triangle has shorter sides ${a * k} cm and ${b * k} cm. How long is the hypotenuse?`, c * k, " cm"]; },
    () => { const u = rnd(1, 9); let v; do v = rnd(1, 9); while (v === u);
            return [`What is the larger solution of x² − ${u + v}x + ${u * v} = 0?`, Math.max(u, v), ""]; }
  ],
  "Physics": [
    () => { const t = rnd(2, 12), v = rnd(3, 30); return [`A car travels ${v * t} m in ${t} s. What is its average speed?`, v, " m/s"]; },
    () => { const m = rnd(2, 20), a = rnd(2, 10); return [`A ${m} kg object accelerates at ${a} m/s². What is the resultant force?`, m * a, " N"]; },
    () => { const F = rnd(2, 20) * 10, d = rnd(2, 15); return [`A force of ${F} N moves an object ${d} m in the direction of the force. How much work is done?`, F * d, " J"]; },
    () => { const m = rnd(1, 10) * 2, v = rnd(2, 12); return [`What is the kinetic energy of a ${m} kg object moving at ${v} m/s?`, m * v * v / 2, " J"]; },
    () => { const R1 = rnd(2, 10), R2 = rnd(2, 10), I = rnd(1, 5);
            return [`Two resistors of ${R1} Ω and ${R2} Ω are in series across a ${I * (R1 + R2)} V supply. What is the current?`, I, " A"]; }
  ]
};

function genCS(level) {
    if (level === 4) {   // denary to 8-bit binary, wrong answers differ by one bit
        const v = rnd(20, 255), bin = v.toString(2).padStart(8, "0"), set = new Set([bin]);
        while (set.size < 4) {
            const i = rnd(0, 7);
            set.add(bin.slice(0, i) + (bin[i] === "1" ? "0" : "1") + bin.slice(i + 1));
        }
        return { text: `Convert denary ${v} to 8-bit binary.`, opts: [...set], ans: bin };
    }
    if (level === 5) { const v = rnd(16, 255); return { text: `Convert hexadecimal ${v.toString(16).toUpperCase()} to denary.`, num: v, unit: "" }; }
    const n = level + 3, v = rnd(5, 2 ** n - 1);
    return { text: `Convert the binary number ${v.toString(2).padStart(n, "0")} to denary.`, num: v, unit: "" };
}

function makeQuestion(level) {
    const subject = pick(["Mathematics", "Physics", "Computer Science", "Chemistry"]);
    const near = BANK.filter(q => q[1] === subject && q[0] <= level && q[0] >= level - 1);
    const any = BANK.filter(q => q[1] === subject && q[0] <= level);
    const canGen = subject !== "Chemistry";

    if (!canGen || (near.length && Math.random() < 0.5)) {
        const q = pick(near.length ? near : any);
        const options = shuffle([q[3], q[4], q[5], q[6]]);
        return { s: subject, text: q[2], options, correct: options.indexOf(q[3]) };
    }

    let text, opts, ans;
    if (subject === "Computer Science") {
        const g = genCS(level);
        text = g.text;
        if (g.opts) { opts = g.opts; ans = g.ans; } else { g.n = g.num; }
        if (g.num !== undefined) { var num = g.num, unit = g.unit; }
    } else {
        const [t, a, u] = GEN[subject][level - 1]();
        text = t; var num = a, unit = u;
    }
    if (num !== undefined) {
        const set = new Set([num]), spread = Math.max(3, Math.round(Math.abs(num) * 0.3));
        while (set.size < 4) {
            const o = num + rnd(-spread, spread);
            if (o !== num && (num <= 0 || o > 0)) set.add(o);
        }
        opts = [...set].map(v => v + unit);
        ans = num + unit;
    }
    const options = shuffle(opts);
    return { s: subject, text, options, correct: options.indexOf(ans) };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const level = p => Math.min(5, 1 + Math.floor(p.points / 50));
const boosted = (p, id) => (p.boosts[id] || 0) > now();
const send = (p, o) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(o)); };
const broadcast = (r, o) => r.players.forEach(p => send(p, o));

const TANKS = [
 {n:"Scout",c:"#2585e8",a:"#8ac7ff",sh:"sq",bar:1,sz:42,lv:1,hp:100,sp:240,fr:110,dm:10,rg:650,ab:{n:"Dash",cd:4000,dash:260}},
 {n:"Striker",c:"#e8a525",a:"#ffd27a",sh:"tri",bar:1,sz:40,lv:1,hp:90,sp:260,fr:95,dm:8,rg:600,ab:{n:"Overdrive",cd:9000,buff:["rapid"],bt:4000}},
 {n:"Guardian",c:"#3aa86b",a:"#8dffb8",sh:"hex",bar:1,sz:48,lv:2,hp:150,sp:200,fr:140,dm:9,rg:600,ab:{n:"Aegis",cd:10000,sh:2500}},
 {n:"Scatter",c:"#e8631f",a:"#ffc04d",sh:"sq",bar:2,sz:44,lv:2,hp:110,sp:235,fr:650,dm:9,rg:330,pl:5,spr:0.55,ab:{n:"Blink",cd:6000,blink:380}},
 {n:"Medic",c:"#d94f9e",a:"#ffb0dc",sh:"circ",bar:1,sz:42,lv:3,hp:110,sp:240,fr:120,dm:8,rg:600,ab:{n:"Repair Pulse",cd:12000,heal:60}},
 {n:"Sniper",c:"#7b4be8",a:"#c8b0ff",sh:"tri",bar:1,sz:38,lv:3,hp:80,sp:215,fr:900,dm:38,rg:1100,ab:{n:"Railshot",cd:9000,shot:[80,1500]}},
 {n:"Gatling",c:"#7f8c99",a:"#e0e8f0",sh:"sq",bar:3,sz:46,lv:4,hp:130,sp:200,fr:55,dm:5,rg:550,jt:0.1,ab:{n:"Spin-up",cd:11000,buff:["rapid"],bt:5000}},
 {n:"Nova",c:"#19c3d6",a:"#9ffcff",sh:"circ",bar:1,sz:42,lv:4,hp:100,sp:240,fr:120,dm:9,rg:650,ab:{n:"Ring Blast",cd:7000,ring:[12,14,450]}},
 {n:"Phantom",c:"#4a4f7a",a:"#9aa0ff",sh:"tri",bar:1,sz:36,lv:5,hp:80,sp:290,fr:100,dm:9,rg:600,ab:{n:"Phase",cd:9000,sh:1500,buff:["speed"],bt:3000}},
 {n:"Tempest",c:"#3a7bd5",a:"#8fd3ff",sh:"hex",bar:2,sz:46,lv:5,hp:120,sp:225,fr:100,dm:7,rg:580,pl:2,spr:0.12,ab:{n:"Storm Fan",cd:6000,cone:[7,1.0,10,420]}},
 {n:"Vanguard",c:"#b33a3a",a:"#ff9c9c",sh:"sq",bar:1,sz:52,lv:6,hp:180,sp:190,fr:130,dm:11,rg:600,ab:{n:"Charge",cd:7000,dash:220,sh:800,buff:["power"],bt:3000}},
 {n:"Lancer",c:"#8a6d2b",a:"#ffe08a",sh:"tri",bar:2,sz:40,lv:7,hp:95,sp:265,fr:150,dm:14,rg:800,ab:{n:"Death Star",cd:10000,beam:5}},
 {n:"Inferno",c:"#e8431f",a:"#ffb347",sh:"circ",bar:2,sz:44,lv:8,hp:115,sp:235,fr:60,dm:5,rg:400,jt:0.1,ab:{n:"Flare",cd:8000,ring:[8,10,350],buff:["rapid"],bt:3000}},
 {n:"Titan",c:"#5a6b7d",a:"#cfe0f0",sh:"hex",bar:2,sz:58,lv:9,hp:260,sp:165,fr:150,dm:12,rg:600,ab:{n:"Fortress",cd:14000,sh:3500,heal:40}},
 {n:"Wraith",c:"#6d2fb3",a:"#e0a8ff",sh:"tri",bar:1,sz:38,lv:10,hp:85,sp:280,fr:90,dm:9,rg:650,ab:{n:"Shadow Step",cd:7000,blink:450,buff:["rapid"],bt:2500}},
 {n:"Railgun",c:"#1f9fa8",a:"#aaffee",sh:"sq",bar:1,sz:44,lv:11,hp:100,sp:215,fr:1100,dm:55,rg:1400,ab:{n:"Overcharge",cd:10000,shot:[110,1700]}},
 {n:"Juggernaut",c:"#8b1e2d",a:"#ff6f7f",sh:"hex",bar:3,sz:60,lv:12,hp:320,sp:150,fr:120,dm:10,rg:550,ab:{n:"Shockwave",cd:9000,ring:[16,12,500],sh:1000}},
 {n:"Valkyrie",c:"#e0c040",a:"#fff6b0",sh:"tri",bar:2,sz:42,lv:13,hp:140,sp:270,fr:85,dm:9,rg:700,ab:{n:"Soar",cd:6000,dash:300,heal:40}},
 {n:"Overlord",c:"#222a44",a:"#7a8cff",sh:"circ",bar:2,sz:46,lv:14,hp:170,sp:235,fr:110,dm:11,rg:700,ab:{n:"Death Beam",cd:9000,beam:7}},
 {n:"Omega",c:"#f2f2f2",a:"#ffd700",sh:"hex",bar:3,sz:54,lv:15,hp:300,sp:220,fr:80,dm:12,rg:750,ab:{n:"Annihilate",cd:12000,beam:9,sh:2500}}
];
const T = p => TANKS[p.tk];
const need = L => 30 + 15 * L;          // xp needed to go from level L to L+1

function addXp(p, n) {
    if (p.lvl >= TANKS.length) return;
    p.xp += n;
    while (p.xp >= need(p.lvl) && p.lvl < TANKS.length) {
        p.xp -= need(p.lvl);
        p.lvl++;
        const names = TANKS.filter(x => x.lv === p.lvl).map(x => x.n);
        send(p, { t: "toast", text: "LEVEL " + p.lvl + "!" + (names.length ? " Unlocked: " + names.join(", ") : "") });
    }
}

function pickTank(p, i) {
    if (!TANKS[i] || TANKS[i].lv > p.lvl || i === p.tk) return;
    const old = T(p).hp;
    p.tk = i;
    p.hp = Math.max(1, p.hp / old * T(p).hp);   // keep the same health percentage
    p.ult = null;
}

function useAbility(r, p) {
    const t = now(), d = T(p), A = d.ab;
    if (p.dead || p.ult || t - p.lastAb < A.cd) return;
    p.lastAb = t;
    const mv = Math.hypot(p.inp.dx, p.inp.dy) > 0.1 ? Math.atan2(p.inp.dy, p.inp.dx) : p.angle;
    const jump = (dist, a) => {
        p.x = clamp(p.x + Math.cos(a) * dist, 25, 2975);
        p.y = clamp(p.y + Math.sin(a) * dist, 25, 2975);
    };
    if (A.dash) { jump(A.dash, mv); p.invuln = Math.max(p.invuln, t + 300); }
    if (A.blink) jump(A.blink, p.angle);
    if (A.sh) p.invuln = Math.max(p.invuln, t + A.sh);
    if (A.heal) p.hp = Math.min(d.hp, p.hp + A.heal);
    if (A.buff) A.buff.forEach(id => { p.boosts[id] = t + A.bt; });
    if (A.ring) for (let k = 0; k < A.ring[0]; k++) shoot(r, p, k * 2 * Math.PI / A.ring[0], A.ring[2], A.ring[1], d.a);
    if (A.cone) for (let k = 0; k < A.cone[0]; k++) shoot(r, p, p.angle + (k / (A.cone[0] - 1) - 0.5) * A.cone[1], A.cone[3], A.cone[2], d.a);
    if (A.shot) shoot(r, p, p.angle, A.shot[1], A.shot[0], "#ffffff");
    if (A.beam) p.ult = { start: t, angle: p.angle, nd: t + 1150, ex: false, x: 0, y: 0, dm: A.beam };
}

function getRoom(id) {
    if (!rooms.has(id)) rooms.set(id, { id, players: new Map(), lasers: [], hits: [], round: null, next: 1 });
    return rooms.get(id);
}

function spot(r, min) {
    let x, y, i = 0;
    do {
        x = 100 + Math.random() * 2800;
        y = 100 + Math.random() * 2800;
    } while (i++ < 30 && [...r.players.values()].some(p => !p.dead && Math.hypot(p.x - x, p.y - y) < min));
    return { x, y };
}

function addPlayer(r, ws, name) {
    const p = {
        id: r.next++, ws, name: name.slice(0, 14) || "Player", ...spot(r, 500),
        angle: 0, hp: 100, dead: false, respawnAt: 0, invuln: now() + 2000,
        lastShot: 0, lastAb: -1e9, lastHit: -1e9, ult: null, tk: 0, xp: 0,
        lvl: Math.min(20, +process.env.START_LEVEL || 1),
        kills: 0, deaths: 0, points: 0, boosts: {}, q: null, lock: 0,
        inp: { dx: 0, dy: 0, a: 0, f: false, s: false }
    };
    r.players.set(p.id, p);
    return p;
}

// ---------- combat ----------

function ray(sx, sy, a, len, t, rad) {
    const vx = Math.cos(a) * len, vy = Math.sin(a) * len;
    const s = clamp(((t.x - sx) * vx + (t.y - sy) * vy) / (vx * vx + vy * vy), 0, 1);
    return Math.hypot(t.x - (sx + s * vx), t.y - (sy + s * vy)) < T(t).sz / 2 + rad ? s * len : -1;
}

function hurt(r, t, dmg, by) {
    if (t.dead || now() < t.invuln) return;
    t.hp = Math.max(0, t.hp - dmg);
    t.lastHit = now();
    if (by && by !== t) addXp(by, dmg * 0.5);
    r.hits.push([Math.round(t.x), Math.round(t.y), "#55faff", 8]);
    if (t.hp <= 0) {
        t.dead = true; t.ult = null; t.respawnAt = now() + 3000; t.deaths++;
        if (by !== t) { by.kills++; addXp(by, 40 + 10 * t.lvl); }
        r.hits.push([Math.round(t.x), Math.round(t.y), "#ffbd45", 35]);
    }
}

function shoot(r, p, a, len, dmg, color) {
    const sx = p.x + Math.cos(a) * 38, sy = p.y + Math.sin(a) * 38;
    let best = null, bd = len;
    for (const q of r.players.values()) {
        if (q === p || q.dead) continue;
        const d = ray(sx, sy, a, len, q, 4);
        if (d >= 0 && d <= bd) { bd = d; best = q; }
    }
    r.lasers.push([Math.round(sx), Math.round(sy), +a.toFixed(3), Math.round(bd), color, p.id]);
    if (best) hurt(r, best, boosted(p, "power") ? dmg * 2 : dmg, p);
}

function updateUltimate(r, p, t) {
    const u = p.ult, e = t - u.start;
    if (e < 950) u.angle = p.angle;
    u.x = p.x + Math.cos(u.angle) * 38;
    u.y = p.y + Math.sin(u.angle) * 38;
    if (e >= 950 && !u.ex) { u.ex = true; r.hits.push([Math.round(u.x), Math.round(u.y), "#55faff", 65]); }
    if (e >= 1150 && t >= u.nd) {
        for (const q of r.players.values()) {
            if (q !== p && !q.dead && ray(u.x, u.y, u.angle, 1300, q, 35) >= 0) hurt(r, q, u.dm, p);
        }
        u.nd = t + 250;
    }
    if (e >= 2500) p.ult = null;
}

// ---------- quiz: everyone gets a question at once, first correct answer wins the boost ----------

function giveQuestion(p, deadline) {
    p.q = makeQuestion(level(p));
    p.lock = 0;
    send(p, { t: "q", s: p.q.s, text: p.q.text, options: p.q.options, deadline });
}

function startRound(r) {
    const deadline = now() + QUIZ_TIME;
    r.round = { deadline };
    r.players.forEach(p => giveQuestion(p, deadline));
}

function answer(r, p, i) {
    if (!p.q || now() < p.lock) return;
    if (i === p.q.correct) {
        p.points += 10 * level(p);
        addXp(p, 25);
        const b = BOOSTS[Math.floor(Math.random() * BOOSTS.length)];
        if (b.time) p.boosts[b.id] = now() + b.time;
        if (b.id === "shield") p.invuln = Math.max(p.invuln, now() + b.time);
        if (b.id === "heal") p.hp = Math.min(T(p).hp, p.hp + 50);
        if (b.id === "ult") p.lastAb = -1e9;
        r.players.forEach(q => send(q, {
            t: "msg", text: q === p ? "Correct! " + b.name + "!" : p.name + " answered first!",
            color: q === p ? "#36e080" : "#ffbd45"
        }));
        startRound(r);
    } else {
        p.points = Math.max(0, p.points - 5);
        p.lock = now() + 2000;
        send(p, { t: "lock", until: p.lock });
        send(p, { t: "msg", text: "Wrong! Locked for 2s (−5 pts)", color: "#ff5566" });
    }
}

// ---------- game loop ----------

function tick(r, dt) {
    const t = now();
    r.lasers = [];
    r.hits = [];

    for (const p of r.players.values()) {
        if (p.dead) {
            if (t >= p.respawnAt) Object.assign(p, spot(r, 500), { hp: T(p).hp, dead: false, invuln: t + 2000 });
            continue;
        }
        const d = T(p), i = p.inp, l = Math.hypot(i.dx, i.dy), k = l > 1 ? 1 / l : 1;
        const speed = d.sp * (boosted(p, "speed") ? 1.4 : 1);
        p.x = clamp(p.x + i.dx * k * speed * dt, 25, 2975);
        p.y = clamp(p.y + i.dy * k * speed * dt, 25, 2975);
        p.angle = i.a;

        if (t - p.lastHit > 4000 && p.hp < d.hp) p.hp = Math.min(d.hp, p.hp + 8 * dt);

        if (i.f && t - p.lastShot >= d.fr * (boosted(p, "rapid") ? 0.5 : 1)) {
            p.lastShot = t;
            const n = d.pl || 1;
            for (let j = 0; j < n; j++) {
                const off = n > 1 ? (j / (n - 1) - 0.5) * d.spr : 0;
                shoot(r, p, p.angle + off + (Math.random() - 0.5) * (d.jt || 0), d.rg, d.dm, d.a);
            }
        }
        if (p.ult) updateUltimate(r, p, t);
    }

    if (r.round && t > r.round.deadline) {
        broadcast(r, { t: "msg", text: "Time's up! New question", color: "#ffbd45" });
        startRound(r);
    }
}

function snapshot(r) {
    const t = now(), P = [...r.players.values()];
    const shared = {
        t: "snap", st: t,
        p: P.map(p => ({ id: p.id, n: p.name, x: Math.round(p.x), y: Math.round(p.y),
            a: +p.angle.toFixed(3), hp: Math.round(p.hp), d: p.dead ? 1 : 0, inv: p.invuln, k: p.kills, tk: p.tk, lv: p.lvl })),
        u: P.filter(p => p.ult).map(p => ({ id: p.id, x: p.ult.x, y: p.ult.y, a: p.ult.angle, s: p.ult.start })),
        l: r.lasers, h: r.hits
    };
    for (const p of P) {
        send(p, { ...shared, me: {
            sp: T(p).sp * (boosted(p, "speed") ? 1.4 : 1), pts: p.points, k: p.kills, dt: p.deaths,
            la: p.lastAb, ra: p.respawnAt, xp: Math.floor(p.xp), need: need(p.lvl), lv: p.lvl,
            b: Object.entries(p.boosts).filter(([, e]) => e > t)
                .map(([id, e]) => [BOOSTS.find(b => b.id === id).name, e])
        } });
    }
}

let last = now();
setInterval(() => {
    const t = now(), dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    for (const r of rooms.values()) { tick(r, dt); snapshot(r); }
}, 1000 / 30);

// ---------- web server ----------

const server = http.createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    const isConfig = url === "/config.js";
    const file = path.join(__dirname, isConfig ? "config.js" : "index.html");
    fs.readFile(file, (err, data) => {
        res.writeHead(err ? 500 : 200, {
            "Content-Type": isConfig ? "application/javascript; charset=utf-8" : "text/html; charset=utf-8"
        });
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    let r = null, p = null;

    ws.on("message", raw => {
        let m;
        try { m = JSON.parse(raw); } catch { return; }

        if (m.t === "join" && !p) {
            const id = String(m.room || "lobby").replace(/[^\w-]/g, "").slice(0, 20) || "lobby";
            r = getRoom(id);
            if (r.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: "full" })); return; }
            p = addPlayer(r, ws, String(m.name || ""));
            send(p, { t: "welcome", id: p.id, tanks: TANKS });
            if (!r.round) startRound(r); else giveQuestion(p, r.round.deadline);
        } else if (p && m.t === "in") {
            p.inp = { dx: clamp(+m.dx || 0, -1, 1), dy: clamp(+m.dy || 0, -1, 1),
                      a: Number.isFinite(+m.a) ? +m.a : p.inp.a, f: !!m.f, s: !!m.s };
        } else if (p && m.t === "ult") {
            useAbility(r, p);
        } else if (p && m.t === "tank") {
            pickTank(p, +m.i);
        } else if (p && m.t === "ans") {
            answer(r, p, +m.i);
        }
    });

    ws.on("close", () => {
        if (!p) return;
        r.players.delete(p.id);
        if (!r.players.size) rooms.delete(r.id);
    });
});

server.listen(PORT, () => console.log("Laser Tag server running on port " + PORT));
