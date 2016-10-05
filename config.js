/*jshint strict:false */
/*jshint esversion: 6 */
'use strict';

exports.storage = "dynamo";
exports.couch = {
    endpoint: "http://127.0.0.1:5984",
    dbname: "ludus"
};
exports.dynamo = {
    aws: {
        region: "us-west-2",
        accessKeyId: 'YOUR_ACCESS_KEY_ID',
        secretAccessKey: 'YOUR_SECRET_ACCESS_KEY'
    },
    provisionedThroughput: { 
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10
    },
    tableName: "ludus"
};
