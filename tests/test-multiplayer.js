const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function runTest() {
    console.log('--- Starting Multiplayer Integration Test ---');

    // 1. Connect Player 1 (Creator)
    const p1 = io(SERVER_URL, { transports: ['websocket'] });
    let p1RoomId = null;
    let p1UserId = null;

    let p2 = null;
    let p2UserId = null;

    let secretWord = null;

    await new Promise((resolve, reject) => {
        p1.on('connect', () => {
            console.log('Player 1 connected to socket.');
            p1.emit('login', {
                join: 0,
                create: 1,
                name: 'Alice',
                lang: 0,
                code: '',
                avatar: [5, 12, 8, -1]
            });
        });

        p1.on('data', (packet) => {
            if (packet.id === 10) { // INIT
                p1UserId = packet.data.me;
                p1RoomId = packet.data.id;
                console.log(`Player 1 initialized! Room ID: ${p1RoomId}, User ID: ${p1UserId}`);
                resolve();
            }
        });

        setTimeout(() => reject(new Error('P1 login timeout')), 4000);
    });

    // 2. Connect Player 2 (Join Room)
    await new Promise((resolve, reject) => {
        p2 = io(SERVER_URL, { transports: ['websocket'] });

        p2.on('connect', () => {
            console.log('Player 2 connected to socket.');
            p2.emit('login', {
                join: p1RoomId,
                create: 0,
                name: 'Bob',
                lang: 0,
                code: '',
                avatar: [10, 20, 30, -1]
            });
        });

        p2.on('data', (packet) => {
            if (packet.id === 10) { // INIT
                p2UserId = packet.data.me;
                console.log(`Player 2 joined! User ID: ${p2UserId}, Room ID: ${packet.data.id}`);
                resolve();
            }
        });

        setTimeout(() => reject(new Error('P2 login timeout')), 4000);
    });

    // 3. Start Game by Owner (P1)
    console.log('Player 1 starting game...');
    p1.emit('data', {
        id: 22, // START_GAME
        data: 'cat,dog,elephant,guitar,apple,pizza,rainbow'
    });

    // 4. Wait for WORD_SELECT (State 3)
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Waiting for word selection timeout')), 12000);

        function handleState(packet, playerLabel, sock) {
            if (packet.id === 11) { // STATE_CHANGE
                console.log(`[${playerLabel}] State change to ${packet.data.id} (data:`, packet.data.data, `)`);
                if (packet.data.id === 3) { // WORD_SELECT
                    if (packet.data.data && packet.data.data.words) {
                        console.log(`[${playerLabel}] Drawer received word choices:`, packet.data.data.words);
                        secretWord = packet.data.data.words[0];
                        // Select first word!
                        console.log(`[${playerLabel}] Selecting word index 0: "${secretWord}"`);
                        sock.emit('data', {
                            id: 18,
                            data: 0
                        });
                        clearTimeout(timeout);
                        resolve();
                    }
                }
            }
        }

        p1.on('data', pkt => handleState(pkt, 'P1', p1));
        p2.on('data', pkt => handleState(pkt, 'P2', p2));
    });

    // 5. Wait for DRAWING (State 4) & Test Drawing Commands
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Waiting for drawing phase timeout')), 5000);

        p2.on('data', (packet) => {
            if (packet.id === 11 && packet.data.id === 4) { // DRAWING
                console.log('Drawing phase active!');
                console.log('Player 2 received word lengths:', packet.data.data.word);

                // Drawer (P1) sends draw commands
                const testStrokes = [
                    [0, 4, 10, 100, 100, 150, 150],
                    [0, 4, 10, 150, 150, 200, 100]
                ];
                p1.emit('data', {
                    id: 19,
                    data: testStrokes
                });
            }

            if (packet.id === 19) {
                console.log('Player 2 received drawing strokes successfully:', packet.data);
                clearTimeout(timeout);
                resolve();
            }
        });
    });

    // 6. Test Close Guess & Correct Guess
    console.log(`Testing guess for secret word: "${secretWord}"...`);
    let gotCloseNotice = false;
    let gotGuessedNotice = false;

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Guessing phase timeout')), 8000);

        p2.on('data', (packet) => {
            if (packet.id === 16) { // CLOSE
                console.log('SUCCESS: Close guess event received! Player close:', packet.data);
                gotCloseNotice = true;

                // Send exact correct guess!
                setTimeout(() => {
                    console.log(`Player 2 sending exact correct guess: "${secretWord}"`);
                    p2.emit('data', {
                        id: 30, // CHAT
                        data: secretWord
                    });
                }, 300);
            }

            if (packet.id === 15) { // GUESSED
                console.log('SUCCESS: Word guessed event received!', packet.data);
                gotGuessedNotice = true;
            }

            if (packet.id === 11 && packet.data.id === 5) { // TURN_REVEAL
                console.log('SUCCESS: Turn reveal phase entered! Reveal data:', packet.data.data);
                clearTimeout(timeout);
                resolve();
            }
        });

        // Send a close guess (1 character off)
        const closeGuess = secretWord.slice(0, -1) + 'z';
        console.log(`Player 2 sending close guess: "${closeGuess}"`);
        p2.emit('data', {
            id: 30,
            data: closeGuess
        });
    });

    p1.disconnect();
    p2.disconnect();

    console.log('--- ALL MULTIPLAYER TESTS PASSED SUCCESSFULLY! ---');
    process.exit(0);
}

runTest().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
