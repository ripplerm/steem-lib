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
remote.connect();

// ================================

var meta_json_account = { type: 'multiple author blog'};
var memoKey = "STM*****";

var tx = remote.transaction(accountName);

tx.add_operation("account_update", {
	account: accountName,
	memo_key: memoKey,  //required.
	posting: {
	    weight_threshold: 1,
	    account_auths: [
	    	['author-01', 1],
	    	['author-02', 1],
	    	['author-03', 1],
	    	['author-04', 1],
	    ],
	    key_auths:[]	      
	},
    json_metadata: JSON.stringify(meta_json_account)  
});

tx.submit();