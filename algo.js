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


// CLAIM NLL REWARDS
const claimNLLRewards = async () => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(5000);

    const [claimBtn] = await yieldlyPage.$x("//button[text() = 'Claim']");
    await claimBtn.click();

    await yieldlyPage.waitForTimeout(2000);

    const [claimAmountYLDY] = await yieldlyPage.$$eval('input', inputs => inputs.map((input) => parseFloat(input.value)))
    if (claimAmountYLDY == 0) {
        await browser.close();
        return claimAmountYLDY;
    }

    await yieldlyPage.waitForTimeout(2000);

    const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
    await nextBtn.click();

    await myAlgoOpened();


    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(30000);

    await browser.close();
    return claimAmountYLDY
}

// STAKE HALF ALGO BALANCE
const stakeALGO = async () => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();

    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(5000);

    const [stakeBtn] = await yieldlyPage.$x("//button[text() = 'Stake']");
    await stakeBtn.click();

    await yieldlyPage.waitForTimeout(2000);

    // ONLY STAKE 50% OF THE TOTAL BALANCE
    const [fiftyBtn] = await yieldlyPage.$x("//button[text() = '50%']");
    await fiftyBtn.click();

    await yieldlyPage.waitForTimeout(2000);

    const [stakedALGO] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedALGO == 0) {
        await browser.close();
        return stakedALGO;
    }

    const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
    await nextBtn.click();

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(30000);

    await browser.close();
    return stakedALGO
}


// UN-STAKE AVAILABLE BALANCE
const unStakeALGO = async () => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();

    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(5000);

    const [withdrawBtn] = await yieldlyPage.$x("//button[text() = 'Withdraw']");
    await withdrawBtn.click();

    await yieldlyPage.waitForTimeout(2000);

    const [hundredBtn] = await yieldlyPage.$x("//button[text() = '100%']");
    await hundredBtn.click();

    await yieldlyPage.waitForTimeout(2000);

    const [stakedALGO] = await yieldlyPage.$$eval('input[type=number]', inputs => inputs.map((input) => parseFloat(input.value)))
    if (stakedALGO == 0) {
        await browser.close();
        return stakedALGO;
    }

    const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
    await nextBtn.click();

    await myAlgoOpened();

    await signAlgoTransactions();

    await yieldlyPage.waitForTimeout(30000);

    await browser.close();
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
    for (let i = 0; i < 1; i++) { // TRY TO RUN THE SCRIPT 10 TIMES TO BYPASS POSSIBLE NETWORK ERRORS
        try {
            log(`------ START -----`);
            log(`YIELDLY-ALGO NLL AUTO COMPOUNDER v1.1.4${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            // CHECK IF MYALGO WALLET IS CREATED
            await checkAlgoWallet();

            // ******************
            // CLAIM NLL REWARDS
            // ******************
            const claimedNLLRewards = await claimNLLRewards();
            log(`Claimed NLL Assets: ${claimedNLLRewards} YLDY`)

            // *****************************
            // STAKE - HALF ALGO FROM WALLET
            // *****************************
            const stakedAmount = await stakeALGO();
            log(`Staked Amount in NLL: ${stakedAmount} ALGO`);

            // ***************************************
            // AWAIT SLEEP UNTIL REMOVE ALGO FROM NLL
            // ***************************************
            // 15 minutes in MS = 900000
            // 30 minutes in MS = 1800000
            // 45 minutes in MS = 2700000
            await sleep(2700000);

            // ********************************
            // UN-STAKE - EVERY ALGO IN WALLET
            // ********************************
            const unStakedAmount = await unStakeALGO();
            log(`Un-Staked Amount in NLL: ${unStakedAmount} ALGO`);

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