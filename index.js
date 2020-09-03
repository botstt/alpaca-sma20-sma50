const _ = require('lodash');
const Alpaca = require("@alpacahq/alpaca-trade-api");
const SMA = require('technicalindicators').SMA;

const alpaca = new Alpaca({
    keyId: process.env.API_KEY,
    secretKey: process.env.SECRET_API_KEY,
    paper: true
});

let sma20, sma50;
let lastOrder = 'SELL';
let symbol = 'SPY';

// Check if the market is open now.
alpaca.getClock().then((clock) => {
    console.log('The market is ' + (clock.is_open ? 'open.' : 'closed.'));
});

// Get the market operation hours.
const date = new Date();
alpaca.getCalendar({
    start: date,
    end: date
}).then((calendars) => {
    console.log(`The market opened at ${calendars[0].open} and closed at ${calendars[0].close} on ${date}.`)
});

async function initializeAverages() {
    const initialData = await alpaca.getBars(
        '1Min',
        symbol,
        {
            limit: 50,
            until: new Date()
        }
    );

    const closeValues = _.map(initialData[symbol], (bar) => bar.closePrice);

    sma20 = new SMA({ period: 20, values: closeValues });
    sma50 = new SMA({ period: 50, values: closeValues });

    console.log(`sma20: ${sma20.getResult()}`);
    console.log(`sma50: ${sma50.getResult()}`);
}


initializeAverages();

const client = alpaca.data_ws;

client.onConnect(() => {
    console.log("Connected!");

    client.subscribe(['alpacadatav1/AM.' + symbol]);

    setTimeout(() => client.disconnect(), 25200 * 1000);    // Runs 7 hours and disconnects.
});

client.onStockAggMin((subject, data) => {

    const nextValue = data.closePrice;

    const next20 = sma20.nextValue(nextValue);
    const next50 = sma50.nextValue(nextValue);

    console.log(`next20: ${next20}`);
    console.log(`next50: ${next50}`);

    if (next20 > next50 && lastOrder !== 'BUY') {
        alpaca.createOrder({
            symbol: symbol,
            qty: 1,
            side: 'buy',
            type: 'market',
            time_in_force: 'day'
        });

        lastOrder = 'BUY';
        console.log('\nBUY\n');
    } else if (next20 < next50 && lastOrder !== 'SELL') {
        alpaca.createOrder({
            symbol: symbol,
            qty: 1,
            side: 'sell',
            type: 'market',
            time_in_force: 'day'
        });

        lastOrder = 'SELL';
        console.log('\nSELL\n');
    }

});

client.connect();