const { io } = require('socket.io-client');
const SERVER_URL = 'http://localhost:3000';

async function testBot() {
    console.log('--- Testing Bot Player Integration ---');

    const p1 = io(SERVER_URL, { transports: ['websocket'] });
    let p1RoomId = null;

    await new Promise((resolve, reject) => {
        p1.on('connect', () => {
            p1.emit('login', {
                join: 0,
                create: 1,
                name: 'HumanPlayer',
                lang: 0,
                code: '',
                avatar: [2, 15, 20, -1]
            });
        });

        p1.on('data', (packet) => {
            if (packet.id === 10) {
                p1RoomId = packet.data.id;
                console.log(`Human joined room ${p1RoomId}. Requesting bot...`);
                p1.emit('addBot');
            }
            if (packet.id === 1) { // USER_JOIN
                console.log(`Bot joined room: Name="${packet.data.name}", ID=${packet.data.id}`);
                resolve();
            }
        });

        setTimeout(() => reject(new Error('Bot join timeout')), 5000);
    });

    console.log('Starting game with human + bot...');
    p1.emit('data', {
        id: 22,
        data: 'banana,pizza,sun'
    });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Game play timeout')), 20000);

        p1.on('data', (packet) => {
            if (packet.id === 11 && packet.data.id === 3) {
                if (packet.data.data && packet.data.data.words) {
                    console.log('Human is drawing! Picking word:', packet.data.data.words[0]);
                    p1.emit('data', { id: 18, data: 0 });
                }
            }

            if (packet.id === 16) {
                console.log(`Close guess event from: ${packet.data}`);
            }

            if (packet.id === 15) {
                console.log(`Word guessed by player ID: ${packet.data.id}`);
            }

            if (packet.id === 11 && packet.data.id === 5) {
                console.log('Turn completed! Scores:', packet.data.data.scores);
                clearTimeout(timeout);
                resolve();
            }
        });
    });

    p1.disconnect();
    console.log('--- BOT TEST PASSED SUCCESSFULLY! ---');
    process.exit(0);
}

testBot().catch(err => {
    console.error('Bot test failed:', err);
    process.exit(1);
});
