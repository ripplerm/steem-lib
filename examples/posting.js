var Steem = require('steem-lib');
var Remote = Steem.Remote;

// ======== configuration =========
var url = 'wss://node.steem.ws';

var MY_ACCOUNT = "alice";
var MY_KEY = "5******";

var remote = new Remote({severs:[url]});
remote.setKey(MY_ACCOUNT, MY_KEY);
remote.connect();

// ================================

var meta_json = {
	tags: ['travel', 'photo'],
};
var plink = 'xxx-yyy-zzzzzz'

var tx = remote.creatTransaction(MY_ACCOUNT);

tx.comment({
    parent_author: "",
    author: MY_ACCOUNT,
    parent_permlink: plink,
    permlink: plink,
    title: "My Travel Diary",
    body: "a fantastic story ....",
    json_metadata: JSON.stringify(meta_json)
});

tx.broadcast(function (err, res){
    // submission result.
    console.log(err, res)
});