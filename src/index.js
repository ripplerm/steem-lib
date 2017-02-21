// under construction
'use strict';

exports.Remote = require('./remote');
exports.Transaction = require('./transaction');
exports.Request = require('./request');
exports.Server = require('./server');
exports.Auth = require('./auth');

exports.Operations = require('./operations');
exports.Hash = require('./hash');
exports.PrivateKey = require('./privateKey');
exports.PublicKey = require('./publicKey');

exports.Signature = require('./signature');
exports.Utils = require('./utils')

exports.Formatter = require('./formatter');


// camelCase to under_scored API conversion
function attachUnderscored(name) {
 var o = exports[name];

 Object.keys(o.prototype).forEach(function(key) {
   var UPPERCASE = /([A-Z]{1})[a-z]+/g;

   if (!UPPERCASE.test(key)) {
     return;
   }

   var underscored = key.replace(UPPERCASE, function(c) {
     return '_' + c.toLowerCase();
   });

   o.prototype[underscored] = o.prototype[key];
 });
}

['Remote',
 'Transaction'
].forEach(attachUnderscored);