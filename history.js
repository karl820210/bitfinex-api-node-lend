const Queue = require("./Queue");

const match_sort = 0;
// millisecond
const timeSec = 1000;
const timeMin = timeSec * 60;
const timeHour = timeMin * 60;
const timeDay = timeHour * 24;
const time30Day = timeDay * 30;
const timeYear = timeDay * 365;

const matchTime = timeMin * 2; // 2 min
const historySize = 30 * 24; // 60/matchTime * 24 h

function TimeMod(date, count) {
    return new Date(date - (date % count));
}

function TimeModMin(date) {
    return TimeMod(date, timeMin);
}

function Rate(value, amount = 0) {
    this.value = value;
    this.amount = amount;

    //percentage of day
    this.PCTD = function() {
        return (this.value * 100).toFixed(4);
    }

    //percentage of year
    this.PCTY = function() {
        return (this.PCTD() * 365).toFixed(2);
    }

    this.GetPCTLog = function() {
        let str = '';
        if (this.amount != 0)
            str = `${this.PCTY() + "%"}(${this.PCTD() + "%"})[${this.amount.toFixed(2)}]`;
        else
            str = `${this.PCTY() + "%"}(${this.PCTD() + "%"})`;
        return str;
    }
}

function Match(period) {
    this.timePeriod = period;
    this.timeStart = 0;
    this.timeEnd = 0;

    this.count = 0;
    this.avg = new Rate(0);
    this.max = new Rate(0);
    this.min = new Rate(Number.MAX_VALUE);

    this.Update = function(history) {
        if (history.matches.length() === 0)
            return;

        this.timeEnd = history.matches.peek().timeEnd;
        this.timeStart = this.timeEnd - this.timePeriod + 1;

        this.count = 0;
        this.avg = new Rate(0);
        this.max = new Rate(0);
        this.min = new Rate(Number.MAX_VALUE);

        for (let i = 0; i < history.matches.length(); i++) {
            match = history.matches.Get(i);
            if (match.timeEnd <= this.timeStart)
                break;

            this.count += match.count;
            this.avg.value += match.avg.value * match.count;
            this.avg.amount += match.avg.amount * match.count;
            if (this.max.value < match.max.value) {
                this.max.value = match.max.value;
                this.max.amount = match.max.amount;
            }
            if (this.min.value > match.min.value) {
                this.min.value = match.min.value;
                this.min.amount = match.min.amount;
            }
        }
        if (this.count != 0) {
            this.avg.value /= this.count;
            this.avg.amount /= this.count;
        }
    }

    this.GetLog = function(prefix) {
        let str = `————— ${prefix}`;
        str += ` Avg ${this.avg.GetPCTLog()} ,`;
        str += ` Max ${this.max.GetPCTLog()} ,`;
        str += ` Min ${this.min.GetPCTLog()}`;
        str += ` —————`;
        return str;
    }
};

function History(bfxRest2, currency) {
    this.bfxRest2 = bfxRest2;
    this.currency = currency;

    this.startTime = new Date();
    this.lastUpdateTime = TimeModMin(this.startTime);
    this.matches = new Queue();

    this.m24h = new Match(timeDay);
    this.m12h = new Match(timeHour * 12);
    this.m6h = new Match(timeHour * 6);
    this.m3h = new Match(timeHour * 3);
    this.m1h = new Match(timeHour);
    this.m30m = new Match(timeMin * 30);
    this.m10m = new Match(timeMin * 10);
    this.m6m = new Match(timeMin * 6);
    this.m2m = new Match(timeMin * 2);

    this.GetFundingMatched = function() {
        let match_end = Date.now(); // ms
        let match_start = match_end - 5 * timeMin;
        let match_records = 1;
        return this.bfxRest2.trades(
            "f" + this.currency,
            match_start, match_end,
            match_records, match_sort
        ).then(records => {
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

    this.Update = async (force = false) => {
        let nowTimeMin = TimeModMin(new Date()).getTime();
        if (force || (nowTimeMin - this.lastUpdateTime) >= matchTime) {
            this.lastUpdateTime = nowTimeMin;
            this.matches.clear()
            let timeRegion = (this.matches.length() != this.historySize) ? timeDay : matchTime;
            let match_end = nowTimeMin;
            let match_start = match_end - timeRegion + 1;
            let match_records = 10000;
            let records = await this.bfxRest2.trades("f" + this.currency, match_start, match_end, match_records, match_sort);
            let finish = (records.length === 0);
            if (finish)
                return;

            this.matches.dequeue();
            let match = new Match();
            match.timeEnd = match_end;
            match.timeStart = match_end - matchTime + 1;
            match_end = match.timeStart - 1;
            //console.log("records.length " + records.length + " from " + records[0].mts + " to " + records[records.length - 1].mts);
            //console.log("match.timeEnd " + match.timeEnd + " match.timeStart " + match.timeStart);
            while (!finish) {
                for (let i = 0; i < records.length; i++) {
                    if (records[i].mts <= match_start) {
                        finish = true;
                        break;
                    }
                    if (records[i].mts <= match.timeStart) {
                        if (match.count != 0) {
                            match.avg.value /= match.count;
                            match.avg.amount /= match.count;
                        }
                        this.matches.enqueue(match);
                        //console.log(match.timeStart + ": avg " + match.avg + " count " + match.count);
                        match = new Match();
                        match.timeEnd = match_end;
                        match.timeStart = match_end - matchTime + 1;
                        match_end = match.timeStart - 1;
                        //console.log("match.timeEnd " + match.timeEnd + " match.timeStart " + match.timeStart);
                    }
                    match.count++;
                    match.avg.value += records[i].rate;
                    match.avg.amount += Math.abs(records[i].amount);
                    if (match.max.value < records[i].rate) {
                        match.max.value = records[i].rate;
                        match.max.amount = records[i].amount;
                    }
                    if (match.min.value > records[i].rate) {
                        match.min.value = records[i].rate;
                        match.min.amount = records[i].amount;
                    }
                }

                //last one
                if (match_end <= match_start) {
                    if (match.count != 0) {
                        match.avg.value /= match.count;
                        match.avg.amount /= match.count;
                    }
                    this.matches.enqueue(match);
                    break;
                }

                records = await this.bfxRest2.trades("f" + this.currency, match_start, match_end, match_records, match_sort);
                finish = (records.length === 0);
                //console.log("records.length " + records.length + " from " + records[0].mts + " to " + records[records.length - 1].mts);
            }

            this.m24h.Update(this);
            this.m12h.Update(this);
            this.m6h.Update(this);
            this.m3h.Update(this);
            this.m1h.Update(this);
            this.m30m.Update(this);
            this.m10m.Update(this);
            this.m6m.Update(this);
            this.m2m.Update(this);
        }
    }
}

exports.Rate = Rate;
exports.History = History;