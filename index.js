// third party library for creating endpoints
const express = require('express');
const app = express();
app.use(express.json());

// input validation 
const Joi = require('joi');

// listen to port
const PORT = process.env.PORT || 3000;

// single endpoint - no need to use a router for different endpoints
app.post('/split-payments/compute', (req, res) => {
    // final response blue print
    class ResponseFormat {
        constructor(id, balance, splitBd) {
            this.ID = id;
            this.Balance = balance,
            this.SplitBreakDown = splitBd
        }
    }

    // split breakdown blue print
    class SplitBreakDown {
        constructor(id, amount) {
            this.SplitEntityId = id;
            this.Amount = amount;
        }
    }

    // split type - 'flat' split types are being computed in real time
    const mapping = {
        "percentage": [],
        "ratio": []
    }

    const request = req.body;

    // input validation
    const {error} = validateInput(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    // array to contain processed data to be responded with
    const newSplitInfo = [];

    // amount balance left to be utilized by 'ratio' types
    let balance = request.Amount;

    // final balance after deducation fractional (ratio) splits
    let finalBalance;

    let totalRatio = 0;

    // array of splits from input body
    const splitInfo = request.SplitInfo;

    // -- INPUT PROCESSING PROCEDURE --

    for (splitObject of splitInfo) {
        // adjusting split type strings for case sensitive comparisons
        let type = splitObject.SplitType.toLowerCase();
        splitObject.SplitType = type;

        // aggregate ratio if present
        if (type === 'ratio') {
            totalRatio += splitObject.SplitValue;
        }

        // computing for 'flat' types directly
        if (type === 'flat') {
            calculateAmount(splitObject);
            let newObj = new SplitBreakDown(splitObject.SplitEntityId, splitObject.Amount);
            newSplitInfo.push(newObj);
            continue;
        }

        // seperating the different types of split transactions
        mapping[type].push(splitObject);
    }

    // compute for 'percentage' and 'ratio' split types
    for (type in mapping) {
        // compute amount for the different split objects
        // create split breakdown objects to form array to be responded with

        if (type === 'ratio') {
            finalBalance = balance;
        }
        for (splitObj of mapping[type]) {
            calculateAmount(splitObj, totalRatio);
            splitObj = new SplitBreakDown(splitObj.SplitEntityId, splitObj.Amount);
            newSplitInfo.push(splitObj);
        }
    }

    // create final response
    const response = new ResponseFormat(request.ID, finalBalance, newSplitInfo);

    // server response
    res.send(response);

    // function to calculate final amount for the differnet split type ojects
    // for the 'ratio' type we work with an additional parameter
    function calculateAmount(splitObj, ratioTotal = 0) {
        switch (splitObj.SplitType) {
            case 'flat':
                
                splitObj.Amount = (balance < splitObj.SplitValue) ? balance : splitObj.SplitValue;
                balance = balance - splitObj.Amount;
                break;

            case 'percentage':
                splitObj.Amount = (splitObj.SplitValue/100) * balance;
                balance = balance - splitObj.Amount;
                break;

            case 'ratio':
                splitObj.Amount = (splitObj.SplitValue/ratioTotal) * balance;

                // updating final balance to be returned to the user
                finalBalance -= splitObj.Amount;
            
        }

    }

});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// input validation function
function validateInput(input) {
    const schema = Joi.object({
        ID: Joi.number().required(),
        Amount: Joi.number().required(),
        Currency: Joi.string().required(),
        CustomerEmail: Joi.string().email().required(),
        SplitInfo: Joi.array().items(Joi.object({
            SplitType: Joi.string().required(),
            SplitValue: Joi.number().required(),
            SplitEntityId: Joi.string().required()
        }))
    });

    return schema.validate(input);
}