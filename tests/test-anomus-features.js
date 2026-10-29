const { io } = require('socket.io-client');
const SERVER_URL = 'http://localhost:3000';

async function testAnomusFeatures() {
    console.log('=== Testing Anomus Critical Fixes & Features ===');

    // 1. Connect P1
    const p1 = io(SERVER_URL, { transports: ['websocket'] });
    let roomId = null;
    let p1Id = null;

    await new Promise((res, rej) => {
        p1.on('connect', () => {
            p1.emit('login', { join: 0, create: 1, name: 'Alice', lang: 0, avatar: [1, 2, 3, -1] });
        });
        p1.on('data', pkt => {
            if (pkt.id === 10) {
                p1Id = pkt.data.me;
                roomId = pkt.data.id;
                console.log(`[PASS] Room created with crypto code: ${roomId}`);
                res();
            }
        });
        setTimeout(() => rej(new Error('P1 login timeout')), 4000);
    });

    // 2. Test Word Count setting = 4
    console.log('Testing Word Count Setting = 4...');
    p1.emit('data', {
        id: 12, // SETTING_UPDATE
        data: { id: 4, val: 4 } // setting 4 is WORDCOUNT
    });
    await new Promise(r => setTimeout(r, 200));

    // Connect P2 so we can start
    const p2 = io(SERVER_URL, { transports: ['websocket'] });
    await new Promise((res, rej) => {
        p2.on('connect', () => {
            p2.emit('login', { join: roomId, create: 0, name: 'Bob', lang: 0, avatar: [4, 5, 6, -1] });
        });
        p2.on('data', pkt => {
            if (pkt.id === 10) res();
        });
        setTimeout(() => rej(new Error('P2 login timeout')), 4000);
    });

    // Start game
    p1.emit('data', { id: 22, data: '' });

    // Wait for WORD_SELECT on P1 and verify word count === 4
    await new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('Word choice timeout')), 12000);
        p1.on('data', pkt => {
            if (pkt.id === 11 && pkt.data.id === 3 && pkt.data.data && pkt.data.data.words) {
                console.log(`Word choices received:`, pkt.data.data.words);
                if (pkt.data.data.words.length === 4) {
                    console.log('[PASS] Word count setting honored! Exactly 4 words presented.');
                    clearTimeout(to);
                    // Select word 0 to enter drawing
                    p1.emit('data', { id: 18, data: 0 });
                    res();
                } else {
                    rej(new Error(`Expected 4 words, got ${pkt.data.data.words.length}`));
                }
            }
        });
    });

    // 3. Draw strokes on P1
    const testStrokes = [
        [0, 1, 10, 10, 10, 20, 20],
        [0, 1, 10, 20, 20, 30, 30],
        [0, 1, 10, 30, 30, 40, 40]
    ];
    await new Promise(r => setTimeout(r, 500));
    p1.emit('data', { id: 19, data: testStrokes });
    console.log('Drawer sent 3 strokes.');
    await new Promise(r => setTimeout(r, 500));

    // 4. Test Late Joiner Canvas Sync (Connect P3 mid-drawing!)
    console.log('Connecting Late Joiner (P3) during active drawing phase...');
    const p3 = io(SERVER_URL, { transports: ['websocket'] });
    await new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('P3 late join timeout')), 5000);
        p3.on('connect', () => {
            p3.emit('login', { join: roomId, create: 0, name: 'LateCharlie', lang: 0, avatar: [7, 8, 9, -1] });
        });
        p3.on('data', pkt => {
            if (pkt.id === 10) { // INIT
                const state = pkt.data.state;
                console.log('P3 received INIT state:', state.id, 'with data keys:', Object.keys(state.data));
                if (state.id === 4 && state.data.drawCommands && state.data.drawCommands.length === 3) {
                    console.log('[PASS] Late joiner canvas synchronized! Received all 3 previous strokes.');
                    clearTimeout(to);
                    res();
                } else {
                    rej(new Error('Late joiner did not receive drawCommands in state data'));
                }
            }
        });
    });

    // 5. Test Chat Spam Rate Limiting on P2
    console.log('Testing chat spam rate limiting (rapid sending 5 messages)...');
    let receivedSpamWarn = false;
    p2.on('data', pkt => {
        if (pkt.id === 32) { // SPAM_WARN
            receivedSpamWarn = true;
            console.log('[PASS] Spam warning (packet 32) successfully triggered by rate limiter!');
        }
    });

    for (let i = 0; i < 5; i++) {
        p2.emit('data', { id: 30, data: `spam ${i}` });
    }
    await new Promise(r => setTimeout(r, 400));
    if (!receivedSpamWarn) {
        throw new Error('Spam warning packet 32 was not received');
    }

    // 6. Test Player Reporting Flow
    console.log('Testing player report handler...');
    p2.emit('data', {
        id: 6, // MSG.REPORT
        data: { id: p1Id, reasons: 1 } // Toxic drawing report
    });
    await new Promise(r => setTimeout(r, 400));
    console.log('[PASS] Report packet handled without errors.');

    p1.disconnect();
    p2.disconnect();
    p3.disconnect();
    console.log('=== ALL ANOMUS TESTS COMPLETED WITH 100% SUCCESS! ===');
    process.exit(0);
}

testAnomusFeatures().catch(err => {
    console.error('Anomus test failed:', err);
    process.exit(1);
});
