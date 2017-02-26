var BigInteger = require('bigi');
var ecurve = require('ecurve');
var secp256k1 = ecurve.getCurveByName('secp256k1');
var base58 = require('bs58');
var hash = require('./hash');
var config = require('./chainConfig');;
var assert = require('assert');

var G = secp256k1.G
var n = secp256k1.n

var PublicKey = function(Q){
    var self = this;
    this.Q = Q;
}

PublicKey.fromBinary = function(bin) {
    return PublicKey.fromBuffer(new Buffer(bin, 'binary'));
}

PublicKey.fromBuffer = function(buffer) {
    var type = buffer.readUInt8(0);
    if (type === 4 || type === 3 || type === 2) {
        return new PublicKey(ecurve.Point.decodeFrom(secp256k1, buffer));    
    }
    var p = new PublicKey();
    p.buffer = buffer;
    return p;
}

PublicKey.prototype.toBuffer = function(compressed ) {
    if (!this.Q && this.buffer) return this.buffer;
    if(!compressed) compressed = this.Q.compressed;
    return this.Q.getEncoded(compressed);
}

PublicKey.fromPoint = function(point) {
    return new PublicKey(point);
}

PublicKey.prototype.toUncompressed = function() {
    var buf = this.Q.getEncoded(false);
    var point = ecurve.Point.decodeFrom(secp256k1, buf);
    return PublicKey.fromPoint(point);
}

PublicKey.prototype.toBlockchainAddress = function() {
    var pub_buf = this.toBuffer();
    var pub_sha = hash.sha512(pub_buf);
    return hash.ripemd160(pub_sha);
}

PublicKey.prototype.toString = function(address_prefix) {
    if(!address_prefix) address_prefix = config.address_prefix
    return this.toPublicKeyString(address_prefix)
}

PublicKey.prototype.toPublicKeyString = function(address_prefix) {
     if(!address_prefix) address_prefix = config.address_prefix
    if(this.pubdata) return address_prefix + this.pubdata
    const pub_buf = this.toBuffer();
    const checksum = hash.ripemd160(pub_buf);
    const addy = Buffer.concat([pub_buf, checksum.slice(0, 4)]);
    this.pubdata = base58.encode(addy)
    return address_prefix + this.pubdata;
}

/**
    @arg {string} public_key - like STMXyz...
    @arg {string} address_prefix - like STM
    @throws {Error} if public key is invalid
    @return PublicKey
*/
PublicKey.fromString = function(public_key, address_prefix) {
    if(!address_prefix) address_prefix = config.address_prefix
    try {
        return PublicKey.fromStringOrThrow(public_key, address_prefix)
    } catch (e) {
        return null;
    }
}

PublicKey.fromStringOrThrow = function(public_key, address_prefix ) {
     if(!address_prefix) address_prefix = config.address_prefix
    var prefix = public_key.slice(0, address_prefix.length);
    assert.equal(
        address_prefix, prefix,
        'Expecting key to begin with ' + address_prefix + ', instead got ' + prefix);
        public_key = public_key.slice(address_prefix.length);

    public_key = new Buffer(base58.decode(public_key), 'binary');
    var checksum = public_key.slice(-4);
    public_key = public_key.slice(0, -4);
    var new_checksum = hash.ripemd160(public_key);
    new_checksum = new_checksum.slice(0, 4);
    assert.deepEqual(checksum, new_checksum, 'Checksum did not match');
    return PublicKey.fromBuffer(public_key);
}

PublicKey.prototype.toAddressString = function(address_prefix ) {
     if(!address_prefix) address_prefix = config.address_prefix
    var pub_buf = this.toBuffer();
    var pub_sha = hash.sha512(pub_buf);
    var addy = hash.ripemd160(pub_sha);
    var checksum = hash.ripemd160(addy);
    addy = Buffer.concat([addy, checksum.slice(0, 4)]);
    return address_prefix + base58.encode(addy);
}

PublicKey.prototype.toPtsAddy = function() {
    var pub_buf = this.toBuffer();
    var pub_sha = hash.sha256(pub_buf);
    var addy = hash.ripemd160(pub_sha);
    addy = Buffer.concat([new Buffer([0x38]), addy]); //version 56(decimal)

    var checksum = hash.sha256(addy);
    checksum = hash.sha256(checksum);

    addy = Buffer.concat([addy, checksum.slice(0, 4)]);
    return base58.encode(addy);
}

PublicKey.prototype.child = function( offset ) {

    assert(Buffer.isBuffer(offset), "Buffer required: offset")
    assert.equal(offset.length, 32, "offset length")

    offset = Buffer.concat([ this.toBuffer(), offset ])
    offset = hash.sha256( offset )

    var c = BigInteger.fromBuffer( offset )

    if (c.compareTo(n) >= 0)
        throw new Error("Child offset went out of bounds, try again")


    var cG = G.multiply(c)
    var Qprime = this.Q.add(cG)

    if( secp256k1.isInfinity(Qprime) )
        throw new Error("Child offset derived to an invalid key, try again")

    return this.fromPoint(Qprime)
}

/* <HEX> */

PublicKey.prototype.toByteBuffer = function() {
    var b = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN);
    this.appendByteBuffer(b);
    return b.copy(0, b.offset);
}

PublicKey.fromHex = function(hex) {
    return PublicKey.fromBuffer(new Buffer(hex, 'hex'));
}

PublicKey.prototype.toHex = function() {
    return this.toBuffer().toString('hex');
}

PublicKey.fromStringHex = function(hex) {
    return PublicKey.fromString(new Buffer(hex, 'hex'));
}

module.exports = PublicKey;