
var Config = {
    core_asset: "STEEM",
    vest_asset: "VESTS",
    dollar_asset: "SBD",
    address_prefix: "STM",
    expire_in_secs: 60,
    expire_in_secs_proposal: 24 * 60 * 60,
    networks: {
        Steem: {
            core_asset: "STEEM",
            address_prefix: "STM",
            chain_id: "0000000000000000000000000000000000000000000000000000000000000000"
        }
    },
};

module.exports = Config;