'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Transaction = require('./transaction');

function TransactionManager(remote) {
  EventEmitter.call(this);

  var self = this;
  this.remote = remote;
  this.pending = {};

  this.remote.on('transaction', function (transaction) {
    self.transactionReceived(transaction);
  });
}

util.inherits(TransactionManager, EventEmitter);


TransactionManager.prototype.transactionReceived = function (transaction) {
  var id;

  try {
    id = Transaction.Id(transaction);  
  } catch (e) {
    console.log('Error parsing transaction id:', e)
  }
  
  if (!id) return; 

  var submission = this.pending[id];
  if (!(submission instanceof Transaction)) return;

  submission.emit('success', transaction)
};


TransactionManager.prototype.submit = function (tx, callback) {
  if (! this.remote.isConnected()) return this.submit(tx, callback);
  if (typeof callback != 'function') callback = function () {};

  var self = this;
	var id = tx.transaction_id || (tx.transaction_id = Transaction.Id(tx));
	this.pending[id] = tx;

  tx.once('success', function (transaction) {
    clearInterval(tx._timer);
    callback(null, transaction);
  });

  tx.once('error', function(err){
    clearInterval(tx._timer);
    callback(err)
  })

  function checkStatus () {
    if (! self.remote.isConnected()) return;
    self.remote.getTransaction(id, function (err, res){
      if (res) {
        if (res.block_num <= self.remote.last_irreversible_block_num) {
          return tx.emit('success', res);  
        }
        tx.emit('submitted', res)
      } else {
        if (self.remote.last_irreversible_block_timesec > tx.expiration) {
          return tx.emit('error', {message: 'Expiration exceeded.', expired: true}); 
        }
        tx.emit('resubmit');
        self.broadcast(tx);
      }
    })
  }

	this.broadcast(tx, function (err, res) {
    if (res) tx.emit('submitted', res);
    else if (err) {
      setTimeout(checkStatus, 6 * 1000); //wait for 2block.
    }
  });

  tx._timer = setInterval(checkStatus, 60 * 1000) // check and resubmit every 1minutes.
}

TransactionManager.prototype.broadcast = function (tx, callback) {
  var opts = {
    trx: tx.serialize(),
    broadcast: true
  }
	this.remote.broadcastTransactionSynchronousWith(opts, function (err, res){
		if (typeof callback == 'function') callback(err, res);
	});
}

module.exports = TransactionManager;