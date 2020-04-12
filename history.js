const Queue = require("./Queue");
const match_sort = null
const match_records = 5
const match_period = 300 //second

function History(bfxRest2) {
    this.bfxRest2 = bfxRest2;
    this.startTime = Date.now();
    this.historyData = new Queue();

    this.GetFundingMatched = function(currency) {
        let match_end = Date.now(); // ms
        let match_start = match_end - match_period * 1000;
        return this.bfxRest2.trades("f" + currency, match_start, match_end, match_records, match_sort).then(records => {
            let data = {
                amount: [],
                period: [],
                rate: []
            };
            for (let i = 0; i < records.length; i++) {
                data.amount[i] = records[i].amount;
                data.period[i] = records[i].period;
                data.rate[i] = records[i].rate;
            }
            return data;
        });
    }
}
module.exports = History;