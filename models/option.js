const mongoose = require('mongoose');

// Options Schema.
let optionSchema = mongoose.Schema({
    option_name: {
        type: String,
        required: true
    },
    option_value: {
        type: String,
        required: true
    }
});

let Option = module.exports = mongoose.model('Option', optionSchema);