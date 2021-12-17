const puppeteer = require("puppeteer");
const readline = require("readline");
const settings = require("./settings");
const axios = require('axios');

////////////////////////////////////////////
//                                        //
//  OPUL - YIELDY and OPUL Pools only,    //
//  PLEASE CHECK settings.js              //
//                                        //
////////////////////////////////////////////

const MYALGO_PASSWORD = settings.password;
const DEBUG = settings.debug;
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


// CONNECTS MY ALGO WALLET
const connectAlgoWallet = async browser => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.waitForTimeout(5000);

    // Quick check if wallet is already connected
    const walletAlreadyConnected = await yieldlyPage.evaluate(() => !!document.querySelector('header button.MuiButton-contained')) // !! converts anything to boolean
    if(walletAlreadyConnected) return;

    const [connectBtn] = await yieldlyPage.$x("//button[contains(., 'Connect Wallet')]");
    await connectBtn.click();

    await yieldlyPage.waitForTimeout(5000);

    const [walletBtn] = await yieldlyPage.$x("//button[contains(., 'My ALGO Wallet')]");
    await walletBtn.click();

    await myAlgoOpened();

    pages = await browser.pages();
    let myAlgoPage = pages.find(page => page.url().indexOf("wallet.myalgo.com") > -1)

    await myAlgoPage.waitForSelector('input.input-password');

    await myAlgoPage.type('input.input-password', [MYALGO_PASSWORD, ENTER]);
    try {
        await myAlgoPage.waitForSelector('.title-preview');
        await myAlgoPage.click('.title-preview')
        await myAlgoPage.click('.custom-btn')
    } catch (e) { }
}


// CLAIM STAKING POOL REWARDS
const claimPoolRewards = async (browser, id=348079765) => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);
    log(`--- Loading ---`);
    await yieldlyPage.waitForTimeout(20000);

    const [claimBtn] = await yieldlyPage.$x("//button[text() = 'Claim']");
    await claimBtn.click();

    await yieldlyPage.waitForTimeout(10000);
    const claimAmounts = await yieldlyPage.$$eval('.MuiFormControl-root input[type=text]', inputs => inputs.map((input) => parseFloat(input.value.replace(',', ''))))

    if (claimAmounts[0] == 0 && claimAmounts[1] == 0) {
        log(`--- Nothing to claim ---`);
        return claimAmounts;
    }

    await yieldlyPage.waitForTimeout(2000);

    const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
    await nextBtn.click();

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    return [Math.min(...claimAmounts), Math.max(...claimAmounts)]
}


// STAKE AVAILABLE BALANCE
const stakeYLDY = async (browser, id=348079765, amount=100) => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);
    log(`--- Loading ---`);
    await yieldlyPage.waitForTimeout(20000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Stake').click();
    });

    await yieldlyPage.waitForTimeout(5000);

    if (amount === 50) {
        await yieldlyPage.evaluate(() => {
            [...document.querySelectorAll('button')].find(element => element.textContent === '50%').click();
        });
    }
    else if (amount === 75) {
        await yieldlyPage.evaluate(() => {
            [...document.querySelectorAll('button')].find(element => element.textContent === '75%').click();
        });
    }
    else {
        await yieldlyPage.evaluate(() => {
            [...document.querySelectorAll('button')].find(element => element.textContent === '100%').click();
        });
    }

    await yieldlyPage.waitForTimeout(5000);

    const [stakedYLDY] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedYLDY == 0) {
        log(`--- Stake amount too low ---`);
        return stakedYLDY;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    return stakedYLDY
}


// UN-STAKE AVAILABLE BALANCE
const unStakeYLDY = async (browser, id=348079765) => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);
    log(`--- Loading ---`);
    await yieldlyPage.waitForTimeout(20000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Withdraw').click();
    });

    await yieldlyPage.waitForTimeout(5000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === '100%').click();
    });

    await yieldlyPage.waitForTimeout(5000);

    const [stakedYLDY] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedYLDY == 0) {
        log(`--- Nothing to unstake ---`);
        return stakedYLDY;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    return stakedYLDY
}

// SIGNS TRANSACTIONS
const signAlgoTransactions = async () => {
    const pages = await browser.pages();
    const myAlgoPage = pages.find(page => page.url().indexOf("wallet.myalgo.com") > -1)
    await myAlgoPage.waitForSelector('.custom-btn');
    await myAlgoPage.click('.custom-btn')
    await myAlgoPage.type('input.input-password', [MYALGO_PASSWORD, DEBUG ? ESC : ENTER]);
}

// WAITS FOR MYALGO OPENED, TIMEOUT IS 30 SECONDS (60*500)
const myAlgoOpened = async () => {
    for (let i = 0; i < 60; i++) {
        let pages = await browser.pages();
        let myAlgoPage = pages.find(page => page.url().indexOf("wallet.myalgo.com") > -1)
        if (myAlgoPage != undefined) return;
        await sleep(1000)
    }
    throw "MyAlgoWallet not opened. Check your connection"
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
            log(`YIELDLY-OPUL POOL Claim and Stake${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            browser = await puppeteer.launch(PUPPETEER_SETTINGS);
            let pages = await browser.pages();
            const yieldlyPage = pages[0];

            await yieldlyPage.goto('https://app.yieldly.finance/pools?id=348079765');
            log(`--- Initializing ---`);
            await yieldlyPage.waitForTimeout(20000);

            await connectAlgoWallet(browser);
            log(`--- Connecting Wallet ---`);
            await yieldlyPage.waitForTimeout(5000);

            // *******************************
            // STAKE - EVERY YLDY FROM WALLET
            // *******************************
            // id=348079765 YLDY-OPUL
            log(`--- Staking ---`);
            const stakedInOpulAmount = await stakeYLDY(browser, 348079765);
            log(`Staked Amount in YLDY-OPUL: ${stakedInOpulAmount} YLDY`);

            // *******************
            // CLAIM POOL REWARDS
            // *******************
            // id=348079765 YLDY-OPUL
            log(`--- Claiming ---`);
            const claimedOpulPoolRewards = await claimPoolRewards(browser, 348079765);
            log(`Claimed YLDY-OPUL Assets: ${claimedOpulPoolRewards[0]} OPUL`)

            // Close out
            await sleep(70000);
            await browser.close();
            log(`------ END -----`);
            break;
        } catch (e) {
            await browser.close();
            log(`ERROR: ${e}\n`)
        }
    }

})();
