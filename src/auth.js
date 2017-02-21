"use strict";

var PrivateKey = require("./privateKey");

function Auth(opts) {
    this.roles = ["owner", "active", "posting", "memo"];
    this.priKeys = {};
    this.pubKeys = {};
}

Auth.prototype.setRoles = function (roles) {
    if (Array.isArray(roles)) {
        this.roles = roles;
    } else {
        throw new Error("roles must be an array.")
    }
}

Auth.prototype.generateKeys = function (accountName, password, roles){
    if (roles) this.setRoles(roles);
    var self = this;

    if (!accountName || !password) {
        throw new Error("Account name or password required");
    }
    if (password.length < 12) {
        throw new Error("Password must have at least 12 characters");
    }

    var priKeys = {};
    var pubKeys = {};

    (roles || this.roles).forEach(function (role) {
        var seed = accountName + role + password;
        var pkey = PrivateKey.fromSeed(seed);
        
        priKeys[role] = pkey;
        pubKeys[role] = pkey.toPublicKey().toString();
    });

    this.pubKeys = pubKeys;
    this.priKeys = priKeys;

    return { priKeys: priKeys, pubKeys: pubKeys };
}

Auth.prototype.getPubKeys = function (roles){
    var self = this;
    roles = roles || this.roles;

    return roles.map(function (role){
        return self.pubKeys[role];
    })
}


Auth.prototype.getPriKeys = function (roles){
    var self = this;
    roles = roles || this.roles;

    return roles.map(function (role){
        return self.priKeys[role];
    })
}


Auth.prototype.getPubKey = function (role){
   if (!role) role = this.roles[0];
   return this.pubkeys[role];   
}

Auth.prototype.getPriKey = function (role){
   if (!role) role = this.roles[0];
   return this.priKeys[role];
}

module.exports = Auth;