'use strict';

/**
 * Test script:
 *
 * - write "im running" to console every second
 *
 * - start if:
 * 	1) state 'state.test.test1.counter' fired
 * 	2) script is not running
 * 	3) ups service and ups 'raspberry' work not from battery
 *
 * - stop after 1 minute of work
 */

var cfg = {
    id: 'test',
    version: '0.0.1'
};

function Scenario(service, callback) {

    console.log('>>> %s started', cfg.id);
    this.service = service;

    // stop scenario after 1 minute
    this.timer = setTimeout(this.stop.bind(this), 6 * 1000);
    setInterval(console.log, 1000, 'im running');

    setImmediate(callback);
}

Scenario.prototype.stop = function() {
    clearTimeout(this.timer);
    this.service.stopScenario(this);
    console.log('>>> %s stopped', cfg.id);
};

Scenario.beforeLoad = function(config, service, callback) {

    // basic device fields
    this.id = cfg.id;
    this.version = cfg.version;
    this.service = service;

    // specified events and handler which will be fired on event trigger
    this.events = {
        runOnEvent: ['state.test.*.*']
    };

    return callback();
};

Scenario.runOnEvent = function(eventName, arg, callback) {

    var isScenarioLaunched = this.service.devices[cfg.id].active;

    if(isScenarioLaunched) { return callback(null, false); }
    this.service.getState('ups', 'raspberry', 'power', true, callback);
};

module.exports = Scenario;
