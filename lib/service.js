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
            self.network.on('*.*.*.*', function() {
                self.handleEvent(this.event, ld.values(arguments));
            }, next);
        },
    ], callback);
};

Service.prototype.loadScenario = function(filename, callback) {

    var self = this,
        device = require(this.scenarioPath + '/' + filename);

    // inject scenario states
    var deviceStates = device.states || [];
    deviceStates.push('active');
    device.states = ld.unique(deviceStates);

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

Service.prototype.handleEvent = function(eventName, arg) {

    var eventArr = eventName.split('.'),
        self = this;

    // cache any state event
    if(eventArr[0] === 'state') {
        this.eventMap[eventName] = arg;
    }

    // test scenario run conditions on event
    var stack = self.valueFromMap(this.registeredEvents, ld.clone(eventArr));
    async.each(stack || [], function(item, next) { // [.id, .call]

        var device = self.devices[item.id];
        device[item.call](eventName, arg, function(err, shouldRun) {
            if (err) { return console.error(err); }
            if (shouldRun) {
                self.startScenario(device);
            }
            return next();
        });
    });
};

Service.prototype.getState = function(/*service, device, state, testCache, callback*/) {

    var arg = ld.values(arguments),
        eventName, service, device, state,
        callback = arg.pop(),
        testCache = true;

    if(typeof arg[arg.length - 1] === 'boolean') {
        testCache = arg.pop();
    }

    service = arg[0];
    switch(arg.length) {
        case 2:
            device = 'service';
            state = arg[1];
            break;
        case 3:
            device = arg[1];
            state = arg[2];
            break;
        default:
            return callback ? callback(new Error('wrong parameters count')) : undefined;
    }
    eventName = ['state', service, device, state].join('.');

    if(testCache && typeof this.eventMap[eventName] !== 'undefined') {
        var param = ld.clone(this.eventMap[eventName]);
        param.unshift(null);
        return callback.apply(null, param);
    }
    return this.request(service, device, state, callback);
};

Service.prototype.request = function(service, device, state, callback) {

    var replyID = uuid.v4(),
        local = this.network.local,
        replyEvent = ['reply', service, replyID, state].join('.'),
        timeout,
        cb = function (err, res) {
            clearTimeout(timeout);
            local.off(replyEvent, cb);
            return callback(err, res);
        };
    local.on(replyEvent, cb);
    timeout = setTimeout(cb, this.cfg.replyTimeout, new Error('timeout while waiting answer from '+state));
    this.network.emit(['request', service, device, state].join('.'), replyID);
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
        Device.active = true;
        self.state(Device, 'active', true);
    });
};

Service.prototype.stopScenario = function(scenario) {

    var uuid = scenario._uuid, deviceId = scenario._id, active = this.active, self = this;
    if(!uuid || !deviceId) {
        throw new Error('incorrect scenario found');
    }

    // 2do: rewrite
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
        var Device = self.devices[deviceId];
        console.log('[%s] stopped', Device.id);
        Device.active = false;
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
