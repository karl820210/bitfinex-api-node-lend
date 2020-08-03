const apiKey = require("./config/apiKey").apiKey;
const apiSecret = require("./config/apiKey").apiSecret;
const affCode = require("./config/apiKey").affCode;
const BFX = require("bitfinex-api-node");
const {
    FundingOffer
} = require("bfx-api-node-models");
const Table = require("cli-table2");
const History = require("./history").History;
const Rate = require("./history").Rate;
const bfx = new BFX({
    apiKey: apiKey,
    apiSecret: apiSecret,
    ws: {
        autoReconnect: true,
        seqAudit: true,
        packetWDDelay: 10 * 1000
    }
});
const bfxRest2 = bfx.rest(2, {
    affCode: affCode,
    transform: true
});
const bfxRest1 = bfx.rest(1, {
    transform: true
});

const lending_start_date = '2020-04-06';
const offer_minimum = 50;
const offer_currency = 'USD';
const period = [2, 15, 30];
const minDaliyRate = [0.00020, 0.0007, 0.001];
const minYearRate = (minDaliyRate[0] * 365 * 100).toFixed(2);
const max_amount = 100;
let startBookingTime = 0;
let maxBookingTime = 60 * 1000; // ms

const history = new History(bfxRest2, offer_currency);
const offerHistory = {
    date: [],
    amount: [],
    period: [],
    rate: []
};
// Get funding Wallets balance,okay
function get_funding_balance(currency) {
    const currencyUpper = currency.toUpperCase();
    const foundWallet = bfxRest2.wallets().then(wallets => {
        const [wallet] = wallets.filter(
            wallet => wallet.type === "funding" && wallet.currency == currencyUpper
        );
        return wallet;
    });
    return foundWallet.then(foundWallet => foundWallet.balance);
}

// timestampToTime
function timestamp_to_time(timestamp) {
    const date = new Date(timestamp);
    Y = date.getFullYear() + "-";
    M =
        (date.getMonth() + 1 < 10 ?
            "0" + (date.getMonth() + 1) :
            date.getMonth() + 1) + "-";
    D = date.getDate() + " ";
    h = date.getHours() + ":";
    m = date.getMinutes() + ":";
    s = date.getSeconds();
    return Y + M + D + h + m + s;
}

// Check All funding Loans.

function check_target_currency_all_funding_loans(currency) {
    let currencyUpper = currency.toUpperCase();
    const fCurrency = `f${currencyUpper}`;

    return bfxRest2.fundingCredits(fCurrency).then(fundingCredits => {
        if (fundingCredits.length == 0) {
            return 0;
        }
        return fundingCredits.reduce(
            (transformingFundingCredit, fundingCredit) => {
                transformingFundingCredit.mtsCreate.push(
                    timestamp_to_time(fundingCredit.mtsCreate)
                );
                transformingFundingCredit.mtsUpdate.push(
                    timestamp_to_time(fundingCredit.mtsUpdate)
                );
                transformingFundingCredit.amount.push(fundingCredit.amount);
                transformingFundingCredit.symbol.push(fundingCredit.symbol);
                transformingFundingCredit.rate.push(fundingCredit.rate);
                transformingFundingCredit.period.push(fundingCredit.period);
                return transformingFundingCredit;
            }, {
                mtsCreate: [],
                mtsUpdate: [],
                amount: [],
                symbol: [],
                rate: [],
                period: []
            }
        );
    });
}
// Check All funding Loans amount.
function check_target_currency_all_funding_loans_amount(offer_currency) {
    return new Promise(function(resolve, reject) {
        check_target_currency_all_funding_loans(offer_currency).then(r => {
            let amountTotal = 0;
            if (r != 0) {
                for (let i = 0; i < r.amount.length; i++) {
                    amountTotal += r.amount[i];
                }
            }
            resolve(amountTotal);
        });
    });
}

// Check funding Offers
function check_funding_offers(currency) {
    let currencyUpper = currency.toUpperCase();
    const fCurrency = `f${currencyUpper}`;

    return bfxRest2.fundingOffers(fCurrency).then(res => {
        if (res.length == 0) {
            return 0;
        }
        let data = {
            id: [],
            mtsCreate: [],
            mtsUpdate: [],
            amount: [],
            symbol: [],
            rate: [],
            period: []
        };
        for (let i = 0; i < res.length; i++) {
            data.id[i] = res[i].id;
            data.mtsCreate[i] = timestamp_to_time(res[i].mtsCreate);
            data.mtsUpdate[i] = timestamp_to_time(res[i].mtsUpdate);
            data.amount[i] = res[i].amount;
            data.symbol[i] = res[i].symbol;
            data.rate[i] = res[i].rate;
            data.period[i] = res[i].period;
        }
        return data;
    });
}

// Offers amount
function check_funding_offers_amount(offer_currency) {
    return new Promise(function(resolve, reject) {
        check_funding_offers(offer_currency).then(r => {
            let amountTotal = 0;
            if (r != 0) {
                for (let i = 0; i < r.amount.length; i++) {
                    amountTotal += r.amount[i];
                }
                resolve(amountTotal);
            }
            resolve(amountTotal);
        });
    });
}

// Gat available_amount
const get_available_amount = async currency => {
    let funding_balance = await get_funding_balance(currency);

    let funding_loans_amount = await check_target_currency_all_funding_loans_amount(
        currency
    );
    let funding_offers_amount = await check_funding_offers_amount(currency);
    let available_amount =
        funding_balance - funding_loans_amount - funding_offers_amount;
    return available_amount;
};

// Get funding book.
function get_funding_book(currency, limit_asks, limit_bids) {
    const options = {
        limit_asks: limit_asks,
        limit_bids: limit_bids
    };
    return new Promise(function(resolve, reject) {
        bfxRest1.fundingbook(currency, options, (err, res) => {
            if (err) console.log(err);
            resolve(res);
        });
    });
}

// funding credits
function offer_a_funding(currency, amount, rate, period) {
    offerHistory.date.push(new Date().toLocaleString());
    offerHistory.amount.push(amount);
    offerHistory.rate.push(rate);
    offerHistory.period.push(period);
    let offer = new FundingOffer({
        type: "LIMIT",
        symbol: "f" + currency,
        amount: String(amount),
        rate: String(rate),
        period: period,
        flags: 0
    });
    return bfxRest2.submitFundingOffer(offer).then(res => {
        return res;
    });
}

// cancel offers
const cancelOffers = async (currency, minRate) => {
    let offers = await check_funding_offers(offer_currency);
    if (offers != 0) {
        for (let i = 0; i < offers.id.length; i++) {
            if (offers.rate[i] > minRate) {
                await bfxRest2.cancelFundingOffer(offers.id[i]);
            }
        }
    }
}

// check_price
function check_price(currency) {
    if (currency === "USD")
        return Promise.resolve({
            last_price: "1"
        });
    const symbol = currency + "USD";
    return new Promise(function(resolve, reject) {
        bfxRest1.ticker(symbol, (err, res) => {
            if (err) console.log(err);
            resolve(res);
        });
    });
}

// Check balance, if possible send amount.
const checkIfPoss = async currency => {
    let balance = await get_available_amount(currency);
    let price = await check_price(currency);
    let total = Number(balance) * Number(price.last_price);
    if (total >= offer_minimum) {
        return balance;
    } else {
        return {
            balance: balance,
            total: total
        };
    }
};

// Check total income
function check_total_income(offer_currency, lending_start_date) {
    const lending_start_date_t = new Date(lending_start_date).getTime();
    return new Promise(function(resolve, reject) {
        return bfxRest1.balance_history(offer_currency, {}, (err, res) => {
            if (err) console.log(err);
            let ob = [];
            if (res) {
                for (let i = 0; i < res.length; i++) {
                    const timestamp1000 = Number(res[i].timestamp) * 1000;
                    if (
                        timestamp1000 > lending_start_date_t &&
                        res[i].description == "Margin Funding Payment on wallet deposit"
                    ) {
                        ob.push(res[i]);
                    }
                }
            }
            resolve(ob);
        });
    });
}

//已提供
const gen_table_loaning = async offer_currency => {
    const table = new Table({
        head: ["Opening", "Currency", "Amount", "Rate", "Period", "LastPayout"],
        colWidths: [21]
    });
    let funding_loaning = await check_target_currency_all_funding_loans(offer_currency);
    if (funding_loaning != 0) {
        for (let i = 0; i < funding_loaning.amount.length; i++) {
            table.push([
                funding_loaning.mtsCreate[i],
                funding_loaning.symbol[i],
                funding_loaning.amount[i],
                new Rate(funding_loaning.rate[i]).GetPCTLog(),
                funding_loaning.period[i],
                funding_loaning.mtsUpdate[i]
            ]);
        }
    }
    return table;
}

//掛單中
const gen_table_offers = async offer_currency => {
    const table = new Table({
        head: ["Opening", "Currency", "Amount", "Rate", "Period", "LastPayout"]
    });

    let funding_offers = await check_funding_offers(offer_currency);
    if (funding_offers != 0) {
        for (let i = 0; i < funding_offers.amount.length; i++) {
            table.push([
                funding_offers.mtsCreate[i],
                funding_offers.symbol[i],
                funding_offers.amount[i],
                new Rate(funding_offers.rate[i]).GetPCTLog(),
                funding_offers.period[i],
                funding_offers.mtsUpdate[i]
            ]);
        }
    }
    return table;
}

//掛單歷史
function gen_table_offerHistory() {
    const table = new Table({
        head: ["Date", "Amount", "Rate", "Period"]
    });

    for (let i = 0; i < offerHistory.date.length; i++) {
        table.push([
            offerHistory.date[i],
            offerHistory.amount[i],
            new Rate(offerHistory.rate[i]).GetPCTLog(),
            offerHistory.period[i]
        ]);
    }
    return table;
}

const gen_table_income = async (offer_currency, start_data) => {
    const table = new Table({
        head: ["Currency", "Total", "昨日收益", "累積收益", "累積USD收益", "Yrate"]
    });
    let total_income = await check_total_income(offer_currency, start_data);
    if (total_income.length != 0) {
        let cumulative_income = 0;
        if (total_income.length == 1) {
            cumulative_income = total_income[0].amount;
        }
        if (total_income.length > 1) {
            const len = total_income.length - 1;
            cumulative_income = Number(total_income[0].balance) - Number(total_income[len].balance) + Number(total_income[len].amount);
            cumulative_income = cumulative_income.toFixed(8);
        }

        const timeSec = 1000;
        const timeMin = timeSec * 60;
        const timeHour = timeMin * 60;
        const timeDay = timeHour * 24;
        const time30Day = timeDay * 30;
        const timeYear = timeDay * 365;
        let price = await check_price(offer_currency);
        let usd_valuation = cumulative_income * Number(price.last_price);
        usd_valuation = usd_valuation.toFixed(2);
        const lending_t = timeYear / (new Date(start_data).getTime() - new Date().getTime());
        let yRate = -100 * lending_t * cumulative_income / (total_income[0].balance - cumulative_income)
        table.push([
            total_income[0].currency,
            total_income[0].balance,
            total_income[0].amount,
            cumulative_income,
            usd_valuation,
            yRate.toFixed(3)
        ]);
    }
    return table;
}

// Renders an overview.
const render_overview = async offer_currency => {
    // cancel booking
    if (startBookingTime != 0 && (new Date() - startBookingTime) > maxBookingTime) {
        await cancelOffers(offer_currency, minDaliyRate[0]);
    }

    const ba = await checkIfPoss(offer_currency);
    let remaining_balance = 0;

    let funding_matched = await history.GetFundingMatched();
    if (typeof ba === "number") {
        let daliyRate = 0;
        if (funding_matched.rate.length > 0)
            daliyRate = funding_matched.rate[0];

        let funding_r = Math.max(daliyRate, Math.max(history.m2m.avg.value, history.m6m.avg.value));
        let funding_a = max_amount;
        let funding_p = period[0];

        let check_amount = "";
        if (funding_a < ba) {
            check_amount = funding_a;
        } else {
            check_amount = ba;
        }
        if (Number(funding_r) < minDaliyRate[0])
            funding_r = minDaliyRate[0];
        tPeriod = period[0];
        if (Number(funding_r) >= minDaliyRate[1])
            tPeriod = period[1];
        else if (Number(funding_r) >= minDaliyRate[2])
            tPeriod = period[2];
        if (Number(check_amount) > max_amount)
            check_amount = max_amount;
        await offer_a_funding(
            offer_currency,
            check_amount,
            funding_r,
            tPeriod
        );
        startBookingTime = new Date();
    } else {
        remaining_balance = ba.balance;
    }
    const table_loaning = await gen_table_loaning(offer_currency);
    const table_offers = await gen_table_offers(offer_currency);
    const table_offerHistory = gen_table_offerHistory();
    const table_income = await gen_table_income(offer_currency, lending_start_date);

    if (table_offers.length === 0 && typeof ba != "number")
        startBookingTime = 0;

    let daliyRate = 0;
    let yearRate = 0;
    if (funding_matched.rate.length > 0) {
        daliyRate = (funding_matched.rate[0] * 100).toFixed(4);
        yearRate = (daliyRate * 365).toFixed(2);
    }

    let date = new Date();

    const renderString = `
—————————————— Stupid Bitfinex Lending BOT ——————————————

————————————————— ${date.toLocaleString()} ————————————————
————————————— 負數：掛貸出成交，正數：掛貸入成交 —————————————
————————————— 限制最小利率年 ${minYearRate + "%"} — 日 ${(minDaliyRate[0] * 100).toFixed(4) + "%"} ————————————
—————————————— 即時利率年 ${yearRate + "%"} — 日 ${daliyRate + "%"} —————————————

${history.m2m.GetLog(" 2m")}
${history.m6m.GetLog(" 6m")}
${history.m10m.GetLog("10m")}
${history.m30m.GetLog("30m")}
${history.m1h.GetLog(" 1h")}
${history.m3h.GetLog(" 3h")}
${history.m6h.GetLog(" 6h")}
${history.m12h.GetLog("12h")}
${history.m24h.GetLog("24h")}

——————————————————— 已提供 ———————————————————
${table_loaning.toString()}

——————————————————— 掛單中 ———————————————————
${table_offers.length === 0 ? "無" : table_offers.toString()}
——————————————————— 掛單歷史 ——————————————————
${table_offerHistory.toString()}

——————————————————— 剩餘數量 ——————————————————
${remaining_balance}

——————————————————— 累積收益 ——————————————————
${table_income.toString()}
`;
    process.stdout.write('\033c\033[3J');
    console.log(renderString);
};

history.Update(true).then(() => {
    table_offers = gen_table_offers(offer_currency);
    if (table_offers.length != 0)
        startBookingTime = new Date();
    render_overview(offer_currency);

    setInterval(function() {
        render_overview(offer_currency);
    }, 10000);
    setInterval(function() {
        history.Update();
    }, 10000);
});