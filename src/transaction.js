var util         = require('util');
var EventEmitter= require('events').EventEmitter;

var Config 		= require('./chainConfig');
var Ops 		= require('./operations');
var ChainTypes	= require('./chainTypes');
var Hash		= require('./hash')

var Transaction = function (opts) {
	EventEmitter.call(this);

	if (!opts) opts = {};

	this.remote = opts.remote;
	this.account = opts.account;

    this.ref_block_num = opts.ref_block_num || null;
    this.ref_block_prefix = opts.ref_block_prefix || null;
    this.expiration = opts.expiration || null;
    this.operations = [];
    this.signatures = [];
    this.prikeys = [];
};

util.inherits(Transaction, EventEmitter);

Transaction.Id = function (trx) {
	var buf = Ops.transaction.toBuffer(trx);
	return Hash.sha256(buf).toString('hex').slice(0,40);
}

Transaction.prototype.toObject = 
Transaction.prototype.serialize = function () {
	return Ops.signed_transaction.toObject(this);
}

Transaction.prototype.getPotentialSignatures = function (callback) {
	if (typeof callback != 'function') callback = function (){};
	this.remote.getPotentialSignatures(this.toObject(), function (err, res){
		callback(err, res)
	});
}

Transaction.prototype.getRequiredSignatures = function (callback) {
	if (typeof callback != 'function') callback = function (){};
	var auth = this.remote.getAuth(this.account);
	var my_pubkeys = auth? auth.getPubKeys() : [];
	this.remote.getRequiredSignatures(this.toObject(), my_pubkeys, function (err, res){
		callback(err, res)
	})
}

Transaction.prototype.signWithAccounts = function (accounts, callback) {
	var self = this;
	if (Array.isArray(accounts)) {
		accounts.forEach(function(account){
			self.signWithAccount(account, callback)
		});
	}
}

Transaction.prototype.signWith = 
Transaction.prototype.signWithAccount = function (accountName, role) {
	var self = this;
	if (Array.isArray(accountName)) {
		accountName.forEach(function (account) {
			self.signWithAccount(account, role);
		})
		return this;
	}

	if (!this.tr_buffer) this.tr_buffer = this.toBuffer();

	var prikey = null;
	var auth = null;

	if (this.remote) {
		if (this.remote.prikeys) {
			prikey = this.remote.prikeys[accountName];
		}

		if ( !prikey && (auth = this.remote.getAuth(accountName))) {
			prikey = auth.getPriKey(role);
		}
	}

	if (! prikey) throw new Error('no prikey for signing');

	self.signWithPrikey(prikey);
	return this;
}


Transaction.prototype.getSigningKeys = function () {
	var account = this.account;
	var prikeys = [];
	
	if (account && this.remote && this.remote.prikeys) {
		var key = this.remote.prikeys[account];
		if (key) prikeys.push(key);
	}

	return prikeys;
}

Transaction.prototype.addSigningAccount = function (account){
	var self = this;
	if (Array.isArray(account)) {
		account.forEach(function (acc) {
			self.addSigningAccount(acc)
		});
		return this;
	}

	else if (account && this.remote && this.remote.prikeys) {
		var key = this.remote.prikeys[account];
		if (key) this.addSigningKey(key);
	}
	return this;
}

Transaction.prototype.addSigningKey = function (prikey){
	if (!prikey) return;
	this.prikeys = this.prikeys.concat(prikey);
}

Transaction.prototype.signWithPrikey = function (prikey) {
    if (!prikey) throw new Error("missing prikey.");
    var sig = this.getSignatureForPrikey(prikey);
    this.signatures.push(sig);
}

Transaction.prototype.getSignatureForPrikey = function (prikey) {
    var chain_id = Config.networks.Steem.chain_id;
    if (!this.tr_buffer) this.tr_buffer = this.toBuffer();
    var buf = Buffer.concat([new Buffer(chain_id, 'hex'), this.tr_buffer]);
    var sig = prikey.signBuffer(buf);
    return sig.toBuffer();
}

Transaction.prototype.getSignatureFor = function (account) {
	var prikey = null;
	if (account && this.remote && this.remote.prikeys) {
		prikey = this.remote.prikeys[account];
	}
	if (! prikey) return false;

	return this.getSignatureForPrikey(prikey);
}

Transaction.prototype.addSignature = function (sig) {
	if (typeof sig == 'string') {
		var sig = new Buffer(sig, 'hex'); 	//convert hex string to buffer
	}
	this.signatures.push(sig);
}

Transaction.prototype.sign = function (callback) {
	if (typeof callback != 'function') callback = function (){};	
	if (!this.tr_buffer) this.tr_buffer = this.toBuffer();

	var self = this;

	var prikeys = this.prikeys.length ? this.prikeys : this.getSigningKeys();

	if (prikeys.length) {
		prikeys.forEach(function (prikey) {
			self.signWithPrikey(prikey);
		});
		if (typeof callback == 'function') callback();
	} else {
		this.getRequiredSignatures(function(err, required_pubkeys){
			if (err || !required_pubkeys) throw new Error("required_keys not found!", err);
			var hasKey = false;
			required_pubkeys.forEach(function (pubkey) {
				var prikey = self.remote.getPrivateKey(pubkey);
	            if (prikey) {
	            	hasKey = true;
	            	self.signWithPrikey(prikey);
	            }			
			});
			if (!hasKey) throw new Error("No private_key for signing!")
			if (typeof callback == 'function') callback();
		});
	}
}

Transaction.prototype.broadcast = function (callback) {
	if (!this.signatures.length) return this.processTransaction(callback);
	this.remote.transactionManager.broadcast(this, callback);
}

Transaction.prototype.processTransaction = function (callback) {
	if (typeof callback != 'function') callback = function (){};
	var self = this;
	this.complete(function () {
		self.sign(function () {
			self.broadcast(function (err, res) {
				callback(err, res)
			});
		})
	})
}

Transaction.prototype.submit = function (callback) {
	if (!this.signatures.length) return this.processSubmit(callback);
	this.remote.transactionManager.submit(this, callback);
}

Transaction.prototype.processSubmit= function (callback) {
	if (typeof callback != 'function') callback = function (){};
	var self = this;
	this.complete(function () {
		self.sign(function () {
			self.submit(function (err, res) {
				callback(err, res)
			});
		})
	})
}

Transaction.prototype.addOperations = function (operations) {
	var self = this;
	operations.forEach(function (op){
		self.addOperation(op);
	})
}

Transaction.prototype.addTypeOperation =
Transaction.prototype.addOperation = function (name, params) {
	var self = this;
	if (Array.isArray(name) && name.length == 2) {
		params = name[1];
		name = name[0];
	}
	if (!name) throw new Error("no opearation name")
	if (!params) throw new Error("no params")
    if (this.tr_buffer) throw new Error("already completed");
    
    var _type = Ops[name];
    if (!_type) throw new Error("Unknown operation " + name);

    var operation_id = ChainTypes.operations[_type.operation_name];
    if (operation_id === undefined) throw new Error("unknown operation: " + _type.operation_name);
    
    var operation_instance = _type.fromObject(params);
    this.operations.push([operation_id, operation_instance]);

    return this;
}

Transaction.prototype.toBuffer = function () {
	return Ops.transaction.toBuffer(this);
}

Transaction.prototype.complete = function (callback) {
	if (! this.remote) throw('No Remote');
	if (typeof callback != 'function') callback = function (){};

	self = this;	

    function done () {
		self.tr_buffer = self.toBuffer();
		self.transaction_id = self.Id();
		callback();
    }

    if (! this.expiration) {
    	this.expiration = Math.ceil(Date.now()/1000 + Config.expire_in_secs);
    }

    if (self.ref_block_num && self.ref_block_prefix) return done();

    // try autofill ref_block with last_irreversible_block.previous
    function get_ref_block (blockNum) {
		var opts = {
			blockNum: blockNum,
			broadcast:  function (res, server) { return (res && res.previous) }
		};
    	self.remote.getBlockWith(opts, function (err, res) {
    		if (err || !res) throw new Error("autofill ref_block_num fail.");
    		else {
    			var blockId = res.previous;
		    	self.ref_block_num = self.remote.parseBlockNum(blockId) & 0xFFFF;
		    	self.ref_block_prefix = new Buffer(blockId, 'hex').readUInt32LE(4);
		    	done();    			
    		}
    	})
    }

    if (this.remote.last_irreversible_block_num) {
    	get_ref_block(this.remote.last_irreversible_block_num);
    } else {
		this.remote.getDynamicGlobalProperties(function(err, res) {
		    if (err || !res) throw new Error("autofill ref_block_num fail.")
		    else {
		    	get_ref_block(res.last_irreversible_block_num);
		    }	
		});
    }
}

Transaction.prototype.Id = function () {
	var buf = this.tr_buffer || this.toBuffer();
	return this.transaction_id = Hash.sha256(buf).toString('hex').slice(0,40);
}


// ============= st operations ========
Ops.operation.st_operations.forEach(function (op) {
	var name = op.operation_name;
	var op_params = op.keys;

	Transaction.prototype[name] = function (opts) {
		if (typeof opts === 'object') return this.addOperation(name, opts);
		var args = arguments;
		var options = op_params.reduce(function (memo, param, i) {
			memo[param] = args[i];
			return memo;
		}, {})
		return this.addOperation(name, options);
	}
	if (camelCase(name) !== name) {
		Transaction.prototype[camelCase(name)] = Transaction.prototype[name];
	}
})

function camelCase(str) {
	var snakeCaseRe = /_([a-z])/g;
	return str.replace(snakeCaseRe, function (_m, l) {
		return l.toUpperCase();
	});
}
// ============= exports ==============

module.exports = Transaction;