const puppeteer = require("puppeteer");
const readline = require("readline");
const settings = require("./settings");
const axios = require('axios');

////////////////////////////////////////////
//                                        //
//  NO NEED TO EDIT THIS SCRIPT ANYMORE,  //
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

// CLAIM STAKING POOL REWARDS
const claimPoolRewards = async (id) => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();
    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/pools?id=' + id);

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
const stakeYLDY = async (id) => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();

    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/pools?id=' + id);

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(5000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Stake').click();
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

// STAKE HALF ALGO BALANCE
const stakeALGO = async () => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();

    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/algo-prize-game');

    await connectAlgoWallet(browser);

    await yieldlyPage.waitForTimeout(5000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === 'Get Tickets').click();
    });

    await yieldlyPage.waitForTimeout(2000);

    await yieldlyPage.evaluate(() => {
        [...document.querySelectorAll('button')].find(element => element.textContent === '50%').click();
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


// NFT GAME SUBSCRIPTION
// let newNFTsSubscribed = 0;
// const subscribeToNFTs = async () => {
//     browser = await puppeteer.launch(PUPPETEER_SETTINGS);
//     let pages = await browser.pages();
//
//     const yieldlyPage = pages[0];
//
//     await yieldlyPage.goto('https://app.yieldly.finance/nft');
//
//     await connectAlgoWallet(browser);
//
//     // Wait for "Get Tickets" buttons to disappear if user is already subscribed to the respective NFT
//     await yieldlyPage.waitForTimeout(30000);
//
//
//     const availableNFTS = await yieldlyPage.$$("div.MuiLinearProgress-root");
//     for (let nft of availableNFTS) {
//         await nft.click();
//         await yieldlyPage.waitForTimeout(1000);
//     }
//
//     // We need to limit the number of subscriptions per script execution because the button "Get Tickets"
//     // takes a while to disappear after page load, so we end subscribing to the same NFT multiple times
//     // (yeah, that might happen not sure if winning chances increase though) and burn all our ALGOS in fees.
//     // The script should wait 30 seconds after page load to make sure things are in order, this is just another
//     // safety mechanism :)
//     const MAX_SUBSCRIPTIONS_PER_RUN = 5;
//
//     const [ticketBTN] = await yieldlyPage.$x("//button[contains(., 'Get Tickets')]");
//     if (!ticketBTN || newNFTsSubscribed >= MAX_SUBSCRIPTIONS_PER_RUN) {
//         await browser.close();
//         return;
//     }
//
//     log(`Subscribing to NFT #${newNFTsSubscribed+1}...`)
//
//     ticketBTN.click();
//     await yieldlyPage.waitForTimeout(1000);
//     const [nextBtn] = await yieldlyPage.$x("//button[text() = 'Next']");
//     await nextBtn.click();
//
//     await myAlgoOpened();
//
//     await signAlgoTransactions();
//
//     await yieldlyPage.waitForTimeout(30000);
//     newNFTsSubscribed++;
//
//     await browser.close();
//
//     await subscribeToNFTs();
// }

// UN-STAKE AVAILABLE BALANCE
const unstakeYLDY = async (id) => {
    browser = await puppeteer.launch(PUPPETEER_SETTINGS);
    let pages = await browser.pages();

    const yieldlyPage = pages[0];

    await yieldlyPage.goto('https://app.yieldly.finance/pools?id=' + id);

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
            log(`YIELDLY AUTO COMPOUNDER v1.1.4${DEBUG ? " => [DEBUG] No transactions will be made!" : ""}`)

            // CHECK IF MYALGO WALLET IS CREATED
            await checkAlgoWallet();

            // CLAIM NLL REWARDS
            // const claimedNLLRewards = await claimNLLRewards();
            // log(`Claimed NLL Assets: ${claimedNLLRewards} YLDY`)

            // *****************************
            // STAKE - EVERY YLDY IN WALLET
            // *****************************
            // POOL IDs
            // id=233725850 YLDY-YLDY/ALGO
            // const stakedAmount = await stakeYLDY(233725850);
            // log(`Staked Amount in Yieldly/Algo: ${stakedAmount} YLDY`);
            // id=348079765 YLDY-OPUL
            const stakedInOpulAmount = await stakeYLDY(348079765);
            log(`Staked Amount in Opul: ${stakedInOpulAmount} YLDY`);
            // id=393388133 YLDY-GEMS
            // const stakedInGemsAmount = await stakeYLDY(393388133);
            // log(`Staked Amount in Gems: ${stakedInGemsAmount} YLDY`);

            // Not Yieldly Tokens
            // const stakedGemsInGemsAmount = await stakeYLDY(233725850);
            // log(`Staked Gems Amount in Gems: ${stakedGemsInGemsAmount} GEMS`);

            // *******************
            // CLAIM POOL REWARDS
            // *******************
            // POOL IDs
            // id=233725850 YLDY-YLDY/ALGO
            // const claimedPoolRewards = await claimPoolRewards(233725850);
            // log(`Claimed Pool Assets: ${claimedPoolRewards[0]} ALGO | ${claimedPoolRewards[1]} YLDY`)
            // id=348079765 YLDY-OPUL
            const claimedOpulPoolRewards = await claimPoolRewards(348079765);
            log(`Claimed Pool Assets: ${claimedOpulPoolRewards[0]} ALGO | ${claimedOpulPoolRewards[1]} OPUL`)
            // id=393388133 YLDY-GEMS
            // const claimedGemsPoolRewards = await claimPoolRewards(393388133);
            // log(`Claimed Pool Assets: ${claimedGemsPoolRewards[0]} ALGO | ${claimedGemsPoolRewards[1]} GEMS`)

            // Not Yieldly Tokens
            // id=419301793 GEMS-GEMS
            // const claimedGemsGemsPoolRewards = await claimPoolRewards(419301793);
            // log(`Claimed Pool Assets: ${claimedGemsGemsPoolRewards[0]} ALGO | ${claimedGemsGemsPoolRewards[1]} GEMS`)

            // *****************************************
            // AWAIT SLEEP UNTIL REMOVE YLDY FROM POOL
            // *****************************************
            // 15 minutes in MS = 900000
            await sleep(900);

            // ********************************
            // UN-STAKE - EVERY YLDY IN WALLET
            // ********************************
            // POOL IDs
            // id=233725850 YLDY-YLDY/ALGO
            // const stakedAmount = await stakeYLDY(233725850);
            // log(`Staked Amount in Yieldly/Algo: ${stakedAmount} YLDY`);
            // id=348079765 YLDY-OPUL
            const unstakedInOpulAmount = await unstakeYLDY(348079765);
            log(`Staked Amount in Opul: ${unstakedInOpulAmount} YLDY`);
            // id=393388133 YLDY-GEMS
            // const stakedInGemsAmount = await stakeYLDY(393388133);
            // log(`Staked Amount in Gems: ${stakedInGemsAmount} YLDY`);


            // ENTER NFT GAME - NOT 100% TESTED SO COMMENTED OUT. USE AT YOUR WON RISK
            // await subscribeToNFTs();
            // log(`Number of NFTs Subscribed: ${newNFTsSubscribed}`);

            break;
        } catch (e) {
            // await browser.close();
            log(`ERROR: ${e}\n`)
        }
    }

})();