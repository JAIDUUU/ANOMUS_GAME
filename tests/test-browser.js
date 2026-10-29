const puppeteer = require('puppeteer-core');

async function testBrowser() {
    console.log('Launching Chromium...');
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleLogs.push(`[PAGEERROR] ${err.toString()}`));

    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    await page.screenshot({ path: '/home/kali/game/public/screen_1_home.png' });
    console.log('Home screenshot saved.');

    // Fill name
    console.log('Entering name...');
    await page.type('.input-name', 'Picasso');

    // Click Create Private Room
    console.log('Clicking Create Private Room...');
    await page.click('.button-create');

    try {
        // Wait for game room to appear (#game is displayed)
        await page.waitForFunction(() => {
            const game = document.querySelector('#game');
            return game && window.getComputedStyle(game).display === 'flex';
        }, { timeout: 6000 });
    } catch (e) {
        console.log('Error waiting for #game display:flex');
        console.log('\n--- BROWSER CONSOLE LOGS ---');
        consoleLogs.forEach(l => console.log(l));
        await page.screenshot({ path: '/home/kali/game/public/screen_error.png' });
        await browser.close();
        process.exit(1);
    }

    await page.screenshot({ path: '/home/kali/game/public/screen_2_lobby.png' });
    console.log('Lobby screenshot saved.');

    // Check invite input
    const inviteLink = await page.$eval('#input-invite', el => el.value);
    console.log('Invite link generated:', inviteLink);

    // Click Add Bot Player
    console.log('Clicking Add Bot Player...');
    await page.click('#btn-add-bot');
    await new Promise(r => setTimeout(r, 1000));

    // Verify player list has 2 players
    const playerCount = await page.$$eval('#game-players .player', els => els.length);
    console.log('Players in room:', playerCount);

    await page.screenshot({ path: '/home/kali/game/public/screen_3_bot_added.png' });
    console.log('Bot added screenshot saved.');

    // Click Start Game
    console.log('Clicking Start Game...');
    await page.click('#button-start-game');

    // Wait a couple seconds into game
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: '/home/kali/game/public/screen_4_gameplay.png' });
    console.log('Gameplay screenshot saved.');

    console.log('\n--- BROWSER CONSOLE LOGS ---');
    consoleLogs.forEach(l => console.log(l));

    await browser.close();
    console.log('\nBrowser verification complete!');
}

testBrowser().catch(err => {
    console.error('Browser test failed:', err);
    process.exit(1);
});
