var Steem = require('steem-lib').Remote;

// ======== configuration =========

var servers = [
    {
        url: 'wss://steemd.steemit.com',
        username: '',
        password: '',
        primary: true,
    },
    {
        url: 'wss://node.steem.ws',
        username: '',
        password: '',      
    }
]
var remote = new Remote({servers: servers});

var MY_ACCOUNT = "alice";
var MY_KEY = "5K********";

remote.setKey(MY_ACCOUNT, MY_KEY)
remote.connect(function(){

    console.log('connected.')
});

// ================================

var tx = remote.transaction(MY_ACCOUNT);

var payment1 = {
    from: MY_ACCOUNT,
    to: "recipient-account-111",
    amount: "0.123 STEEM",
    memo: "hello"
}

var payment2 = {
    from: MY_ACCOUNT,
    to: "recipient-account-222",
    amount: "0.456 STEEM",
    memo: "donation"
}

// multiple payment in one transaction
tx.transfer(payment1);
tx.transfer(payment2);

// manually set expiration
tx.expiration = Math.ceil(Date.now()/1000 + 30);

tx.once('submitted', function (result) {
    // submission result (head-block)
})

tx.submit(function (err, res){
    // err or successfully included in irreversible-block.
    console.log(err, res)
});
