import {
    Context,
    APIGatewayProxyResultV2,
    APIGatewayProxyWebsocketHandlerV2,
    APIGatewayProxyWebsocketEventV2
} from 'aws-lambda';
import {v4 as uuidv4} from "uuid";
import {AttributeValue} from "@aws-sdk/client-dynamodb";
import {insertItem} from "../../../actions/requests/store";

export interface EKycCreateRequestBody {
    action: string;
    message: {
        name: string;
        date_of_birth: string;
        id_number: string;
        id_type: 'AADHAAR' | 'PAN';
        address: string;
    }
}

export const eKycCreateHandler: APIGatewayProxyWebsocketHandlerV2 = async (event: APIGatewayProxyWebsocketEventV2, context: Context): Promise<APIGatewayProxyResultV2> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    try {
        // Read values from env
        const dynamoDbTable = process.env.DYNAMODB_TABLE;

        // Read values from event
        const {requestContext, body} = event;

        // Validate values
        if (!dynamoDbTable) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'Internal Settings missing',
                }),
            };
        }

        // Validate body
        if (!body) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Body missing',
                }),
            };
        }

        const requestBody: EKycCreateRequestBody = JSON.parse(body);

        const {
            name,
            date_of_birth,
            id_number,
            id_type,
            address
        }: EKycCreateRequestBody['message'] = requestBody.message;

        // Validate request body
        if (!name || !date_of_birth || !id_number || !id_type ||
            !address) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Missing mandatory fields',
                }),
            };
        }

        // Store in DynamoDB
        const tracking_id = uuidv4();
        const item: Record<string, AttributeValue> = {
            connection_id: {S: requestContext.connectionId},
            tracking_id: {S: tracking_id},
            status: {S: 'CREATED'},
            creation_time: {N: Date.now().toString()},
            update_time: {N: Date.now().toString()},
            name: {S: name},
            date_of_birth: {S: date_of_birth},
            id_number: {S: id_number},
            id_type: {S: id_type},
            address: {S: address},
        }

        const storeResult = await insertItem(dynamoDbTable, item);

        console.log('storeResult', storeResult);

        return {
            statusCode: 200,
            body: JSON.stringify({
                connection_id: requestContext.connectionId,
                tracking_id,
                status: 'CREATED',
                message: 'Request submitted successfully',
                isSuccess: true,
            })
        }
    } catch (err) {
        console.error('Failed to create request..', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                error: err
            }),
        };
    }
}