'use strict';

var core = require('paukan-core');
var util = require('util');
var ld = require('lodash-node');
var async = require('async');
var fs = require('fs');
var uuid = require('node-uuid');

function Service(config) {

    core.Service.call(this, config);
}

util.inherits(Service, core.Service);

Service.prototype._init = Service.prototype.init;

Service.prototype.init = function(callback) {

    var self = this;

    this.scenarioPath = fs.realpathSync(__dirname + '/../' + (this.cfg.scripts || 'scripts'));
    this.active = []; // active (launched in current moment) scenarios
    this.eventMap = {}; // map of current events with states
    this.registeredEvents = {}; // map of events registered by devices with callback

    async.series([
        this._init.bind(this),                  // init default service
        function loadScenarios(next) {          // load and register scenario scripts
            async.concat([self.scenarioPath], fs.readdir, function(err, files) {
                 if (err) { return next(err); }
                 async.each(files, self.loadScenario.bind(self), next);
             });
        },
        function listenAllEvents(next) {         // start listen _all_ network events
            self.service.network.on('*.*.*.*', self.handleEvent.bind(self), next);
        },
    ], callback);
};

Service.prototype.loadScenario = function(filename, callback) {

    var self = this,
        device = require(this.scenarioPath + '/' + filename);

    this.loadDevice(device, function (err) { // load scenario as 'device'
        if(err) {
            return console.log('[%s] is not loaded: "%s"', device.id || 'unknown scenario', err.message);
        }
        ld.each(device.events || [], function(eventArr, cbFunc) {
            if(!ld.isFunction(device[cbFunc])) {
                return console.log('[%s] - will not handle %s because function not found', device.id, cbFunc);
            }
            console.log('[%s] register events:', device.id, eventArr.join(', '));

            // remember registered events and handlers
            ld.each(eventArr, function(eventName) {
                self.eventToMap(self.registeredEvents, eventName, {
                    id: device.id,
                    call: cbFunc
                });
            });
        });
        return callback();
    });
};

Service.prototype.handleEvent = function() {

    var eventName = this.event,
        eventArr = eventName.split('.'),
        arg = ld.values(arguments),
        self = this;

    // test scenario run conditions on event
    var stack = self.valueFromMap(this.registeredEvents, ld.clone(eventArr));
    async.each(stack || [], function(item, next) { // [.id, .call]

        var device = self.service.devices[item.id];
        device[item.call](eventName, arg, function(err, shouldRun) {
            if (err) { return console.error(err); }
            if (shouldRun) {
                self.startScenario(device);
            }
            return next();
        });
    });
};

Service.prototype.startScenario = function(Device) {

    var self = this;
    var scenario = new Device(this, function(err) {
        if (err) {
            return console.log('[%s] is not started: "%s"', Device.id, err.message);
        }
        scenario._uuid = uuid.v4();
        scenario._id = Device.id;
        console.log('[%s] started', Device.id);
        self.active.push(scenario);
        self.state(Device, 'active', true);
    });
};

Service.prototype.stopScenario = function(scenario) {

    var uuid = scenario._uuid, deviceId = scenario._id, active = this.active, self = this;
    if(!uuid || !deviceId) {
        throw new Error('incorrect scenario found');
    }

    async.each(ld.keys(active), function(key, next) { // search this uuid in active scenarios
        var item = active[key];
        if(item._uuid === uuid) {
            delete active[key];
            return next('removed');
        }
        return next();
    }, function(err) {
        if(!err) { err = new Error('specificed scenario not found in active'); }
        if(err instanceof Error) { throw err; }
        var Device = self.service.devices[deviceId];
        console.log('[%s] stopped', Device.id);
        self.state(Device, 'active', false);
    });
};

Service.prototype.eventToMap = function(eventMap, eventName, value) {
    var target = eventMap,
        path = eventName.split('.');

    function recurseMap() {
        var item = path.shift();
        if (!item) {
            return target.push(value);
        }
        if (!target[item]) {
            target[item] = path.length ? {} : [];
        }
        target = target[item];
        recurseMap();
    }
    recurseMap();
};

Service.prototype.valueFromMap = function(map, path) {

    var element = path.shift();
    if (!element || !map) {
        return map;
    }
    return this.valueFromMap(map[element] || map['*'], path);
};

module.exports = Service;
