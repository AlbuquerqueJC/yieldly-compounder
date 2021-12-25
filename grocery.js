const puppeteer = require("puppeteer");
const readline = require("readline");
const settings = require("./settings");
const axios = require('axios');

////////////////////////////////////////////
//                                        //
//  DISCORD GROCERY COMMANDS              //
//  PLEASE CHECK settings.js              //
//                                        //
////////////////////////////////////////////

const DACCOUNT = settings.daccount;
const DPW = settings.dpw;
const DCOMMAND = settings.dcommand;
const DEBUG = settings.debug;
const MYALGO_PASSWORD = settings.password;

// RPI4 Settings
const PUPPETEER_SETTINGS = {
    headless: settings.headless,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--single-process', '--no-zygote', '--no-sandbox', '--disable-setuid-sandbox'],
    userDataDir: "./user_data"
};
const ENTER = String.fromCharCode(13);
const ESC = String.fromCharCode(27);

let browser;

// PRINTS TERMINAL STUFF WAITING FOR USER INPUT
function terminalPrompt(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) =>
        rl.question(query, (ans) => {
            rl.close();
            resolve(ans);
        })
    );
}


// CHECK IF DISCORD ACCOUNT IS LOGGED IN
const checkDiscord = async () => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    const page = (await browser.pages())[0];
    await page.goto('https://discord.com/channels/904883897224032256/906906150405017611');
    await page.waitForSelector("input[name='password']");

    // CHECKS IF THERE'S AN <input name=password> IN PAGE, INDICATING ACCOUNT NOT LOGGED IN
    const accNotLoggedIn = await page.evaluate(
        () => !!document.querySelector("input[name='password']")
    ) // !! converts anything to boolean

    if (accNotLoggedIn) {
        // WAIT FOR USER INPUT ON THE TERMINAL AFTER THE LOGIN IS DONE
        await terminalPrompt("Not logged in, please login and press ENTER");
        await browser.close();
        process.exit();
    }
    await browser.close();
}


// CONNECTS DISCORD
const connectDiscord = async browser => {
    let pages = await browser.pages();
    const discordPage = pages[0];

    await discordPage.waitForTimeout(10000);

    log(`--- Check if account is logged in ---`);
    // CHECKS IF THERE'S AN <input name=password> IN PAGE, INDICATING ACCOUNT NOT LOGGED IN
    const accNotLoggedIn = await discordPage.evaluate(
        () => !!document.querySelector("input[name='password']")
    ) // !! converts anything to boolean

    if (accNotLoggedIn) {
        log(`--- Logging in account ---`);
        await discordPage.waitForTimeout(1000);
        await discordPage.waitForSelector("input[name='password']");

        await discordPage.type("input[name='email']", [DACCOUNT]);
        await discordPage.waitForTimeout(1000);

        await discordPage.type("input[name='password']", [DPW, ENTER]);
        await discordPage.waitForTimeout(1000);
        log(`--- Logged in ---`);
    } else {
        log(`--- Logged in ---`);
    }
}

// PAUSE EXECUTION FOR THE SPECIFIED AMOUNT OF TIME
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// LOGS OUTPUT TO CONSOLE AND (OPTIONALLY) TO TELEGRAM, IF VARIABLES ARE PRESENT IN SETTINGS.JS
const log = message => {
    console.log(message);
    settings.telegram_api && settings.telegram_chatid &&
    axios.get(`https://api.telegram.org/bot${settings.telegram_api}/sendmessage?chat_id=${settings.telegram_chatid}&disable_web_page_preview=1&disable_notification=true&text=${encodeURIComponent(message)}`);
}

// RUNS THIS SCRIPT
(async () => {
    for (let i = 0; i < 3; i++) { // TRY TO RUN THE SCRIPT 3 TIMES TO BYPASS POSSIBLE NETWORK ERRORS
        try {
            log(`------ START -----`);
            log(`DISCORD Hourly command g$d100${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            browser = await puppeteer.launch(PUPPETEER_SETTINGS);
            let pages = await browser.pages();
            const discordPage = pages[0];

            log(`--- Loading ---`);
            await discordPage.goto('https://discord.com/channels/904883897224032256/906906150405017611');
            await discordPage.waitForTimeout(15000);

            await connectDiscord(browser);
            await discordPage.waitForTimeout(15000);

            // *******************
            // SEND COMMAND
            // *******************
            await discordPage.waitForSelector('[data-can-focus="true"]');
            await discordPage.click('[data-can-focus="true"]')
            await discordPage.type('[data-can-focus="true"]', [DCOMMAND, DEBUG ? ESC : ENTER]);
            await discordPage.type('[data-can-focus="true"]', [ENTER]);
            log(`--- Command sent ---`);

            // Close out
            await sleep(30000);
            await browser.close();
            log(`------ END -----`);
            break;
        } catch (e) {
            await browser.close();
            log(`ERROR: ${e}\n`)
        }
    }

})();
