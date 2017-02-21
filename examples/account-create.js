var Remote = require('steem-lib').Remote;

// ======== configuration =========

var remote = new Remote({
	servers: [{
		url: 'wss://node.steem.ws',
	    username: '',
	    password: '',
	}]
});

var accountName = "testing001";
var activeKey = "5******";

remote.setKey(accountName, activeKey);

remote.connect(function(){
	console.log('connected.')
});

// ================================

var newAccount = 'my-account-007';

var memoKey = "STM1*****";
var signer1 = "STM2*****";
var signer2 = "STM3*****";
var signer3 = "STM4*****";

var keys = [
	[signer1, 1], 
	[signer2, 1], 
	[signer3, 1]
];

var auth = {
    weight_threshold: 2,
    account_auths: [],
    key_auths: keys,    	
};

var posting_auth = {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [
    	['STM7******', 1]
    ], 	
}

var metadata = { account_type: '2-of-3 multi-signature pubkey'};

var opts = {
	fee: '100.000 STEEM',
	new_account_name: newAccount,
	creator: accountName,
	memo_key: memoKey,
	owner: auth,
	active: auth,
	posting: posting_auth,
	json_metadata: JSON.stringify(metadata)
}

var stx = remote.transaction(accountName);

// stx.add_type_operation("account_create", opts);
stx.account_create(opts);

stx.submit(function (err, res){
	console.log(err, res)
})
