import {
    Context,
    APIGatewayProxyResultV2,
    APIGatewayProxyWebsocketHandlerV2,
    APIGatewayProxyWebsocketEventV2
} from 'aws-lambda';
import {eKycRequestHandler, EKycRequest} from "../../../handlers/eKycRequestHandler";

export interface EKycRequestBody {
    name: string;
    date_of_birth: string;
    id_number: string;
    id_type: 'AADHAAR' | 'PAN' | 'PASSPORT' | 'Driving License' | 'Voter ID' | 'VOTER_ID' | 'VOTERID' | 'VOTER_ID';
    id_front: string;
    id_back: string;
    address: string;
    selfie: string;
    liveliness_selfie: string;
}

/**
 * eKyc Request Handler
 *
 * @param event
 * @param context
 */
export const eKycHandler: APIGatewayProxyWebsocketHandlerV2 = async (event: APIGatewayProxyWebsocketEventV2, context: Context): Promise<APIGatewayProxyResultV2> => {
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);

    // Read values from env
    const s3Bucket = process.env.S3_BUCKET;
    const dynamoDbTable = process.env.DYNAMODB_TABLE;
    const partitionKey = process.env.PARTITION_KEY;
    const sqsQueue = process.env.SQS_QUEUE;

    // Read values from event
    const {requestContext, body} = event;

    // Validate values
    if (!s3Bucket || !dynamoDbTable || !partitionKey || !sqsQueue) {
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

    const requestBody: EKycRequestBody = JSON.parse(body);

    // Validate request body
    if (!requestBody.name || !requestBody.date_of_birth || !requestBody.id_number || !requestBody.id_type || !requestBody.id_front || !requestBody.id_back ||
        !requestBody.address || !requestBody.selfie || !requestBody.liveliness_selfie) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing mandatory fields',
            }),
        };
    }


    const eKycRequest: EKycRequest = {
        request_id: requestContext.requestId,
        ...requestBody,
        settings: {
            dynamoDbTableName: dynamoDbTable,
            s3BucketName: s3Bucket,
            partitionKeyName: partitionKey,
            sqsQueueUrl: sqsQueue,
        }
    }

    // Call eKycRequestHandler
    const response = await eKycRequestHandler(eKycRequest);
    const statusCode = response.isSuccess ? 200 : 500;

    return {
        statusCode,
        body: JSON.stringify(response),
    };

};