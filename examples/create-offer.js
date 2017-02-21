var Steem = require('steem-lib');

// ======== configuration =========
var s1 = 'wss://node.steem.ws';
var s2 = 'wss://steemd.steemit.com';
var accountName = "testing001";
var activeKey = "5******";

var remote = new Steem.Remote({servers: [s1, s2]});
remote.setKey(accountName, activeKey);

// ================================
remote.connect(function(){
	console.log('connected.')

	var opts = {
		owner: accountName,
    	amount_to_sell: '1.000 STEEM',
    	min_to_receive: '0.123 SBD',
	    fill_or_kill: false,
	    orderid: Math.round(Date.now() / 1000),
	    expiration: Math.round(Date.now() / 1000 + 3600),
	}

	var stx = remote.transaction(accountName);	

	stx.add_operation("limit_order_create", opts);
	// stx.limit_order_create(opts)

	stx.broadcast();
});

return;
