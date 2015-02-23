#!/usr/bin/env node

'use strict';

var core = require('paukan-core');
var ScenarioService = require('./lib/service');

var config = core.common.serviceConfig(require('./config.json'), require('./package.json'));

var service = new ScenarioService(config);
service.init(function (err) {
    if(err) { throw err; }
    console.log('Scenario service started');
});
