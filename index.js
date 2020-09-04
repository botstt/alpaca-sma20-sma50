const _ = require('lodash');
const Alpaca = require("@alpacahq/alpaca-trade-api");
const SMA = require('technicalindicators').SMA;
const mongoose = require('mongoose');

const alpaca = new Alpaca({
    keyId: process.env.API_KEY,
    secretKey: process.env.SECRET_API_KEY,
    paper: true
});

let sma20, sma50;
let lastOrderSide = '';
let symbol = 'SPY';

// Bring in the Option Models.
var Option = require('./models/option');

// Connect to MongoDB database.
mongoose.connect('mongodb+srv://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' + process.env.DB_HOST + '/' + process.env.DB_NAME + '?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true });
let db = mongoose.connection;

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

// Function to update last order side value in database.
function updateOption(optionData, value) {
    optionData.option_value = value;
    Option.update({ _id: optionData._id }, optionData, function (err) {
        if (err) {
            console.log(err);
            return;
        } else {
            return;
        }
    });
}

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

// Send errors to the console for debugging.
db.on('error', console.error.bind(console, 'connection error:'));

// Send message to the console when the script is connected to the DB.
db.once('open', function () {
    console.log('Connected to script database.');

    // Find the lastOrderSide value first.
    Option.findOne({ option_name: 'last_order_side' }, function (err, optionData) {
        if (err) {
            console.log(err);
        } else {
            // Get lastOrderSide value from DB.
            lastOrderSide = optionData.option_value;

            // Get initial simple averages.
            initializeAverages();

            // Get Alpaca websocket client.
            const client = alpaca.data_ws;

            // Connect to the socket for 7 hours and then disconnects.
            client.onConnect(() => {
                console.log("Connected to the Alpaca API!");

                client.subscribe(['alpacadatav1/AM.' + symbol]);

                setTimeout(() => client.disconnect(), 25200 * 1000);
            });

            // Listen to stock price change per minute.
            client.onStockAggMin((subject, data) => {


                const nextValue = data.closePrice;

                const next20 = sma20.nextValue(nextValue);
                const next50 = sma50.nextValue(nextValue);

                console.log(`next20: ${next20}`);
                console.log(`next50: ${next50}`);

                if (next20 > next50 && lastOrderSide !== 'BUY') {
                    alpaca.createOrder({
                        symbol: symbol,
                        qty: 1,
                        side: 'buy',
                        type: 'market',
                        time_in_force: 'day'
                    });

                    lastOrderSide = 'BUY';
                    // Update lastOrderSide in DB.
                    updateOption(optionData, lastOrderSide);

                    console.log('\n' + lastOrderSide + '\n');
                } else if (next20 < next50 && lastOrderSide !== 'SELL') {
                    alpaca.createOrder({
                        symbol: symbol,
                        qty: 1,
                        side: 'sell',
                        type: 'market',
                        time_in_force: 'day'
                    });

                    lastOrderSide = 'SELL';
                    // Update lastOrderSide in DB.
                    updateOption(optionData, lastOrderSide);

                    console.log('\n' + lastOrderSide + '\n');
                }

            });

            client.connect();
        }
    });
});