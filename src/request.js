
var async 		 = require('async');
var util         = require('util');
var EventEmitter = require('events').EventEmitter;


function Request(opts) {
	EventEmitter.call(this);

	var self = this;

	if (! opts) opts = {};

	this.remote = opts.remote;
	this.requested = false;
	this.called = false;
  	this.reconnectTimeout = 1000 * 3;

	this.api = opts.api;
	this.method = opts.method;
	this.params = opts.params || [];
	this.callback = (typeof (opts.callback) == 'function') ? opts.callback : function (){};
	this.subscribeCallback = (typeof (opts.subscribeCallback) == 'function') ? opts.subscribeCallback : function (){};
	this.isSubscribe = opts.isSubscribe || false;

	this.message = {
  	    id: void(0),
	};

	var called = false;
	this.once('success', function (message){
		if (!called){
			called = true;
			self.callback(null, message)
		}
	})

	this.once('error', function (error){
		if (!called){
			called = true;
			self.callback(error)
		}		
	})

	if (this.isSubscribe){
		this.on('notice', function(message) {
			self.subscribeCallback(message)
		})
	}

	return this;
};

util.inherits(Request, EventEmitter);

Request.prototype.broadcast = function (filterFn) {
	if (typeof filterFn !== 'function') {
		filterFn = function (res) {
			if (res && res.code) return false;
			return true;
		};	
	} 

	this.requested = true;

	var self = this;
	var lastResponse = new Error('No servers available');
	var connectTimeouts = {};
	var emit = this.emit;

	this.emit = function (event, a, b) {
		// Proxy success/error events
		switch (event) {
			case 'success':
			case 'error':
				emit.call(self, 'proposed', a, b);
				break;
			default:
				emit.apply(self, arguments);
		}
	};

	function iterator(server, callback) {
		// Iterator is called in parallel

		if (server.isConnected()) {
			// Listen for proxied success/error event and apply filter
			self.on('proposed', function (res, res_server) {
				if (res_server !== server) return;
				lastResponse = res;
				callback(filterFn(res, server));
			});
			return server._request(self);
		}

		// Server is disconnected but should reconnect. Wait for it to reconnect,
		// and abort after a timeout
		var serverID = server.getServerID();

		function serverReconnected() {
			clearTimeout(connectTimeouts[serverID]);
			connectTimeouts[serverID] = null;
			iterator(server, callback);
		}

		connectTimeouts[serverID] = setTimeout(function () {
			server.removeListener('connect', serverReconnected);
			callback(false);
		}, self.reconnectTimeout);

		server.once('connect', serverReconnected);
	}

	function complete(success) {
		// Emit success if the filter is satisfied by any server
		// Emit error if the filter is not satisfied by any server
		// Include the last response
		emit.call(self, success ? 'success' : 'error', lastResponse);
	}

	var servers = this.remote.servers.filter(function (server) {
		// Pre-filter servers that are disconnected and should not reconnect
		return (server.isConnected() || server._shouldConnect)
	});

	// Apply iterator in parallel to connected servers, complete when the
	// supplied filter function is satisfied once by a server's response
	async.some(servers, iterator, complete);

  	return this;
}

Request.prototype.request = function (servers) {
  this.emit('before');

  if (this.requested) {
    return this;
  }
  this.requested = true;

  this.emit('request', this.remote);

  if (Array.isArray(servers)) {
    servers.forEach(function (server) {
      server.request(this);
    }, this);
  } else {
    this.remote.request(this);
  }

  return this;
};

Request.prototype.setServer = function (server) {
  var selected = null;

  switch (typeof server) {
    case 'object':
      selected = server;
      break;

    case 'string':
      // Find server by URL
      var servers = this.remote._servers;

      for (var i = 0, s = undefined; s = servers[i]; i++) {
        if (s._url === server) {
          selected = s;
          break;
        }
      }
      break;
  }

  this.server = selected;

  return this;
};

Request.prototype.timeout = function (duration, callback) {
  var self = this;

  function requested() {
    self.timeout(duration, callback);
  }

  if (!this.requested) {
    // Defer until requested
    return this.once('request', requested);
  }

  var emit = this.emit;
  var timed_out = false;

  var timeout = setTimeout(function () {
    timed_out = true;

    if (typeof callback === 'function') {
      callback();
    }

    emit.call(self, 'timeout');
    self.cancel();
  }, duration);

  this.emit = function () {
    if (!timed_out) {
      clearTimeout(timeout);
      emit.apply(self, arguments);
    }
  };

  return this;
};

Request.prototype.cancel = function () {
  this.removeAllListeners();
  return this;
};

module.exports = Request;