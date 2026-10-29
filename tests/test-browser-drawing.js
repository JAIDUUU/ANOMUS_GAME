const puppeteer = require('puppeteer-core');

async function testFullGame() {
    console.log('Launching browser for complete drawing test...');
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on('console', msg => console.log('[BROWSER LOG]', msg.text()));
    page.on('pageerror', err => console.log('[BROWSER ERR]', err.toString()));

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await page.type('.input-name', 'ArtistPro');
    await page.click('.button-create');

    // Wait for room to be created and displayed
    await page.waitForFunction(() => {
        const game = document.querySelector('#game');
        return game && window.getComputedStyle(game).display === 'flex';
    }, { timeout: 8000 });
    console.log('Room created successfully!');

    // Add bot
    console.log('Adding bot player...');
    await new Promise(r => setTimeout(r, 1500));
    await page.click('#btn-add-bot');
    await page.waitForFunction(() => document.querySelectorAll('#game-players .player').length >= 2, { timeout: 8000 });
    console.log('Bot joined the room!');

    // Start game
    console.log('Clicking Start Game...');
    await page.click('#button-start-game');

    // Wait for word selection phase
    console.log('Waiting for word choices to appear...');
    await page.waitForFunction(() => {
        const words = document.querySelectorAll('.words .word');
        return words.length > 0;
    }, { timeout: 12000 });

    const words = await page.$$eval('.words .word', els => els.map(e => e.textContent));
    console.log('Words available to choose:', words);

    // Click the first word
    await page.evaluate(() => document.querySelector('.words .word').click());
    console.log(`Chose word: ${words[0]}`);

    // Wait for toolbar to show (drawing mode)
    await page.waitForFunction(() => {
        const wrapper = document.querySelector('#game-wrapper');
        return wrapper && !wrapper.classList.contains('toolbar-hidden');
    }, { timeout: 5000 });

    console.log('Drawing mode active! Drawing on canvas...');
    const canvas = await page.$('#game-canvas canvas');
    const box = await canvas.boundingBox();

    // Draw on canvas
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 200);
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.move(box.x + 200, box.y + 300);
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.up();

    await page.screenshot({ path: '/home/kali/game/public/screen_5_drawing.png' });
    console.log('Saved screen_5_drawing.png');

    // Wait for bot to guess or timer to reveal
    console.log('Waiting for bot to guess word...');
    await page.waitForFunction(() => {
        const chat = document.querySelector('#game-chat .chat-content');
        return chat && chat.innerText.includes('guessed the word');
    }, { timeout: 15000 });

    console.log('Bot successfully guessed the word!');
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: '/home/kali/game/public/screen_6_revealed.png' });
    console.log('Saved screen_6_revealed.png');

    await browser.close();
    console.log('Full game cycle completed perfectly!');
}

testFullGame().catch(err => {
    console.error('Error during full game test:', err);
    process.exit(1);
});
