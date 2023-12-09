import { MongoClient, ServerApiVersion, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.MONGODB_USERNAME || !process.env.MONGODB_PASSWORD) {
    throw new Error("No MONGODB_USERNAME or MONGODB_PASSWORD provided in .env");
}

const uri: string = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.as2bljh.mongodb.net/?retryWrites=true&w=majority`;

const client: MongoClient = new MongoClient(uri, {
    serverApi: ServerApiVersion.v1
});

let dbConnection: Db;

export const connectToServer = async (): Promise<void> => {
    try {
        await client.connect();
        dbConnection = client.db("delegation_stats");
        console.log("Successfully connected to MongoDB.");
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        throw err; // Rethrow the error for further handling
    }
};


export const getDb = (): Db => {
    return dbConnection;
};
