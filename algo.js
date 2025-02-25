const puppeteer = require("puppeteer");
const readline = require("readline");
const settings = require("./settings");
const axios = require('axios');

////////////////////////////////////////////
//                                        //
//  ALGO - NLL ONLY SCRIPT                //
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
    userDataDir: "./user_data_algo"
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

    await yieldlyPage.waitForTimeout(5000);

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

// CLAIM NLL REWARDS
const claimNLLRewards = async browser => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    const [claimBtn] = await yieldlyPage.$x("//button[text() = 'Claim']");
    await claimBtn.click();

    await yieldlyPage.waitForTimeout(2000);

    const [claimAmountYLDY] = await yieldlyPage.$$eval('input', inputs => inputs.map((input) => parseFloat(input.value)))
    if (claimAmountYLDY == 0) {
        // await browser.close();
        return claimAmountYLDY;
    }

    await yieldlyPage.waitForTimeout(2000);

    const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
    await nextBtn.click();

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    // await browser.close();
    return claimAmountYLDY
}

// STAKE HALF ALGO BALANCE
const stakeALGO = async browser => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Stake').click();
    });

    await yieldlyPage.waitForTimeout(2000);

    // ONLY STAKE 50% OF THE TOTAL BALANCE
    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === '50%').click();
    });

    await yieldlyPage.waitForTimeout(2000);

    const [stakedALGO] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedALGO == 0) {
        // await browser.close();
        return stakedALGO;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    // await browser.close();
    return stakedALGO
}

// UN-STAKE AVAILABLE BALANCE
const unStakeALGO = async (browser) => {
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');
    log(`--- Loading ---`);
    await yieldlyPage.waitForTimeout(15000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Withdraw').click();
    });

    await yieldlyPage.waitForTimeout(2000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === '100%').click();
    });

    await yieldlyPage.waitForTimeout(2000);

    const [stakedALGO] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedALGO == 0) {
        log(`--- Nothing to unstake ---`);
        return stakedALGO;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(60000);

    return stakedALGO
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
            log(`YIELDLY-ALGO NLL AUTO COMPOUNDER v1.1.4${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            browser = await puppeteer.launch(PUPPETEER_SETTINGS);
            let pages = await browser.pages();
            const yieldlyPage = pages[0];

            await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');
            log(`--- Initializing ---`);
            await yieldlyPage.waitForTimeout(15000);

            await connectAlgoWallet(browser);
            log(`--- Connecting Wallet ---`);
            await yieldlyPage.waitForTimeout(5000);

            // ******************
            // CLAIM NLL REWARDS
            // ******************
            log(`--- Claiming ---`);
            const claimedNLLRewards = await claimNLLRewards(browser);
            log(`Claimed NLL Assets: ${claimedNLLRewards} YLDY`)

            // *****************************
            // STAKE - HALF ALGO FROM WALLET
            // *****************************
            await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');
            log(`--- Loading ---`);
            await yieldlyPage.waitForTimeout(20000);

            log(`--- Staking ---`);
            const stakedAmount = await stakeALGO(browser);
            log(`Staked Amount in NLL: ${stakedAmount} ALGO`);

            // ***************************************
            // AWAIT SLEEP UNTIL REMOVE ALGO FROM NLL
            // ***************************************
            // 10 minutes in MS = 600000
            // 15 minutes in MS = 900000
            // 20 minutes in MS = 1200000
            log(`--- Sleeping 20mins ---`);
            await sleep(1200000);

            // ********************************
            // UN-STAKE - EVERY ALGO IN WALLET
            // ********************************
            await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');
            log(`--- Loading ---`);
            await yieldlyPage.waitForTimeout(15000);

            log(`--- Unstaking ---`);
            const unStakedAmount = await unStakeALGO(browser);
            log(`Un-Staked Amount in NLL: ${unStakedAmount} ALGO`);

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