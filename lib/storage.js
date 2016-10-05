/*jshint esversion: 6 */
'use strict';

const
    couchStorage = require('./couch-storage.js'),
    dynamoStorage = require('./dynamo-storage.js'),
    config = require('../config.js');

let storageType = config.storage,
    storage;

if (storageType === 'couch') {
    storage = couchStorage(config.couch.endpoint, config.couch.dbname);
} else if (storageType === 'dynamo') {
    storage = dynamoStorage(config.dynamo.tableName, config.dynamo.aws, config.dynamo.provisionedThroughput);
} else {
    throw Error("Unsupported storage type '" + storageType + "'.");
}

module.exports = storage;
