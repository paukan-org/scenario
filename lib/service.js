'use strict';

var core = require('paukan-core');
var util = require('util');
var ld = require('lodash-node');
var async = require('async');
var fs = require('fs');

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
        function (next) {                       // handle _all_ network events
            return next();
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
                    callback: cbFunc
                });
            });
        });
        return callback();
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

module.exports = Service;
