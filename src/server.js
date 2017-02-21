var util        = require('util');
var EventEmitter= require('events').EventEmitter;

var Request 	= require('./request')

var API_IDS = {
	'login_api': 1,
}

function Server(opts) {
	EventEmitter.call(this);

	var self = this;

	if (typeof opts === 'string') {
		var url = opts;
		opts = {url: url};
	}

	if (typeof opts !== 'object') {
	throw new TypeError('Server configuration is not an Object');
	}

	this.setMaxListeners(opts.max_listeners || 100);

	this.apiIds = Object.assign({}, API_IDS);

	this._opts = opts;
	this._remote = opts.remote;
	this._url = this._opts.url || 'wss://node.steem.ws';
	this._username = opts.username;
	this._password = opts.password;

	this._ws = void(0);

	this._connected = false;
	this._shouldConnect = false;
	this._state = 'offline';

	this._id = 0; // request ID
	this._retry = 0;
	this._requests = { };
	this._notices = { };

	this._properties = {};

	this._score = 0;
	this._scoreWeights = {
    	block: 1,
    	response: 1
	};

	this._accountSubs = {};

	this.on('message', function onMessage(message) {
		self._handleMessage(message);
	});

	this.on('connect', function() {
		// reset apiIds;
		self.apiIds = Object.assign({}, API_IDS);
	});

	function setServerStateInterval() {
		var interval = self._checkServerState.bind(self);
		self._serverStateInterval = setInterval(interval, 3 * 1000);
	}
	this.once('connect', setServerStateInterval);

	this._remote.on('block_advanced', function (blockNum, increment) {
		var lag = blockNum - self._properties.last_irreversible_block_num;
		if (lag > increment) {
			self._updateScore('block', lag - increment);
		}
	})
}

util.inherits(Server, EventEmitter);

Server.TLS_ERRORS = [
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_CRL',
  'UNABLE_TO_DECRYPT_CERT_SIGNATURE', 'UNABLE_TO_DECRYPT_CRL_SIGNATURE',
  'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY', 'CERT_SIGNATURE_FAILURE',
  'CRL_SIGNATURE_FAILURE', 'CERT_NOT_YET_VALID', 'CERT_HAS_EXPIRED',
  'CRL_NOT_YET_VALID', 'CRL_HAS_EXPIRED', 'ERROR_IN_CERT_NOT_BEFORE_FIELD',
  'ERROR_IN_CERT_NOT_AFTER_FIELD', 'ERROR_IN_CRL_LAST_UPDATE_FIELD',
  'ERROR_IN_CRL_NEXT_UPDATE_FIELD', 'OUT_OF_MEM',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_CHAIN_TOO_LONG', 'CERT_REVOKED', 'INVALID_CA',
  'PATH_LENGTH_EXCEEDED', 'INVALID_PURPOSE', 'CERT_UNTRUSTED',
  'CERT_REJECTED'
];

Server.websocketConstructor = function() {
	return require('ws');
};

Server.prototype._setState = function(state) {
  if (state !== this._state) {
    this._state = state;
    this.emit('state', state);
    switch (state) {
      case 'online':
        this._connected = true;
        this._retry = 0;
        this.emit('connect');
        break;
      case 'offline':
        this._connected = false;
        this.emit('disconnect');
        break;
    }
  }
};

Server.prototype._checkServerState = function () {
	if (!this.isConnected()) return;
	var self = this;

	function callback (err, res) {
		if (err || !res) return;
		if (res.head_block_number <= self._properties.head_block_number) return;
		Object.assign(self._properties, res);
		self.emit('properties', res);
	}
	var opts = {
		api: 'database_api',
		method: 'get_dynamic_global_properties',
		callback: callback,		
	}
  	var req = new Request(opts);
	this.request(req);
};

Server.prototype.disconnect = function() {
	var self = this;

	if (!this.isConnected()) {
		this.once('socket_open', function() {
			self.disconnect();
		});
		return;
	}

	this._shouldConnect = false;
	this._setState('offline');
		if (this._ws) {
		this._ws.close();
	}
};


Server.prototype.reconnect = function(delay_secs) {
  var self = this;

  function reconnect() {
    self._shouldConnect = true;
    self._retry = 0;
    if (typeof delay_secs !== 'number') delay_secs = 0;
    setTimeout(function () {
      self.connect();
    }, delay_secs * 1000);
  }

  if (this._ws && this._shouldConnect) {
    if (this.isConnected()) {
      this.once('disconnect', reconnect);
      this.disconnect();
    } else {
      reconnect();
    }
  }
}


Server.prototype.connect = function() {
  var self = this;

  var WebSocket = Server.websocketConstructor();

  if (!WebSocket) {
    throw new Error('No websocket support detected!');
  }

  // We don't connect if we believe we're already connected. This means we have
  // recently received a message from the server and the WebSocket has not
  // reported any issues either. 
  if (this.isConnected()) {
    return;
  }

  // Ensure any existing socket is given the command to close first.
  if (this._ws) {
    this._ws.close();
  }

  var ws = this._ws = new WebSocket(this._opts.url);

  this._shouldConnect = true;

  self.emit('connecting');

  ws.onmessage = function onMessage(msg) {
    self.emit('message', msg.data);
  };

  ws.onopen = function onOpen() {
    if (ws === self._ws) {
      	self.emit('socket_open');
      	// login before emit 'connect'.
      	self.login(function(err, res){
			if (res) self._setState('online');
     	});
    }
  };

  ws.onerror = function onError(e) {
    if (ws === self._ws) {
      self.emit('socket_error');

      if (Server.TLS_ERRORS.indexOf(e.message) !== -1) {
        // Unrecoverable
        throw e;
      }

      // Most connection errors for WebSockets are conveyed as 'close' events with
      // code 1006. This is done for security purposes and therefore unlikely to
      // ever change.

      // This means that this handler is hardly ever called in practice. If it is,
      // it probably means the server's WebSocket implementation is corrupt, or
      // the connection is somehow producing corrupt data.

      // Most WebSocket applications simply log and ignore this error. Once we
      // support for multiple servers, we may consider doing something like
      // lowering this server's quality score.

      // However, in Node.js this event may be triggered instead of the close
      // event, so we need to handle it.
      self._handleClose();
    }
  };

  ws.onclose = function onClose() {
    if (ws === self._ws) {
      self._handleClose();
    }
  };
};

Server.prototype._retryConnect = function() {
  var self = this;

  this._retry += 1;

  var retryTimeout = (this._retry < 40)
  // First, for 2 seconds: 20 times per second
  ? (1000 / 20)
  : (this._retry < 40 + 60)
  // Then, for 1 minute: once per second
  ? (1000)
  : (this._retry < 40 + 60 + 60)
  // Then, for 10 minutes: once every 10 seconds
  ? (10 * 1000)
  // Then: once every 30 seconds
  : (30 * 1000);

  function connectionRetry() {
    if (self._shouldConnect) {
      self.connect();
    }
  };

  this._retryTimer = setTimeout(connectionRetry, retryTimeout);
};

Server.prototype._handleClose = function() {
  var self = this;
  var ws = this._ws;

  function noOp(){};

  // Prevent additional events from this socket
  ws.onopen = ws.onerror = ws.onclose = ws.onmessage = noOp;

  this.emit('socket_close');
  this._setState('offline');

  if (this._shouldConnect) {
    this._retryConnect();
  }
};

Server.prototype._handleMessage = function(message) {
	var self = this;

	try {
		message = JSON.parse(message);
	} catch(e) {
		//do nothing
	}

	if (message.id != undefined) {
		this._handleResponse(message);	
	}

	if (message.method == 'notice') {
		this._handleNotice(message.params)
	}
};

Server.prototype._handleResponse = function(message) {
	// A response to a request.
	var request = this._requests[message.id];

	delete this._requests[message.id];

	if (!request) return;

	if (message.result !== undefined) {
		var result = message.result;
		request.emit('success', message.result, this);
	} else if (message.error) {
		request.emit('error', message.error, this);
	}
};

Server.prototype._handleNotice = function(params) {
	var id = params[0];
	var result = params[1];
	var notice = this._notices[id];

	if (!notice) return;
	notice.emit('notice', result);
};

Server.prototype.isConnected =
Server.prototype._isConnected = function() {
  return this._connected;
};


Server.prototype._sendMessage = function(message) {
  if (this._ws) {
    this._ws.send(JSON.stringify(message));
  }
};

Server.prototype.request =
Server.prototype._request = function(request) {
	var self  = this;

	// Only bother if we are still connected.
	if (!this._ws) return;

	this.getApi(request.api, function(err, apiId){
		if (apiId == null) throw new Error("Failed to get ApiID for " + request.api)
		request.time = Date.now();

		if (request.isSubscribe) {
			var subs_id = self._id++;
			request.params.unshift(subs_id);
			self._notices[subs_id] = request;
		}

		request.message.id = self._id++;
		request.message.method = "call";
		request.message.params = [
			apiId,
			request.method,
			request.params
		]

		self._requests[request.message.id] = request;

		function sendRequest() {
			self._sendMessage(request.message);
		};

		var isOpen = self._ws.readyState === 1;
		var isLogin = (request.api == 'login_api') && (request.method == 'login');

		if (self.isConnected() || (isOpen && isLogin)) {
			sendRequest();
		} else {
			self.once('connect', sendRequest);
		}
	});
};

Server.prototype.getApi = function(api, callback) {
	if (typeof api == "number") return callback(null, api);
	var self = this;
	if (this.apiIds[api] || this.apiIds[api] === 0) {	
		callback(null, this.apiIds[api]);
	} else {
		this.getApiByName(api, function(err, result) {
			self.apiIds[api] = result;
			callback(null, result);
		});
	}
};


Server.prototype.getApiByName = function(apiName, callback) {
	var self = this;
	var req = new Request({
		api:"login_api",
		method: "get_api_by_name",
		params: [apiName],
		callback: callback
	})
	this._request(req);
};

Server.prototype.login = function(callback) {
	var self = this;
	var req = new Request({
		api:"login_api",
		method: "login",
		params: [this._username, this._password],
		callback: callback
	})
	this._request(req);
};

Server.prototype.getHostID = 
Server.prototype.getServerID = function () {
  return this._url;
};

Server.prototype._updateScore = function (type, delta) {
  if (!this.isConnected()) {
    return;
  }

  var weight = this._scoreWeights[type] || 1;
  this._score += weight * delta;

  if (this._score > 1000) {
    this.reconnect();
  }
};


Server.prototype._accountSubscribe = function (account, immediate) {
	var accountName = account._name;
	if (this._accountSubs[accountName]) return; //already subscribe

	this._accountSubs[accountName] = {};
	var self = this;
	var results = [];

	function update (err, res) {
		if (! res || !res[0]) return;

		var seq = res[0][0];
		var last_seq = self._accountSubs[accountName].seq;
		if (!last_seq) return self._accountSubs[accountName].seq = seq;
		if (seq > last_seq + 1) return getHistory(seq, seq - last_seq - 1, update);

		res.forEach(function (tx) {
			var seq = tx[0];
			var tx = tx[1];
			if (seq <= last_seq) return;
			if (!immediate && tx.block > self._properties.last_irreversible_block_num) return;
			self._accountSubs[accountName].seq = seq;
			account.notifyTx(tx);
		})
	}

	function getHistory (from, limit, callback) {
		if (!self.isConnected()) return;
		from = from || -1;
		limit = limit || 0;
		callback = callback || update;
		var req = new Request({
			api: 'database_api',
			method: 'get_account_history',
			params: [accountName, from, limit],
			callback: callback
		})
		self.request(req);
	}

	function handleHistory (err, res) {
		if (err || !res || !res[0]) return;
		var seq = res[0][0];
		var tx = res[0][1];
		var marker = getTxMarker(tx);
		if (marker > account._marker) {
			results = res.concat(results);
			return getHistory(seq - 1, 20, handleHistory)
		}
		for (var i=0, l=res.length; i<l; i++) {
			marker = getTxMarker(res[i][1]);
			if (marker > account._marker) break;
		}
		self._accountSubs[accountName].seq = res[i-1][0]
		results = res.slice(i).concat(results);
		update(null, results);
	}

	this._accountSubs[accountName].timer = setInterval(getHistory, 3 * 1000);

	if (account._marker) getHistory(-1, 20, handleHistory);
	else getHistory(-1, 0, update);
}

Server.prototype._accountUnsubscribe = function (account) {
	if (this._accountSubs[account._name]) {
		clearInterval(this._accountSubs[account._name].timer);
		delete this._accountSubs[account._name];
	}
}

function getTxMarker (tx) {
	function toHex (num) { return h = ("00000000" + num.toString(16)).substr(-8); }
	return [tx.block, tx.trx_in_block, tx.op_in_trx].map(toHex).join('');
}

module.exports = Server;