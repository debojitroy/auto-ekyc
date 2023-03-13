import {DynamoDB, AttributeValue} from '@aws-sdk/client-dynamodb';
import {AttributeValueUpdate} from "@aws-sdk/client-dynamodb/dist-types/models/models_0";

//Function to insert item to DynamoDB
export const insertItem = async (tableName: string, item: Record<string, AttributeValue>) => {
    const client = new DynamoDB({});
    const params = {
        TableName: tableName,
        Item: item
    };
    try {
        return await client.putItem(params);
    } catch (err) {
        console.log('Failed to insert item to DynamoDB', err);
        throw err;
    }
}

export const getItem = async (tableName: string, partition_key: string, sort_key: string) => {
    const client = new DynamoDB({});
    const params = {
        TableName: tableName,
        Key: {
            connection_id: {S: partition_key},
            tracking_id: {S: sort_key},
        }
    };

    try {
        return await client.getItem(params);
    } catch (err) {
        console.log('Failed to get item from DynamoDB', err);
        throw err;
    }
}

export const updateItem = async (tableName: string, partition_key: string, sort_key: string, item: Record<string, AttributeValueUpdate>) => {
    const client = new DynamoDB({});
    const params = {
        TableName: tableName,
        Key: {
            connection_id: {S: partition_key},
            tracking_id: {S: sort_key},
        },
        AttributeUpdates: item,
        ReturnValues: 'ALL'
    };
    try {
        return await client.updateItem(params);
    } catch (err) {
        console.log('Failed to update item in DynamoDB', err);
        throw err;
    }
}
