var util         = require('util');
var EventEmitter = require('events').EventEmitter;

var Server 		= require('./server');
var Request 	= require('./request');
var Auth 		= require('./auth');
var Transaction = require('./transaction');
var PrivateKey 	= require('./privateKey');
var Tm 			= require('./transactionManager');
var Utils		= require('./utils');
var Account 	= require('./account');
var Api 		= require('./api');

var Ops = require('./operations');
var Hash = require('./hash');

var defaultOptions = {
	servers: [
		{
		    url: "wss://node.steem.ws",
		    username: '',
		    password: '',
		},
		{
		    url: "wss://steemd.steemit.com",
		    username: '',
		    password: '',
		}
	],
	timeout: 3000, // 3seconds.
};

function Remote(opts) {
	EventEmitter.call(this);

	var self = this;
	opts = opts || { };

	this.options = Object.assign({}, defaultOptions, opts);

 	this.connection_count = 0;
	this.servers = [];

	this.accounts = {};

	this.auths = {};

	this.prikeys = {};  // prikey caches;
	this.blocks = [];

	this.head_block_number = null;
	this.last_irreversible_block_num = null;
	this.start_block_num = null;

	this.transactionManager = new Tm(this);

	this.max_listeners = opts.max_listeners || 100;
	this.setMaxListeners(this.max_listeners);

	this.options.servers.forEach(function (serverOptions) {
		var server = self.addServer(serverOptions);
		server.setMaxListeners(self.max_listeners);
	});
}

util.inherits(Remote, EventEmitter);

Remote.prototype.addServer = function (opts) {
	if (typeof opts === 'string') opts = {url: opts};

	var self = this;
	opts.remote = this;
	var server = new Server(opts);

	function serverConnect() {
		self.connection_count += 1;
		if (opts.primary) {
			self.primary_server = server;
		}
		if (self.connection_count === 1) {
		  self.emit('connect');
		}
		if (self.connection_count === self.servers.length) {
		  self.emit('ready');
		}
	}

	function serverDisconnect() {
		self.connection_count--;
		if (self.connection_count === 0) {
		  self.emit('disconnect');
		}
	}

	function serverProperties (properties) {
		if (properties.head_block_number > self.head_block_number) {
			self.head_block_number = properties.head_block_number;
			self.head_block_id = properties.head_block_id;
			self.head_block_timestamp = properties.time;
		}
		if (properties.last_irreversible_block_num > self.last_irreversible_block_num) {
			var increment = properties.last_irreversible_block_num - self.last_irreversible_block_num;
			self.last_irreversible_block_num = properties.last_irreversible_block_num;
			self.last_irreversible_block_timesec =  (new Date(properties.time)).getTime() / 1000 - 3 * (properties.head_block_number - properties.last_irreversible_block_num);
			self.emit('block_advanced', self.last_irreversible_block_num, increment);
		}
	}
	server.on('connect', serverConnect);
	server.on('disconnect', serverDisconnect);	
	server.on('properties', serverProperties);

	this.servers.push(server);
	return server;
}

Remote.prototype.connect = function (callback) {
	if (typeof callback === 'function') {
		this.once('connect', callback);
	}
	this.servers.forEach(function (server) {
		server.connect();
	})
	return this;
}

Remote.prototype.disconnect = function (callback) {
	this.once('disconnect', callback);
	this.servers.forEach(function (server) {
		server.disconnect();
	});
	return this;
};

Remote.prototype.request = function (opts) {
	var request;
	if (opts instanceof Request) {
		request = opts;
	} else if (typeof opts === 'object') {
		if (!opts.remote) opts.remote = this;
		request = new Request(opts);
	}
	if (!request) throw new Error("Invalid request options");

	if (!this.isConnected()) {
		return this.once('connect', this.request.bind(this, opts));
	}

	var server = request.server || this.getServer();
	if (server) {
		server._request(request);
	} else {
		request.emit('error', new Error('No servers available'));
	}
}

Remote.prototype.getConnectedServers = function () {
	var servers = this.servers.filter(function (server) {
    	return server.isConnected();
  	});

  	//ording by ascending score.
  	servers.sort(function (a, b) {
  		return a._score - b._score;
  	})

  	return servers;
};

Remote.prototype.getServer = function() {
	if (this.primary_server && this.primary_server.isConnected()) {
    	return this.primary_server;
 	}

	if (!this.servers.length) return null;

	var connectedServers = this.getConnectedServers();
 	if (connectedServers.length) return connectedServers[0];

	return null;
};


Remote.prototype.isConnected = function() {
	return this.connection_count > 0;
};

Remote.prototype.streamHeadBlockNum = function () {
	var self = this;
	this.streamBlockHeader(function (header) {
		if (!header || !header.previous) return;
		var num = Remote.parseBlockNum(header.previous) + 1;
		if (num && num > self.head_block_number) {
			self.head_block_number = num;
			self.head_block_timestamp = header.timestamp;
			self.emit('head_block_num', num);
		}		
	});
}

Remote.prototype.streamBlockHeader = function (callback) {
	this.setBlockAppliedCallback(function(res){
		self.emit('block_header', res)
		if (typeof callback == 'function') callback(res[0]);
	});
}

Remote.prototype.streamCancel = function (callback) {
	this.removeListener('block_advanced', this.fetchBlocks)
	this.streaming = false;
}

Remote.prototype.streamStart =
Remote.prototype.stream = function (startBlock) {
	if (this.streaming) return;
	if (typeof startBlock === 'number') this.start_block_num = startBlock;
	this.on('block_advanced', this.fetchBlocks)
}

Remote.prototype.fetchBlocks = function () {
	var self = this;

	if (this.start_block_num <= 0) {
		this.start_block_num = this.last_irreversible_block_num + this.start_block_num;
	}
	var blockNum = this.last_streamed_block_num ? this.last_streamed_block_num + 1 : this.start_block_num;
	if (blockNum > this.last_irreversible_block_num) return;

	function processTransactions (block) {
		block['transactions'].forEach(function (tx, i){
			tx.timestamp = block.timestamp;
			tx.block_num = block.block_num;
			tx.block_id = block.block_id;
			tx.transaction_num = i;
			self.emit('transaction', tx);
			self.notifyAccounts(tx);
		});
	}

	var opts = {
		blockNum: blockNum,
		broadcast:  function (res, server) {
						return (res && res.previous && server._properties.last_irreversible_block_num >= blockNum)
					}
	}
	this.getBlockWith(opts, function (err, block){
		if (err) return console.log('Error fetching Block #', blockNum);
		var num = Remote.getBlockNum(block);
		if (num <= self.last_streamed_block_num) return;
		self.last_streamed_block_num = num;

		block.block_num = num;
		try{
			block.block_id = Remote.getBlockId(block)
		} catch (e) {
			console.log('Error computing Block_ID');
			throw e;
		}
		self.emit('block', block);
		processTransactions(block);
		self.fetchBlocks();
	});	
}

Remote.prototype.notifyAccounts = function (tx) {
	var self = this;

	function getAffectedAccounts (tx) {
		var accounts = new Set();
		tx.operations.forEach(function (op, i){
			var op_type = op[0];
			var op_data = op[1];

			// fields of accountname.
			var keys = [
				'to',
				'from',
				'voter',
				'author',
				'parent_author',
				'account',
				'owner',
				'witness',
				'publisher',
				'creator',
				'new_account_name',
				'from_account',
				'to_account',
				'challenger',
				'challenged',
				'recovery_account',
				'account_to_recover',
				'new_recovery_account',
				'agent',
				'reset_account',
				'account_to_reset',
				'curator',
				'current_owner',
				'open_owner',
			]
			for (var key in op_data) {
				if (typeof op_data[key] === 'string' && keys.indexOf(key) >= 0) accounts.add(op_data[key]);
			}
		});
		return accounts;
	}

	getAffectedAccounts(tx).forEach(function (account) {
		if (self.accounts[account]) {
			if (!tx.transaction_id) {
				try {
					tx.transaction_id = Transaction.Id(tx);	
				} catch (e){
					console.log('Error computing transaction_id', tx);
					throw e;				
				};
			}
			self.accounts[account].notify(tx);
		}
	})
}

// ========================================================================

// get blockNum from blockId
Remote.parseBlockNum =
Remote.prototype.parseBlockNum = function (blockId) {
	if (typeof blockId != 'string') throw new Error("Invalid BlockId");
	return parseInt(blockId.slice(0,8), 16);
}

// get blockNum from block object
Remote.getBlockNum =
Remote.prototype.getBlockNum = function (block) {
	if (typeof block != 'object') throw new Error("Invalid Block");
	return Remote.parseBlockNum(block.previous) + 1;
}

// compute blockId from block object
Remote.getBlockId = 
Remote.prototype.getBlockId = function (block) {
	var num = ("00000000" + Remote.getBlockNum(block).toString(16)).substr(-8);
	var hash = Hash.sha224(Ops.signed_block_header.toBuffer(block)).toString('hex').slice(8, -16);
	return num + hash;
}

// =========================================================================

Remote.prototype.setAuth = function (accountName, password, roles){
	var auth = new Auth();
	if (roles && Array.isArray(roles)){
		auth.setRoles(roles);
	}
	var keys = auth.generateKeys(accountName, password);

	this.auths[accountName] = auth;

	for (var role in keys.priKeys) {
		this.prikeys[keys.pubKeys[role]] = keys.priKeys[role];		
	};
}

Remote.prototype.getLogin =
Remote.prototype.getAuth = function (accountName) {
	return this.auths[accountName];
}

Remote.prototype.setKey = function (accountName, prikey_wif){
	if (PrivateKey.isWif(prikey_wif)) {
		this.prikeys[accountName] = PrivateKey.fromWif(prikey_wif);
	} else if (/^[0-9a-fA-F]{64}$/.test(prikey_wif)) {
		this.prikeys[accountName] = PrivateKey.fromHex(prikey_wif);
	} else {
		throw new Error("Invalid Key");
	}
}

Remote.prototype.getPrivateKey = function (name) {
	return this.prikeys[name];
}

Remote.prototype.transaction =
Remote.prototype.newTransaction =
Remote.prototype.createTransaction = function (accountName) {
	var opts = { remote: this };

	if (typeof accountName == 'string') opts.account = accountName;
	if (typeof accountName == 'object') Object.assign(opts, accountName)
	return new Transaction(opts);
}

Remote.prototype.addAccount = function (accountName) {
	if (typeof accountName != 'string') return;

	return this.accounts[accountName] ? 
		this.accounts[accountName] :
		this.accounts[accountName] = new Account(this, accountName);
}


// =================== Api ============================

function addApi (method) {
	function camelCase(str) {
		var snakeCaseRe = /_([a-z])/g;
		return str.replace(snakeCaseRe, function (_m, l) {
			return l.toUpperCase();
		});
	}
	var methodName = camelCase(method.method);
	var methodParams = method.params || [];

	Remote.prototype[methodName + 'With'] = function (options, callback) {
		var params = methodParams.map(function (param) {
			return options[param];
		});
		var opts = {
			api: method.api,
			method: method.method,
			params:  params,
			callback: callback,
		}
		if (methodParams[0] == 'cb') {
			opts.isSubscribe = true;
			opts.subscribeCallback = options.cb;
		}
		opts.remote = this;
		var req = new Request(opts)
		req.timeout(opts.timeout || this.options.timeout)
		if (options.broadcast) {
			req.broadcast(options.broadcast);
		} else {
			this.request(req);
		}
	}

	Remote.prototype[methodName] = function () {
		var args = arguments;
		var options = methodParams.reduce(function (memo, param, i) {
			memo[param] = args[i];
			return memo;
		}, {})
		var callback = arguments[arguments.length - 1];
		return this[methodName + 'With'](options, callback);
	}
}

Api.forEach(addApi);

// ======================== Export ============================

module.exports = Remote;