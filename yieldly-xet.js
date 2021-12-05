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
// Windows - WSL Attempt
// const PUPPETEER_SETTINGS = {
//     headless: settings.headless,
//     executablePath: '/mnt/c/Program Files/Chromium/chrome.exe',
//     arg: ['--single-process', '--no-zygote', '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
//     userDataDir: "user_data",
// };
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


// CLAIM STAKING POOL REWARDS
const claimPoolRewards = async (id=233725850) => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(1000);

    const [claimBtn] = await yieldlyPage.$x("//button[text() = 'Claim']");
    await claimBtn.click();

    await yieldlyPage.waitForTimeout(10000);
    const claimAmounts = await yieldlyPage.$$eval('.MuiFormControl-root input[type=text]', inputs => inputs.map((input) => parseFloat(input.value.replace(',', ''))))

    if (claimAmounts[0] == 0 && claimAmounts[1] == 0) {
        await browser.close();
        return claimAmounts;
    }

    // Check if YLDY rewards under 375 (about 4 days worth with 81k YLDY), do not claim.
    if (id === 233725850 && claimAmounts[0] < 374) {
        log(`Claim Yieldly Amount too low: ${claimAmounts[0]} YLDY less than 375`);
        await browser.close();
        return claimAmounts;
    }

    // Check if SMILE-SMILE rewards under 50, do not claim.
    if (id === 373819681 && claimAmounts[0] < 49) {
        log(`Claim Smiles Amount too low: ${claimAmounts[0]} SMILE less than 50`);
        await browser.close();
        return claimAmounts;
    }

    // Check if GEMS-GEMS rewards under 1, do not claim.
    if (id === 419301793 && claimAmounts[0] < 1) {
        log(`Claim Gems Amount too low: ${claimAmounts[0]} GEMS less than 1`);
        await browser.close();
        return claimAmounts;
    }

    await yieldlyPage.waitForTimeout(2000);

    const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
    await nextBtn.click();

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(30000);

    await browser.close();
    return [Math.min(...claimAmounts), Math.max(...claimAmounts)]
}


// STAKE AVAILABLE BALANCE
const stakeYLDY = async (id=233725850, amount=100) => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();

    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(5000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Stake').click();
    });

    await yieldlyPage.waitForTimeout(2000);

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

    await yieldlyPage.waitForTimeout(2000);

    const [stakedYLDY] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedYLDY == 0) {
        await browser.close();
        return stakedYLDY;
    }

    // Check if YLDY balance under 1, do not stake.
    if (id === 233725850 && stakedYLDY < 10) {
        log(`Stake Yieldly amount too low: ${stakedYLDY} YLDY less than 10`);
        await browser.close();
        return stakedYLDY;
    }

    // Check if GEMS-GEMS balance under 1, do not stake.
    if (id === 419301793 && stakedYLDY < 1) {
        log(`Stake Gems amount too low: ${stakedYLDY} GEMS less than 1`);
        await browser.close();
        return stakedYLDY;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(30000);

    await browser.close();
    return stakedYLDY
}


// UN-STAKE AVAILABLE BALANCE
const unStakeYLDY = async (id=233725850) => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();

    const yieldlyPage = pages[0];

    await yieldlyPage.goto(`https://app.yieldly.finance/pools?id=${id}`);

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(5000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Withdraw').click();
    });

    await yieldlyPage.waitForTimeout(2000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === '100%').click();
    });

    await yieldlyPage.waitForTimeout(2000);

    const [stakedYLDY] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedYLDY == 0) {
        await browser.close();
        return stakedYLDY;
    }

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Next').click();
    });

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(30000);

    await browser.close();
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
        await sleep(500)
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
    for (let i = 0; i < 5; i++) { // TRY TO RUN THE SCRIPT 10 TIMES TO BYPASS POSSIBLE NETWORK ERRORS
        try {
            log(`YIELDLY - 1/2 XET - 1/2 YLDY/ALGO AUTO COMPOUNDER v1.1.4${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            // CHECK IF MYALGO WALLET IS CREATED
            await checkAlgoWallet();

            // *******************
            // CLAIM POOL REWARDS
            // *******************
            // POOL IDs
            // id=393388133 YLDY-XET
            const claimedXETPoolRewards = await claimPoolRewards(424101057);
            log(`Claimed XET Pool Assets: ${claimedXETPoolRewards[0]} XET`)

            // id=419301793 GEMS-GEMS
            const claimedGemsGemsPoolRewards = await claimPoolRewards(419301793);
            log(`Claimed GEMS-GEMS Pool Assets: ${claimedGemsGemsPoolRewards[0]} GEMS`)

            // id=373819681 SMILE-SMILE Tokens
            const claimedSmileSmilePoolRewards = await claimPoolRewards(373819681);
            log(`Claimed SMILE-SMILE Pool Assets: ${claimedSmileSmilePoolRewards[0]} SMILE`)

            // id=233725850 YLDY-YLDY/ALGO
            const claimedPoolRewards = await claimPoolRewards(233725850);
            log(`Claimed YLDY Pool Assets: ${claimedPoolRewards[0]} ALGO | ${claimedPoolRewards[1]} YLDY`)

            // *******************************
            // STAKE - EVERY YLDY FROM WALLET
            // *******************************
            // POOL IDs
            // id=233725850 YLDY-YLDY/ALGO
            const stakedAmount = await stakeYLDY(233725850, 50);
            log(`Staked amount in Yieldly/Algo: ${stakedAmount} YLDY`);

            // id=393388133 YLDY-XET
            const stakedInXETAmount = await stakeYLDY(424101057);
            log(`Staked amount in XET: ${stakedInXETAmount} YLDY`);

            // id=419301793 GEMS-GEMS Tokens
            const stakedGemsInGemsAmount = await stakeYLDY(419301793);
            log(`Staked Gems amount in Gems: ${stakedGemsInGemsAmount} GEMS`);

            // id=373819681 SMILE-SMILE Tokens
            const stakedSmileInSmileAmount = await stakeYLDY(373819681, 75);
            log(`Staked Smile amount in Smile: ${stakedSmileInSmileAmount} SMILE`);

            // *****************************************
            // AWAIT SLEEP UNTIL REMOVE YLDY FROM POOL
            // *****************************************
            // 20 minutes in MS = 1,200,000 1200000
            // 25 minutes in MS = 1,500,000 1500000
            // 30 minutes in MS = 1,800,000 1800000
            // 45 minutes in MS = 2,700,000 2700000
            // 1h in MS = 3,600,000 3600000
            await sleep(1800000);

            // ********************************
            // UN-STAKE - EVERY YLDY IN WALLET
            // ********************************
            // POOL IDs
            // id=373819681 SMILE-SMILE Tokens
            const unStakedInSmileAmount = await unStakeYLDY(373819681);
            log(`Un-Staked Smile amount in Smile: ${unStakedInSmileAmount} SMILE`);

            // id=233725850 YLDY-YLDY/ALGO
            const unStakedAmount = await unStakeYLDY(233725850);
            log(`Un-Staked amount in Yieldly/Algo: ${unStakedAmount} YLDY`);

            // id=393388133 YLDY-XET
            const unStakedInXETAmount = await unStakeYLDY(424101057);
            log(`Un-Staked amount in XET: ${unStakedInXETAmount} YLDY`);


            // *****************************************
            // AWAIT SLEEP UNTIL BALANCE IS AVAILABLE
            // *****************************************
            // 5 minutes in MS = 300,000 300000
            // 15 minutes in MS = 900,000 900000
            await sleep(600000);

            // *****************************************
            // STAKE - EVERY YLDY FROM WALLET INTO OPUL
            // *****************************************
            // id=348079765 YLDY-OPUL
            const stakedInOpulAmount = await stakeYLDY(348079765);
            log(`Staked amount in Opul: ${stakedInOpulAmount} YLDY`);

            // Close out
            await sleep(60000);
            log(`------ END -----`);

            break;
        } catch (e) {
            // await browser.close();
            log(`ERROR: ${e}\n`)
        }
    }

})();
