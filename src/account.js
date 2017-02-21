var util         = require('util');
var EventEmitter = require('events').EventEmitter;

function Account(remote, accountName) {
  EventEmitter.call(this);
  var self = this;
  this._remote = remote;
  this._name = accountName;

  this._entry = {};

  this._marker = null;

  return this;
};

util.inherits(Account, EventEmitter);

// from Remote.stream();
Account.prototype.notify = function (tx) {
	var self = this;

	this.emit('transaction', tx);
	tx.operations.forEach(function (op, i) {
		var type = op[0];
		var data = op[1];

		data.timestamp = tx.timestamp;
		data.block_num = tx.block_num;
		data.block_id = tx.block_id;
		data.transaction_num = tx.transaction_num;
		data.transaction_id = tx.transaction_id;
		data.operation_num = i;

		var trx = {
			block: tx.block_num,
			trx_in_block: tx.transaction_num,
			op_in_trx: i,
			timestamp: tx.timestamp,
			trx_id: tx.transaction_id,
			op: op,
		}
		self.notifyTx(trx);
	})
}

// from account.subscribe();
Account.prototype.notifyTx = function (tx) {
	var marker = getTxMarker(tx);
	if (marker <= this._marker) return;

	this._marker = marker;
	var type = tx.op[0];
	var data = tx.op[1];

	this.emit('tx', tx);
	this.emit(type, tx);

	if (type == 'transfer') {
		if (data.from == this._name) this.emit('transfer-out', tx);
		if (data.to == this._name) this.emit('transfer-in', tx)
	}
	if (type == 'account_update' && data.account == this._name) {
		Object.assign(this._entry, data);
	}
}

Account.prototype.subscribe = function (immediate) {
	var self = this;
	this._remote.servers.forEach(function (server){
		if (server.isConnected()) {
			server._accountSubscribe(self, immediate);
		} else {
			server.once('connect', function () {
				server._accountSubscribe(self, immediate);
			})
		}
	})
	this._subscribed = true;
	return this;
}

Account.prototype.unsubscribe = function () {
	var self = this;
	this._remote.servers.forEach(function (server){
		server._accountUnsubscribe();
	})
	this._subscribed = false;
	return this;
}

function getTxMarker (tx) {
	function toHex (num) { return h = ("00000000" + num.toString(16)).substr(-8); }
	return [tx.block, tx.trx_in_block, tx.op_in_trx].map(toHex).join('');
}

module.exports = Account;