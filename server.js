const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1); // Support reverse proxies on Render, Railway, Fly.io, Heroku, Nginx
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Load dictionary and prepare multi-language word packs (English primary, structured for Hindi/Hinglish packs)
let wordsData = { easy: [], medium: [], normal: [], all: [] };
let wordsList = [];
try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf-8'));
    if (Array.isArray(raw)) {
        wordsList = raw;
        wordsData.all = raw;
        wordsData.easy = raw.filter(w => w.length <= 4);
        wordsData.medium = raw.filter(w => w.length > 4 && w.length <= 7);
        wordsData.normal = raw.filter(w => w.length > 7);
    } else if (raw && typeof raw === 'object') {
        wordsData = {
            easy: raw.easy || [],
            medium: raw.medium || [],
            normal: raw.normal || [],
            all: raw.all || [
                ...(raw.easy || []),
                ...(raw.medium || []),
                ...(raw.normal || [])
            ]
        };
        wordsList = wordsData.all;
    }
} catch (e) {
    wordsList = ['apple', 'banana', 'cat', 'dog', 'elephant', 'guitar', 'house', 'pizza', 'robot', 'sun', 'tree', 'car'];
    wordsData.all = wordsList;
    wordsData.easy = ['cat', 'dog', 'sun', 'car'];
    wordsData.medium = ['apple', 'pizza', 'robot', 'tree'];
    wordsData.normal = ['banana', 'elephant', 'guitar', 'house'];
}

const wordPacks = {
    0: wordsData, // English default (structured easy, medium, normal)
    hi: [],       // Reserved for Hindi pack expansion
    hinglish: []  // Reserved for Hinglish pack expansion
};

// Protocol constants
const MSG = {
    USER_JOIN: 1,
    USER_LEAVE: 2,
    KICK: 3,
    BAN: 4,
    VOTEKICK: 5,
    REPORT: 6,
    MUTE: 7,
    RATE: 8,
    UPDATE_AVATAR: 9,
    INIT: 10,
    STATE_CHANGE: 11,
    SETTING_UPDATE: 12,
    HINTS: 13,
    TIME: 14,
    GUESSED: 15,
    CLOSE: 16,
    OWNER_CHANGE: 17,
    WORD_SELECT: 18,
    DRAW_DATA: 19,
    CLEAR_CANVAS: 20,
    UNDO: 21,
    START_GAME: 22,
    CHAT: 30,
    SYSTEM_MSG: 31,
    SPAM_WARN: 32,
    UPDATE_NAME: 90
};

const STATES = {
    WAITING: 0,
    STARTING: 1,
    ROUND_START: 2,
    WORD_SELECT: 3,
    DRAWING: 4,
    TURN_REVEAL: 5,
    GAME_OVER: 6,
    LOBBY: 7
};

const REASONS = {
    EVERYONE_GUESSED: 0,
    TIME_UP: 1,
    DRAWER_LEFT: 2,
    DRAWER_SKIPPED: 5
};

const SETTINGS = {
    LANG: 0,
    SLOTS: 1,
    DRAWTIME: 2,
    ROUNDS: 3,
    WORDCOUNT: 4,
    HINTCOUNT: 5,
    WORDMODE: 6,
    CUSTOMWORDSONLY: 7
};

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// Bot drawing presets (series of line segments: [0, colorIdx, size, x1, y1, x2, y2])
const BOT_DRAWINGS = {
    smile: [
        // yellow circle
        [0, 8, 20, 400, 300, 400, 300],
        [1, 8, 400, 300],
        // eye 1
        [0, 1, 10, 350, 260, 350, 260],
        // eye 2
        [0, 1, 10, 450, 260, 450, 260],
        // smile arc
        [0, 1, 10, 340, 330, 360, 370],
        [0, 1, 10, 360, 370, 400, 380],
        [0, 1, 10, 400, 380, 440, 370],
        [0, 1, 10, 440, 370, 460, 330]
    ],
    house: [
        // walls
        [0, 6, 10, 300, 300, 500, 300],
        [0, 6, 10, 500, 300, 500, 500],
        [0, 6, 10, 500, 500, 300, 500],
        [0, 6, 10, 300, 500, 300, 300],
        [1, 22, 400, 400],
        // roof
        [0, 4, 10, 300, 300, 400, 180],
        [0, 4, 10, 400, 180, 500, 300],
        [1, 4, 400, 240],
        // door
        [0, 24, 10, 380, 500, 380, 420],
        [0, 24, 10, 380, 420, 420, 420],
        [0, 24, 10, 420, 420, 420, 500],
        [1, 25, 400, 460]
    ],
    tree: [
        // trunk
        [0, 25, 20, 390, 350, 390, 520],
        [0, 25, 20, 410, 350, 410, 520],
        [1, 24, 400, 450],
        // leaves
        [0, 10, 32, 400, 250, 350, 300],
        [0, 10, 32, 350, 300, 450, 300],
        [0, 10, 32, 450, 300, 400, 200],
        [1, 10, 400, 250]
    ],
    sun: [
        [0, 8, 32, 400, 300, 400, 300],
        [1, 8, 400, 300],
        [0, 8, 10, 400, 180, 400, 120],
        [0, 8, 10, 400, 420, 400, 480],
        [0, 8, 10, 280, 300, 220, 300],
        [0, 8, 10, 520, 300, 580, 300],
        [0, 8, 10, 310, 210, 260, 160],
        [0, 8, 10, 490, 390, 540, 440],
        [0, 8, 10, 490, 210, 540, 160],
        [0, 8, 10, 310, 390, 260, 440]
    ]
};

const BOT_NAMES = ['DoodleBot', 'PixelPanda', 'SketchMaster', 'Artie', 'Chalky', 'PicassoAI', 'ColorCraze'];

// Curated English names (85-90% popular English girl names for default random player assignment)
const GIRL_NAMES = [
    'Emma', 'Olivia', 'Sophia', 'Ava', 'Mia', 'Isabella', 'Amelia', 'Harper', 'Evelyn', 'Abigail',
    'Emily', 'Ella', 'Chloe', 'Grace', 'Lily', 'Zoe', 'Hannah', 'Victoria', 'Stella', 'Maya',
    'Scarlett', 'Daisy', 'Ruby', 'Lucy', 'Alice', 'Rose', 'Clara', 'Elena', 'Bella', 'Sophie',
    'Hazel', 'Amber', 'Fiona', 'Ivy', 'Jade', 'Luna', 'Penny', 'Holly', 'Millie', 'Summer',
    'Layla', 'Poppy', 'Sienna', 'Freya', 'Zara', 'Phoebe', 'Skye', 'Gemma', 'Rosie', 'Ellie',
    'Brooke', 'Paige', 'Georgia', 'Leah', 'Amy', 'Molly', 'Katie', 'Sarah', 'Jessica', 'Laura',
    'Megan', 'Rachel', 'Tessa', 'Kylie', 'Autumn', 'Heidi', 'Sadie', 'Chelsea', 'Carly', 'Kira',
    'Serena', 'Eliza', 'Nancy', 'Nina', 'Talia', 'Wendy', 'Bonnie', 'Daphne', 'Joy', 'Pearl',
    'Hope', 'Faith', 'Melody', 'Annie', 'Lexi', 'Macy', 'Rory', 'Jasmine', 'April', 'Crystal',
    'Gwen', 'Kelly', 'Jenny', 'Brittany', 'Cassidy', 'Sydney', 'Naomi', 'Violet', 'Samantha', 'Vanessa',
    'Penelope', 'Madeline', 'Audrey', 'Eleanor', 'Claire', 'Piper', 'Norah', 'Vivian', 'Allison'
];

const OTHER_NAMES = [
    'Alex', 'Sam', 'Charlie', 'Taylor', 'Jordan', 'Morgan', 'Robin', 'Riley', 'Casey', 'Sunny',
    'Sky', 'Jamie', 'Avery', 'Dakota', 'Skyler', 'Finley', 'Rowan', 'Harper', 'Eden'
];

function generatePlayerName(existingUsers = []) {
    const existing = new Set((existingUsers || []).map(u => (u.name || '').toLowerCase()));
    const useGirlName = Math.random() < 0.88; // ~88% English girl names
    const pool = useGirlName ? GIRL_NAMES : OTHER_NAMES;

    for (let i = 0; i < 30; i++) {
        const candidate = pool[Math.floor(Math.random() * pool.length)];
        if (!existing.has(candidate.toLowerCase())) {
            return candidate;
        }
    }

    const fallback = pool[Math.floor(Math.random() * pool.length)];
    let count = 2;
    while (existing.has(`${fallback} ${count}`.toLowerCase())) {
        count++;
    }
    return `${fallback} ${count}`;
}

class Room {
    constructor(id, isPrivate) {
        this.id = id;
        this.isPrivate = isPrivate;
        // [lang, slots, drawtime, rounds, wordcount, hintcount, wordmode, customwordsonly]
        this.settings = [0, 8, 80, 3, 3, 2, 0, 0];
        this.customWords = [];
        this.users = [];
        this.nextUserId = 1;
        this.owner = 1;
        this.round = 0;
        this.turnOrder = [];
        this.currentDrawerIndex = 0;
        this.currentWord = '';
        this.wordChoices = [];
        this.hints = [];
        this.drawCommands = [];
        this.turnScores = new Map();
        this.timer = null;
        this.timeRemaining = 0;
        this.state = {
            id: isPrivate ? STATES.LOBBY : STATES.WAITING,
            time: 0,
            data: null
        };
        this.bannedIps = new Set();
        this.votekicks = new Map(); // targetId -> Set(voterId)
    }

    addUser(socket, name, avatar, ip) {
        const userId = this.nextUserId++;
        const trimmed = (typeof name === 'string') ? name.trim() : '';
        const finalName = trimmed || generatePlayerName(this.users);
        const user = {
            id: userId,
            flags: 0,
            name: finalName,
            avatar: avatar || [Math.floor(Math.random() * 28), Math.floor(Math.random() * 57), Math.floor(Math.random() * 51), -1],
            score: 0,
            guessed: false,
            socket: socket,
            socketId: socket ? socket.id : null,
            isBot: !socket,
            ip: ip
        };

        if (this.users.length === 0) {
            this.owner = userId;
        }

        this.users.push(user);
        return user;
    }

    removeUser(userId, reason = 0) {
        const index = this.users.findIndex(u => u.id === userId);
        if (index === -1) return null;

        const user = this.users[index];
        this.users.splice(index, 1);

        // Broadcast user left
        this.broadcast({
            id: MSG.USER_LEAVE,
            data: { id: userId, reason: reason }
        });

        // Clean up votekicks
        this.votekicks.delete(userId);
        for (const votes of this.votekicks.values()) {
            votes.delete(userId);
        }

        // If owner left, elect new owner
        if (this.owner === userId && this.users.length > 0) {
            const nextOwner = this.users.find(u => !u.isBot) || this.users[0];
            this.owner = nextOwner.id;
            this.broadcast({
                id: MSG.OWNER_CHANGE,
                data: this.owner
            });
        }

        // If current drawer left during drawing/word select
        if (this.getCurrentDrawer() && this.getCurrentDrawer().id === userId) {
            if (this.state.id === STATES.DRAWING || this.state.id === STATES.WORD_SELECT) {
                this.endTurn(REASONS.DRAWER_LEFT);
            }
        } else if (this.state.id === STATES.DRAWING) {
            this.checkAllGuessed();
        }

        // If not enough players to continue in public room
        if (!this.isPrivate && this.users.length < 2 && this.state.id !== STATES.WAITING) {
            this.setState(STATES.WAITING, 0, null);
        }

        return user;
    }

    getCurrentDrawer() {
        if (this.turnOrder.length === 0 || this.currentDrawerIndex >= this.turnOrder.length) {
            return null;
        }
        const drawerId = this.turnOrder[this.currentDrawerIndex];
        return this.users.find(u => u.id === drawerId) || null;
    }

    broadcast(msg) {
        for (const u of this.users) {
            if (u.socket) {
                u.socket.emit('data', msg);
            }
        }
    }

    broadcastTo(filterFn, msg) {
        for (const u of this.users) {
            if (u.socket && filterFn(u)) {
                u.socket.emit('data', msg);
            }
        }
    }

    setState(stateId, duration, data) {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.state = {
            id: stateId,
            time: duration,
            data: data
        };
        this.timeRemaining = duration;

        // Broadcast state change
        this.broadcast({
            id: MSG.STATE_CHANGE,
            data: this.state
        });

        if (duration > 0) {
            this.timer = setInterval(() => {
                this.timeRemaining--;
                this.broadcast({
                    id: MSG.TIME,
                    data: Math.max(0, this.timeRemaining)
                });

                this.onTick();

                if (this.timeRemaining <= 0) {
                    clearInterval(this.timer);
                    this.timer = null;
                    this.onTimeExpired();
                }
            }, 1000);
        }
    }

    onTick() {
        if (this.state.id === STATES.DRAWING) {
            // Check hints
            const drawTime = this.settings[SETTINGS.DRAWTIME] || 80;
            const hintCount = this.settings[SETTINGS.HINTCOUNT] || 2;
            const word = this.currentWord;

            if (word && hintCount > 0 && word.length > 2) {
                const interval = Math.floor(drawTime / (hintCount + 1));
                const currentHintsCount = this.hints.length;
                const expectedHints = Math.min(hintCount, Math.floor((drawTime - this.timeRemaining) / interval));

                if (expectedHints > currentHintsCount && expectedHints <= Math.floor(word.length / 2)) {
                    // Reveal an unrevealed letter
                    const unrevealedIndices = [];
                    for (let i = 0; i < word.length; i++) {
                        if (word[i] !== ' ' && !this.hints.some(h => h[0] === i)) {
                            unrevealedIndices.push(i);
                        }
                    }
                    if (unrevealedIndices.length > 0) {
                        const randomIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
                        this.hints.push([randomIdx, word[randomIdx]]);
                        // Broadcast hints to guessers
                        const drawer = this.getCurrentDrawer();
                        this.broadcastTo(u => !drawer || u.id !== drawer.id, {
                            id: MSG.HINTS,
                            data: this.hints
                        });
                    }
                }
            }

            // Bot behavior on tick
            this.tickBots();
        }
    }

    tickBots() {
        const drawer = this.getCurrentDrawer();
        const guessers = this.users.filter(u => u.isBot && (!drawer || u.id !== drawer.id) && !u.guessed);

        for (const bot of guessers) {
            if (!bot.guessTimeTarget) {
                bot.guessTimeTarget = Math.floor(Math.random() * 8) + 4;
                bot.hasCloseGuessed = false;
            }

            const elapsed = (this.settings[SETTINGS.DRAWTIME] || 80) - this.timeRemaining;
            if (elapsed >= bot.guessTimeTarget && !bot.guessed) {
                if (!bot.hasCloseGuessed && Math.random() < 0.4 && this.currentWord.length > 3) {
                    bot.hasCloseGuessed = true;
                    // Typo guess
                    const typo = this.currentWord.slice(0, -1) + 'x';
                    this.handleGuess(bot, typo);
                    bot.guessTimeTarget += Math.floor(Math.random() * 3) + 2;
                } else {
                    this.handleGuess(bot, this.currentWord);
                    // Chance for bot to like drawing
                    if (Math.random() < 0.5) {
                        setTimeout(() => {
                            this.broadcast({
                                id: MSG.RATE,
                                data: { id: bot.id, vote: 1 }
                            });
                        }, 1500);
                    }
                }
            }
        }
    }

    onTimeExpired() {
        switch (this.state.id) {
            case STATES.STARTING:
                this.startRound(0);
                break;
            case STATES.ROUND_START:
                this.startTurn();
                break;
            case STATES.WORD_SELECT:
                // Auto-pick first word if drawer didn't pick
                this.selectWord(0);
                break;
            case STATES.DRAWING:
                this.endTurn(REASONS.TIME_UP);
                break;
            case STATES.TURN_REVEAL:
                this.nextTurn();
                break;
            case STATES.GAME_OVER:
                this.resetToLobby();
                break;
        }
    }

    startGame(customWordsString) {
        if (customWordsString) {
            const words = customWordsString.split(',').map(w => w.trim()).filter(w => w.length > 0);
            if (words.length > 0) {
                this.customWords = words;
            }
        }

        if (this.users.length < 2) {
            const owner = this.users.find(u => u.id === this.owner);
            if (owner && owner.socket) {
                owner.socket.emit('data', {
                    id: MSG.SYSTEM_MSG,
                    data: { id: 0 } // "You need at least 2 players to start the game!"
                });
            }
            return;
        }

        // Reset scores
        for (const u of this.users) {
            u.score = 0;
            u.guessed = false;
        }

        this.round = 0;
        this.setState(STATES.STARTING, 3, null);
    }

    startRound(roundNum) {
        this.round = roundNum;
        // Build turn order (shuffle or order of players)
        this.turnOrder = this.users.map(u => u.id);
        this.currentDrawerIndex = 0;

        this.setState(STATES.ROUND_START, 3, this.round);
    }

    startTurn() {
        const drawer = this.getCurrentDrawer();
        if (!drawer) {
            this.nextRoundOrGameOver();
            return;
        }

        this.drawCommands = [];
        this.hints = [];
        this.turnScores.clear();
        for (const u of this.users) {
            u.guessed = false;
            u.guessTimeTarget = null;
            u.hasCloseGuessed = false;
        }

        // Pick balanced words respecting WORDCOUNT setting (1-5, default 3)
        const wordCountSetting = parseInt(this.settings[SETTINGS.WORDCOUNT]) || 3;
        const targetCount = Math.max(1, Math.min(5, wordCountSetting));
        const langSetting = this.settings[SETTINGS.LANG] || 0;
        const pack = wordPacks[langSetting] || wordsData;
        const fullPool = Array.isArray(pack) ? pack : (pack.all || wordsList);

        const choices = [];
        if (this.settings[SETTINGS.CUSTOMWORDSONLY] && this.customWords.length >= targetCount) {
            // Exclusive custom words
            while (choices.length < targetCount && choices.length < this.customWords.length) {
                const rand = this.customWords[Math.floor(Math.random() * this.customWords.length)];
                if (!choices.includes(rand)) choices.push(rand);
            }
        } else if (pack && pack.easy && pack.medium && pack.normal && pack.easy.length > 0) {
            // Balanced difficulty: Tier 1 (Easy), Tier 2 (Medium), Tier 3 (Normal/Fun)
            const tiers = [pack.easy, pack.medium, pack.normal];

            // If custom words exist and not exclusive, occasionally slot one
            if (this.customWords.length > 0 && Math.random() < 0.4) {
                const randCustom = this.customWords[Math.floor(Math.random() * this.customWords.length)];
                if (!choices.includes(randCustom)) choices.push(randCustom);
            }

            for (let i = 0; choices.length < targetCount && i < tiers.length; i++) {
                const tierList = tiers[i];
                if (tierList && tierList.length > 0) {
                    let attempts = 0;
                    while (attempts < 25) {
                        const word = tierList[Math.floor(Math.random() * tierList.length)];
                        if (!choices.includes(word)) {
                            choices.push(word);
                            break;
                        }
                        attempts++;
                    }
                }
            }

            // Fill any remaining slots (for word count 4 or 5)
            while (choices.length < targetCount && choices.length < fullPool.length) {
                const rand = fullPool[Math.floor(Math.random() * fullPool.length)];
                if (!choices.includes(rand)) choices.push(rand);
            }
        } else {
            // Flat pool fallback
            while (choices.length < targetCount && choices.length < fullPool.length) {
                const rand = fullPool[Math.floor(Math.random() * fullPool.length)];
                if (!choices.includes(rand)) choices.push(rand);
            }
        }
        this.wordChoices = choices;

        // Drawer gets word choices, others get drawer id
        if (drawer.socket) {
            drawer.socket.emit('data', {
                id: MSG.STATE_CHANGE,
                data: { id: STATES.WORD_SELECT, time: 15, data: { words: this.wordChoices } }
            });
        }

        this.broadcastTo(u => u.id !== drawer.id, {
            id: MSG.STATE_CHANGE,
            data: { id: STATES.WORD_SELECT, time: 15, data: { id: drawer.id } }
        });

        this.timeRemaining = 15;
        this.state = { id: STATES.WORD_SELECT, time: 15, data: { id: drawer.id } };

        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.timeRemaining--;
            this.broadcast({ id: MSG.TIME, data: Math.max(0, this.timeRemaining) });
            if (this.timeRemaining <= 0) {
                clearInterval(this.timer);
                this.timer = null;
                this.selectWord(0);
            }
        }, 1000);

        // If drawer is bot, auto-pick word after 1.5s
        if (drawer.isBot) {
            setTimeout(() => {
                this.selectWord(Math.floor(Math.random() * this.wordChoices.length));
            }, 1500);
        }
    }

    selectWord(index) {
        if (this.state.id !== STATES.WORD_SELECT) return;

        const word = this.wordChoices[index] || this.wordChoices[0] || 'cat';
        this.currentWord = word;
        const drawer = this.getCurrentDrawer();
        const drawTime = this.settings[SETTINGS.DRAWTIME] || 80;

        // Word lengths for guessers: e.g. "ice cream" -> [3, 5]
        const wordLengths = word.split(' ').map(part => part.length);

        if (drawer && drawer.socket) {
            drawer.socket.emit('data', {
                id: MSG.STATE_CHANGE,
                data: {
                    id: STATES.DRAWING,
                    time: drawTime,
                    data: { id: drawer.id, word: word, drawCommands: [] }
                }
            });
        }

        this.broadcastTo(u => !drawer || u.id !== drawer.id, {
            id: MSG.STATE_CHANGE,
            data: {
                id: STATES.DRAWING,
                time: drawTime,
                data: { id: drawer ? drawer.id : 0, word: wordLengths, hints: [] }
            }
        });

        this.state = { id: STATES.DRAWING, time: drawTime, data: { id: drawer ? drawer.id : 0 } };
        this.timeRemaining = drawTime;

        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.timeRemaining--;
            this.broadcast({ id: MSG.TIME, data: Math.max(0, this.timeRemaining) });
            this.onTick();

            if (this.timeRemaining <= 0) {
                clearInterval(this.timer);
                this.timer = null;
                this.endTurn(REASONS.TIME_UP);
            }
        }, 1000);

        // If bot is drawing, run bot drawing animation!
        if (drawer && drawer.isBot) {
            this.startBotDrawing();
        }
    }

    startBotDrawing() {
        const presets = Object.keys(BOT_DRAWINGS);
        const presetKey = presets[Math.floor(Math.random() * presets.length)];
        const commands = BOT_DRAWINGS[presetKey];

        let cmdIndex = 0;
        const drawInterval = setInterval(() => {
            if (this.state.id !== STATES.DRAWING || cmdIndex >= commands.length) {
                clearInterval(drawInterval);
                return;
            }
            const batch = [commands[cmdIndex++]];
            this.drawCommands.push(...batch);
            this.broadcast({
                id: MSG.DRAW_DATA,
                data: batch
            });
        }, 600);
    }

    handleGuess(user, msg) {
        if (!msg || typeof msg !== 'string') return;
        const trimmed = msg.trim();
        if (trimmed.length === 0) return;

        const drawer = this.getCurrentDrawer();
        const isDrawer = drawer && drawer.id === user.id;

        // If user already guessed or is drawer
        if (user.guessed || isDrawer) {
            // Send only to others who already guessed or drawer
            const recipients = this.users.filter(u => u.guessed || (drawer && u.id === drawer.id));
            for (const r of recipients) {
                if (r.socket) {
                    r.socket.emit('data', {
                        id: MSG.CHAT,
                        data: { id: user.id, msg: trimmed }
                    });
                }
            }
            return;
        }

        // Check if guess is correct
        const normalizedGuess = trimmed.toLowerCase();
        const normalizedTarget = this.currentWord.toLowerCase();

        if (normalizedGuess === normalizedTarget) {
            user.guessed = true;

            const drawTime = this.settings[SETTINGS.DRAWTIME] || 80;
            const guesserPoints = Math.round(400 * (this.timeRemaining / drawTime)) + 100;
            const drawerPoints = Math.round(50 * (this.timeRemaining / drawTime)) + 25;

            user.score += guesserPoints;
            this.turnScores.set(user.id, (this.turnScores.get(user.id) || 0) + guesserPoints);

            if (drawer) {
                drawer.score += drawerPoints;
                this.turnScores.set(drawer.id, (this.turnScores.get(drawer.id) || 0) + drawerPoints);
            }

            // Broadcast GUESSED
            this.broadcast({
                id: MSG.GUESSED,
                data: { id: user.id, word: this.currentWord }
            });

            this.checkAllGuessed();
        } else {
            // Check Levenshtein distance for close guess
            const dist = levenshtein(normalizedGuess, normalizedTarget);
            if (dist === 1 && normalizedTarget.length > 2) {
                this.broadcast({
                    id: MSG.CLOSE,
                    data: user.name
                });
            }

            // Broadcast normal chat
            this.broadcast({
                id: MSG.CHAT,
                data: { id: user.id, msg: trimmed }
            });
        }
    }

    checkAllGuessed() {
        const drawer = this.getCurrentDrawer();
        const guessers = this.users.filter(u => !drawer || u.id !== drawer.id);
        const allGuessed = guessers.length > 0 && guessers.every(u => u.guessed);

        if (allGuessed) {
            this.endTurn(REASONS.EVERYONE_GUESSED);
        }
    }

    endTurn(reason) {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Build scores array: [p.id, p.score, turnGainedScore, ...]
        const scores = [];
        for (const u of this.users) {
            scores.push(u.id);
            scores.push(u.score);
            scores.push(this.turnScores.get(u.id) || 0);
        }

        this.setState(STATES.TURN_REVEAL, 5, {
            word: this.currentWord,
            reason: reason,
            scores: scores
        });
    }

    nextTurn() {
        this.currentDrawerIndex++;
        if (this.currentDrawerIndex >= this.turnOrder.length) {
            this.nextRoundOrGameOver();
        } else {
            this.startTurn();
        }
    }

    nextRoundOrGameOver() {
        const totalRounds = this.settings[SETTINGS.ROUNDS] || 3;
        if (this.round + 1 < totalRounds) {
            this.startRound(this.round + 1);
        } else {
            this.gameOver();
        }
    }

    gameOver() {
        // Sort users by score descending
        const sorted = [...this.users].sort((a, b) => b.score - a.score);
        // Podium array: [[userId, rank, title], ...]
        const podium = sorted.map((u, rank) => [u.id, rank, '']);

        this.setState(STATES.GAME_OVER, 12, podium);
    }

    resetToLobby() {
        for (const u of this.users) {
            u.score = 0;
            u.guessed = false;
        }

        if (this.isPrivate) {
            this.setState(STATES.LOBBY, 0, null);
        } else {
            this.setState(this.users.length >= 2 ? STATES.STARTING : STATES.WAITING, 0, null);
        }
    }
}

// Active rooms
const rooms = new Map();

function getOrCreatePublicRoom() {
    for (const [id, room] of rooms.entries()) {
        if (!room.isPrivate && room.users.length < (room.settings[SETTINGS.SLOTS] || 8)) {
            return room;
        }
    }
    const newId = crypto.randomBytes(3).toString('hex').toUpperCase();
    const room = new Room(newId, false);
    rooms.set(newId, room);
    return room;
}

function createPrivateRoom() {
    const id = crypto.randomBytes(3).toString('hex').toUpperCase();
    const room = new Room(id, true);
    rooms.set(id, room);
    return room;
}

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// API endpoint expected by game client
app.post('/api/play', (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    res.send(`${proto}://${host}`);
});

// Terms of Service & Credits routes
app.get(['/terms', '/terms.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});
app.get(['/credits', '/credits.html'], (req, res) => {
    res.redirect('/terms#credits');
});

// Fallback to index.html for all page requests (supports ?roomId query)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO Handling
io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUser = null;

    socket.on('login', (data) => {
        const clientIp = socket.handshake.address;

        let room = null;
        if (data.create) {
            room = createPrivateRoom();
        } else if (data.join) {
            room = rooms.get(data.join);
            if (!room) {
                socket.emit('joinerr', 1); // Room not found!
                return;
            }
        } else {
            room = getOrCreatePublicRoom();
        }

        const maxSlots = room.settings[SETTINGS.SLOTS] || 8;
        if (room.users.length >= maxSlots) {
            socket.emit('joinerr', 2); // Room is full!
            return;
        }

        if (room.bannedIps.has(clientIp)) {
            socket.emit('joinerr', 4); // Banned!
            return;
        }

        currentRoom = room;
        currentUser = room.addUser(socket, data.name, data.avatar, clientIp);

        // Send INIT payload (id: 10) with full late-joiner canvas synchronization
        let stateToSend = room.state;
        if (room.state.id === STATES.DRAWING) {
            stateToSend = {
                id: room.state.id,
                time: Math.max(0, room.timeRemaining),
                data: Object.assign({}, room.state.data, {
                    drawCommands: room.drawCommands,
                    hints: room.hints
                })
            };
        }

        socket.emit('data', {
            id: MSG.INIT,
            data: {
                me: currentUser.id,
                type: room.isPrivate ? 1 : 0,
                id: room.id,
                settings: room.settings,
                users: room.users.map(u => ({
                    id: u.id,
                    flags: u.flags,
                    name: u.name,
                    avatar: u.avatar,
                    score: u.score,
                    guessed: u.guessed
                })),
                round: room.round,
                owner: room.owner,
                state: stateToSend
            }
        });

        // Broadcast USER_JOIN (id: 1) to other users in room
        room.broadcastTo(u => u.id !== currentUser.id, {
            id: MSG.USER_JOIN,
            data: {
                id: currentUser.id,
                flags: currentUser.flags,
                name: currentUser.name,
                avatar: currentUser.avatar,
                score: currentUser.score,
                guessed: currentUser.guessed
            }
        });

        // If public room reached 2 players and is WAITING, start game!
        if (!room.isPrivate && room.users.length >= 2 && room.state.id === STATES.WAITING) {
            room.setState(STATES.STARTING, 3, null);
        }
    });

    socket.on('data', (packet) => {
        if (!currentRoom || !currentUser) return;

        const id = packet.id;
        const data = packet.data;

        switch (id) {
            case MSG.DRAW_DATA: // 19
                if (currentRoom.state.id === STATES.DRAWING) {
                    const drawer = currentRoom.getCurrentDrawer();
                    if (drawer && drawer.id === currentUser.id && Array.isArray(data)) {
                        // Security bounds: max 150 commands per batch, max 12000 commands per round
                        if (data.length <= 150 && currentRoom.drawCommands.length + data.length <= 12000) {
                            const validated = [];
                            for (const cmd of data) {
                                if (Array.isArray(cmd) && (cmd[0] === 0 || cmd[0] === 1)) {
                                    validated.push(cmd);
                                }
                            }
                            if (validated.length > 0) {
                                currentRoom.drawCommands.push(...validated);
                                currentRoom.broadcastTo(u => u.id !== currentUser.id, {
                                    id: MSG.DRAW_DATA,
                                    data: validated
                                });
                            }
                        }
                    }
                }
                break;

            case MSG.CLEAR_CANVAS: // 20
                if (currentRoom.state.id === STATES.DRAWING) {
                    const drawer = currentRoom.getCurrentDrawer();
                    if (drawer && drawer.id === currentUser.id) {
                        currentRoom.drawCommands = [];
                        currentRoom.broadcastTo(u => u.id !== currentUser.id, {
                            id: MSG.CLEAR_CANVAS
                        });
                    }
                }
                break;

            case MSG.UNDO: // 21
                if (currentRoom.state.id === STATES.DRAWING) {
                    const drawer = currentRoom.getCurrentDrawer();
                    if (drawer && drawer.id === currentUser.id) {
                        currentRoom.drawCommands = currentRoom.drawCommands.slice(0, data);
                        currentRoom.broadcastTo(u => u.id !== currentUser.id, {
                            id: MSG.UNDO,
                            data: data
                        });
                    }
                }
                break;

            case MSG.WORD_SELECT: // 18
                if (currentRoom.state.id === STATES.WORD_SELECT) {
                    const drawer = currentRoom.getCurrentDrawer();
                    if (drawer && drawer.id === currentUser.id) {
                        currentRoom.selectWord(data);
                    }
                }
                break;

            case MSG.CHAT: // 30
                // Spam rate limiting: max 4 messages per 2 seconds
                {
                    const now = Date.now();
                    if (!socket.chatTimestamps) socket.chatTimestamps = [];
                    socket.chatTimestamps = socket.chatTimestamps.filter(t => now - t < 2000);
                    if (socket.chatTimestamps.length >= 4) {
                        socket.emit('data', { id: MSG.SPAM_WARN });
                        return;
                    }
                    socket.chatTimestamps.push(now);
                    currentRoom.handleGuess(currentUser, data);
                }
                break;

            case MSG.REPORT: // 6
                if (data && data.id && data.reasons) {
                    const target = currentRoom.users.find(u => u.id === data.id);
                    if (target && target.id !== currentUser.id) {
                        if (!currentRoom.reports) currentRoom.reports = new Map();
                        if (!currentRoom.reports.has(target.id)) {
                            currentRoom.reports.set(target.id, new Set());
                        }
                        const reporters = currentRoom.reports.get(target.id);
                        reporters.add(currentUser.id);
                        console.log(`[REPORT] User ${currentUser.name} reported ${target.name} (reasons: ${data.reasons}). Total reports: ${reporters.size}`);

                        const needed = Math.floor(currentRoom.users.length / 2) + 1;
                        if (reporters.size >= needed) {
                            if (target.socket) {
                                target.socket.emit('reason', 1); // kicked
                                target.socket.disconnect();
                            } else if (target.isBot) {
                                currentRoom.removeUser(target.id, 1);
                            }
                        }
                    }
                }
                break;

            case MSG.START_GAME: // 22
                if (currentUser.id === currentRoom.owner) {
                    currentRoom.startGame(data);
                }
                break;

            case MSG.SETTING_UPDATE: // 12
                if (currentUser.id === currentRoom.owner && data) {
                    const sId = parseInt(data.id);
                    const val = parseInt(data.val);
                    if (!isNaN(sId) && !isNaN(val)) {
                        currentRoom.settings[sId] = val;
                        currentRoom.broadcast({
                            id: MSG.SETTING_UPDATE,
                            data: { id: sId, val: val }
                        });
                    }
                }
                break;

            case MSG.RATE: // 8 (thumbs up/down)
                currentRoom.broadcast({
                    id: MSG.RATE,
                    data: { id: currentUser.id, vote: data }
                });
                break;

            case MSG.KICK: // 3
                if (currentUser.id === currentRoom.owner && data) {
                    const target = currentRoom.users.find(u => u.id === data);
                    if (target && target.socket) {
                        target.socket.emit('reason', 1); // 1 = kicked
                        target.socket.disconnect();
                    }
                }
                break;

            case MSG.BAN: // 4
                if (currentUser.id === currentRoom.owner && data) {
                    const target = currentRoom.users.find(u => u.id === data);
                    if (target) {
                        if (target.ip) currentRoom.bannedIps.add(target.ip);
                        if (target.socket) {
                            target.socket.emit('reason', 2); // 2 = banned
                            target.socket.disconnect();
                        }
                    }
                }
                break;

            case MSG.VOTEKICK: // 5
                if (data && data !== currentUser.id) {
                    if (!currentRoom.votekicks.has(data)) {
                        currentRoom.votekicks.set(data, new Set());
                    }
                    const votes = currentRoom.votekicks.get(data);
                    votes.add(currentUser.id);

                    const needed = Math.floor(currentRoom.users.length / 2) + 1;
                    currentRoom.broadcast({
                        id: MSG.VOTEKICK,
                        data: [currentUser.id, data, votes.size, needed]
                    });

                    if (votes.size >= needed) {
                        const target = currentRoom.users.find(u => u.id === data);
                        if (target && target.socket) {
                            target.socket.emit('reason', 1);
                            target.socket.disconnect();
                        }
                    }
                }
                break;
        }
    });

    // Custom helper event: add bot to room
    socket.on('addBot', () => {
        if (!currentRoom || currentUser.id !== currentRoom.owner) return;
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + ' #' + Math.floor(Math.random() * 99);
        const botAvatar = [Math.floor(Math.random() * 28), Math.floor(Math.random() * 57), Math.floor(Math.random() * 51), -1];
        const bot = currentRoom.addUser(null, botName, botAvatar, '127.0.0.1');

        currentRoom.broadcast({
            id: MSG.USER_JOIN,
            data: {
                id: bot.id,
                flags: bot.flags,
                name: bot.name,
                avatar: bot.avatar,
                score: bot.score,
                guessed: bot.guessed
            }
        });
    });

    socket.on('disconnect', () => {
        if (currentRoom && currentUser) {
            currentRoom.removeUser(currentUser.id);
            if (currentRoom.users.length === 0) {
                rooms.delete(currentRoom.id);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`Anomus Server is running on port ${PORT}!`);
    console.log(`Open http://localhost:${PORT} in your browser.`);
    console.log(`=========================================`);
});
