#!/usr/bin/env node

'use strict';

var core = require('paukan-core');
var async = require('async');
var Scenario = require('./lib/scenario');

var config = core.common.serviceConfig(require('./config.json'), require('./package.json'));

// var service, http;
async.series([
    function (next) {
        service = new core.Service(config, next);
    },
    function (next) {
        scene = new Scenario();
    }
], function (err) {
    if(err) { throw err; }
    console.log('Web service started on %s port', config.listen);
});
