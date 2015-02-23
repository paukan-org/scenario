'use strict';

var cfg = {
    id: 'test',
    version: '0.0.1'
};

function Scenario(service, callback) {

    this.log('>>> %s started', cfg.id);
    this.service = service;

    // stop scenario after 1 minute
    this.timer = setTimeout(this.stop.bind(this), 60 * 1000);

    setImmediate(callback);
}

Scenario.prototype.stop = function() {
    clearTimeout(this.timer);
    this.service.stopScenario(this);
    this.log('>>> %s stopped', cfg.id);
};

// Scenario.prototype.log = function() {
//     console.log.apply(console, ld.values(arguments));
// };
//
Scenario.beforeLoad = function(config, service, callback) {

    // basic device fields
    this.id = cfg.id;
    this.version = cfg.version;

    // specified events and handler which will be fired on event trigger
    this.events = {
        runOnEvent: ['test.*.*.*']
    };

    return callback();
};

Scenario.runOnEvent = function(eventName, arg, callback) {

    return callback(null, arg[0] && arg[0] === 'run');
};

module.exports = Scenario;
