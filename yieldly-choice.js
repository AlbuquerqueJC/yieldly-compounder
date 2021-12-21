const puppeteer = require("puppeteer");
const readline = require("readline");
const settings = require("./settings");
const axios = require('axios');

////////////////////////////////////////////
//                                        //
//  YIELDLY - 1/2 GEMS and 1/2 YLDY/ALGO  //
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
    await yieldlyPage.waitForTimeout(20000);

    const [claimBtn] = await yieldlyPage.$x("//button[text() = 'Claim']");
    await claimBtn.click();

    await yieldlyPage.waitForTimeout(10000);
    const claimAmounts = await yieldlyPage.$$eval('.MuiFormControl-root input[type=text]', inputs => inputs.map((input) => parseFloat(input.value.replace(',', ''))))

    if (claimAmounts[0] == 0) {
        log(`--- Nothing to claim ---`);
        return claimAmounts;
    }

    // Check if YLDY rewards under 164 (about 4 days worth with 87k YLDY), do not claim.
    if (id === 233725850 && claimAmounts[0] < 44) {
        log(`Claim Yieldly Amount too low: ${claimAmounts[0]} YLDY less than 164`);
        return claimAmounts;
    }

    // Check if YLDY-CHOICE rewards under 1, do not claim.
    if (id === 447336112 && claimAmounts[0] < 1) {
        log(`Claim CHOICE Amount too low: ${claimAmounts[0]} CHOICE less than 1`);
        return claimAmounts;
    }

    // Check if XET-XET rewards under 1, do not claim.
    if (id === 470390215 && claimAmounts[0] < 1) {
        log(`Claim XET Amount too low: ${claimAmounts[0]} XET less than 1`);
        return claimAmounts;
    }

    // Check if SMILE-SMILE rewards under 50, do not claim.
    if (id === 373819681 && claimAmounts[0] < 49) {
        log(`Claim Smiles Amount too low: ${claimAmounts[0]} SMILE less than 49`);
        return claimAmounts;
    }

    // Check if GEMS-GEMS rewards under 1, do not claim.
    if (id === 419301793 && claimAmounts[0] < 1) {
        log(`Claim Gems Amount too low: ${claimAmounts[0]} GEMS less than 1`);
        return claimAmounts;
    }

    // id=464365150 CHOICE-CHOICE Check if rewards under 1, do not claim.
    if (id === 464365150 && claimAmounts[0] < 1) {
        log(`Claim CHOICE Amount too low: ${claimAmounts[0]} CHOICE less than 1`);
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
        log(`--- Nothing to stake ---`);
        return stakedYLDY;
    }

    // Check if YLDY balance under 10, do not stake.
    if (id === 233725850 && stakedYLDY < 10) {
        log(`Stake Yieldly amount too low: ${stakedYLDY} YLDY less than 10`);
        return stakedYLDY;
    }

    // Check if GEMS-GEMS balance under 1, do not stake.
    if (id === 419301793 && stakedYLDY < 1) {
        log(`Stake Gems amount too low: ${stakedYLDY} GEMS less than 1`);
        return stakedYLDY;
    }

    // Check if XET-XET rewards under 2, do not stake.
    if (id === 470390215 && stakedYLDY < 1) {
        log(`Stake XET Amount too low: ${stakedYLDY} XET less than 1`);
        return stakedYLDY;
    }

    // id=464365150 CHOICE-CHOICE Check if rewards under 1, do not stake.
    if (id === 464365150 && stakedYLDY < 1) {
        log(`Stake CHOICE Amount too low: ${stakedYLDY} CHOICE less than 1`);
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
            log(`YIELDLY - 1/2 CHOICE - 1/2 YLDY/ALGO Claim and Stake${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            browser = await puppeteer.launch(PUPPETEER_SETTINGS);
            let pages = await browser.pages();
            const yieldlyPage = pages[0];

            await yieldlyPage.goto('https://app.yieldly.finance/pools');
            log(`--- Initializing ---`);
            await yieldlyPage.waitForTimeout(20000);

            await connectAlgoWallet(browser);
            log(`--- Connecting Wallet ---`);
            await yieldlyPage.waitForTimeout(5000);

            // *******************
            // CLAIM POOL REWARDS
            // *******************
            log(`--- CLAIMING ---`);
            // POOL IDs
            // id=373819681 SMILE-SMILE Tokens
            const claimedSmileSmilePoolRewards = await claimPoolRewards(browser, 373819681);
            log(`Claimed SMILE-SMILE Pool Assets: ${claimedSmileSmilePoolRewards[0]} SMILE`)

            // id=419301793 GEMS-GEMS
            const claimedGemsGemsPoolRewards = await claimPoolRewards(browser, 419301793);
            log(`Claimed GEMS-GEMS Pool Assets: ${claimedGemsGemsPoolRewards[0]} GEMS`)

            // id=470390215 XET-XET Tokens
            const claimedXETXETPoolRewards = await claimPoolRewards(browser, 470390215);
            log(`Claimed XET-XET Pool Assets: ${claimedXETXETPoolRewards[0]} XET`)

            // id=464365150 CHOICE-CHOICE
            const claimedCHOICECHOICEPoolRewards = await claimPoolRewards(browser, 464365150);
            log(`Claimed CHOICE-CHOICE Pool Assets: ${claimedCHOICECHOICEPoolRewards[0]} CHOICE`)

            // id=447336112 YLDY-CHOICE
            const claimedCHOICEPoolRewards = await claimPoolRewards(browser, 447336112);
            log(`Claimed YLDY-CHOICE Pool Assets: ${claimedCHOICEPoolRewards[0]} CHOICE`)

            // id=233725850 YLDY-YLDY/ALGO
            const claimedPoolRewards = await claimPoolRewards(browser, 233725850);
            log(`Claimed YLDY-ALGO Pool Assets: ${claimedPoolRewards[0]} | ${claimedPoolRewards[1]} ALGO-YLDY`)

            // *******************************
            // STAKE - EVERY YLDY FROM WALLET
            // *******************************
            log(`--- STAKING ---`);
            // POOL IDs
            // id=233725850 YLDY-YLDY/ALGO
            const stakedAmount = await stakeYLDY(browser, 233725850, 50);
            log(`Staked amount in Yieldly/Algo: ${stakedAmount} YLDY`);

            // id=447336112 YLDY-CHOICE
            const stakedInCHOICEAmount = await stakeYLDY(browser, 447336112);
            log(`Staked amount in YLDY-CHOICE: ${stakedInCHOICEAmount} YLDY`);

            // id=464365150 CHOICE-CHOICE
            const stakedInCHOICECHOICEAmount = await stakeYLDY(browser, 464365150);
            log(`Staked amount in CHOICE-CHOICE: ${stakedInCHOICECHOICEAmount} CHOICE`);

            // id=373819681 SMILE-SMILE Tokens
            const stakedSmileInSmileAmount = await stakeYLDY(browser, 373819681);
            log(`Staked Smile amount in Smile: ${stakedSmileInSmileAmount} SMILE`);

            // id=419301793 GEMS-GEMS Tokens
            const stakedGemsInGemsAmount = await stakeYLDY(browser, 419301793);
            log(`Staked GEMS-GEMS amount: ${stakedGemsInGemsAmount} GEMS`);

            // id=470390215 XET-XET Tokens
            const stakedInXETInXETAmount = await stakeYLDY(browser, 470390215);
            log(`Staked amount in XET-XET: ${stakedInXETInXETAmount} XET`);

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
