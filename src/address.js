'use strict';

var assert = require('assert');
var ChainConfig = require("./chainConfig");
var hash = require('./hash');

var _require = require('bs58');

var encode = _require.encode;
var decode = _require.decode;

/** Addresses are shortened non-reversable hashes of a public key.  The full PublicKey is preferred.
    @deprecated
*/

var Address = function () {
    this.addy = addy;    
}

Address.prototype.toBuffer = function () {
   return this.addy;
}

Address.prototype.toString = function () {
    var address_prefix = arguments.length <= 0 || arguments[0] === undefined ? ChainConfig.address_prefix : arguments[0];

    var checksum = hash.ripemd160(this.addy);
    var addy = Buffer.concat([this.addy, checksum.slice(0, 4)]);
    return address_prefix + encode(addy);    
}

Address.fromBuffer = function (buffer) {
    var _hash = hash.sha512(buffer);
    var addy = hash.ripemd160(_hash);
    return new Address(addy);
}

Address.fromString = function (string) {
    var address_prefix = arguments.length <= 1 || arguments[1] === undefined ? ChainConfig.address_prefix : arguments[1];

    var prefix = string.slice(0, address_prefix.length);
    assert.equal(address_prefix, prefix, 'Expecting key to begin with ' + address_prefix + ', instead got ' + prefix);
    var addy = string.slice(address_prefix.length);
    addy = new Buffer(decode(addy), 'binary');
    var checksum = addy.slice(-4);
    addy = addy.slice(0, -4);
    var new_checksum = hash.ripemd160(addy);
    new_checksum = new_checksum.slice(0, 4);
    if (checksum.toString() !== new_checksum.toString()) {
        throw new Error('Invalid WIF key (checksum miss-match)')
    }
    return new Address(addy);
}

Address.fromPublic = function (public_key) {
    var compressed = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
    var version = arguments.length <= 2 || arguments[2] === undefined ? 56 : arguments[2];

    var sha2 = hash.sha256(public_key.toBuffer(compressed));
    var rep = hash.ripemd160(sha2);
    var versionBuffer = new Buffer(1);
    versionBuffer.writeUInt8(0xFF & version, 0);
    var addr = Buffer.concat([versionBuffer, rep]);
    var check = hash.sha256(addr);
    check = hash.sha256(check);
    var buffer = Buffer.concat([addr, check.slice(0, 4)]);
    return new Address(hash.ripemd160(buffer));
}


module.exports = Address;