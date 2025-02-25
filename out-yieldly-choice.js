const puppeteer = require("puppeteer");
const readline = require("readline");
const settings = require("./settings");
const axios = require('axios');

////////////////////////////////////////////
//                                        //
//  YIELDLY - 1/2 CHOICE & 1/2 YLDY/ALGO  //
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


// CHECK IF MYALGO ACCOUNT IS CREATED
const checkAlgoWallet = async () => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    const page = (await browser.pages())[0];
    await page.goto('https://wallet.myalgo.com/');
    await page.waitForSelector('input.input-password, div.home-image-1');

    // CHECKS IF THERE'S AN <input> IN PAGE, INDICATING A WALLET HAS BEEN STORED LOCALLY
    const walletCreated = await page.evaluate(() => !!document.querySelector('input.input-password')) // !! converts anything to boolean
    if (!walletCreated) {

        // WAIT FOR USER INPUT ON THE TERMINAL AFTER THE LOGIN IS DONE
        await terminalPrompt("No wallet data, please create a wallet and press ENTER");
        await browser.close();
        process.exit();
    }
    await browser.close();
}


// CONNECTS MY ALGO WALLET
const connectAlgoWallet = async browser => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.waitForTimeout(15000);

    // Quick check if wallet is already connected
    const walletAlreadyConnected = await yieldlyPage.evaluate(() => !!document.querySelector('header button.MuiButton-contained')) // !! converts anything to boolean
    if(walletAlreadyConnected) return;

    const [connectBtn] = await yieldlyPage.$x("//button[contains(., 'Connect Wallet')]");
    await connectBtn.click();

    await yieldlyPage.waitForTimeout(1000);
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
const claimPoolRewards = async (browser, id=233725850) => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);
    if (DEBUG) { log(`--- Loading pool id:${id} ---`); }
    await yieldlyPage.waitForTimeout(15000);

    const [claimBtn] = await yieldlyPage.$x("//button[text() = 'Claim']");
    await claimBtn.click();

    await yieldlyPage.waitForTimeout(10000);
    const claimAmounts = await yieldlyPage.$$eval('input[type=text]', inputs => inputs.map((input) => parseFloat(input.value)))
    claimAmounts.shift();

    if (claimAmounts[0] === 0 || claimAmounts[0] < 1 || !claimAmounts) {
        log(`--- Nothing to claim ---`);
        return claimAmounts;
    }

    // Check if YLDY rewards under 164 (about 4 days worth with 87k YLDY), do not claim.
    if (id === 233725850 && claimAmounts[0] < 164) {
        log(`Claim Yieldly Amount too low: ${claimAmounts[0]} YLDY less than 164`);
        return claimAmounts;
    }

    // Check if XET rewards under 4, do not claim.
    if (id === 424101057 && claimAmounts[0] < 4) {
        log(`Claim XET Amount too low: ${claimAmounts[0]} XET less than 4`);
        return claimAmounts;
    }

    // Check if SMILE-SMILE rewards under 50, do not claim.
    if (id === 373819681 && claimAmounts[0] < 49) {
        log(`Claim Smiles Amount too low: ${claimAmounts[0]} SMILE less than 50`);
        return claimAmounts;
    }

    // Check if GEMS-GEMS rewards under 1, do not claim.
    if (id === 419301793 && claimAmounts[0] < 1) {
        log(`Claim GEMS Amount too low: ${claimAmounts[0]} GEMS less than 1`);
        return claimAmounts;
    }

    await yieldlyPage.waitForTimeout(5000);

    const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
    await nextBtn.click();

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    return [Math.min(...claimAmounts), Math.max(...claimAmounts)]
}


// STAKE AVAILABLE BALANCE
const stakeYLDY = async (browser, id=233725850, amount=100) => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);
    if (DEBUG) { log(`--- Loading pool id:${id} ---`); }
    await yieldlyPage.waitForTimeout(15000);

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

    const stakedYLDY = await yieldlyPage.$$eval('.MuiInputBase-input', inputs => inputs.map((input) => parseFloat(input.value)))
    const staked = stakedYLDY.slice(-1);

    if (staked === 0 || staked < 1 || !staked) {
        log(`--- Nothing to stake ---`);
        return staked;
    }

    // Check if YLDY balance under 1, do not stake.
    if (id === 233725850 && staked < 10) {
        log(`Stake Yieldly amount too low: ${staked} YLDY less than 10`);
        return staked;
    }

    // Check if GEMS-GEMS balance under 1, do not stake.
    if (id === 419301793 && staked < 1) {
        log(`Stake Gems amount too low: ${staked} GEMS less than 1`);
        return staked;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    return staked
}


// UN-STAKE AVAILABLE BALANCE
const unStakeYLDY = async (browser, id=233725850) => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);
    if (DEBUG) { log(`--- Loading pool id:${id} ---`); }
    await yieldlyPage.waitForTimeout(20000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Withdraw').click();
    });

    await yieldlyPage.waitForTimeout(5000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === '100%').click();
    });

    await yieldlyPage.waitForTimeout(5000);

    const stakedYLDY = await yieldlyPage.$$eval('.MuiInputBase-input', inputs => inputs.map((input) => parseFloat(input.value)))
    const staked = stakedYLDY.slice(-1);

    if (staked === 0 || staked < 1 || !staked) {
        log(`--- Nothing to unstake ---`);
        return staked;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    return staked
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
            log(`YIELDLY - 1/2 CHOICE - 1/2 YLDY/ALGO Unstake${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            browser = await puppeteer.launch(PUPPETEER_SETTINGS);
            let pages = await browser.pages();
            const yieldlyPage = pages[0];

            await yieldlyPage.goto('https://app.yieldly.finance/pools');
            log(`--- Initializing ---`);
            await yieldlyPage.waitForTimeout(20000);

            await connectAlgoWallet(browser);
            log(`--- Connecting Wallet ---`);
            await yieldlyPage.waitForTimeout(5000);

            // ********************************
            // UN-STAKE - EVERY YLDY IN WALLET
            // ********************************
            // POOL IDs
            log(`--- UNSTAKING ---`);
            // id=447336112 YLDY-CHOICE
            const unStakedInCHOICEAmount = await unStakeYLDY(browser, 447336112);
            log(`Un-Staked amount in YLDY-CHOICE: ${unStakedInCHOICEAmount} YLDY`);

            // id=233725850 YLDY-YLDY/ALGO
            const unStakedAmount = await unStakeYLDY(browser, 233725850);
            log(`Un-Staked amount in YLDY-ALGO: ${unStakedAmount} YLDY`);

            // *****************************************
            // AWAIT SLEEP UNTIL BALANCE IS AVAILABLE
            // *****************************************
            // 5 minutes in MS = 300,000 300000
            // 15 minutes in MS = 900,000 900000
            log(`--- Sleeping 70secs ---`);
            await sleep(70000);

            // ******************************************
            // STAKE - EVERY YLDY FROM WALLET INTO AKITA
            // ******************************************
            // id=511597182 YLDY-AKITA
            log(`--- STAKING ---`);
            const stakedInAKITAAmount = await stakeYLDY(browser, 511597182);
            log(`Staked amount in YLDY-AKITA: ${stakedInAKITAAmount} YLDY`);

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
