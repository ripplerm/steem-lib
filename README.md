# steem-lib

A JavaScript library for interacting with Steem in Node.js and the browser

## Features

+ Connect to one/multiple Steem server in JavaScript (Node.js or browser)
+ Issue [steem API](https://steemit.github.io/steemit-docs/) requests
+ Listen to events on Steem (blocks, transactions, etc.)
+ Sign and submit transactions to Steem blockchain


## Installation

**Via npm for Node.js**

```
  $ npm install steem-lib
```

**Building steem-lib for browser environments**

steem-lib uses Gulp to generate browser builds. These steps will generate minified and non-minified builds of steem-lib in the `build/` directory.

```
  $ git clone https://github.com/ripplerm/steem-lib
  $ npm install
  $ npm run build
```


## Quick start

`Remote.js` ([remote.js](https://github.com/ripplerm/steem-lib/blob/master/src/remote.js)) is the point of entry for interacting with Steem

```js
/* Loading steem-lib with Node.js */
var Remote = require('steem-lib').Remote;

var remote = new Remote({
  servers: [
    {
        url: "wss://steemd.steemit.com",
        primary: true,
        username: '',
        password: '',
    },
    {
        url: "wss://steemit.com/wspa",
        username: '',
        password: '',
    }
  ]
});

remote.connect(function() {
  console.log('connected to Steem servers');
  remote.getDynamicGlobalProperties(function(err, res) {
    console.log(res);
  });
});

// make api request
remote.get_accounts(['dan', 'ned'], function (err, res) {
  console.log(err, res);
})

// import signing keys for an account (use for signing)
var account = "account-name-here";
var key = "wif-key-here";
remote.setKey(account, key);

/* // from steemit accountname + password
var account = "account-name-here";
var pass = "steemit-password-here";
remote.setAuth(account, pass);
*/

// transaction construction and broadcast
var tx = remote.transaction(account);
tx.add_operation('transfer', {
    from: account,
    to: "the-recipient-account",
    amount: "0.001 STEEM",
    memo: "payment for xxx"    
});
tx.broadcast(function (err, res){
    // process err or result.
})

// listening to new (last-irreversible) blocks 
remote.on('block', function (block) {
  //process block data.
})
remote.stream();

// stop streaming.
remote.stream_cancel();

```


## More Information

+ sample codes in the [examples](https://github.com/ripplerm/steem-lib/blob/master/examples) folder.
+ Documentaion on [Steem API](https://steemit.github.io/steemit-docs/)


## License

MIT
