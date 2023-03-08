import {DynamoDB, AttributeValue} from '@aws-sdk/client-dynamodb';

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
