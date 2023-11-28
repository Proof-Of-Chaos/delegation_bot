"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = exports.connectToServer = void 0;
const mongodb_1 = require("mongodb");
if (!process.env.MONGODB_USERNAME || !process.env.MONGODB_PASSWORD) {
    throw new Error("No MONGODB_USERNAME or MONGODB_PASSWORD provided in .env");
}
const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.as2bljh.mongodb.net/?retryWrites=true&w=majority`;
const client = new mongodb_1.MongoClient(uri, {
    serverApi: mongodb_1.ServerApiVersion.v1
});
let dbConnection;
const connectToServer = async () => {
    try {
        await client.connect();
        dbConnection = client.db("delegation_stats");
        console.log("Successfully connected to MongoDB.");
    }
    catch (err) {
        console.error("Failed to connect to MongoDB", err);
        throw err; // Rethrow the error for further handling
    }
};
exports.connectToServer = connectToServer;
const getDb = () => {
    return dbConnection;
};
exports.getDb = getDb;
