'use strict';
var ecurve = require('ecurve');
var ECDSA = require('./ecdsa');
var PublicKey = require('./publicKey');
var Signature = require('./signature');
var ECSignature = require('./ecsignature');
var Config = require('./chainConfig');

// =====================================================

function verifySignature (hash, pub, sig) {
  if (typeof hash == 'object') {
    var opts = hash;
    hash = opts.hash;
    pub = opts.pubkey;
    sig = opts.signature;
  }

  var c = ecurve.getCurveByName('secp256k1');
  var h = new Buffer(hash, 'hex');
  var p = PublicKey.fromHex(pub).Q;
  var s = ECSignature.fromDER(new Buffer(sig, 'hex'));

  return ECDSA.verify(c, h, s, p);  
}

function verifySteemSignature (tr_buf, pubkey, signature) {
  if (typeof tr_buf == 'object') {
    var opts = tr_buf;
    tr_buf = opts.tr_buf;
    pubkey = opts.pubkey;
    signature = opts.signature;
  }
  
  if (typeof tr_buf == 'string') tr_buf = new Buffer(tr_buf, 'hex');
  if (typeof pubkey == 'string') pubkey = PublicKey.fromString(pubkey)
  if (typeof signature == 'string') signature = Signature.fromHex(signature);

  var chain_id = Config.networks.Steem.chain_id;
  tr_buf = Buffer.concat([new Buffer(chain_id, 'hex'), tr_buf]);

  return signature.verifyBuffer(tr_buf, pubkey);  
}
// ==========================================

exports.verifySignature = verifySignature;
exports.verifySteemSignature = verifySteemSignature;