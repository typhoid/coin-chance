/*
 *  Copyright 2014 Rick Van Tassel<rickvt@gmail.com>
 *
 *  This file is part of Coin-chance.
 *
 *  Coin-chance is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Coin-chance is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with Coin-chance.  If not, see <http://www.gnu.org/licenses/>.
 */

var rpc = require('json-rpc2'),
    config = require('../../config'),
    BigNumber = require('bignumber.js'),
    async = require('async');

var client = new rpc.Client(
    config.COIN_RPC_PORT,
    config.COIN_RPC_HOST,
    config.COIN_RPC_USER,
    config.COIN_RPC_PASSWORD
    );

// Amount is a BigNumber
exports.moveFromUserToHouse = function (userId,amount,cb) {
    console.log("movefromuser");
    amount = Number(amount.toFixed(config.DECIMAL_PLACES));
    client.call( "move", [userId,"",amount], cb);
};

// Amount is a BigNumber
exports.moveToUserFromHouse = function (userId, amount, cb) {
    console.log("movetouser");
    amount = Number(amount.toFixed(config.DECIMAL_PLACES));
    client.call( "move", [userId,"",amount], cb);
};

exports.isValidAddress = function (address, cb) {
    console.log("[src/model/coin.js] validateAddress");
    client.call("validateaddress", [address], function (err,res) {
        if (err) {
            console.error("[src/model/coin.js] validateAddress error: %s",err);
            cb(false);
        } else {
            cb(res.isvalid);
        }
    });
};

exports.getHistory = function(userId, n, offset, cb) {
    console.log("history");
    client.call( "listtransactions", [userId, n, offset], 
            function(err, res) {
                if (err){
                    console.err(err);
                    cb(err, []);
                }
            cb(err,res);
    });
};

// Amount is a BigNumber
exports.getUserBalance = function (userId,cb) {
    console.log("getuserbalance");
    client.call( 
        "getbalance",
        [userId, config.MIN_DEPOSIT_CONFIRMATIONS], 
        function (err,res){
            if (err | isNaN(res)) {
                cb("Problem getting a user's balance",res);
                return;
            }
            cb(err, BigNumber(res));
    });
};

exports.getUserAddress = function (userId,cb) {
    client.call( "getaccountaddress",
        [userId], 
        function(err,res){
            cb(err,res);
    });
};

// Oh god this is getting out of control
// Basically, you push tasks in the form:
//      {
//          func: function(param, task_complete_callback(complete_acknowledged_callback())),
//          param: [anything]
//      }
// The func will execute once it enters its place in the queue
// The func MUST call the task_complete_callback, with a callback that will be called when the task is done.
// Complicated, but I have too much coffee to slow down now!! Hahahahaha....
exports.balanceQueue = async.queue( function(task, endOfItemCb) {
    task.func(task.param, function(complete_acknowledged_callback){
        endOfItemCb();
        complete_acknowledged_callback();
    });
});

exports.subsume = function(userId,cb) {
    exports.balanceQueue.push({
        'func' : function(dummy, endCb){
            // Make sure user balance is STILL 0 after reaching this point!
            exports.getUserBalance(userId, function (err, bal) {
                if (err) {
                    endCb(function(){
                        cb(err,BigNumber(0));
                    });
                } else if (bal.equals(0)) {
                    // if balance is 0, nothing necessary 
                    // (THIS MEANS WE DODGED A RACE CONDITION BULLET! CONGRATS!)
                    endCb(function() {
                        cb(null,bal);
                    });
                } else {
                    exports.moveFromUserToHouse(userId,bal,function (err){
                        endCb(function() {
                            cb(null,bal);
                        });
                    });
                }
            });
        },
    'param': null
    });
};

// amount is a BigNumber
exports.withdraw = function (userId, addr, amount, cb) {
    console.log("[src/model/coin.js] User userId:%s is withdrawing %s to %s.",userId,amount,addr);
    var realAmount = Number(amount.toFixed(config.DECIMAL_PLACES));
    var realAmountPlusFee = Number(amount.plus(config.COIN_NETWORK_FEE).toFixed(config.DECIMAL_PLACES));
    console.info("[src/model/coin.js] Withdraw: realAmount:%d, realAmountPlusFee:%d.",realAmount,realAmountPlusFee);
    client.call("move", ["", userId, realAmountPlusFee], function (err, res) {
        if (err) {
            console.error(err);
            cb(err);
            return;
        }

        console.info("Withdraw res: ",res);

        client.call("sendfrom", [
                userId,
                addr, 
                realAmount,
                config.MIN_DEPOSIT_CONFIRMATIONS], cb);

        });
};
